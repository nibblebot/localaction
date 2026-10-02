import { test, expect } from '@playwright/test';
import { createArea, createRootTask } from './helpers.ts';

test.describe('Shell routing', () => {
  test('home hash shows the welcome empty state', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.main-empty')).toContainText('Welcome to LocalAction');
  });

  test('creating an area navigates to its main pane with the unified task groups', async ({
    page,
  }) => {
    await page.goto('/#/');
    await createArea(page, 'Work');
    await expect(page).toHaveURL(/#\/a\//);
    await expect(page.locator('.area-header-name')).toContainText('Work');
    // The area view is the unified Active / Backlog / Done tri-state
    // (the Projects/Sections era's task/project toggle is gone).
    await expect(page.locator('.tasks-tab')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Active/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Backlog/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Done/ })).toBeVisible();
  });

  test('the Active group header offers the inline add-task input', async ({ page }) => {
    await page.goto('/#/');
    // Create an area so we have something to render.
    await createArea(page, 'Health');
    await expect(page.locator('.tasks-tab')).toBeVisible();
    await expect(page.locator('button[aria-label="Add task to Active"]')).toBeVisible();
    await page.locator('button[aria-label="Add task to Active"]').click();
    await expect(page.locator('input[aria-label="New task"]')).toBeFocused();
  });

  test('caret toggles a parent row; clicking its name opens the task detail pane', async ({
    page,
  }) => {
    await page.goto('/#/');
    await createArea(page, 'Family');
    await createRootTask(page, 'Plan trip');
    await expect(page.locator('input[aria-label="Mark “Plan trip” done"]')).toBeVisible();
    // Add a sub-task: the row becomes a parent (caret + progress meter).
    const row = page.locator('.task-line', { hasText: 'Plan trip' });
    await row.locator('button[aria-label="Add sub-task"]').click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type('Book flights');
    await page.keyboard.press('Enter');
    await expect(row.locator('button[aria-label="Collapse Plan trip"]')).toBeVisible();
    await expect(row.locator('.project-row-progress-count')).toHaveText('0 / 1');
    // Clicking the parent name navigates to the detail pane — it does
    // NOT collapse the row.
    await row.locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/t\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText('Plan trip');
    // The detail pane shows the same task surface as the tree row.
    await expect(
      page.locator('.project-pane-tasks .task-line', { hasText: 'Book flights' }),
    ).toBeVisible();
    // The breadcrumb returns to the area.
    await page.locator('.area-header-crumb').click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    await expect(page.locator('.task-line', { hasText: 'Book flights' })).toBeVisible();
    // Only the caret toggles the row; again expands it.
    await row.locator('button[aria-label="Collapse Plan trip"]').click();
    await expect(page.locator('.task-line', { hasText: 'Book flights' })).toHaveCount(0);
    await row.locator('button[aria-label="Expand Plan trip"]').click();
    await expect(page.locator('.task-line', { hasText: 'Book flights' })).toBeVisible();
    // Management affordances (rename, delete) are not on the tree row —
    // they live on the task detail pane header only.
    await expect(row.locator('button[aria-label^="Rename"]')).toHaveCount(0);
    await expect(row.locator('button[aria-label="Delete task"]')).toHaveCount(0);
  });

  test('invalid route hashes fall back to the welcome state', async ({ page }) => {
    for (const hash of [
      '/#/t/whatever',
      '/#/n/whatever',
      // Legacy project routes collapse to home too (src/router.ts
      // `parseRoute` — anything it does not recognise falls back).
      '/#/p/does-not-exist',
      '/#/unknown/x',
    ]) {
      await page.goto(hash);
      await expect(page.locator('.main-empty')).toBeVisible();
    }
  });
});
