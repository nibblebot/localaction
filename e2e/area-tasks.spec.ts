import { test, expect, type Page } from '@playwright/test';

// Unique tokens keep replayed state from prior specs harmless.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

async function addAreaTask(page: Page, title: string): Promise<void> {
  const section = page.locator('.pane-section', { hasText: 'Area tasks' });
  await section.locator('button[aria-label="Add task"]').click();
  const input = section.locator('input[aria-label="New area task"]');
  await input.fill(title);
  await input.press('Enter');
}

test('area tasks: add, nest, complete, and persist across reload', async ({ page }) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);

  // The Area tasks band is always visible, even when empty.
  const section = page.locator('.pane-section', { hasText: 'Area tasks' });
  await expect(section.locator('.pane-section-toggle')).toContainText('Area tasks');
  await expect(section.locator('button[aria-label="Add task"]')).toBeVisible();

  // Add two area-rooted tasks; the header count tracks them.
  await addAreaTask(page, `Task one ${tok}`);
  await addAreaTask(page, `Task two ${tok}`);
  await expect(section.locator('.pane-section-toggle')).toContainText('· 2');

  // Sub-tasks nest under their parent instead of rendering flush-left.
  const taskTwo = section.locator('.task-line', { hasText: `Task two ${tok}` });
  await taskTwo.hover();
  await taskTwo.locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(`Sub task ${tok}`);
  await page.keyboard.press('Enter');
  const nested = section.locator('.task-line', { hasText: `Sub task ${tok}` });
  await expect(nested).toBeVisible();
  const parentBox = await taskTwo.boundingBox();
  const nestedBox = await nested.boundingBox();
  expect(parentBox).not.toBeNull();
  expect(nestedBox).not.toBeNull();
  expect(nestedBox!.x).toBeGreaterThan(parentBox!.x);

  // Completing a task prunes it from the default (hide-completed) view.
  await page.locator(`input[aria-label="Mark “Task one ${tok}” done"]`).click();
  await expect(section.locator('.task-line', { hasText: `Task one ${tok}` })).toHaveCount(0);
  await expect(section.locator('.pane-section-toggle')).toContainText('· 1');

  // The area-wide show-completed toggle (in the area header) brings it back.
  await page.locator('.area-header-actions button[aria-label="Show completed tasks"]').click();
  await expect(section.locator('.task-line', { hasText: `Task one ${tok}` })).toBeVisible();

  // Tasks survive a reload (OPFS persistence round-trip).
  await page.reload();
  const reloaded = page.locator('.pane-section', { hasText: 'Area tasks' });
  await expect(reloaded.locator('.task-line', { hasText: `Task two ${tok}` })).toBeVisible();
  await expect(reloaded.locator('.task-line', { hasText: `Sub task ${tok}` })).toBeVisible();
});

test('collapsing a section hides its body and persists across reload', async ({ page }) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);

  // Collapse Notes: its body (the inline add input) disappears.
  const notesToggle = page.locator('.pane-section-toggle', { hasText: 'Notes' });
  await expect(page.locator('.notes-tab')).toBeVisible();
  await notesToggle.click();
  await expect(notesToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.notes-tab')).toHaveCount(0);

  // The collapse preference survives a reload (localStorage-backed).
  await page.reload();
  await expect(
    page.locator('.pane-section-toggle', { hasText: 'Notes' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.notes-tab')).toHaveCount(0);

  // Re-expanding restores the body; the Projects and Area tasks
  // sections were never affected.
  await page.locator('.pane-section-toggle', { hasText: 'Notes' }).click();
  await expect(page.locator('.notes-tab')).toBeVisible();
  await expect(page.locator('.projects-tab')).toBeVisible();
});
