import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { createSqlite3Persister } from 'tinybase/persisters/persister-sqlite3';
import { openDatabase, type ServerDatabase } from './db.ts';

export const DEFAULT_PORT = 5173;
export const WS_PATH = '/ws';
export const STATIC_ROOT_NAME = 'dist';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATIC_ROOT = join(__dirname, '..', STATIC_ROOT_NAME);

export interface ServerOptions {
  port?: number;
  secret?: string;
  dbPath?: string;
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
  options: ServerOptions = {},
): Promise<AttachedSyncServer> {
  const secret = options.secret ?? process.env.LOCALACTION_SYNC_SECRET ?? '';
  const dbPath = options.dbPath ?? process.env.LOCALACTION_DB_PATH ?? './data.db';
  const debug = !!process.env['LOCALACTION_DEBUG'];

  // Monotonic connection counter so log lines can be correlated without
  // touching the WebSocket (whose `id` is library-defined and may collide).
  let nextConnId = 0;

  const log = (connId: number, msg: string): void => {
    process.stderr.write(`[srv conn=${connId}] ${msg}\n`);
  };

  const wsServer = new WebSocketServer({ noServer: true });

  if (debug) {
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
  }

  // One shared sqlite3 connection for the whole process. `createSqlite3Persister`
  // only needs a `Database`; opening it per WebSocket connection leaked
  // FDs (no `db.close()`) and forced the per-connection persister factory
  // to redo the schema bootstrap. The `Database` is closed in `close()`.
  const db = await openDatabase(dbPath);
  const tinyServer = createWsServer(wsServer, async (pathId) => {
    const safePathId = sanitizePathId(pathId);
    if (!safePathId) {
      throw new Error(`invalid sync path: ${pathId}`);
    }
    const store = createMergeableStore();
    const persister = createSqlite3Persister(store, db);
    process.stderr.write(
      `[srv ${safePathId}] persister created. debug=${!!process.env['LOCALACTION_DEBUG']}\n`,
    );
    if (process.env['LOCALACTION_DEBUG']) {
      const touched = new Set<string>();
      store.addCellListener(
        null,
        null,
        null,
        (_store, _tableId, _rowId, _cellId) => {
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
    return persister;
  });

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
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wsServer.emit('connection', ws, req);
    });
  });

  return {
    wsServer,
    tinyServer,
    db,
    async close() {
      await tinyServer.destroy();
      await new Promise<void>((resolve, reject) =>
        db.close((err) => (err ? reject(err) : resolve())),
      );
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

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? portFromEnv() ?? DEFAULT_PORT;
  const secret = options.secret ?? process.env.LOCALACTION_SYNC_SECRET ?? '';
  const dbPath = options.dbPath ?? process.env.LOCALACTION_DB_PATH ?? './data/data.db';
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
// `ServerOptions` already accepts a literal `dbPath`; these flags exist so
// a `bun build`-compiled binary can pick the DB at runtime without env
// tweaks. CLI values win over `LOCALACTION_DB_PATH` / `LOCALACTION_PORT`
// because `startServer` checks explicit options first, falling back to
// the env var, then the default. Unknown flags are ignored so the
// compiled binary is robust to stray args.
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
      '                   Overrides LOCALACTION_DB_PATH. Default: ./data/data.db\n' +
      '  --port <n>       TCP port to listen on. Overrides LOCALACTION_PORT.\n' +
      '                   Default: 5173\n' +
      '  -h, --help       Show this help and exit.\n',
  );
}

if (isMain) {
  const cli = parseServerArgs(process.argv.slice(2));
  if (cli.help) {
    printServerUsage(process.stdout);
    process.exit(0);
  }
  const server = await startServer({ dbPath: cli.dbPath, port: cli.port });
  console.log(`[localaction] listening on http://localhost:${server.port}`);
}

function portFromEnv(): number | undefined {
  const raw = process.env.LOCALACTION_PORT;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
