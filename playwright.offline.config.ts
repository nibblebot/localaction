import { defineConfig } from '@playwright/test';
import { OFFLINE_TEST_DB_PATH } from './e2e/offline-test-db-path.ts';

// Offline (service-worker) e2e. Runs against the PRODUCTION BUILD via the
// prod server (`bun server/index.ts`) — the SW only registers in prod builds,
// so the dev server used by playwright.config.ts cannot exercise it.
// Requires `bun run build` first; the `test:e2e:offline` script chains it.
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
    baseURL: 'http://localhost:5181',
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
    command: `bun run start --port 5181 --db "${OFFLINE_TEST_DB_PATH}"`,
    url: 'http://localhost:5181',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
