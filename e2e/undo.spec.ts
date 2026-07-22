import { test, expect, type Page } from '@playwright/test';

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('.projects-tab > .inline-add-button[aria-label="Add project"]').click();
  const input = page.locator('.projects-tab .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createTask(page: Page, title: string): Promise<void> {
  // Single-project contexts: the one project card's footer add button.
  await page.locator('.project-row-tasks .tasks-tab-footer button[aria-label="Add task"]').first().click();
  const input = page.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New task"]').first();
  await input.fill(title);
  await input.press('Enter');
}

test.describe('Undo toast', () => {
  test('offers undo after completing a task and restores it', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'UndoArea');
    await createProject(page, 'UndoProject');
    await createTask(page, 'Finish me');

    await page.locator('input[aria-label="Mark “Finish me” done"]').click();
    // Hidden-completed mode prunes the row; the toast names the action.
    await expect(page.locator('.task-line-title', { hasText: 'Finish me' })).toHaveCount(0);
    await expect(page.locator('.undo-toast-label')).toHaveText('Completed “Finish me”');

    await page.locator('.undo-toast-action').click();
    await expect(page.locator('.task-line-title', { hasText: 'Finish me' })).toHaveCount(1);
    await expect(page.locator('.undo-toast')).toHaveCount(0);
  });

  test('restores a deleted task', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'UndoDelArea');
    await createProject(page, 'UndoDelProject');
    await createTask(page, 'Delete me');

    const row = page.locator('.task-line', { hasText: 'Delete me' });
    await row.hover();
    await row.locator('button[aria-label="Delete task"]').click();
    await page.locator('.modal button', { hasText: 'Delete' }).click();
    await expect(page.locator('.task-line-title', { hasText: 'Delete me' })).toHaveCount(0);
    await expect(page.locator('.undo-toast-label')).toHaveText('Deleted “Delete me”');

    await page.locator('.undo-toast-action').click();
    await expect(page.locator('.task-line-title', { hasText: 'Delete me' })).toHaveCount(1);
    await expect(page.locator('.undo-toast')).toHaveCount(0);
  });
});
