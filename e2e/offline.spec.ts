import { test, expect } from '@playwright/test';
import { uniq } from './helpers.ts';

// Contract: after one online visit, the app shell loads with the network
// fully offline (service worker precache) and shows OPFS-persisted data.
// Runs against the prod server (`bun server/index.ts`) via
// playwright.offline.config.ts — the dev server never registers the SW.

test('app shell and data load with the network offline', async ({ page, context }) => {
  // Capture client lifecycle logs; asserted at the end.
  const consoleLines: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));

  // Online first load: SW installs, precaches the shell, claims the page.
  await page.goto('/#/inbox');
  await page.waitForSelector('.sidebar-inbox-link');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);

  // Create a task, then poll OPFS until the autosave lands (same pattern as
  // waitForOpfsSave in e2e/inbox.spec.ts) so the reload hydrates from disk.
  const title = `Offline task ${uniq()}`;
  await page.locator('main[aria-label="Inbox"] button[aria-label="Add task to Active"]').click();
  const input = page.locator('main[aria-label="Inbox"] input[aria-label="New inbox task"]');
  await input.fill(title);
  await input.press('Enter');
  await expect(async () => {
    const text = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle('localaction.json');
        return await (await handle.getFile()).text();
      } catch {
        return '';
      }
    });
    expect(text).toContain(title);
  }).toPass({ timeout: 5000 });

  // Offline reload: SW must serve the shell, OPFS must hydrate the task.
  // `context.setOffline(true)` is NOT used: Playwright implements it in a
  // way that fails subresource requests with ERR_FAILED before they reach
  // the service worker (blank page). CDP network emulation goes through
  // Chromium's network stack, where SW cache hits still resolve.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  try {
    await page.reload();
    await page.waitForSelector('.sidebar-inbox-link');
    await expect
      .poll(() =>
        page
          .locator('main[aria-label="Inbox"] .task-line-title')
          .evaluateAll((els) =>
            els.map((el) => (el as HTMLTextAreaElement).value ?? el.textContent ?? ''),
          ),
      )
      .toContain(title);
  } finally {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

  // Lifecycle logs actually fired on the client.
  expect(consoleLines.some((l) => l.includes('[localaction] sw — registered'))).toBe(true);
  expect(
    consoleLines.some((l) => l.includes('[localaction] persistence — loaded OPFS snapshot')),
  ).toBe(true);
  expect(consoleLines.some((l) => l.includes('[localaction] sync — '))).toBe(true);
  // No spurious persister errors on either load (fresh snapshot or hydrate).
  expect(consoleLines.some((l) => l.includes('OPFS persister error'))).toBe(false);
});
