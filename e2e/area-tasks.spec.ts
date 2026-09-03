import { test, expect } from '@playwright/test';
import { createArea, createRootTask, nestArea, uniq, groupCount } from './helpers.ts';

test('area tasks: add, nest, complete', async ({ page }) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);

  // The Active group header tracks its root count.
  await expect(page.locator('.tasks-tab')).toBeVisible();
  await expect(page.locator('button[aria-label="Add task to Active"]')).toBeVisible();

  // Add two Active roots; the header count tracks them.
  await createRootTask(page, `Task one ${tok}`);
  await createRootTask(page, `Task two ${tok}`);
  expect(await groupCount(page, 'Active')).toBe(2);

  // Sub-tasks nest under their parent instead of rendering flush-left.
  const taskTwo = page.locator('.task-line', { hasText: `Task two ${tok}` });
  await taskTwo.hover();
  await taskTwo.locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(`Sub task ${tok}`);
  await page.keyboard.press('Enter');
  const nested = page.locator('.task-line', { hasText: `Sub task ${tok}` });
  await expect(nested).toBeVisible();
  const parentBox = await taskTwo.boundingBox();
  const nestedBox = await nested.boundingBox();
  expect(parentBox).not.toBeNull();
  expect(nestedBox).not.toBeNull();
  expect(nestedBox!.x).toBeGreaterThan(parentBox!.x);

  // A fully-done root moves to the Done group; its row stays visible
  // there with the done treatment (completed tasks are always shown
  // now — no show-completed plumbing).
  await page.locator(`input[aria-label="Mark “Task one ${tok}” done"]`).click();
  await expect(
    page.locator('.task-line.task-line-done', { hasText: `Task one ${tok}` }),
  ).toBeVisible();
  expect(await groupCount(page, 'Active')).toBe(1);
  expect(await groupCount(page, 'Done')).toBe(1);
});

test('sub-area roots render under their own header and navigate on click', async ({
  page,
}) => {
  const tok = uniq();
  const area = `Parent ${tok}`;
  const sub = `Sub ${tok}`;
  const parentTask = `Own ${tok}`;
  const subTask = `Subtask ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, parentTask);

  // Create a second root area, then drag it onto the first to nest it
  // as a sub-area (the sidebar drag is how areas get reparented).
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(sub);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(sub);

  // Nest the sub-area under the parent via the data layer (the sidebar
  // drag is covered by reorder.spec; this test targets the sub-area
  // slices in the area view).
  await nestArea(page, area, sub);

  // The sub-area is now nested; navigate into it and add a root there.
  await page.locator('.sidebar-item-name', { hasText: sub }).click();
  await expect(page.locator('.area-header-name')).toContainText(sub);
  await createRootTask(page, subTask);

  // A second sub-area with no tasks anywhere contributes no grouping:
  // its header never renders.
  const emptySub = `Empty ${tok}`;
  await createArea(page, emptySub);
  await nestArea(page, area, emptySub);

  // Back on the parent area: the parent's own roots render headerless
  // at the top of the group; the only slice header is the clickable
  // sub-area name (no "This area" grouping, no empty sub-area grouping).
  await page.locator('.sidebar-item-name', { hasText: area }).click();

  await expect(page.locator('.area-header-name')).toContainText(area);
  const subHeader = page.locator('.subarea-header-name', { hasText: sub });
  await expect(subHeader).toBeVisible();
  await expect(page.locator('.subarea-header-name')).toHaveCount(1);
  await expect(page.locator('.tasks-tab .task-line', { hasText: parentTask })).toBeVisible();
  await expect(page.locator('.tasks-tab .task-line', { hasText: subTask })).toBeVisible();
  expect(await groupCount(page, 'Active')).toBe(2);

  // Clicking the sub-area name navigates to its own pane.
  await subHeader.click();
  await expect(page).toHaveURL(/#\/a\/[^/]+$/);
  await expect(page.locator('.area-header-name')).toContainText(sub);
  await expect(page.locator('.task-line', { hasText: subTask })).toBeVisible();
});
test('parent "+" draft survives when sibling slices mount their own trees', async ({
  page,
}) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  const sub = `Sub ${tok}`;
  const parentTask = `Parent ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createRootTask(page, parentTask);

  // A nested sub-area with a root mounts extra TaskTrees beside the one
  // holding the parent (an empty sub-area renders no slice, so the sub
  // gets a root first). Regression: every tree that lacked the draft
  // target used to append the draft at its own root, so several draft
  // rows mounted at once, raced for focus, and blur-cancelled the draft
  // instantly — the row's "+" appeared dead.
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(sub);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(sub);
  await nestArea(page, area, sub);
  await createRootTask(page, `Sub root ${tok}`);
  await page.locator('.sidebar-item-name', { hasText: area }).click();
  await expect(page.locator('.area-header-name')).toContainText(area);
  await expect(
    page.locator('.subarea-header-name', { hasText: sub }),
  ).toBeVisible();

  const row = page.locator('.task-line', { hasText: parentTask });
  await row.hover();
  await row.locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(`Child ${tok}`);
  await page.keyboard.press('Enter');

  // The committed child nests under its parent (indented, not flush).
  const child = page.locator('.task-line', { hasText: `Child ${tok}` });
  await expect(child).toBeVisible();
  const parentBox = await row.boundingBox();
  const childBox = await child.boundingBox();
  expect(parentBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThan(parentBox!.x);
});
