import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { getStore } from './store.ts';

// Module-level singleton. One SyncClient per page, started lazily and
// never destroyed by React effects. Survives StrictMode's mount →
// unmount → remount cycle, which would otherwise open the WebSocket
// twice and have the first connection torn down mid-handshake on the
// fake unmount — surfacing as "Firefox can’t establish a connection
// to the server at ws://…/ws" / "interrupted while the page was
// loading" in the browser console.

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;

export interface SyncClient {
  start(): void;
  destroy(): Promise<void>;
  readonly status: SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'retrying'; attempt: number; nextDelayMs: number; reason: string }
  | { kind: 'error'; message: string };

export interface SyncClientOptions {
  webSocketImpl?: typeof WebSocket;
  endpoint?: string;
}

let singleton: SyncClient | undefined;

/**
 * Returns a process-wide singleton SyncClient, creating it on first call.
 * The returned client is auto-started exactly once and is intentionally
 * never destroyed by React lifecycle effects — destroying it on
 * StrictMode's fake unmount would close an in-flight WebSocket during
 * page load, which Firefox reports as an interrupted connection.
 *
 * Tests and isolated consumers can still call {@link startSync}
 * directly to spin up independent clients.
 */
export function getSyncClient(): SyncClient {
  if (!singleton) {
    singleton = startSync();
    singleton.start();
  }
  return singleton;
}

/**
 * Tears down the module singleton (and its WebSocket). Intended for
 * `beforeunload` handlers and tests only; do not call from React
 * effects, which would defeat the StrictMode-safe lifecycle above.
 */
export async function destroySyncClient(): Promise<void> {
  if (!singleton) return;
  const c = singleton;
  singleton = undefined;
  await c.destroy();
}

export function startSync(options: SyncClientOptions = {}): SyncClient {
  const store = getStore();
  const url = options.endpoint ?? defaultEndpoint();
  const WS = options.webSocketImpl ?? globalThis.WebSocket;

  let status: SyncStatus = { kind: 'idle' };
  const listeners = new Set<(s: SyncStatus) => void>();
  let currentSync: Awaited<ReturnType<typeof createWsSynchronizer>> | undefined;
  let destroyed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  // True while a `connect()` attempt is mid-flight. Prevents React 19
  // StrictMode's double-start from racing a second socket against the
  // first, and prevents the retry timer from re-entering while a connect
  // is already underway.
  let connecting = false;
  // Holds the in-flight WebSocket between construction and either
  // synchronizer hand-off or destroy(). Required so `destroy()` can close
  // a still-connecting socket — otherwise React 19 StrictMode's double-mount
  // leaks the first WS and a second one opens on re-mount.
  let currentWs: WebSocket | undefined;

  function setStatus(next: SyncStatus): void {
    status = next;
    for (const listener of listeners) listener(next);
  }

  function scheduleReconnect(reason: string): void {
    if (destroyed) return;
    attempt += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (attempt - 1));
    setStatus({ kind: 'retrying', attempt, nextDelayMs: delay, reason });
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect(reason);
    }, delay);
  }

  async function connect(reasonForReconnect?: string): Promise<void> {
    if (destroyed) return;
    // Guard against React 19 StrictMode double-mount: `start()` may be
    // invoked twice in quick succession. The first attempt is already in
    // flight; let it complete rather than racing a second socket.
    if (connecting) return;
    connecting = true;
    setStatus({ kind: 'connecting' });

    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch (err) {
      connecting = false;
      setStatus({ kind: 'error', message: (err as Error).message });
      scheduleReconnect(reasonForReconnect ?? 'socket-construction-failed');
      return;
    }
    currentWs = ws;

    // Attach error/close listeners BEFORE handing the socket to TinyBase.
    // `createWsSynchronizer` only wires its own handlers after the WS `open`
    // event, so an aborted or failed handshake (e.g. when React 19
    // StrictMode tears down the first mount mid-handshake) would otherwise
    // surface as "connection interrupted while the page was loading".
    const earlyClose = (reason: string): void => {
      if (currentWs === ws) currentWs = undefined;
      if (!destroyed) scheduleReconnect(reason);
    };
    ws.addEventListener('error', () => earlyClose('socket-error'));
    ws.addEventListener('close', () => earlyClose('socket-closed'));

    let sync: Awaited<ReturnType<typeof createWsSynchronizer>>;
    try {
      sync = await createWsSynchronizer(store, ws);
    } catch (err) {
      connecting = false;
      setStatus({ kind: 'error', message: (err as Error).message });
      if (!destroyed) {
        try {
          ws.close();
        } catch {
        }
        currentWs = undefined;
        scheduleReconnect(reasonForReconnect ?? (err as Error).message);
      }
      return;
    }

    // If destroy() ran during the createWsSynchronizer await, the socket is
    // already closed and reaped — bail without registering reconnect handlers
    // or claiming this WS as the live one.
    if (destroyed) {
      try {
        ws.close();
      } catch {
      }
      currentWs = undefined;
      return;
    }

    currentSync = sync;
    await sync.startSync();
    attempt = 0;
    connecting = false;
    setStatus({ kind: 'connected' });
    ws.addEventListener('close', () => {
      if (currentSync === sync) currentSync = undefined;
      if (currentWs === ws) currentWs = undefined;
      scheduleReconnect('socket-closed');
    });
  }

  return {
    start(): void {
      if (destroyed) {
        throw new Error('SyncClient already destroyed');
      }
      void connect();
    },
    async destroy(): Promise<void> {
      destroyed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      const ws = currentWs;
      currentWs = undefined;
      if (ws) {
        try {
          ws.close();
        } catch {
        }
      }
      const sync = currentSync;
      currentSync = undefined;
      if (sync) {
        try {
          await sync.destroy();
        } catch {
        }
      }
    },
    get status(): SyncStatus {
      return status;
    },
    subscribe(listener: (s: SyncStatus) => void): () => void {
      listeners.add(listener);
      listener(status);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function defaultEndpoint(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  const secret = readSecret();
  if (secret) params.set('secret', secret);
  const qs = params.toString();
  return `${proto}//${window.location.host}/ws${qs ? `?${qs}` : ''}`;
}

function readSecret(): string {
  const fromEnv = import.meta.env.VITE_LOCALACTION_SYNC_SECRET;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return '';
}
