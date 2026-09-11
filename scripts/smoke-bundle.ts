// Pre-push gate: the `bun run smoke` assertions, but against the packaged
// daemon (`dist-bundle/localaction.js`) — the exact artifact `nix/module.nix`
// installs as the systemd service. Catches bundle-embedding or CLI
// regressions that source-level smoke cannot see.
//
//   bun run build && bun run smoke:bundle
//
// Spawns the daemon on a free port with a throwaway DB, asserts the embedded
// app shell serves, runs the two-client sync/persistence assertions, then
// stops the daemon and deletes the DB.
import { cpSync, existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { getFreePort } from '../e2e/infra.ts';
import { assertSyncConvergence } from './smoke-sync.ts';

const ROOT = join(import.meta.dir, '..');
const DIST_BUNDLE = join(ROOT, 'dist-bundle');
const DB_PATH = join(tmpdir(), `localaction-bundle-smoke-${Date.now()}-${process.pid}.db`);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url: string, timeoutMs = 15_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return res;
      await res.arrayBuffer().catch(() => {});
    } catch {
      // daemon not listening yet
    }
    if (Date.now() >= deadline) {
      throw new Error(`timeout waiting for ${url} to serve 200`);
    }
    await sleep(100);
  }
}

async function stopDaemon(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(50);
  }
  if (child.exitCode === null) child.kill('SIGKILL');
}

function cleanupDb(): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // already gone
    }
  }
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST_BUNDLE, 'localaction.js'))) {
    throw new Error('dist-bundle/localaction.js missing — run `bun run build` first');
  }
  // Stage an isolated copy: the daemon resolves its disk static root as
  // `<exe>/../dist`, which exists in a source checkout (repo dist/) and would
  // shadow the embedded assets per createStaticFileServer's disk-first order.
  // The Nix store has no dist/ sibling ($out/libexec/localaction.js), so serve
  // from a copy to force the EMBEDDED_DIST path the service actually uses.
  const stage = mkdtempSync(join(tmpdir(), 'localaction-bundle-stage-'));
  cpSync(DIST_BUNDLE, join(stage, 'dist-bundle'), { recursive: true });
  const bundle = join(stage, 'dist-bundle', 'localaction.js');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  try {
    child = spawn(process.execPath, [bundle, '--host', '127.0.0.1', '--port', String(port), '--db', DB_PATH], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    console.log(`bundle-smoke: daemon pid=${child.pid} on :${port}, db=${DB_PATH}, stage=${stage}`);
    const root = await waitForHttpOk(`${baseUrl}/`);
    const contentType = root.headers.get('content-type') ?? '';
    await root.arrayBuffer();
    if (!contentType.includes('text/html')) {
      throw new Error(`GET / served unexpected content-type ${JSON.stringify(contentType)} — embedded dist broken?`);
    }
    console.log('bundle-smoke: GET / serves the app shell (embedded dist OK)');
    await assertSyncConvergence({
      wsUrl: `${baseUrl.replace('http', 'ws')}/ws`,
      dbPath: DB_PATH,
      label: 'bundle-smoke',
    });
  } finally {
    if (child) await stopDaemon(child);
    cleanupDb();
    rmSync(stage, { recursive: true, force: true });
  }
}

main().then(
  () => {
    console.log('bundle-smoke: OK');
    process.exit(0);
  },
  (err) => {
    console.error('bundle-smoke: FAIL', err);
    process.exit(1);
  },
);
