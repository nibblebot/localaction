import { test, expect, type Page } from '@playwright/test';

/**
 * The project detail pane (`#/p/<id>`) is the standalone form of an
 * expanded project card — its header carries the same row actions the
 * area-view card shows: progress meter, due date, empty-sections
 * toggle, rename, delete. Empty-section state is per project,
 * so toggling it on one surface applies to the other.
 */

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="Add project to Active"]').click();
  const input = page.locator('input[aria-label="New project"]');
  await input.fill(name);
  await input.press('Enter');
}

async function addPaneTask(page: Page, title: string): Promise<void> {
  await page.locator('.pane-section-head-actions button[aria-label^="Add task to "]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

async function openProjectPane(page: Page, area: string, project: string): Promise<void> {
  await page.goto('/#/');
  await createArea(page, area);
  await createProject(page, project);
  await page.locator('li.project-row', { hasText: project }).locator('.project-row-name').click();
  await expect(page).toHaveURL(/#\/p\/[^/]+$/);
  await expect(page.locator('.area-header-name')).toContainText(project);
}

test.describe('Project detail pane row actions', () => {
  test('pane header mirrors the card: progress, due date, empty-sections toggle', async ({
    page,
  }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const project = `Project ${tok}`;
    await openProjectPane(page, area, project);
    const header = page.locator('.area-header');

    // Progress meter tracks the deep task list, live.
    await addPaneTask(page, `Task one ${tok}`);
    await addPaneTask(page, `Task two ${tok}`);
    await expect(header.locator('.project-row-progress-count')).toHaveText('0 / 2');
    await page.locator(`input[aria-label="Mark “Task one ${tok}” done"]`).click();
    await expect(header.locator('.project-row-progress-count')).toHaveText('1 / 2');

    // Due date: pick the 14th from the calendar popover, label shows MM/DD.
    await header.getByRole('button', { name: 'Set due date' }).click();
    const calendar = page.getByRole('dialog', { name: 'Pick due date' });
    await calendar.getByRole('gridcell', { name: '14', exact: true }).click();
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    await expect(header.locator('.due-date-label')).toHaveText(`${mm}/14`);

    // Empty-sections toggle prunes section headers with no visible tasks.
    await page
      .locator(`.pane-section-head-actions button[aria-label="Add section to ${project}"]`)
      .click();
    await expect(page.locator('.section-row .editable-title:focus')).toBeVisible();
    await page.keyboard.type(`Empty ${tok}`);
    await page.keyboard.press('Enter');
    await expect(page.locator('.project-pane-tasks .section-row')).toHaveCount(1);
    await header.getByRole('button', { name: `Hide empty sections in ${project}` }).click();
    const toggle = header.getByRole('button', { name: `Show empty sections in ${project}` });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.project-pane-tasks .section-row')).toHaveCount(0);

    // The state is per project: back on the area view the card hides the
    // empty section too, and its toggle reads pressed.
    await page.locator('.area-header-crumb', { hasText: area }).click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    const card = page.locator('li.project-row', { hasText: project });
    await expect(card.locator('.section-row')).toHaveCount(0);
    await expect(
      card.getByRole('button', { name: `Show empty sections in ${project}` }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('rename and delete work from the pane header', async ({ page }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const project = `Project ${tok}`;
    await openProjectPane(page, area, project);
    const header = page.locator('.area-header');

    // Clicking the name swaps the header title for an inline input.
    await header.getByRole('button', { name: `Rename ${project}` }).click();
    const rename = header.getByRole('textbox', { name: 'Project name' });
    await rename.fill(`Renamed ${tok}`);
    await rename.press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(`Renamed ${tok}`);

    // The trash rides the rename input: re-enter edit mode, then delete.
    await header.getByRole('button', { name: `Rename Renamed ${tok}` }).click();
    await header.getByRole('button', { name: 'Delete project' }).click();
    await page.getByRole('dialog', { name: 'Delete project?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText(area);
    await expect(page.locator('.project-row-name', { hasText: `Renamed ${tok}` })).toHaveCount(0);
  });
});


// The rename input and its trash must stay on one row at phone
// widths — the pane header wraps on mobile, but the trash riding the
// input is a single atomic group (`.area-header-edit-row`). Regression
// guard for the flex-wrap / min-width interaction at the ≤700px break.
test.describe('Project detail pane row actions @ mobile', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('rename input and trash share a row at 360px', async ({ page }) => {
    const tok = uniq();
    const area = `Area ${tok}`;
    const project = `Project ${tok}`;
    // Mobile sidebar is an off-canvas drawer — open it to reach the
    // area/project affordances before the shared setup helpers run.
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await createArea(page, area);
    await createProject(page, project);
    await page.locator('li.project-row', { hasText: project }).locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/p\/[^/]+$/);

    // Enter edit mode by clicking the name.
    await page.locator('.area-header').getByRole('button', { name: `Rename ${project}` }).click();
    const editRow = page.locator('.area-header-edit-row');
    const input = editRow.locator('input[aria-label="Project name"]');
    const trash = editRow.locator('button[aria-label="Delete project"]');
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
