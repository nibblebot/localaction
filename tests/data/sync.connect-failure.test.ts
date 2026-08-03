// A failed connect must log (and report as the retry reason) an actionable
// message, not TinyBase's internal error codes. createWsSynchronizer rejects
// with `new Error('tinybase:<code>')` when the socket dies before the sync
// handshake — code 5 (ERROR_MULTIPLEX_SOCKET) is the offline-server case.
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { startSync } from '../../src/data/sync.ts';

const rejectingSynchronizer = ((() =>
  Promise.reject(new Error('tinybase:5'))) as unknown) as typeof createWsSynchronizer;

function makeDeadWebSocket(): typeof WebSocket {
  class DeadWS {
    public url: string;
    public closed = false;
    private listeners = new Map<string, Set<(event: unknown) => void>>();
    constructor(url: string) {
      this.url = url;
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
  return DeadWS as unknown as typeof WebSocket;
}

describe('startSync connect-failure message', () => {
  const originalWarn = console.warn;
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '));
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { protocol: 'http:', host: 'example.test', pathname: '/' } },
    });
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it('translates tinybase:5 into an actionable warn and retry reason', async () => {
    const client = startSync({
      webSocketImpl: makeDeadWebSocket(),
      synchronizerImpl: rejectingSynchronizer,
    });
    const reasons: string[] = [];
    client.subscribe((s) => {
      if (s.kind === 'retrying') reasons.push(s.reason);
    });
    client.start();
    // Let the synchronizer rejection and its microtask chain settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnings).toEqual([
      '[localaction] sync — connect failed: server unreachable (socket failed before the sync handshake)',
    ]);
    expect(reasons).toEqual(['server unreachable (socket failed before the sync handshake)']);

    await client.destroy();
  });
});
