// Regression test: React 19 StrictMode double-mount must not open two WS
// connections. The first client is destroyed before its synchronizer
// await resolves, so `currentSync` is undefined at destroy() time. The fix
// tracks the in-flight WebSocket so destroy() can close it directly.
//
// The hanging synchronizer is injected via `synchronizerImpl` (a
// `startSync` test seam) rather than `mock.module`: Bun shares one module
// registry across all test files in a run and resolves each file's
// static imports at evaluation time, so a module mock installed here
// leaks into tests/integration/ and hangs its synchronizers.
import { describe, expect, it, beforeEach } from 'bun:test';
import type { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { startSync } from '../../src/data/sync.ts';

// Hangs forever — that's the race window where StrictMode's first-mount
// cleanup runs while we're still awaiting.
const hangingSynchronizer = ((_store: unknown, _ws: unknown) =>
  new Promise(() => {})) as unknown as typeof createWsSynchronizer;

interface FakeWsHandle {
  url: string;
  closed: boolean;
  close: () => void;
  addEventListener: (event: string, listener: (event: unknown) => void) => void;
}

interface FakeWsCtor {
  instances: FakeWsHandle[];
  ctor: typeof WebSocket;
}

function makeFakeWebSocket(): FakeWsCtor {
  const instances: FakeWsHandle[] = [];
  class FakeWS {
    public url: string;
    public closed = false;
    private listeners = new Map<string, Set<(event: unknown) => void>>();
    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
    close(): void {
      this.closed = true;
    }
    addEventListener(event: string, listener: (event: unknown) => void): void {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(listener);
    }
  }
  return { instances, ctor: FakeWS as unknown as typeof WebSocket };
}

describe('startSync under StrictMode double-mount', () => {
  beforeEach(() => {
    // No DOM under `bun test`: `defaultEndpoint()` only reads
    // `window.location`, so stub a minimal `window` on globalThis.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { protocol: 'http:', host: 'example.test', pathname: '/' } },
    });
  });

  it('closes the in-flight WS of the first mount so only one WS exists', async () => {
    const fake = makeFakeWebSocket();

    // Mount #1: startSync() opens WS1, then hangs in the synchronizer.
    const first = startSync({
      webSocketImpl: fake.ctor,
      synchronizerImpl: hangingSynchronizer,
    });
    first.start();
    // Let microtasks flush so the constructor runs.
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.instances.length).toBe(1);

    // StrictMode cleanup: first client destroyed while createWsSynchronizer
    // is still pending. The in-flight WS must be closed synchronously — that's
    // the bug fix.
    const firstDestroy = first.destroy();
    expect(fake.instances[0]!.closed).toBe(true);

    // Mount #2: a fresh client opens a new WS. With the fix, only WS2 is live.
    const second = startSync({
      webSocketImpl: fake.ctor,
      synchronizerImpl: hangingSynchronizer,
    });
    second.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.instances.length).toBe(2);
    expect(fake.instances[1]!.closed).toBe(false);

    // Both clients are destroyed cleanly. firstDestroy is awaited to drain
    // any pending rejection from the hanging synchronizer.
    const secondDestroy = second.destroy();
    expect(fake.instances[1]!.closed).toBe(true);
    // Swallow the never-resolving synchronizer promises — they were
    // intentionally left hanging to simulate the race window.
    firstDestroy.catch(() => undefined);
    secondDestroy.catch(() => undefined);
  });
});
