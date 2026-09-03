import { defineConfig } from '@playwright/test';
import { TEST_DB_PATH } from './e2e/test-db-path.ts';
import { getE2eServerPort, systemChromiumPath } from './e2e/infra.ts';

// Free port per run (AGENTS.md agent port rule — e2e never hardcodes ports).
// The port comes from LOCALACTION_E2E_PORT, set by scripts/e2e.ts: this file
// is loaded once per process (runner + workers), so rolling the port here
// would desync webServer.command from use.baseURL. Top-level await rather
// than an async default export — Playwright 1.61 does not await the default
// export (see e2e/infra.ts header).
const port = await getE2eServerPort();
const baseURL = `http://localhost:${port}`;

// NixOS: Playwright's downloaded chromium cannot execute there, so drive the
// Nix-packaged system chromium instead (see systemChromiumPath in
// e2e/infra.ts). Undefined elsewhere — Playwright uses its own build.
const chromiumPath = systemChromiumPath();

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    '**/global-setup.ts',
    '**/global-teardown.ts',
    '**/test-db-path.ts',
    '**/offline.spec.ts',
    '**/offline-test-db-path.ts',
    '**/offline-global-setup.ts',
    '**/offline-global-teardown.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${port} --strictPort -- --db "${TEST_DB_PATH}"`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_LOCALACTION_SYNC_ENABLED: 'false',
      // Lets the spawned dev server self-terminate when this runner dies
      // (startOwnerWatchdog in e2e/infra.ts); scripts/e2e.ts reaps leftovers.
      LOCALACTION_OWNER_PID: String(process.pid),
    },
  },
});
