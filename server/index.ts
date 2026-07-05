import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { createSqlite3Persister } from 'tinybase/persisters/persister-sqlite3';
import sqlite3 from 'sqlite3';
import type { Database } from 'sqlite3';

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

export interface RunningServer {
  port: number;
  httpServer: Server;
  wsServer: WebSocketServer;
  tinyServer: ReturnType<typeof createWsServer>;
  close(): Promise<void>;
}

export function attachSyncServer(
  httpServer: Server,
  options: ServerOptions = {},
): { wsServer: WebSocketServer; tinyServer: ReturnType<typeof createWsServer> } {
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

  const tinyServer = createWsServer(wsServer, async (pathId) => {
    const safePathId = sanitizePathId(pathId);
    if (!safePathId) {
      throw new Error(`invalid sync path: ${pathId}`);
    }
    const db = await openDatabase(dbPath);
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

  return { wsServer, tinyServer };
}

function checkSecret(url: URL, expected: string): boolean {
  if (!expected) return true;
  return url.searchParams.get('secret') === expected;
}

function sanitizePathId(pathId: string): string {
  return pathId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function openDatabase(file: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
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
  const dbPath = options.dbPath ?? process.env.LOCALACTION_DB_PATH ?? './data.db';
  const staticRoot = options.staticRoot ?? STATIC_ROOT;

  const httpServer = createServer(createStaticFileServer(staticRoot));
  const { wsServer, tinyServer } = attachSyncServer(httpServer, {
    secret,
    dbPath,
  });

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
      await tinyServer.destroy();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const server = await startServer();
  console.log(`[localaction] listening on http://localhost:${server.port}`);
}

function portFromEnv(): number | undefined {
  const raw = process.env.LOCALACTION_PORT;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
