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

test('blurring a fresh draft with no content closes it without creating a task', async ({ page }) => {
  const tok = uniq();
  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);

  const section = page.locator('.pane-section', { hasText: 'Tasks' });
  await section.locator('button[aria-label="Add task"]').click();
  await expect(section.locator('.task-line-title:focus')).toBeVisible();

  // The "+" only opens a draft: nothing is created, so the header count
  // stays 0 and the only row present is the draft itself.
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');
  await expect(section.locator('.task-line')).toHaveCount(1);

  // Tab moves focus off the untouched draft — it closes uncommitted,
  // nothing was ever persisted, and the header count never saw it.
  await page.keyboard.press('Tab');
  await expect(section.locator('.task-line')).toHaveCount(0);
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');

  // Escape on an untouched draft cancels the same way.
  await section.locator('button[aria-label="Add task"]').click();
  await expect(section.locator('.task-line-title:focus')).toBeVisible();
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');
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

  // Typed but uncommitted: still no store row — the header count stays
  // 0 and the only line present is the draft holding the typed text.
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('0');
  await expect(section.locator('.task-line')).toHaveCount(1);

  // Blurring commits the draft: the task is created only now.
  await page.keyboard.press('Tab');

  await expect(section.locator('.task-line', { hasText: `Kept ${tok}` })).toBeVisible();
  await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('1');
});
