import { test, expect, type Page } from '@playwright/test';

// Each test uses a unique, timestamped area name so OPFS state from
// prior runs in the same dev server is harmless.
test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
});

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
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
    await page.locator('.area-tab', { hasText: 'Projects' }).click();
    const input = page.locator('.projects-tab > .inline-add-input');
    await input.fill(project);
    await input.press('Enter');
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
    await page.locator('.projects-tab > .inline-add-input').fill(project);
    await page.locator('.projects-tab > .inline-add-input').press('Enter');
    const card = page.locator('li.project-row', { hasText: project });
    await card.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New task"]').fill(task);
    await card.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New task"]').press('Enter');
    await expect(card.locator('.task-line-title').last()).toHaveValue(task);
    // Back on the parent (default Projects tab): the sub-area task
    // rolls up under a header, inside its project card.
    await page.locator('.area-header-crumb', { hasText: parent }).click();
    await expect(page.locator('.subarea-header-name', { hasText: child })).toBeVisible();
    await expect(
      page.locator('.subarea-section .task-line-title').last(),
    ).toHaveValue(task);
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

  test('a sub-area pane has no add-sub-area button (one level deep only)', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Daughter ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);
    // Sub-area pane: no add button, no list of sub-sub-areas here.
    await expect(page.locator('.area-header-add')).toHaveCount(0);
    await expect(page.locator('.subarea-row')).toHaveCount(0);
    // Crumb font-size matches the heading.
    const crumb = page.locator('.area-header-crumb', { hasText: parent });
    const crumbSize = await crumb.evaluate((el) => getComputedStyle(el).fontSize);
    const headingSize = await page
      .locator('.area-header-name')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(crumbSize).toBe(headingSize);
  });
});
