#!/usr/bin/env bun
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import {
  defaultPreviewDbPath,
  defaultProdDbPath,
  openDatabase,
  type ServerDatabase,
} from './db.ts';
import { startOwnerWatchdog } from './e2e-watchdog.ts';
import { createServerPersister, dropLegacyJsonTable } from './persister.ts';
import { logInfo, logWarn } from '../src/log.ts';
import { EMBEDDED_DIST } from './embedded-dist.ts';
export const DEFAULT_PORT = 7373;
// Default port for `bun run preview` (plain `bun run prod` uses `DEFAULT_PORT`).
export const PREVIEW_PORT = 7474;
export const WS_PATH = '/ws';
export const STATIC_ROOT_NAME = 'dist';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATIC_ROOT = join(__dirname, '..', STATIC_ROOT_NAME);

export interface ServerOptions {
  port?: number;
  host?: string;
  secret?: string;
  // Required: no built-in default. Entry points (`scripts/dev.ts`, the CLI
  // below) pass `defaultDevDbPath()`/`defaultProdDbPath()` explicitly;
  // tests/smoke must name their own throwaway path so a run can never touch
  // the user's real store by accident.
  dbPath: string;
  staticRoot?: string;
}

/**
 * Return type of `createWsServer` from `tinybase/synchronizers/synchronizer-ws-server`.
 * TinyBase does not export a name for it, so we declare it here for use
 * across the public `RunningServer` surface and the `attachSyncServer`
 * return type — keeps callers off `ReturnType<typeof createWsServer>`.
 */
export type TinySyncServer = ReturnType<typeof createWsServer>;

export interface RunningServer {
  port: number;
  httpServer: Server;
  wsServer: WebSocketServer;
  tinyServer: TinySyncServer;
  close(): Promise<void>;
}

export interface AttachedSyncServer {
  wsServer: WebSocketServer;
  tinyServer: TinySyncServer;
  db: ServerDatabase;
  close(): Promise<void>;
}

export async function attachSyncServer(
  httpServer: Server,
  options: ServerOptions,
): Promise<AttachedSyncServer> {
  const secret = options.secret ?? process.env.LOCALACTION_SYNC_SECRET ?? '';
  const dbPath = options.dbPath;

  const wsServer = new WebSocketServer({ noServer: true });

  // Track the TCP sockets we upgrade so close() can destroy them. Bun's
  // node:http compat keeps upgraded sockets registered as open
  // connections, so `httpServer.close()`'s callback never fires without
  // this (Node detaches them at upgrade time and doesn't need it).
  const openSockets = new Set<Duplex>();
  // One shared bun:sqlite connection for the whole process. `createSqliteBunPersister`
  // only needs a `Database`; opening it per WebSocket connection leaked
  // FDs (no `db.close()`) and forced the per-connection persister factory
  // to redo the schema bootstrap. The `Database` is closed in `close()`.
  const db = openDatabase(dbPath);
  await dropLegacyJsonTable(db);
  // requestTimeoutSeconds=0.1 (TinyBase default: 1s). While TinyBase's
  // ws-server configures/starts a per-path server client (which happens on
  // EVERY sole-client connect — it tears the path down when the last client
  // disconnects), all inbound messages are buffered. That includes the
  // response to the server's own initial sync pull, so that pull can never
  // be answered: it always dies at this timeout before the path goes Ready
  // and the buffer replays. The timeout is therefore PURE dead wait on every
  // connect — measured as ~250ms of the ~256ms client connect time at 0.25s
  // — and the only thing it must outlive is the SQLite load (0-10ms here),
  // so smaller is strictly better. The floor is the buffer expiry
  // (timeout*10): a huge database that loads slower than 1s would have its
  // buffered messages expire and the client overflow-killed — 0.1s keeps
  // that budget at 1s. Historically this was 1s and the ~1.05s path Ready
  // landed just AFTER the client's own 1s request timeout, silently
  // aborting the initial sync (data only flowed once a later local mutation
  // pushed ContentHashes): the multi-second "slow initial sync" on every
  // page reload. The client now allows 10s for its pull, so the server
  // staying under 1s is what matters.
  const tinyServer = createWsServer(
    wsServer,
    async (pathId) => {
      const safePathId = sanitizePathId(pathId);
      if (!safePathId) {
        throw new Error(`invalid sync path: ${pathId}`);
      }
      const store = createMergeableStore();
      logInfo('sync', `persister created for path ${safePathId}`);
      const persister = createServerPersister(store, db);
      // Time the SQLite load: the ws-server's per-path startup calls
      // startAutoSave() (which loads the DB content into the path store)
      // before the path goes Ready, and the client's first pull is
      // buffered until then — the load duration is the dominant
      // server-side term of the connect time. The client's own TTC
      // (`Connected 1.2s` in the sync log) includes it.
      const loadStartedAt = Date.now();
      const load = persister.startAutoSave.bind(persister);
      return {
        ...persister,
        async startAutoSave() {
          const result = await load();
          logInfo('sync', `path store loaded in ${Date.now() - loadStartedAt}ms`);
          return result;
        },
      };
    },
    undefined,
    0.1,
  );

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url) {
      return;
    }
    // Only handle our sync path. Anything else (notably Vite's own HMR
    // WebSocket on its own path) must fall through to other listeners
    // — destroying the socket here was killing Vite's HMR client and
    // surfacing "[vite] failed to connect to websocket" in Firefox.
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== WS_PATH) {
      return;
    }
    if (!checkSecret(url, secret)) {
      logWarn('sync', `ws upgrade rejected, secret mismatch (${url.pathname})`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    logInfo('sync', `ws upgrade accepted (${url.pathname})`);
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    wsServer.handleUpgrade(req, socket, head, (ws: WsWebSocket) => {
      wsServer.emit('connection', ws, req);
      logInfo('sync', `client connected (${wsServer.clients.size} online)`);
      ws.on('close', () => {
        logInfo('sync', `client disconnected (${wsServer.clients.size} online)`);
      });
    });
  });

  return {
    wsServer,
    tinyServer,
    db,
    async close() {
      // Sockets first: TinyBase's destroy waits on server-side client
      // close events, and under Bun the upgraded sockets are the only
      // handle that reliably ends them.
      for (const socket of openSockets) {
        socket.destroy();
      }
      await tinyServer.destroy();
      db.close();
      logInfo('persistence', 'closed sqlite');
    },
  };
}

