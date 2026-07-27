import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { openDatabase, defaultDbPath, type ServerDatabase } from './db.ts';
import { createServerPersister, dropLegacyJsonTable } from './persister.ts';
export const DEFAULT_PORT = 5173;
export const WS_PATH = '/ws';
export const STATIC_ROOT_NAME = 'dist';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATIC_ROOT = join(__dirname, '..', STATIC_ROOT_NAME);

export interface ServerOptions {
  port?: number;
  secret?: string;
  // Required: no built-in default. Entry points (`scripts/dev.ts`, the CLI
  // below) pass `defaultDbPath()` explicitly; tests/smoke must name their
  // own throwaway path so a run can never touch the user's real store by
  // accident.
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

  // Monotonic connection counter so log lines can be correlated without
  // touching the WebSocket (whose `id` is library-defined and may collide).
  let nextConnId = 0;

  const log = (connId: number, msg: string): void => {
    process.stderr.write(`[srv conn=${connId}] ${msg}\n`);
  };

  const wsServer = new WebSocketServer({ noServer: true });

  // Track the TCP sockets we upgrade so close() can destroy them. Bun's
  // node:http compat keeps upgraded sockets registered as open
  // connections, so `httpServer.close()`'s callback never fires without
  // this (Node detaches them at upgrade time and doesn't need it).
  const openSockets = new Set<Duplex>();

