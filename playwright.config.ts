import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end browser tests. The config auto-starts the dev servers each
 * project needs — agents and CI can run `pnpm test:e2e` without remembering
 * to launch Vite first.
 *
 * Browser binaries are not committed; install once per machine with:
 *   pnpm exec playwright install chromium
 *
 * ## Two projects / two dev servers
 *
 * The foundation suite exercises the full PWA (manifest + service worker)
 * against a normal dev server on :5173. The OPFS persistence suite cannot
 * tolerate the dev PWA layer: `vite-plugin-pwa`'s dev SW registration
 * script triggers an `import.meta.hot.send` race (`SendBeforeConnectError`)
 * in a fresh browser context, sending the page into an infinite reload
 * loop that destroys every `page.evaluate`'s execution context. So the
 * OPFS project runs against a dedicated dev server on :5174 with
 * `LOCALACTION_E2E=1`, which makes `vite-plugin-pwa` skip the dev SW
 * injection (see `vite.config.ts`). OPFS doesn't need the PWA, so the
 * absence of the manifest / SW there is fine.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-foundation',
      testMatch: /foundation\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'chromium-opfs',
      testMatch: /opfs-persistence\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      // CRUD/feature suites run against the PWA-disabled dev server (:5174)
      // so the `vite-plugin-pwa` dev SW reload loop can't destroy execution
      // contexts mid-interaction. See `vite.config.ts` + `e2e/helpers.ts`.
      name: 'chromium-crud',
      testMatch: /crud\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'LOCALACTION_E2E=1 pnpm dev --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});