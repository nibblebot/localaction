import { test, expect, type Page, type Locator } from '@playwright/test';
import { createArea, createRootTask, addSubTask, uniq, groupBox, groupCount } from './helpers.ts';

// The completed-tasks toggle is pure view state shared by the area view
// and the task detail pane, persisted to localStorage under
// 'localaction.main.showCompleted'. On (default) the Done group renders and
// completed subtasks stay in place struck through; off drops the Done group
// and prunes every completed row from the Active/Backlog trees.

function areaToggle(page: Page): Locator {
  return page.locator('.area-header-actions button');
}

function paneToggle(page: Page): Locator {
  return page.locator('.project-row-actions .area-tab-action');
}

test('area view: the header toggle hides the Done group and completed rows', async ({ page }) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  const doneChild = `Done child ${tok}`;
  const openChild = `Open child ${tok}`;
  const doneRoot = `Done root ${tok}`;

  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, `Parent ${tok}`);
  await addSubTask(page, page.locator('.task-line', { hasText: `Parent ${tok}` }), doneChild);
  await addSubTask(page, page.locator('.task-line', { hasText: `Parent ${tok}` }), openChild);
  await createRootTask(page, doneRoot);

  // Complete one subtask and one whole root. The root's checkbox is
  // clicked (not `check()`): completing it moves the row into the static
  // Done group, where `check()`'s post-click assertion can no longer find
  // a checkbox to latch onto.
  await page.locator('.task-line', { hasText: doneChild }).locator('input.task-line-check').check();
  await page.locator('.task-line', { hasText: doneRoot }).locator('input.task-line-check').click();
  await expect(page.locator('.task-line', { hasText: doneRoot })).toHaveClass(/task-line-done/);

  // Default: completed tasks show — the done root sits in the Done group
  // and the completed subtask stays in place under its parent.
  await expect(areaToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.task-line', { hasText: doneChild })).toBeVisible();
  expect(await groupCount(page, 'Done')).toBe(1);

  // Hide completed: the Done group goes away entirely and the completed
  // subtask is pruned, leaving its open sibling.
  await areaToggle(page).click();
  await expect(areaToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(groupBox(page, 'Done')).toHaveCount(0);
  await expect(page.locator('.task-line', { hasText: doneChild })).toHaveCount(0);
  await expect(page.locator('.task-line', { hasText: doneRoot })).toHaveCount(0);
  await expect(page.locator('.task-line', { hasText: openChild })).toBeVisible();

  // The preference survives a reload.
  await page.reload();
  await expect(areaToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(groupBox(page, 'Done')).toHaveCount(0);

  // …and is reversible.
  await areaToggle(page).click();
  await expect(areaToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(groupBox(page, 'Done')).toHaveCount(1);
  await expect(page.locator('.task-line', { hasText: doneChild })).toBeVisible();
});

test('task detail pane shares the completed preference with the area view', async ({ page }) => {
  const tok = uniq();
  const parent = `Parent ${tok}`;
  const doneChild = `Done child ${tok}`;
  const openChild = `Open child ${tok}`;

  await page.goto('/#/');
  await createArea(page, `Area ${tok}`);
  await createRootTask(page, parent);
  await addSubTask(page, page.locator('.task-line', { hasText: parent }), doneChild);
  await addSubTask(page, page.locator('.task-line', { hasText: parent }), openChild);
  await page.locator('.task-line', { hasText: doneChild }).locator('input.task-line-check').check();

  // Open the parent's detail pane: completed subtasks show in place.
  await page.locator('.task-line', { hasText: parent }).locator('.project-row-name').click();
  await expect(paneToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.project-pane-tasks .task-line', { hasText: doneChild })).toBeVisible();

  // Hiding from the pane prunes the completed subtask there…
  await paneToggle(page).click();
  await expect(paneToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.project-pane-tasks .task-line', { hasText: doneChild })).toHaveCount(0);
  await expect(page.locator('.project-pane-tasks .task-line', { hasText: openChild })).toBeVisible();

  // …and the area view reflects the same device-wide preference.
  await page.locator('.area-header-crumb').click();
  await expect(areaToggle(page)).toHaveAttribute('aria-pressed', 'false');
});
