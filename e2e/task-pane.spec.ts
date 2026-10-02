import { test, expect, type Page } from '@playwright/test';
import { createArea, createRootTask, addSubTask, rootRow, uniq, groupCount } from './helpers.ts';
import { openTaskPane } from './spec-helpers.ts';

/**
 * The task detail pane (`#/t/<id>`) — the standalone form of a parent
 * task, reached by clicking a parent row's name anywhere it renders.
 * Its header carries the same actions the tree parent row shows:
 * rename (via a button that swaps the title for an inline input), a
 * due date, delete (the trash rides the rename input), and — roots
 * only — the Active/Backlog toggle. A back affordance
 * (`.area-header-crumb`, aria-label "Go back") returns to the owning
 * area for a root.
 */

/** Add a sub-task from the pane body via its head action. */
async function addPaneSubTask(page: Page, title: string): Promise<void> {
  await page.locator('button[aria-label^="Add sub-task to "]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

test.describe('Task detail pane header chrome', () => {
  test('pane header mirrors the parent row: progress meter and due date', async ({ page }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const task = `Task ${tok}`;
    await openTaskPane(page, area, task);
    const header = page.locator('.area-header');
    await addPaneSubTask(page, `First ${tok}`);

    // Progress meter tracks the subtree, live (1 seed + 1 pane sub-task).
    await expect(header.locator('.project-row-progress-count')).toHaveText('0 / 2');
    await page.locator(`input[aria-label="Mark “First ${tok}” done"]`).click();
    await expect(header.locator('.project-row-progress-count')).toHaveText('1 / 2');

    // Due date: pick the 14th from the calendar popover, label shows the
    // "Aug 14" shape (same Intl format as src/components/shared/dates.ts).
    await header.getByRole('button', { name: 'Set due date' }).click();
    const calendar = page.getByRole('dialog', { name: 'Pick due date' });
    await calendar.getByRole('gridcell', { name: '14', exact: true }).click();
    const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date());
    await expect(header.locator('.due-date-label')).toHaveText(`${monthShort} 14`);
  });

  test('rename and delete work from the pane header', async ({ page }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const task = `Task ${tok}`;
    await openTaskPane(page, area, task);
    const header = page.locator('.area-header');

    // Clicking the name swaps the header title for an inline input.
    await header.getByRole('button', { name: `Rename ${task}` }).click();
    const rename = header.getByRole('textbox', { name: 'Task name' });
    await rename.fill(`Renamed ${tok}`);
    await rename.press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(`Renamed ${tok}`);

    // The trash rides the rename input: re-enter edit mode, then delete.
    await header.getByRole('button', { name: `Rename Renamed ${tok}` }).click();
    await header.getByRole('button', { name: 'Delete task' }).click();
    await page
      .getByRole('dialog', { name: 'Delete task?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    // A deleted root falls back to its owning area.
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText(area);
    await expect(page.locator('.project-row-name', { hasText: `Renamed ${tok}` })).toHaveCount(0);
  });

  test('the backlog toggle shelves a root from the pane', async ({ page }) => {
    const tok = uniq();
    const area = `BacklogPane ${tok}`;
    const task = `Root ${tok}`;
    const seed = await openTaskPane(page, area, task);

    // Roots show the toggle (sub-tasks don't): an Active root renders
    // "Active", unpressed — pressing shelves it into Backlog.
    const toggle = page.locator('.area-header .btn.btn-sm');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Back in the area, the root sits under the Backlog group (the
    // seed sub-task moves with it — only ROOT status changed).
    await page.locator('.area-header-crumb').click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    expect(await groupCount(page, 'Active')).toBe(0);
    expect(await groupCount(page, 'Backlog')).toBe(1);
    const backlogGroup = page.locator('.tab-group', {
      has: page.getByRole('button', { name: /^Backlog/ }),
    });
    await expect(backlogGroup.locator('.task-line', { hasText: task })).toBeVisible();
    await expect(backlogGroup.locator('.task-line', { hasText: seed })).toBeVisible();
  });

  test('a parent row name opens its own pane; the back affordance returns', async ({ page }) => {
    const tok = uniq();
    const area = `NestPane ${tok}`;
    const parent = `Parent ${tok}`;
    const child = `Child ${tok}`;
    await page.goto('/#/');
    await createArea(page, area);
    await createRootTask(page, parent);
    await addSubTask(page, rootRow(page, parent), child);

    // The child is a leaf, so no pane of its own; its PARENT row name
    // opens the parent pane, showing the child as the subtree root.
    await rootRow(page, parent).locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/t\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText(parent);
    await expect(page.locator('.project-pane-tasks .task-line', { hasText: child })).toBeVisible();

    // The back affordance (". .. /" crumb) returns to the owning area.
    await page.locator('.area-header-crumb').click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText(area);
    await expect(page.locator('.task-line', { hasText: parent })).toBeVisible();
  });

  test('a deleted root offers undo from the pane header', async ({ page }) => {
    const tok = uniq();
    const area = `UndoPane ${tok}`;
    const task = `Doomed ${tok}`;
    await openTaskPane(page, area, task);

    await page
      .locator('.area-header')
      .getByRole('button', { name: `Rename ${task}` })
      .click();
    await page.locator('.area-header').getByRole('button', { name: 'Delete task' }).click();
    await page
      .getByRole('dialog', { name: 'Delete task?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.locator('.area-header-name')).toContainText(area);
    await expect(page.locator('.undo-toast-label')).toHaveText(`Deleted “${task}”`);

    await page.locator('.undo-toast-action').click();
    await expect(page.locator('.task-line', { hasText: task })).toBeVisible();
    await expect(page.locator('.undo-toast')).toHaveCount(0);
  });
});

// The rename input and its trash must stay on one row at phone
// widths — the pane header wraps on mobile, but the trash riding the
// input is a single atomic group (`.area-header-edit-row`). Regression
// guard for the flex-wrap / min-width interaction at the ≤700px break.
test.describe('Task detail pane header @ mobile', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('rename input and trash share a row at 360px', async ({ page }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const task = `Task ${tok}`;
    // Mobile sidebar is an off-canvas drawer — open it to reach the
    // area/new-task affordances before the shared setup helpers run.
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await createArea(page, area);
    await createRootTask(page, task);
    await addSubTask(page, rootRow(page, task), `Seed ${tok}`);
    await rootRow(page, task).locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/t\/[^/]+$/);

    // Enter edit mode by clicking the name.
    await page
      .locator('.area-header')
      .getByRole('button', { name: `Rename ${task}` })
      .click();
    const editRow = page.locator('.area-header-edit-row');
    const input = editRow.locator('input[aria-label="Task name"]');
    const trash = editRow.locator('button[aria-label="Delete task"]');
    await expect(input).toBeVisible();
    await expect(trash).toBeVisible();

    const inputBox = (await input.boundingBox())!;
    const trashBox = (await trash.boundingBox())!;
    // Same row: the trash vertically overlaps the input. A wrap would
    // sit it a full row below; center-aligned elements of different
    // heights can differ a few px at the top without wrapping.
    expect(trashBox.y).toBeLessThan(inputBox.y + inputBox.height);
    expect(trashBox.y + trashBox.height).toBeGreaterThan(inputBox.y);
    // Trash sits to the right of the input, fully in view (no clip).
    expect(trashBox.x).toBeGreaterThan(inputBox.x + inputBox.width);
    expect(trashBox.x + trashBox.width).toBeLessThanOrEqual(360);
  });
});
