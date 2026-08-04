// E2e runner wrapper (`bun run test:e2e` → `bun scripts/e2e.ts`).
//   1. reaps orphaned e2e servers from previous runs (registry + throwaway-DB
//      marker scan; see e2e/infra.ts),
//   2. self-heals a missing Playwright chromium (`bun install --ignore-scripts`),
//   3. allocates one free port for the run (LOCALACTION_E2E_PORT) and spawns
//      `playwright test`; the configs read the port back from the env — see
//      getE2eServerPort() in e2e/infra.ts (AGENTS.md's agent port rule: never
//      hardcode ports for e2e).
// `--offline` selects playwright.offline.config.ts; every other argument is
// passed through unchanged (spec paths, --headed, --grep, --list, …).
//
// The wrapper itself runs under Bun, but the Playwright CLI is spawned via
// its node-shebang bin shim (node_modules/.bin/playwright →
// @playwright/test/cli.js) — playwright/test requires the Node runtime, and
// AGENTS.md already treats Node as the runtime for Playwright binaries.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  ensurePlaywrightChromium,
  getFreePort,
  PLAYWRIGHT_BIN_PATH,
  reapOrphanE2eServers,
} from '../e2e/infra.ts';

const passthrough = process.argv.slice(2).filter((arg) => arg !== '--offline');
const offline = passthrough.length !== process.argv.length - 2;
const config = resolve(
  import.meta.dirname,
  '..',
  offline ? 'playwright.offline.config.ts' : 'playwright.config.ts',
);

reapOrphanE2eServers();
await ensurePlaywrightChromium();

// One free port per run, allocated here: Playwright re-loads the config in
// every worker process, so the port cannot be rolled per config load —
// the configs read it back from LOCALACTION_E2E_PORT (see getE2eServerPort).
const port = await getFreePort();

const child = spawn(PLAYWRIGHT_BIN_PATH, ['test', '--config', config, ...passthrough], {
  stdio: 'inherit',
  env: { ...process.env, LOCALACTION_E2E_PORT: String(port) },
});
child.on('error', (error) => {
  process.stderr.write(`error: failed to launch playwright: ${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
