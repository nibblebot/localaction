import { describe, expect, it, beforeEach } from 'bun:test';
import { startSync } from '../../src/data/sync.ts';

// No DOM under `bun test`: `defaultEndpoint()` only reads
// `window.location`, so stub a minimal `window` on globalThis instead of
// pulling in happy-dom/jsdom.
function stubWindowLocation(protocol: string): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { location: { protocol, host: 'example.test', pathname: '/' } },
  });
}

describe('startSync URL handling', () => {
  beforeEach(() => {
    stubWindowLocation('http:');
  });

  /**
   * The implementation constructs the WebSocket synchronously inside
   * `connect()` and catches any constructor error. Yielding once after
   * `start()` ensures the constructor has run before we read `calls`.
   */
  async function afterStart(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
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
    await afterStart();
    expect(calls[0]).toBe('ws://override.test/ws');
    await client.destroy();
  });

  it('builds a ws:// endpoint from window.location when none is given', async () => {
    const calls: string[] = [];
    const client = startSync({ webSocketImpl: fakeWebSocket(calls) });
    client.start();
    await afterStart();
    expect(calls[0]).toBe('ws://example.test/ws');
    await client.destroy();
  });

  it('builds a wss:// endpoint when served over HTTPS', async () => {
    stubWindowLocation('https:');
    const calls: string[] = [];
    const client = startSync({ webSocketImpl: fakeWebSocket(calls) });
    client.start();
    await afterStart();
    expect(calls[0]).toBe('wss://example.test/ws');
    await client.destroy();
  });
});
