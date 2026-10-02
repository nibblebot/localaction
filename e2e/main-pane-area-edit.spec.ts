import { test, expect } from '@playwright/test';
import { createArea, uniq } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
});

test.describe('Area header editing', () => {
  test('clicking the name opens the editor; Enter renames header and sidebar', async ({ page }) => {
    const name = `Health ${uniq()}`;
    const renamed = `Wellness ${uniq()}`;
    await createArea(page, name);

    await page.locator('.area-header-name-edit').click();
    const input = page.locator('.area-edit-name');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(name);

    await input.fill(renamed);
    await input.press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(renamed);
    await expect(page.locator('.sidebar')).toContainText(renamed);

    // Empty / whitespace-only input reverts instead of blanking the name.
    await input.fill('   ');
    await input.blur();
    await expect(page.locator('.area-header-name')).toContainText(renamed);
  });

  test('a color swatch recolors immediately and Escape closes the editor', async ({ page }) => {
    const name = `Work ${uniq()}`;
    await createArea(page, name);

    await page.locator('.area-header-name-edit').click();
    const blue = page.locator('.area-edit-color-swatch[title="Blue"]');
    await blue.click();
    await expect(blue).toHaveAttribute('data-active', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('.area-edit')).toHaveCount(0);

    // Reopening shows the persisted color as active.
    await page.locator('.area-header-name-edit').click();
    await expect(page.locator('.area-edit-color-swatch[title="Blue"]')).toHaveAttribute(
      'data-active',
      'true',
    );
  });
});
