import { test, expect, type Page } from '@playwright/test';
import { createArea, createRootTask, rootRow, uniq, groupCount } from './helpers.ts';

// The draft-row contract (src/components/tasks/TaskDraftRow.tsx): an
// add-task affordance opens a draft row that never touches the store —
// Escape and an empty blur close it creating nothing, a non-empty blur
// commits the task. The area's root add is an inline input that commits
// on Enter, so the draft-ROW flow this spec exercises is the sub-task
// add (the same TaskDraftRow semantics the area used pre-cutover).

async function openSubTaskDraft(page: Page, parent: string): Promise<void> {
  await rootRow(page, parent).locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
}

test('blurring a fresh draft with no content closes it without creating a task', async ({
  page,
}) => {
  const tok = uniq();
  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);
  await createRootTask(page, `Parent ${tok}`);
  expect(await groupCount(page, 'Active')).toBe(1);

  // The "+" only opens a draft: nothing is created, so the only row in
  // the tree is the draft itself and the root count never moves.
  await openSubTaskDraft(page, `Parent ${tok}`);
  expect(await groupCount(page, 'Active')).toBe(1);
  await expect(page.locator('.task-line')).toHaveCount(2); // parent + draft

  // Tab moves focus off the untouched draft — it closes uncommitted,
  // nothing was ever persisted, and the count never saw it.
  await page.keyboard.press('Tab');
  await expect(page.locator('.task-line')).toHaveCount(1);
  expect(await groupCount(page, 'Active')).toBe(1);

  // Escape on an untouched draft cancels the same way.
  await openSubTaskDraft(page, `Parent ${tok}`);
  await expect(page.locator('.task-line')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.task-line')).toHaveCount(1);
  expect(await groupCount(page, 'Active')).toBe(1);
});

test('typing a title then blurring keeps the task', async ({ page }) => {
  const tok = uniq();
  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);
  await createRootTask(page, `Parent ${tok}`);

  await openSubTaskDraft(page, `Parent ${tok}`);
  await page.keyboard.type(`Kept ${tok}`);

  // Typed but uncommitted: still no store row — the only line present
  // is the draft holding the typed text, and the root count stays 1.
  await expect(page.locator('.task-line-title:focus')).toHaveValue(`Kept ${tok}`);
  expect(await groupCount(page, 'Active')).toBe(1);

  // Blurring commits the draft: the task is created only now, nested
  // under its parent.
  await page.keyboard.press('Tab');
  await expect(page.locator('.task-line', { hasText: `Kept ${tok}` })).toBeVisible();
  expect(await groupCount(page, 'Active')).toBe(1);
});
