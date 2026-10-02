import { test, expect } from '@playwright/test';
import { createArea, createRootTask, uniq } from './helpers.ts';

test.describe('Undo toast', () => {
  test('offers undo after completing a task and restores it', async ({ page }) => {
    const tok = uniq();
    await page.goto('/#/');
    await createArea(page, `UndoArea ${tok}`);
    await createRootTask(page, `Finish me ${tok}`);

    // Completed subtasks stay in place now (no show-completed pruning):
    // the row remains, checked, and the toast names the action.
    await page.locator(`input[aria-label="Mark “Finish me ${tok}” done"]`).click();
    await expect(
      page.locator('.task-line.task-line-done', { hasText: `Finish me ${tok}` }),
    ).toBeVisible();
    await expect(page.locator('.undo-toast-label')).toHaveText(`Completed “Finish me ${tok}”`);

    await page.locator('.undo-toast-action').click();
    await expect(page.locator('.task-line', { hasText: `Finish me ${tok}` })).toBeVisible();
    await expect(page.locator('.task-line', { hasText: `Finish me ${tok}` })).not.toHaveClass(
      /task-line-done/,
    );
    await expect(page.locator('.undo-toast')).toHaveCount(0);
  });

  test('restores a deleted task', async ({ page }) => {
    const tok = uniq();
    await page.goto('/#/');
    await createArea(page, `UndoDelArea ${tok}`);
    await createRootTask(page, `Delete me ${tok}`);

    const row = page.locator('.task-line', { hasText: `Delete me ${tok}` });
    // The delete trash only renders while the title is focused (the
    // leaf-row pattern); focus the input to enter edit mode, then
    // click the trash.
    await row.locator('.task-line-title').click();
    await row.locator('button[aria-label="Delete task"]').click();
    await page.locator('.modal button', { hasText: 'Delete' }).click();
    await expect(page.locator('.task-line', { hasText: `Delete me ${tok}` })).toHaveCount(0);
    await expect(page.locator('.undo-toast-label')).toHaveText(`Deleted “Delete me ${tok}”`);

    await page.locator('.undo-toast-action').click();
    await expect(page.locator('.task-line', { hasText: `Delete me ${tok}` })).toHaveCount(1);
    await expect(page.locator('.undo-toast')).toHaveCount(0);
  });
});
