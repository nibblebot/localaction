import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/index.ts';

test('startServer binds only the requested host', async () => {
  const dbPath = join(
    tmpdir(),
    `localaction-bind-${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.db`,
  );
  const server = await startServer({
    dbPath,
    host: '127.0.0.1',
    port: 0,
  });

  try {
    const address = server.httpServer.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    expect((await fetch(`http://127.0.0.1:${address.port}/`)).status).toBe(200);
  } finally {
    await server.close();
    rmSync(dbPath, { force: true });
  }
});
