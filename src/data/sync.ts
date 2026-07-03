/**
 * Browser-side sync client that connects the local MergeableStore to the
 * server's WebSocket synchronizer.
 *
 * Reconnect: TinyBase's WsSynchronizer does not retry by itself — once the
 * underlying WebSocket closes, the synchronizer is considered done. So we own
 * the reconnect loop here: when the socket closes (or `startSync` rejects),
 * we wait with exponential backoff and try again.
 *
 * Auth: the secret is read from `VITE_LOCALACTION_SYNC_SECRET` (mirrors
 * `LOCALACTION_SYNC_SECRET` on the server). Empty defaults are rejected so
 * misconfigured prod deployments don't accidentally ship an open WS endpoint.
 *
 * Why sync is opt-in from `startSync`: the React provider calls this from an
 * effect; we don't want the start promise to block first paint.
 */

import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { getStore } from './store.ts';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;

export interface SyncClient {
  start(): void;
  destroy(): Promise<void>;
  readonly status: SyncStatus;
  /** Fires whenever the connection status changes. */
  subscribe(listener: (status: SyncStatus) => void): () => void;
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'retrying'; attempt: number; nextDelayMs: number; reason: string }
  | { kind: 'error'; message: string };

export interface SyncClientOptions {
  /** Override the WebSocket constructor (used in tests). */
  webSocketImpl?: typeof WebSocket;
  /** Override the endpoint URL entirely (used in tests). */
  endpoint?: string;
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
    setStatus({ kind: 'connecting' });

    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
      scheduleReconnect(reasonForReconnect ?? 'socket-construction-failed');
      return;
    }

    try {
      const sync = await createWsSynchronizer(store, ws);
      currentSync = sync;
      await sync.startSync();
      attempt = 0;
      setStatus({ kind: 'connected' });
      ws.addEventListener('close', () => {
        currentSync = undefined;
        scheduleReconnect('socket-closed');
      });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
      try {
        ws.close();
      } catch {
        // ignore
      }
      scheduleReconnect(reasonForReconnect ?? (err as Error).message);
    }
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
      const sync = currentSync;
      currentSync = undefined;
      if (sync) {
        try {
          await sync.destroy();
        } catch {
          // best-effort cleanup
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
