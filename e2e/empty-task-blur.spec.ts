import { test, expect, type Page } from '@playwright/test';

// Unique tokens keep replayed state from prior specs harmless.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

test('blurring a fresh task title with no content removes the row', async ({ page }) => {
  const tok = uniq();
  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);

  const section = page.locator('.pane-section', { hasText: 'Tasks' });
  await section.locator('button[aria-label="Add task"]').click();
  await expect(section.locator('.task-line-title:focus')).toBeVisible();

  // Tab moves focus off the empty title — the never-titled task is
  // cancelled, not persisted, and the header count never saw it.
  await page.keyboard.press('Tab');
  await expect(section.locator('.task-line')).toHaveCount(0);
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');

  // Escape on a fresh row cancels the same way.
  await section.locator('button[aria-label="Add task"]').click();
  await expect(section.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(section.locator('.task-line')).toHaveCount(0);
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');
});

test('typing a title then blurring keeps the task', async ({ page }) => {
  const tok = uniq();
  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);

  const section = page.locator('.pane-section', { hasText: 'Tasks' });
  await section.locator('button[aria-label="Add task"]').click();
  await page.keyboard.type(`Kept ${tok}`);
  await page.keyboard.press('Tab');

  await expect(section.locator('.task-line', { hasText: `Kept ${tok}` })).toBeVisible();
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('1');
});
