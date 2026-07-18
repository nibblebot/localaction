import { test, expect, type Page } from '@playwright/test';

// Regression for "inbox tasks don't show up immediately / after reload".
//
// The bug: React Compiler memoizes hooks based on argument identity. The
// affected hooks (`useInboxTaskIds`, `useAreaTaskIds`, `useTasksForProjectDeep`,
// `useNoteIdsForEntity`, `useEntityPersonIds`) called `useRowIds` / `useTables`
// for the subscription but passed only the singleton `store` (and stable args)
// to their calculation function. The compiler's cache key never changed, so
// the cached value was returned across re-renders, hiding newly-written rows.
//
// Fix: pass a dependency token (the rowIds / tables snapshot) into the
// calculation function so the cache key changes when the underlying data does.

async function cleanOpfs(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.evaluate(async () => {
    try {
      type OpfsRoot = FileSystemDirectoryHandle & {
        entries(): AsyncIterable<[string, FileSystemHandle]>;
      };
      const opfsRoot: OpfsRoot = await navigator.storage.getDirectory();
      for await (const [name] of opfsRoot.entries()) {
        try {
          await opfsRoot.removeEntry(name, { recursive: true });
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* OPFS may be unavailable */
    }
  });
}

async function openInbox(page: Page): Promise<void> {
  await page.click('.sidebar-inbox-button');
  await expect(page.locator('main[aria-label="Inbox"]')).toBeVisible();
}

async function createInboxTask(page: Page, title: string): Promise<void> {
  const input = page.locator('main[aria-label="Inbox"] .inline-add-input');
  await input.fill(title);
  await input.press('Enter');
}

test.describe('inbox visibility', () => {
  test.beforeEach(async ({ page }) => {
    await cleanOpfs(page);
    await page.goto('/#/');
    await page.waitForSelector('.sidebar-inbox-button');
  });

  test('a freshly-added inbox task appears immediately in the sidebar count and the inbox body', async ({ page }) => {
    await openInbox(page);
    await expect(page.locator('main[aria-label="Inbox"] .inline-add-input')).toBeVisible();

    await createInboxTask(page, 'Fresh inbox task');

    // Sidebar count + body must reflect the new task without any extra clicks.
    await expect(page.locator('.sidebar-inbox-count')).toHaveText('1');
    await expect(page.locator('main[aria-label="Inbox"] .task-line-title')).toHaveText('Fresh inbox task');
  });

  test('inbox tasks survive a page reload', async ({ page }) => {
    await openInbox(page);
    await createInboxTask(page, 'Persisted inbox task');
    await expect(page.locator('.sidebar-inbox-count')).toHaveText('1');

    await page.reload();
    await page.waitForSelector('.sidebar-inbox-button');
    await openInbox(page);

    await expect(page.locator('.sidebar-inbox-count')).toHaveText('1');
    await expect(page.locator('main[aria-label="Inbox"] .task-line-title')).toHaveText('Persisted inbox task');
  });
});