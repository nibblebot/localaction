import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index.ts';
import { assertSyncConvergence } from './smoke-sync.ts';

const PORT = 5190 + Math.floor(Math.random() * 100);
const DB_PATH = join(tmpdir(), `localaction-smoke-${Date.now()}.db`);
const WS_URL = `ws://localhost:${PORT}/ws`;

async function main() {
  const server = await startServer({ port: PORT, dbPath: DB_PATH });
  console.log(`smoke: server up on :${server.port}, db=${DB_PATH}`);

  try {
    await assertSyncConvergence({ wsUrl: WS_URL, dbPath: DB_PATH, label: 'smoke' });
  } finally {
    await server.close();
    try {
      unlinkSync(DB_PATH);
    } catch {}
  }
}

main().then(
  () => {
    console.log('smoke: OK');
    process.exit(0);
  },
  (err) => {
    console.error('smoke: FAIL', err);
    process.exit(1);
  },
);
