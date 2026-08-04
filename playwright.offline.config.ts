import { defineConfig } from '@playwright/test';
import { OFFLINE_TEST_DB_PATH } from './e2e/offline-test-db-path.ts';
import { getE2eServerPort } from './e2e/infra.ts';

// Offline (service-worker) e2e. Runs against the PRODUCTION BUILD via the
// prod server (`bun server/index.ts`) — the SW only registers in prod builds,
// so the dev server used by playwright.config.ts cannot exercise it.
// Requires `bun run build` first; the `test:e2e:offline` script chains it.
// Port via LOCALACTION_E2E_PORT from scripts/e2e.ts (loaded once per
// process here — see playwright.config.ts and e2e/infra.ts for why).
const port = await getE2eServerPort();
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/offline-global-setup.ts',
  globalTeardown: './e2e/offline-global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `bun run prod --port ${port} --db "${OFFLINE_TEST_DB_PATH}"`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // Lets the spawned prod server self-terminate when this runner dies
      // (startOwnerWatchdog in e2e/infra.ts); scripts/e2e.ts reaps leftovers.
      LOCALACTION_OWNER_PID: String(process.pid),
    },
  },
});