  wsServer.on('connection', (ws, req) => {
    const connId = ++nextConnId;
    const remote = `${req.socket.remoteAddress ?? '?'}:${req.socket.remotePort ?? '?'}`;
    log(connId, `connected from ${remote}`);
    ws.on('message', (data, isBinary) => {
      let size: number;
      if (Array.isArray(data)) {
        size = Buffer.concat(data).byteLength;
      } else if (Buffer.isBuffer(data)) {
        size = data.byteLength;
      } else if (data instanceof ArrayBuffer) {
        size = data.byteLength;
      } else {
        size = Buffer.byteLength(data);
      }
      const kind = isBinary ? 'binary' : 'text';
      log(connId, `recv ${kind} ${size}B`);
    });
    ws.on('close', (code, reason) => {
      log(connId, `closed code=${code} reason=${reason.toString('utf8') || '(empty)'}`);
    });
    ws.on('error', (err) => {
      log(connId, `error: ${err.message}`);
    });
  });
  // One shared bun:sqlite connection for the whole process. `createSqliteBunPersister`
  // only needs a `Database`; opening it per WebSocket connection leaked
  // FDs (no `db.close()`) and forced the per-connection persister factory
  // to redo the schema bootstrap. The `Database` is closed in `close()`.
  const db = openDatabase(dbPath);
  await dropLegacyJsonTable(db);
  // requestTimeoutSeconds=0.25 (TinyBase default: 1s). While TinyBase's
  // ws-server configures/starts a per-path server client (which happens on
  // EVERY sole-client connect — it tears the path down when the last client
  // disconnects), all inbound messages are buffered. That includes the
  // response to the server's own initial sync pull, so that pull always dies
  // at this timeout before the path goes Ready and the buffer replays. With
  // the 1s default, the buffered client pull was answered at ~1.05s — just
  // after the client's own 1s request timeout — so the initial sync silently
  // aborted and data only flowed when a later local mutation (OPFS load)
  // pushed ContentHashes: the multi-second "slow initial sync" on every
  // page reload. 0.25s gets the path Ready fast enough for the client's
  // pull to be answered within its timeout; healthy responses on localhost
  // take <10ms, so the smaller budget changes nothing in steady state.
  const tinyServer = createWsServer(
    wsServer,
    async (pathId) => {
      const safePathId = sanitizePathId(pathId);
      if (!safePathId) {
        throw new Error(`invalid sync path: ${pathId}`);
      }
      const store = createMergeableStore();
      process.stderr.write(
        `[srv ${safePathId}] persister created. debug=${!!process.env['LOCALACTION_DEBUG']}\n`,
      );
      if (process.env['LOCALACTION_DEBUG']) {
        const touched = new Set<string>();
        store.addCellListener(
          null,
          null,
          null,
          (_store: MergeableStore, _tableId: string, _rowId: string, _cellId: string) => {
            touched.add(_tableId);
            process.stderr.write(
              `[srv ${safePathId}] cell changed: ${_tableId}/${_rowId}/${_cellId}\n`,
            );
          },
        );
        store.addDidFinishTransactionListener(() => {
          process.stderr.write(
            `[srv ${safePathId}] tx finished | touched: ${Array.from(touched).sort().join(',')} | store tables: ${Object.keys(store.getTables()).sort().join(',')}\n`,
          );
          touched.clear();
        });
      }
      return createServerPersister(store, db);
    },
    undefined,
    0.25,
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
      process.stderr.write(`[srv upgrade] 401 secret mismatch on ${url.pathname}\n`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    process.stderr.write(`[srv upgrade] upgrading ${url.pathname}\n`);
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    wsServer.handleUpgrade(req, socket, head, (ws: WsWebSocket) => {
      wsServer.emit('connection', ws, req);
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

export function createStaticFileServer(staticRoot: string) {
  return function serve(req: IncomingMessage, res: ServerResponse): void {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === WS_PATH) {
      res.writeHead(426, { Upgrade: 'websocket' });
      res.end();
      return;
    }
    const target = resolveStaticPath(staticRoot, url.pathname);
    if (!target) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const data = readFileSync(target);
      res.writeHead(200, {
        'content-type': mimeFor(target),
        'cache-control': 'no-cache',
      });
      res.end(data);
    } catch {
      try {
        const html = readFileSync(join(staticRoot, 'index.html'));
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    }
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
  const secret = options.secret ?? process.env.LOCALACTION_SYNC_SECRET ?? '';
  const dbPath = options.dbPath;
  const staticRoot = options.staticRoot ?? STATIC_ROOT;

  const httpServer = createServer(createStaticFileServer(staticRoot));
  const { wsServer, tinyServer, close: closeSync } = await attachSyncServer(
    httpServer,
    {
      secret,
      dbPath,
    },
  );

  await new Promise<void>((resolve) => httpServer.listen(port, () => resolve()));

  if (!secret) {
    console.warn(
      '[localaction] LOCALACTION_SYNC_SECRET is empty; /ws accepts any client. ' +
      'Set this env var in production.',
    );
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
    },
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
interface CliArgs {
  dbPath?: string;
  port?: number;
  help: boolean;
}

// CLI flag parsing for the prod-server entrypoint (`bun run start`).
// `ServerOptions` already accepts a literal `dbPath`/`port`; these flags let
// the entry (`bun server/index.ts`) pick them at runtime. When `--db` is
// absent the entry falls back to `defaultDbPath()` (platform user-data dir);
// `startServer` itself has no fallback. Unknown flags are ignored so the
// entry is robust to stray args.
function parseServerArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--db') {
      const next = argv[++i];
      if (next) out.dbPath = next;
    } else if (arg.startsWith('--db=')) {
      out.dbPath = arg.slice('--db='.length);
    } else if (arg === '--port') {
      const next = argv[++i];
      const parsed = next ? Number(next) : NaN;
      if (Number.isFinite(parsed)) out.port = parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed)) out.port = parsed;
    }
  }
  return out;
}

function printServerUsage(stream: NodeJS.WriteStream): void {
  stream.write(
    'Usage: localaction [options]\n' +
      '\n' +
      '  --db <path>      SQLite file for the TinyBase sync persister.\n' +
      `                   Default: ${defaultDbPath()}\n` +
      '  --port <n>       TCP port to listen on. Default: 5173\n' +
      '  -h, --help       Show this help and exit.\n',
  );
}

if (isMain) {
  const cli = parseServerArgs(process.argv.slice(2));
  if (cli.help) {
    printServerUsage(process.stdout);
    process.exit(0);
  }
  const server = await startServer({ dbPath: cli.dbPath ?? defaultDbPath(), port: cli.port });
  console.log(`[localaction] listening on http://localhost:${server.port}`);
}
