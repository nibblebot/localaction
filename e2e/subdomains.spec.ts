import { test, expect, type Page } from '@playwright/test';

// Each test uses a unique, timestamped area name so OPFS state from
// prior runs in the same dev server is harmless.
test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
});

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

test.describe('Sub-area roll-up into the parent area view', () => {
  test('parent Projects tab lists sub-area projects under a sub-area header', async ({
    page,
  }) => {
    const parent = `Family ${uniq()}`;
    const child = `Kids ${uniq()}`;
    const project = `School play ${uniq()}`;
    await createArea(page, parent);
    // Create the sub-area (lands on its pane).
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);
    // Add a project inside the sub-area.
    await page.locator('button[aria-label="Add project to Active"]').click();
    const input1 = page.locator('input[aria-label="New project"]');
    await input1.fill(project);
    await input1.press('Enter');
    await expect(page.locator('.project-row-name', { hasText: project })).toBeVisible();
    // Back on the parent: the sub-area project rolls up under a header.
    await page.locator('.area-header-crumb', { hasText: parent }).click();
    await expect(page.locator('.area-header-name')).toContainText(parent);
    await expect(page.locator('.subarea-header-name', { hasText: child })).toBeVisible();
    await expect(page.locator('.project-row-name', { hasText: project })).toBeVisible();
    // The sub-area header navigates into the sub-area.
    await page.locator('.subarea-header-name', { hasText: child }).click();
    await expect(page.locator('.area-header-name')).toContainText(child);
  });

  test('Active group is hoisted above the sub-area slices it contains', async ({
    page,
  }) => {
    const parent = `Family ${uniq()}`;
    const child = `Kids ${uniq()}`;
    const parentProject = `Renovation ${uniq()}`;
    const childProject = `School play ${uniq()}`;
    await createArea(page, parent);
    // A project in the parent area itself.
    await page.locator('button[aria-label="Add project to Active"]').click();
    const input2 = page.locator('input[aria-label="New project"]');
    await input2.fill(parentProject);
    await input2.press('Enter');
    await expect(
      page.locator('.project-row-name', { hasText: parentProject }),
    ).toBeVisible();
    // A sub-area with its own project.
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await page.locator('button[aria-label="Add project to Active"]').click();
    const input3 = page.locator('input[aria-label="New project"]');
    await input3.fill(childProject);
    await input3.press('Enter');
    // Back on the parent: a single Active group holds the parent's
    // project AND the sub-area slice (header + project) below it.
    await page.locator('.area-header-crumb', { hasText: parent }).click();
    const active = page.locator('.tab-group').filter({
      has: page.locator('.tab-group-title', { hasText: 'Active' }),
    });
    await expect(active).toHaveCount(1);
    await expect(
      active.locator('.project-row-name', { hasText: parentProject }),
    ).toBeVisible();
    await expect(
      active.locator('.subarea-header-name', { hasText: child }),
    ).toBeVisible();
    await expect(
      active.locator('.project-row-name', { hasText: childProject }),
    ).toBeVisible();
    // The group title sits above the sub-area slice it contains.
    const titleBox = await active.locator('.tab-group-title').boundingBox();
    const headerBox = await active
      .locator('.subarea-header-name', { hasText: child })
      .boundingBox();
    expect(titleBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(titleBox!.y).toBeLessThan(headerBox!.y);
  });

  test('parent Projects tab lists sub-area tasks inside their project card', async ({
    page,
  }) => {
    const parent = `Work ${uniq()}`;
    const child = `Team ${uniq()}`;
    const project = `General ${uniq()}`;
    const task = `Prep deck ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);
    // Add a project inside the sub-area, then a task via the project
    // card's footer input (cards are expanded by default).
    await page.locator('button[aria-label="Add project to Active"]').click();
    const input4 = page.locator('input[aria-label="New project"]');
    await input4.fill(project);
    await input4.press('Enter');
    const card = page.locator('li.project-row', { hasText: project });
    await card.locator(`button[aria-label="Add task to ${project}"]`).click();
    await expect(card.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(task);
    await page.keyboard.press('Enter');
    // Back on the parent (default Projects tab): the sub-area task
    // rolls up under a header, inside its project card.
    await page.locator('.area-header-crumb', { hasText: parent }).click();
    await expect(page.locator('.subarea-header-name', { hasText: child })).toBeVisible();
    await expect(
      page.locator('.subarea-section .task-line-title').last(),
    ).toHaveValue(task);
  });

  test('parent Area tasks section groups sub-area tasks under the sub-area name', async ({
    page,
  }) => {
    const parent = `Work ${uniq()}`;
    const child = `Kids ${uniq()}`;
    const taskA = `Pack lunches ${uniq()}`;
    const taskB = `Sign forms ${uniq()}`;
    await createArea(page, parent);
    // A sub-area with two area-rooted tasks.
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);
    const childSection = page.locator('.pane-section', { hasText: 'Area tasks' });
    const addTask = async (title: string): Promise<void> => {
      await childSection.locator('button[aria-label="Add task"]').click();
      await expect(childSection.locator('.task-line-title:focus')).toBeVisible();
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
    };
    await addTask(taskA);
    await addTask(taskB);
    await expect(childSection.locator('.task-line-title')).toHaveCount(2);

    // Back on the parent: both tasks sit in the Area tasks section under
    // a group labeled with the sub-area's name — not in Projects.
    await page.locator('.area-header-crumb', { hasText: parent }).click();
    const section = page.locator('.pane-section', { hasText: 'Area tasks' });
    const group = section.locator('.tab-group', {
      has: page.locator('.tab-group-title', { hasText: child }),
    });
    await expect(group.locator('.task-line-title').nth(0)).toHaveValue(taskA);
    await expect(group.locator('.task-line-title').nth(1)).toHaveValue(taskB);
    await expect(page.locator('.projects-tab .task-line-title')).toHaveCount(0);
    // The section count includes the sub-area's tasks.
    await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('2');

    // Drag-reorder inside the group: the second task moves above the first.
    const second = group.locator('.task-line').nth(1);
    const first = group.locator('.task-line').nth(0);
    const handle = second.locator('.task-line-drag-handle');
    const hb = await handle.boundingBox();
    const fb = await first.boundingBox();
    expect(hb).not.toBeNull();
    expect(fb).not.toBeNull();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y - 20, { steps: 5 });
    await page.mouse.move(fb!.x + fb!.width / 2, fb!.y + 2, { steps: 10 });
    await page.mouse.up();
    await expect(group.locator('.task-line-title').nth(0)).toHaveValue(taskB);
    await expect(group.locator('.task-line-title').nth(1)).toHaveValue(taskA);
    // dnd-kit's PointerSensor swallows document-level clicks (capture)
    // for 50ms after a drop; React's checkbox onChange rides the click
    // event, so a too-fast click toggles the DOM box without writing.
    await page.waitForTimeout(100);

    // Check-off is editable in place too: the done task is pruned and
    // the count drops.
    await page.locator(`input[aria-label="Mark “${taskB}” done"]`).click();
    await expect(group.locator('.task-line-title')).toHaveCount(1);
    await expect(section.locator('.pane-section-toggle .tab-group-count')).toHaveText('1');
  });
});

test.describe('Sub-areas (inline create)', () => {
  test('a top-level area header has no leading slash', async ({ page }) => {
    const name = `Root ${uniq()}`;
    await createArea(page, name);
    await expect(page.locator('.area-header-crumb')).toHaveCount(0);
    await expect(page.locator('.area-header-slash')).toHaveCount(0);
    // The add-sub-area button is shown on a top-level area.
    await expect(page.locator('.area-header-add', { hasTitle: 'Add sub-area' })).toBeVisible();
  });

  test('clicking the + reveals an inline input; Enter creates and navigates', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Wife ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    // The + is replaced by an inline input.
    await expect(page.locator('.area-header-add-input')).toBeVisible();
    await expect(page.locator('.area-header-add-input')).toBeFocused();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    // Navigates into the new sub-area.
    await expect(page.locator('.area-header-name')).toContainText(child);
    // Breadcrumb back to parent present.
    await expect(page.locator('.area-header-crumb', { hasText: parent })).toBeVisible();
  });

  test('Escape cancels the inline input without creating', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill('Should not be created');
    await page.locator('.area-header-add-input').press('Escape');
    // Input dismissed; we remain on the parent area.
    await expect(page.locator('.area-header-name')).toContainText(parent);
    await expect(page.locator('.area-header-add-input')).toHaveCount(0);
    await expect(page.locator('.area-header-add', { hasTitle: 'Add sub-area' })).toBeVisible();
  });

  test('blur with empty input is a no-op (just closes)', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    // Blur without typing.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.area-header-add-input')).toHaveCount(0);
    await expect(page.locator('.area-header-name')).toContainText(parent);
  });

  test('a sub-area pane keeps the root marker and can add another sub-area', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Daughter ${uniq()}`;
    const grandchild = `School ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);

    const rootCrumb = page.locator('.area-header-crumb', { hasText: parent });
    await expect(rootCrumb).toBeVisible();
    await expect(rootCrumb.locator('.area-header-name-edit-dot')).toBeVisible();
    await expect(page.locator('.area-header-add', { hasTitle: 'Add sub-area' })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
    await expect(rootCrumb).toBeVisible();
    await expect(rootCrumb.locator('.area-header-name-edit-dot')).toBeVisible();
    await expect(page.locator('.area-header-add', { hasTitle: 'Add sub-area' })).toBeVisible();

    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(grandchild);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(grandchild);
    await expect(page.locator('.area-header-crumb', { hasText: parent })).toBeVisible();
    await expect(page.locator('.area-header-crumb', { hasText: child })).toBeVisible();

    const crumbSize = await page
      .locator('.area-header-crumb', { hasText: parent })
      .evaluate((el) => getComputedStyle(el).fontSize);
    const headingSize = await page
      .locator('.area-header-name')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(crumbSize).toBe(headingSize);
  });
});
