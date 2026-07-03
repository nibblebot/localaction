import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { evalStable } from './helpers.ts';

/**
 * OPFS persistence end-to-end test (ADR-0003).
 *
 * Verifies TinyBase's `createOpfsPersister` actually round-trips the
 * `MergeableStore` through the origin private file system across a full
 * browser reload. This is the property the pre-OPFS IndexedDB custom
 * persister never satisfied (it never called `load()`), and it is exactly
 * the property we cannot unit-test without a real browser context — jsdom
 * has no OPFS and no File System Access API.
 *
 * The test reads/writes the live store through the dev-only
 * `window.__LOCALACTION` hook exposed by `DataLayerProvider` (gated on
 * `import.meta.env.DEV`, inert in production builds).
 *
 * This suite runs against a dedicated dev server on :5174 with
 * `LOCALACTION_E2E=1`, which makes `vite-plugin-pwa` skip its dev service
 * worker registration path. Without that gate the dev SW registration
 * script races the HMR WebSocket (`SendBeforeConnectError`) and the page
 * enters a reload loop that destroys every `page.evaluate`'s execution
 * context. Even with the gate a brief reload can still race, so every
 * evaluate goes through the shared `evalStable` retry helper (see
 * `./helpers.ts`). The foundation suite runs against a normal dev server
 * on :5173 and keeps exercising the full PWA. See `playwright.config.ts`
 * and `vite.config.ts`.
 *
 * Why `waitUntil: 'commit'`: the page can re-navigate shortly after load
 * (dev HMR / service-worker activation); `commit` returns as soon as the
 * response is committed, before that reload can interrupt, and we then poll
 * the dev hook for readiness through the reload window via `evalStable`.
 *
 * We don't assert a "store is empty on a clean OPFS" case separately: the
 * sync server (itself running in the same dev process) would repopulate
 * the store from its own persistence regardless of the OPFS file, so such
 * an assertion would test the sync server's state, not OPFS. The round-trip
 * test below is the meaningful OPFS verification.
 */
test.describe.serial('OPFS persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });
    // Clear the OPFS file so the round-trip test starts from a known empty
    // file. (The OPFS root persists across page reloads.)
    await evalStable(page, async () => {
      const root = await navigator.storage.getDirectory();
      try {
        await root.removeEntry('localaction.json');
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
          throw err;
        }
      }
    });
  });

  test('a written cell survives a full reload via OPFS', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });

    const SENTINEL = 'opfs-roundtrip-' + Date.now();
    // Wait for the dev hook to be ready AND write the sentinel in the same
    // evaluate, so a transient reload between "ready" and "write" can't
    // throw on `window.__LOCALACTION!.store`. The poll retries until the
    // write returns true (or times out, which is the real failure).
    await expect
      .poll(
        async () =>
          evalStable(page, (value: string) => {
            const hook = window.__LOCALACTION;
            if (!hook?.persistenceReady) return false;
            hook.store.setCell('domains', 'd-opfs', 'name', value);
            return true;
          }, SENTINEL),
        { timeout: 15_000, intervals: [100, 250, 500] },
      )
      .toBe(true);

    // The file-contains-sentinel poll proves OPFS actually wrote the
    // mergeable content to disk.
    await expect
      .poll(async () => readOpfsFileText(page), { timeout: 10_000 })
      .toContain(SENTINEL);

    // Reload — the provider runs `persister.load()` on boot; if persistence
    // works, the sentinel comes straight back from the OPFS file. Poll with
    // optional chaining so a transient "hook not yet re-attached after
    // reload" frame retries rather than failing.
    await page.reload({ waitUntil: 'commit' });
    await expect
      .poll(
        async () =>
          evalStable(page, () =>
            window.__LOCALACTION?.store?.getCell(
              'domains',
              'd-opfs',
              'name',
            ) as string | undefined,
          ),
        // Generous: a reload race can briefly reset the hook; this poll
        // tolerates several reload cycles before giving up.
        { timeout: 25_000, intervals: [100, 200, 500, 1000] },
      )
      .toBe(SENTINEL);
  });
});

async function readOpfsFileText(page: Page): Promise<string> {
  return evalStable(page, async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle('localaction.json');
      const file = await handle.getFile();
      return await file.text();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') return '';
      throw err;
    }
  });
}