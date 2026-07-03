import { expect, test } from '@playwright/test';

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
 */
test.describe.serial('OPFS persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear the OPFS file before each test so they don't bleed state into
    // each other. A brand-new page context is gated on the dev server
    // below, but the OPFS root persists across page reloads, so we must
    // tear the file down explicitly.
    await page.goto('/');
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      try {
        await root.removeEntry('localaction.json');
      } catch (err) {
        // NotFoundError is expected when the suite runs first on a clean profile.
        if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
          throw err;
        }
      }
    });
  });

  test('a written cell survives a full reload via OPFS', async ({ page }) => {
    await page.goto('/');
    await waitForPersistenceReady(page);

    // Write a sentinel cell into the live MergeableStore and wait for
    // TinyBase's autosave to flush it to the OPFS file.
    const SENTINEL = 'opfs-roundtrip-' + Date.now();
    await page.evaluate((value) => {
      const store = window.__LOCALACTION!.store;
      store.setCell('domains', 'd-opfs', 'name', value);
    }, SENTINEL);

    await expect
      .poll(async () => readOpfsFileText(page), { timeout: 10_000 })
      .toContain(SENTINEL);

    // Reload — the provider runs persister.load() on boot; if persistence
    // works, the sentinel comes back without the WS handshake doing anything.
    await page.reload();
    await waitForPersistenceReady(page);

    const restored = await page.evaluate(() => {
      const store = window.__LOCALACTION!.store;
      return store.getCell('domains', 'd-opfs', 'name') as string | undefined;
    });
    expect(restored).toBe(SENTINEL);
  });

  test('a fresh tab does not load data while OPFS is empty', async ({ page }) => {
    // `beforeEach` already deleted the file; boot and confirm the store is
    // empty of our sentinel domain (sanity guard against test cross-talk).
    await page.goto('/');
    await waitForPersistenceReady(page);

    const name = await page.evaluate(() => {
      const store = window.__LOCALACTION!.store;
      return store.getCell('domains', 'd-opfs', 'name');
    });
    expect(name).toBeUndefined();
  });
});

async function waitForPersistenceReady(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate<boolean | undefined>(() =>
          typeof window.__LOCALACTION !== 'undefined'
            ? window.__LOCALACTION!.persistenceReady
            : undefined,
        ),
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toBe(true);
  // The hook itself must also resolve after readiness.
  await expect
    .poll(
      async () =>
        page.evaluate<boolean>(() => typeof window.__LOCALACTION !== 'undefined'),
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function readOpfsFileText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(async () => {
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