function checkSecret(url: URL, expected: string): boolean {
  if (!expected) return true;
  return url.searchParams.get('secret') === expected;
}

function sanitizePathId(pathId: string): string {
  return pathId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Source runs read the Vite output from dist/. The package build replaces the
// empty EMBEDDED_DIST stub with file imports, whose emitted paths live beside
// the bundled executable in dist-bundle/.
export function createStaticFileServer(
  staticRoot: string,
  bundledAssets: Readonly<Record<string, string>> = EMBEDDED_DIST,
) {
  return function serve(req: IncomingMessage, res: ServerResponse): void {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    // Check the raw request target before URL parsing: WHATWG URL
    // normalization resolves `..` away, so a traversal attempt like
    // `/../secret` would otherwise read as a plain missing path. Only the
    // path part counts — a query string may legitimately contain `..`.
    const rawPath = req.url.split('?')[0] ?? req.url;
    if (rawPath.includes('..') || rawPath.includes('\0')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === WS_PATH) {
      res.writeHead(426, { Upgrade: 'websocket' });
      res.end();
      return;
    }

    const diskPath = resolveStaticPath(staticRoot, url.pathname);
    if (diskPath) {
      try {
        const data = readFileSync(diskPath);
        res.writeHead(200, {
          'content-type': mimeFor(diskPath),
          'cache-control': 'no-cache',
        });
        res.end(data);
        return;
      } catch {
        // The file disappeared or became unreadable after resolution. Try the
        // bundled copy before reporting it missing.
      }
    }

    const assetKey = url.pathname === '/' ? '/index.html' : url.pathname;
    const bundledPath = bundledAssets[assetKey];
    if (bundledPath) {
      try {
        const data = readFileSync(bundledPath);
        res.writeHead(200, {
          'content-type': mimeFor(assetKey),
          'cache-control': 'no-cache',
        });
        res.end(data);
        return;
      } catch {
        // The package is incomplete or the emitted asset was removed.
      }
    }

    // A missing file is a 404, not a permission error. (403 here used to
    // make Firefox report devtools-extension source-map requests for paths we
    // don't serve — e.g. installHook.js.map — as "Forbidden".)
    res.writeHead(404);
    res.end('Not found');
  };
}

function resolveStaticPath(root: string, pathname: string): string | undefined {
  if (pathname.includes('..') || pathname.includes('\0')) return undefined;
  const clean = pathname === '/' ? '/index.html' : pathname;
  const target = join(root, clean);
  if (!target.startsWith(root)) return undefined;
  if (!existsSync(target)) return undefined;
  if (statSync(target).isDirectory()) {
    return join(target, 'index.html');
  }
  return target;
}

function mimeFor(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host;
  const secret = options.secret ?? process.env.LOCALACTION_SYNC_SECRET ?? '';
  const dbPath = options.dbPath;
  const staticRoot = options.staticRoot ?? STATIC_ROOT;
  logInfo(
    'server',
    `starting (host ${host ?? 'all interfaces'}, port ${port}, db ${dbPath}, static ${staticRoot})`,
  );

  const httpServer = createServer(createStaticFileServer(staticRoot));
  const {
    wsServer,
    tinyServer,
    close: closeSync,
  } = await attachSyncServer(httpServer, {
    secret,
    dbPath,
  });

  await new Promise<void>((resolve) => {
    if (host) {
      httpServer.listen(port, host, resolve);
    } else {
      httpServer.listen(port, resolve);
    }
  });
  logInfo('server', `listening on ${host ?? 'all interfaces'}:${port}`);

  // Arms the e2e owner watchdog when LOCALACTION_OWNER_PID is set (Playwright
  // webServer env) so an abandoned e2e server exits on its own; a no-op for
  // normal `bun run prod`/`preview`.
  startOwnerWatchdog({ port, dbPath });

  if (!secret) {
    logWarn('server', 'sync secret empty, /ws accepts any client');
  }

  return {
    port,
    httpServer,
    wsServer,
    tinyServer,
    async close() {
      await closeSync();
      // With `noServer:true`, destroying the sync server does not close
      // already-connected WebSockets; terminate them so httpServer.close()
      // resolves instead of hanging on open sockets.
      for (const client of wsServer.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
      logInfo('server', 'closed');
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
interface CliArgs {
  dbPath?: string;
  host?: string;
  port?: number;
  help: boolean;
  preview: boolean;
}

// CLI flag parsing for the prod-server entrypoint (`bun run prod`).
// `ServerOptions` already accepts a literal `dbPath`/`host`/`port`; these
// flags let the entry (`bun server/index.ts`) pick them at runtime. When
// `--db` is absent the entry falls back to `defaultProdDbPath()` (platform
// user-data dir), or to `defaultPreviewDbPath()` under `--preview`;
// `startServer` itself has no DB fallback. Unknown flags are ignored so the
// entry is robust to stray args.
function parseServerArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { help: false, preview: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--db') {
      const next = argv[++i];
      if (next) out.dbPath = next;
    } else if (arg.startsWith('--db=')) {
      out.dbPath = arg.slice('--db='.length);
    } else if (arg === '--host') {
      const next = argv[++i];
      if (next) out.host = next;
    } else if (arg.startsWith('--host=')) {
      out.host = arg.slice('--host='.length);
    } else if (arg === '--port') {
      const next = argv[++i];
      const parsed = next ? Number(next) : NaN;
      if (Number.isFinite(parsed)) out.port = parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed)) out.port = parsed;
    } else if (arg === '--preview') {
      out.preview = true;
    }
  }
  return out;
}

function printServerUsage(stream: NodeJS.WriteStream): void {
  stream.write(
    'Usage: localaction [options]\n' +
      '\n' +
      '  --db <path>      SQLite file for the TinyBase sync persister.\n' +
      `                   Default: ${defaultProdDbPath()}\n` +
      '  --host <address>  Address to bind. Default: all interfaces\n' +
      '  --port <n>       TCP port to listen on. Default: 7373\n' +
      '  --preview        Preview mode: port defaults to 7474 and the db to\n' +
      `                   ${defaultPreviewDbPath()} (explicit --port/--db win).\n` +
      '  -h, --help       Show this help and exit.\n',
  );
}

if (isMain) {
  const cli = parseServerArgs(process.argv.slice(2));
  if (cli.help) {
    printServerUsage(process.stdout);
    process.exit(0);
  }
  await startServer({
    host: cli.host,
    dbPath: cli.dbPath ?? (cli.preview ? defaultPreviewDbPath() : defaultProdDbPath()),
    port: cli.port ?? (cli.preview ? PREVIEW_PORT : DEFAULT_PORT),
  });
}
