import { test, expect } from '@playwright/test';

// Each test uses a unique, timestamped area name so OPFS state from
// prior runs in the same dev server is harmless.
test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
});

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('Sub-areas (inline create)', () => {
  test('a top-level area header has no leading slash', async ({ page }) => {
    const name = `Root ${uniq()}`;
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(name);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.area-header-name')).toContainText(name);
    await expect(page.locator('.area-header-crumb')).toHaveCount(0);
    await expect(page.locator('.area-header-slash')).toHaveCount(0);
    // The add-sub-area button is shown on a top-level area.
    await expect(page.locator('.area-header-add', { hasTitle: 'Add sub-area' })).toBeVisible();
  });

  test('clicking the + reveals an inline input; Enter creates and navigates', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Wife ${uniq()}`;
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(parent);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
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
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(parent);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
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
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(parent);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    // Blur without typing.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.area-header-add-input')).toHaveCount(0);
    await expect(page.locator('.area-header-name')).toContainText(parent);
  });

  test('a sub-area pane has no add-sub-area button (one level deep only)', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Daughter ${uniq()}`;
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(parent);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
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
