import { test, expect, type Page } from '@playwright/test';

// Regression guard for the duplicate-React crash class:
//   "Invalid hook call. Hooks can only be called inside of the body of a
//    function component ... resolveDispatcher() is null"
// seen when @dnd-kit (`useSensor`/`useMemo` in core.esm.js) resolves a
// different React instance than the renderer. The app must boot and mount its
// @dnd-kit sortable surfaces (sidebar area rows, area-view project rows)
// without throwing. Any uncaught page error fails this contract.

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="Add project to Active"]').click();
  const input = page.locator('input[aria-label="New project"]');
  await input.fill(name);
  await input.press('Enter');
}

// Matches the duplicate-React / broken-disporter error family.
const HOOK_ERROR = /Invalid hook call|resolveDispatcher|more than one copy of React|useSensor/i;

test.describe('app boot / React hook contract', () => {
  test('boots the shell and mounts @dnd-kit sortable surfaces with no hook errors', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.sidebar-app-name')).toContainText('LocalAction');

    // Creating an area mounts the sidebar SortableList (area rows are
    // sortable) and navigates into the area view, whose Projects section is
    // itself a SortableList — both exercise the `useSensor`/`useSortable`
    // hooks that crash under a duplicate React copy.
    await createArea(page, 'Boot check');
    await expect(page).toHaveURL(/#\/a\//);
    await expect(page.locator('.sidebar-area-row.sortable-row')).toBeVisible();

    await createProject(page, 'Ship it');
    await expect(page.locator('li.project-row', { hasText: 'Ship it' })).toBeVisible();

    // The crash surfaces as an uncaught page error; any is a regression.
    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    // Console errors in the hook family are also a regression (React logs the
    // "Invalid hook call" message even when an error boundary swallows it).
    const hookConsoleErrors = consoleErrors.filter((e) => HOOK_ERROR.test(e));
    expect(hookConsoleErrors, `hook console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('directly mounting a sortable row does not throw', async ({ page }) => {
    // A second, narrower check: even after HMR / re-navigation the sortable
    // surface must mount without a page error.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

    await page.goto('/#/');
    await createArea(page, 'Solo');
    await expect(page.locator('.sidebar-area-row.sortable-row')).toBeVisible();
    // Re-navigate away and back to force a remount of the sortable list.
    await page.goto('/#/inbox');
    await page.goto('/');
    await expect(page.locator('.sidebar-area-row.sortable-row')).toBeVisible();

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
