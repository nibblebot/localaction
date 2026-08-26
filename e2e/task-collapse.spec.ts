import { test, expect, type Page, type Locator } from '@playwright/test';
import { createArea, createRootTask, addSubTask, uniq, groupBox } from './helpers.ts';

// The caret chrome exists on a row only once the row is a parent (≥1
// descendant) — leaf rows have no caret. Both collapse sets are pure
// view state persisted to localStorage (useCollapsedSet): task rows key
// 'localaction.taskTree.collapsedTaskIds', root groups key
// 'localaction.area.collapsedTaskGroups' — never synced, so a reload
// re-applies them from localStorage.

function parentRow(page: Page, name: string): Locator {
  return page.locator('.task-line', { hasText: name });
}

test('parent-row caret collapses one subtree; collapse persists across reload', async ({
  page,
}) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  const parent = `Parent ${tok}`;
  const child = `Child ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, parent);
  await addSubTask(page, parentRow(page, parent), child);

  // The subtree renders expanded by default.
  const row = parentRow(page, parent);
  await expect(row.locator(`button[aria-label="Collapse ${parent}"]`)).toBeVisible();
  await expect(page.locator('.task-line', { hasText: child })).toBeVisible();

  // Collapse via the caret; the row (and its progress meter) stays.
  await row.locator(`button[aria-label="Collapse ${parent}"]`).click();
  await expect(page.locator('.task-line', { hasText: child })).toHaveCount(0);
  await expect(row.locator(`button[aria-label="Expand ${parent}"]`)).toBeVisible();
  await expect(row.locator('.project-row-progress')).toBeVisible();

  // Re-expand via the caret.
  await row.locator(`button[aria-label="Expand ${parent}"]`).click();
  await expect(page.locator('.task-line', { hasText: child })).toBeVisible();

  // Collapse state persists across reloads (localStorage key
  // 'localaction.taskTree.collapsedTaskIds').
  await row.locator(`button[aria-label="Collapse ${parent}"]`).click();
  await page.reload();
  const after = parentRow(page, parent);
  await expect(after.locator(`button[aria-label="Expand ${parent}"]`)).toBeVisible();
  await expect(page.locator('.task-line', { hasText: child })).toHaveCount(0);
});

test('a completed subtree keeps its parent row with a full progress meter', async ({
  page,
}) => {
  const tok = uniq();
  const area = `DoneCollapse ${tok}`;
  const parent = `P ${tok}`;
  const child = `C ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, parent);
  await addSubTask(page, parentRow(page, parent), child);

  // The Done group prunes fully-done roots, but a completed SUBTASK of
  // an Active root stays in place, struck through (no show-completed
  // plumbing anymore — see src/components/tasks/TaskTree.tsx).
  await page.locator(`input[aria-label="Mark “${child}” done"]`).click();
  const row = parentRow(page, parent);
  await expect(row).toBeVisible();
  await expect(row.locator('.project-row-progress-count')).toHaveText('1 / 1');
  // The caret still toggles the done subtree, which stays visible in place.
  await expect(page.locator('.task-line.task-line-done', { hasText: child })).toBeVisible();
  await row.locator(`button[aria-label="Collapse ${parent}"]`).click();
  await expect(page.locator('.task-line', { hasText: child })).toHaveCount(0);
  await row.locator(`button[aria-label="Expand ${parent}"]`).click();
  await expect(page.locator('.task-line.task-line-done', { hasText: child })).toBeVisible();
});

test('group collapse persists across reload', async ({ page }) => {
  const tok = uniq();
  const area = `CollapseGroups ${tok}`;
  const task = `T ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, task);

  // The Active group header toggle carries aria-expanded; collapsing it
  // hides the rows (the group head and count remain).
  const activeHead = groupBox(page, 'Active').locator('.tab-group-head');
  const toggle = activeHead.locator('.tab-group-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.task-line', { hasText: task })).toHaveCount(0);
  await expect(groupBox(page, 'Active').locator('.tab-group-count')).toHaveText('1');

  // Group collapse persists across reloads (localStorage key
  // 'localaction.area.collapsedTaskGroups').
  await page.reload();
  const after = groupBox(page, 'Active').locator('.tab-group-toggle');
  await expect(after).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.task-line', { hasText: task })).toHaveCount(0);
});
