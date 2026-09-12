import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/index.ts';

test('startServer binds only the requested host and serves its static root', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'localaction-bind-'));
  const dbPath = join(dir, 'bind.db');
  const staticRoot = join(dir, 'dist');
  mkdirSync(staticRoot);
  writeFileSync(join(staticRoot, 'index.html'), '<html><body>shell</body></html>');

  const server = await startServer({
    dbPath,
    staticRoot,
    host: '127.0.0.1',
    port: 0,
  });

  try {
    const address = server.httpServer.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    expect((await fetch(`http://127.0.0.1:${address.port}/`)).status).toBe(200);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
