import { test, expect, type Page } from '@playwright/test';
import { uniq, groupBox, groupCount } from './helpers.ts';

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
  await page
    .locator('main[aria-label="Inbox"] button[aria-label="Add task to Active"]')
    .click();
  const input = page.locator('main[aria-label="Inbox"] input[aria-label="New inbox task"]');
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
    await expect(page.locator('main[aria-label="Inbox"] button[aria-label="Add task to Active"]')).toBeVisible();

    const title = `Fresh inbox task ${uniq()}`;
    const before = await inboxCount(page);
    await createInboxTask(page, title);

    // Sidebar count + body must reflect the new task without any extra clicks.
    await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveText(
      String(before + 1),
    );
    await expect.poll(() => inboxTitles(page)).toContain(title);
  });

  test('the Backlog header "+" shelves a new task, and no ghost placeholder rows remain', async ({ page }) => {
    await openInbox(page);

    // The dashed ghost row under an empty Backlog and the standing Active
    // add-input are gone; the headers themselves remain.
    await expect(page.locator('.tab-group-ghost')).toHaveCount(0);
    await expect(page.locator('main[aria-label="Inbox"] .inline-add-input')).toHaveCount(0);

    const title = `Backlog inbox task ${uniq()}`;
    await page
      .locator('main[aria-label="Inbox"] button[aria-label="Add task to Backlog"]')
      .click();
    const input = page.locator('main[aria-label="Inbox"] input[aria-label="New backlog task"]');
    await input.fill(title);
    await input.press('Enter');

    // The task lands shelved in Backlog; Active stays empty, and the
    // revealed input collapses after the commit.
    await expect(groupBox(page, 'Backlog').locator('.task-line-title', { hasText: title })).toHaveCount(1);
    expect(await groupCount(page, 'Backlog')).toBe(1);
    expect(await groupCount(page, 'Active')).toBe(0);
    await expect(input).toHaveCount(0);
  });

  test('completing an inbox task removes it from the sidebar count', async ({ page }) => {
    await openInbox(page);

    const title = `Completable inbox task ${uniq()}`;
    const before = await inboxCount(page);
    await createInboxTask(page, title);
    await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveText(
      String(before + 1),
    );

    // Done roots stay visible in the pane but leave the sidebar count.
    await page.getByRole('checkbox', { name: `Mark “${title}” done` }).click();
    if (before === 0) {
      // The badge is absent at zero.
      await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveCount(0);
    } else {
      await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveText(
        String(before),
      );
    }
    // The completed root stays visible as a static row in the Done group.
    await expect(
      page.locator('main[aria-label="Inbox"]').getByRole('button', { name: title, exact: true }),
    ).toBeVisible();
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

    // A draft row opens directly under the current one, focused for
    // quick entry; the untouched sibling stays put. The draft is not a
    // store row yet, but it occupies a line in the list.
    await expect(titles).toHaveCount(total + 1);
    await expect(titles.nth(total - 2)).toHaveValue(alpha);
    await expect(titles.nth(total - 1)).toHaveValue('');
    await expect(titles.nth(total)).toHaveValue(beta);
    await expect(titles.nth(total - 1)).toBeFocused();

    // The draft accepts quick entry: typing + Enter commits it as a task.
    await page.keyboard.type('Middle');
    await page.keyboard.press('Enter');
    await expect(titles.nth(total - 1)).toHaveValue('Middle');
  });
});
