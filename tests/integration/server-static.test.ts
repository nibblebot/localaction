/**
 * Static file server contract test.
 *
 * Boots the same `createStaticFileServer` handler the prod server uses
 * against a throwaway static root and asserts the HTTP semantics of the
 * serve path:
 *
 *   1. `/` and existing assets serve 200 with the right content type.
 *   2. A missing path is a 404 — never a 403. (A 403 here made Firefox
 *      report devtools-extension source-map requests for files we don't
 *      serve — e.g. installHook.js.map — as "Forbidden".)
 *   3. Path traversal is still refused with 403.
 *   4. The `/ws` endpoint answers plain-HTTP requests with 426.
 *
 * Runs under `bun test` (real `node:http`, no DOM).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { createStaticFileServer } from '../../server/index.ts';

let staticRoot: string;
let httpServer: Server;
let port: number;

beforeAll(async () => {
  staticRoot = mkdtempSync(join(tmpdir(), 'localaction-static-'));
  writeFileSync(join(staticRoot, 'index.html'), '<html><body>shell</body></html>');
  writeFileSync(join(staticRoot, 'app.js'), 'console.log("asset");');
  httpServer = createServer(createStaticFileServer(staticRoot));
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('unexpected server address');
  }
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
  rmSync(staticRoot, { recursive: true, force: true });
});

describe('static file server', () => {
  it('serves the shell and assets with the right content types', async () => {
    const index = await fetch(`http://127.0.0.1:${port}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toBe('<html><body>shell</body></html>');

    const asset = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('application/javascript');
  });

  it('serves bundled assets when source dist is absent', async () => {
    const bundledRoot = mkdtempSync(join(tmpdir(), 'localaction-bundled-'));
    const indexPath = join(bundledRoot, 'index.html');
    const assetPath = join(bundledRoot, 'app.js');
    writeFileSync(indexPath, '<html><body>bundled shell</body></html>');
    writeFileSync(assetPath, 'console.log("bundled asset");');

    const bundledServer = createServer(
      createStaticFileServer(join(bundledRoot, 'missing-dist'), {
        '/index.html': indexPath,
        '/app.js': assetPath,
      }),
    );
    try {
      await new Promise<void>((resolve) => bundledServer.listen(0, '127.0.0.1', resolve));
      const address = bundledServer.address();
      if (address === null || typeof address === 'string') {
        throw new Error('unexpected server address');
      }

      const index = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(index.status).toBe(200);
      expect(index.headers.get('content-type')).toContain('text/html');
      expect(await index.text()).toBe('<html><body>bundled shell</body></html>');

      const asset = await fetch(`http://127.0.0.1:${address.port}/app.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('application/javascript');
    } finally {
      await new Promise<void>((resolve, reject) =>
        bundledServer.close((err) => (err ? reject(err) : resolve())),
      );
      rmSync(bundledRoot, { recursive: true, force: true });
    }
  });

  it('answers missing paths with 404, not 403', async () => {
    const missing = await fetch(`http://127.0.0.1:${port}/installHook.js.map`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('Not found');
  });

  it('still refuses path traversal with 403', async () => {
    // fetch() and node:http clients normalize `..` away before sending, so
    // speak HTTP/1.1 raw like a hostile client would.
    const status = await new Promise<number>((resolve, reject) => {
      const sock = connect(port, '127.0.0.1', () => {
        sock.write(`GET /../secret.txt HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
      });
      sock.on('data', (chunk) => {
        const head = chunk.toString().split('\r\n')[0]!;
        if (head.startsWith('HTTP/')) resolve(Number(head.split(' ')[1]));
      });
      sock.on('error', reject);
      sock.on('close', () => resolve(0));
    });
    expect(status).toBe(403);
  });

  it('does not mistake `..` in a query string for traversal', async () => {
    const asset = await fetch(`http://127.0.0.1:${port}/app.js?token=..`);
    expect(asset.status).toBe(200);
  });

  it('answers plain-HTTP /ws requests with 426 Upgrade Required', async () => {
    const ws = await fetch(`http://127.0.0.1:${port}/ws`);
    expect(ws.status).toBe(426);
    expect(ws.headers.get('upgrade')).toBe('websocket');
  });
});
