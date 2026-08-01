import { defineConfig } from '@playwright/test';
import { TEST_DB_PATH } from './e2e/test-db-path.ts';

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
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `bun run dev --port 5180 --strictPort -- --db "${TEST_DB_PATH}"`,
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_LOCALACTION_SYNC_ENABLED: 'false',
    },
  },
});
