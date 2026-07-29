// Reconnect policy: a refused connection must retry on a calm, bounded
// ladder — exactly one timer per failed attempt, delays stepping
// 5s→10s→15s→20s across 4 retries (5 tries total), then a terminal
// give-up emitted exactly once. The badge's retry button calls
// `client.retry()`, which re-arms the loop from attempt 0.
// Regression: the old wiring scheduled a timer on the synchronizer
// rejection AND on the socket's error+close events (three per failure,
// none cleared), so the badge showed Retry #17 within a minute of
// downtime and never stopped.
//
// Time is driven by fake timers (`vi.advanceTimersByTime`), so the test
// pins the PRODUCTION ladder exactly — if anyone retunes the constants
// in src/data/sync.ts, this test breaks loudly. The refusing socket and
// rejecting synchronizer come in through `startSync` seams (never
// `mock.module` — Bun shares one module registry across test files).
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import type { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { startSync } from '../../src/data/sync.ts';
import type { SyncStatus } from '../../src/data/sync.ts';

const rejectingSynchronizer = (() =>
  Promise.reject(new Error('handshake failed'))) as unknown as typeof createWsSynchronizer;

// The production ladder this test locks in: 5s step, linear, 4 retries
// (with the initial connect, 5 tries total) before the terminal give-up.
const EXPECTED_DELAYS = [5_000, 10_000, 15_000, 20_000];

// Simulates a connection-refused socket: construction succeeds, then
// 'error' and 'close' fire asynchronously (after listeners attach).
function makeRefusedWebSocket(): { instances: { closed: boolean }[]; ctor: typeof WebSocket } {
  const instances: { closed: boolean }[] = [];
  class FakeWS {
    public url: string;
    public closed = false;
    private listeners = new Map<string, Set<() => void>>();
    constructor(url: string) {
      this.url = url;
      instances.push(this);
      queueMicrotask(() => {
        this.fire('error');
        this.fire('close');
      });
    }
    close(): void {
      this.closed = true;
    }
    addEventListener(event: string, listener: () => void): void {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(listener);
    }
    private fire(event: string): void {
      for (const listener of this.listeners.get(event) ?? []) listener();
    }
  }
  return { instances, ctor: FakeWS as unknown as typeof WebSocket };
}

// Lets queued microtasks (socket refusal, synchronizer rejection) land.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Steps the client through one full ladder: each failed connect's
// refusal lands on a microtask flush, then fake time advances exactly
// the scheduled delay to fire the next retry timer.
async function driveLadder(): Promise<void> {
  for (const delay of EXPECTED_DELAYS) {
    await flushMicrotasks();
    vi.advanceTimersByTime(delay);
  }
  await flushMicrotasks(); // final retry's refusal lands → give-up
}

function gaveUpCount(statuses: SyncStatus[]): number {
  return statuses.filter((s) => s.kind === 'error' && s.message.includes('gave up')).length;
}

describe('startSync reconnect policy', () => {
  beforeEach(() => {
    // No DOM under `bun test`: `defaultEndpoint()` only reads
    // `window.location`, so stub a minimal `window` on globalThis.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { protocol: 'http:', host: 'example.test', pathname: '/' } },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps 5s→20s across 4 retries, then gives up exactly once', async () => {
    const fake = makeRefusedWebSocket();
    const statuses: SyncStatus[] = [];
    const client = startSync({
      webSocketImpl: fake.ctor,
      synchronizerImpl: rejectingSynchronizer,
    });
    client.subscribe((s) => {
      statuses.push(s);
    });
    client.start();

    for (const [i, delay] of EXPECTED_DELAYS.entries()) {
      await flushMicrotasks(); // refusal + rejection land → retry timer scheduled
      // Socket count = 1 (initial connect) + 1 per timer-fired retry so
      // far. Stacked timers per failure would blow past this.
      expect(fake.instances.length).toBe(i + 1);
      expect(statuses.at(-1)).toMatchObject({ kind: 'retrying', attempt: i + 1, nextDelayMs: delay });
      if (i === 0) {
        // retry() while a retry timer is pending is a no-op — the
        // button can only fire this in the terminal state, but the
        // guard keeps double-clicks harmless.
        client.retry();
        vi.advanceTimersByTime(100);
        expect(fake.instances.length).toBe(1);
        vi.advanceTimersByTime(delay - 100);
      } else {
        vi.advanceTimersByTime(delay);
      }
    }
    await flushMicrotasks(); // 4th retry's refusal lands → give-up

    // Exactly one retrying status per failure, attempts climbing 1→4.
    const retryAttempts = statuses.flatMap((s) => (s.kind === 'retrying' ? [s.attempt] : []));
    expect(retryAttempts).toEqual([1, 2, 3, 4]);

    // Terminal state is the give-up error, emitted exactly once even
    // though socket error + close + rejection all re-enter scheduling.
    const last = statuses.at(-1);
    expect(last?.kind).toBe('error');
    if (last?.kind === 'error') {
      expect(last.message).toContain('gave up after 5 tries');
    }
    expect(gaveUpCount(statuses)).toBe(1);

    // No reconnect timer survives the give-up: advancing far past any
    // possible delay changes nothing.
    const statusCount = statuses.length;
    vi.advanceTimersByTime(120_000);
    await flushMicrotasks();
    expect(fake.instances.length).toBe(5); // 1 initial + 4 retries
    expect(statuses.length).toBe(statusCount);

    await client.destroy();
  });

  it('retry() re-arms the loop after give-up', async () => {
    const fake = makeRefusedWebSocket();
    const statuses: SyncStatus[] = [];
    const client = startSync({
      webSocketImpl: fake.ctor,
      synchronizerImpl: rejectingSynchronizer,
    });
    client.subscribe((s) => {
      statuses.push(s);
    });
    client.start();

    await driveLadder();
    expect(gaveUpCount(statuses)).toBe(1);
    expect(fake.instances.length).toBe(5);

    // The badge's retry button: reset to attempt 0 and connect again.
    client.retry();
    expect(statuses.at(-1)).toMatchObject({ kind: 'connecting' });
    expect(fake.instances.length).toBe(6);

    // The full ladder runs again from a fresh attempt counter.
    await driveLadder();
    expect(gaveUpCount(statuses)).toBe(2);
    expect(fake.instances.length).toBe(10);
    const retryAttempts = statuses.flatMap((s) => (s.kind === 'retrying' ? [s.attempt] : []));
    expect(retryAttempts).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);

    await client.destroy();
  });
});
