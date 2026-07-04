import { describe, expect, it, beforeEach } from 'vitest';
import { startSync } from '../../src/data/sync.ts';

describe('startSync URL handling', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'http:', host: 'example.test', pathname: '/' },
    });
  });

  async function waitFor(predicate: () => boolean, maxMs = 200): Promise<void> {
    const step = 5;
    for (let elapsed = 0; elapsed < maxMs; elapsed += step) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, step));
    }
  }

  function fakeWebSocket(calls: string[]): typeof WebSocket {
    return class FakeWS {
      constructor(url: string) {
        calls.push(url);
        throw new Error('stop-after-url');
      }
    } as unknown as typeof WebSocket;
  }

  it('uses the explicit endpoint when one is passed', async () => {
    const calls: string[] = [];
    const client = startSync({
      endpoint: 'ws://override.test/ws',
      webSocketImpl: fakeWebSocket(calls),
    });
    client.start();
    await waitFor(() => calls.length > 0);
    expect(calls[0]).toBe('ws://override.test/ws');
    await client.destroy();
  });

  it('builds a ws:// endpoint from window.location when none is given', async () => {
    const calls: string[] = [];
    const client = startSync({ webSocketImpl: fakeWebSocket(calls) });
    client.start();
    await waitFor(() => calls.length > 0);
    expect(calls[0]).toBe('ws://example.test/ws');
    await client.destroy();
  });

  it('builds a wss:// endpoint when served over HTTPS', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'https:', host: 'example.test', pathname: '/' },
    });
    const calls: string[] = [];
    const client = startSync({ webSocketImpl: fakeWebSocket(calls) });
    client.start();
    await waitFor(() => calls.length > 0);
    expect(calls[0]).toBe('wss://example.test/ws');
    await client.destroy();
  });
});