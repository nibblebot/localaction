import { test, expect, type Page } from '@playwright/test';

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Current inbox sidebar count; the badge is absent at zero. */
async function inboxCount(page: Page): Promise<number> {
  const badge = page.locator('.sidebar-inbox-link .sidebar-link-count');
  if ((await badge.count()) === 0) return 0;
  return Number.parseInt((await badge.textContent()) ?? '0', 10) || 0;
}

/** Visible inbox task titles, in render order (textareas: read .value). */
async function inboxTitles(page: Page): Promise<string[]> {
  return page
    .locator('main[aria-label="Inbox"] .task-line-title')
    .evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value ?? el.textContent ?? ''));
}

async function openInbox(page: Page): Promise<void> {
  await page.click('.sidebar-inbox-link');
  await expect(page.locator('main[aria-label="Inbox"]')).toBeVisible();
}

async function createInboxTask(page: Page, title: string): Promise<void> {
  const input = page.locator('main[aria-label="Inbox"] .inline-add-input');
  await input.fill(title);
  await input.press('Enter');
}

// The OPFS persister auto-saves asynchronously; reload before the
// save lands and the file is truncated, so poll the OPFS snapshot
// until it contains the marker.
async function waitForOpfsSave(page: Page, marker: string): Promise<void> {
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
    expect(text).toContain(marker);
  }).toPass({ timeout: 5000 });
}

test.describe('inbox visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
    await page.waitForSelector('.sidebar-inbox-link');
  });

  test('a freshly-added inbox task appears immediately in the sidebar count and the inbox body', async ({ page }) => {
    await openInbox(page);
    await expect(page.locator('main[aria-label="Inbox"] .inline-add-input')).toBeVisible();

    const title = `Fresh inbox task ${uniq()}`;
    const before = await inboxCount(page);
    await createInboxTask(page, title);

    // Sidebar count + body must reflect the new task without any extra clicks.
    await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveText(
      String(before + 1),
    );
    await expect.poll(() => inboxTitles(page)).toContain(title);
  });

  test('inbox tasks survive a page reload', async ({ page }) => {
    const title = `Persisted inbox task ${uniq()}`;
    await openInbox(page);
    const before = await inboxCount(page);
    await createInboxTask(page, title);
    await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveText(
      String(before + 1),
    );
    await waitForOpfsSave(page, title);

    await page.reload();
    await page.waitForSelector('.sidebar-inbox-link');
    await openInbox(page);

    await expect.poll(() => inboxTitles(page)).toContain(title);
  });

  test('Shift+Enter in a task title saves it and opens a focused empty sibling below', async ({ page }) => {
    const tok = uniq();
    const alpha = `Alpha ${tok}`;
    const beta = `Beta ${tok}`;
    await openInbox(page);
    await createInboxTask(page, alpha);
    await createInboxTask(page, beta);

    const titles = page.locator('main[aria-label="Inbox"] .task-line-title');
    const total = await titles.count();
    await titles.nth(total - 2).click();
    await page.keyboard.press('Shift+Enter');

    // New empty row sits directly under the current one, focused for
    // quick entry; the untouched sibling stays put.
    await expect(titles).toHaveCount(total + 1);
    await expect(titles.nth(total - 2)).toHaveValue(alpha);
    await expect(titles.nth(total - 1)).toHaveValue('');
    await expect(titles.nth(total)).toHaveValue(beta);
    await expect(titles.nth(total - 1)).toBeFocused();

    // The focused row is a real editable task: typing + Enter commits it.
    await page.keyboard.type('Middle');
    await page.keyboard.press('Enter');
    await expect(titles.nth(total - 1)).toHaveValue('Middle');
  });
});
