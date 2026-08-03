import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { getStore } from './store.ts';
import { logInfo, logWarn } from '../log.ts';

// Module-level singleton. One SyncClient per page, started lazily and
// never destroyed by React effects. Survives StrictMode's mount →
// unmount → remount cycle, which would otherwise open the WebSocket
// twice and have the first connection torn down mid-handshake on the
// fake unmount — surfacing as "Firefox can’t establish a connection
// to the server at ws://…/ws" / "interrupted while the page was
// loading" in the browser console.

// Linear backoff: 5 s step per retry → 5/10/15/20 s across 4 retries.
// With the initial connect that's 5 tries total before giving up.
const RECONNECT_STEP_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 4;

// TinyBase rejects createWsSynchronizer with its internal error codes
// (`new Error('tinybase:<code>')`) rather than descriptive messages.
// Translate the codes a failed connect can actually surface into
// something actionable; unknown codes keep a generic label.
const TINYBASE_CONNECT_ERRORS: Record<string, string> = {
  // ERROR_MULTIPLEX_SOCKET: the socket errored or closed before the sync
  // handshake completed — the normal signature of an unreachable server.
  '5': 'server unreachable (socket failed before the sync handshake)',
};

function describeConnectFailure(err: unknown): string {
  const message = (err as Error).message ?? String(err);
  const match = /^tinybase:(\d+)$/.exec(message);
  if (!match) return message;
  return TINYBASE_CONNECT_ERRORS[match[1]] ?? `TinyBase sync error ${match[1]}`;
}

export interface SyncClient {
  start(): void;
  /**
   * Manual re-arm after the reconnect loop gives up: resets the attempt
   * counter and starts a fresh connect. No-op while a connect or retry
   * timer is already in flight, while connected, or after destroy.
   */
  retry(): void;
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
  /**
   * Test seam: override the synchronizer factory. The StrictMode
   * regression test injects a never-resolving factory to hold the
   * race window open (module-level mocking leaks across `bun test`
   * files, so injection is the only reliable seam).
   */
  synchronizerImpl?: typeof createWsSynchronizer;
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
  // Latched when the reconnect loop gives up: the terminal `error`
  // status is emitted exactly once even though a failure's paths
  // (socket error/close, synchronizer rejection) all re-enter
  // scheduleReconnect. Reset by retry() and by a successful connect.
  let gaveUp = false;
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
    switch (next.kind) {
      case 'connecting':
        logInfo('sync', `connecting to ${url}`);
        break;
      case 'connected':
        logInfo('sync', `connected to ${url}`);
        break;
      case 'retrying':
        logInfo('sync', `retry #${next.attempt} in ${next.nextDelayMs}ms (reason: ${next.reason})`);
        break;
      case 'error':
        logWarn('sync', `error: ${next.message}`);
        break;
      case 'idle':
        break;
    }
    status = next;
    for (const listener of listeners) listener(next);
  }

  function scheduleReconnect(reason: string): void {
    // One pending retry at a time. A single failed connect surfaces via
    // the synchronizer rejection AND the socket's error+close events;
    // without this guard each path stacked its own timer and the retry
    // count exploded (observed: Retry #17 within a minute of downtime).
    if (destroyed || retryTimer !== undefined) return;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      // Terminal state — re-armed only by a successful connect or a
      // manual retry() from the badge's retry button.
      if (gaveUp) return;
      gaveUp = true;
      setStatus({
        kind: 'error',
        message: `gave up after ${attempt + 1} tries (${reason})`,
      });
      return;
    }
    attempt += 1;
    const delay = RECONNECT_STEP_MS * attempt;
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
    const attemptStart = Date.now();
    setStatus({ kind: 'connecting' });

    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch (err) {
      connecting = false;
      // No error status here — scheduleReconnect emits `retrying` (or the
      // terminal give-up). A separate `error` first would flash red for
      // the whole backoff window before each retry fires.
      logWarn('sync', `socket construction failed: ${(err as Error).message}`);
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
      // A refused socket fires 'error' then 'close' for the same
      // failure — count it once.
      if (currentWs !== ws) return;
      currentWs = undefined;
      if (!destroyed) scheduleReconnect(reason);
    };
    ws.addEventListener('error', () => earlyClose('socket-error'));
    ws.addEventListener('close', () => earlyClose('socket-closed'));

    let sync: Awaited<ReturnType<typeof createWsSynchronizer>>;
    try {
      // requestTimeoutSeconds=10 (TinyBase default: 1s). On a sole-client
      // connect the server buffers inbound messages until its per-path
      // persister + synchronizer finish starting (SQLite load + its own
      // initial-pull timeout). The client's first GetContentHashes pull is
      // only answered once the path goes Ready — with the 1s default that
      // answer arrived just AFTER the client had already given up, silently
      // aborting the initial sync and gating all data flow on the next
      // local store mutation (OPFS load). 10s keeps the pull alive across
      // slow server-side starts; aborted chains fail silently anyway, so a
      // larger budget costs nothing in steady state.
      sync = await (options.synchronizerImpl ?? createWsSynchronizer)(store, ws, 10);
      logInfo('sync', `connect handshake in ${Date.now() - attemptStart}ms`);
    } catch (err) {
      connecting = false;
      // No error status here either — scheduleReconnect owns the status
      // (`retrying`, or the terminal give-up error). Setting `error`
      // first would flash red between yellow retries.
      const message = describeConnectFailure(err);
      logWarn('sync', `connect failed: ${message}`);
      if (!destroyed) {
        try {
          ws.close();
        } catch {
        }
        currentWs = undefined;
        scheduleReconnect(reasonForReconnect ?? message);
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
    logInfo('sync', `initial sync complete in ${Date.now() - attemptStart}ms`);
    attempt = 0;
    gaveUp = false;
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
    retry(): void {
      if (destroyed || connecting || retryTimer !== undefined || currentSync !== undefined) {
        return;
      }
      attempt = 0;
      gaveUp = false;
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
      logInfo('sync', 'destroyed');
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
