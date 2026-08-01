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

test.describe('Area header editing', () => {
  test('clicking the name opens the editor; Enter renames header and sidebar', async ({
    page,
  }) => {
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

  test('a color swatch recolors immediately and Escape closes the editor', async ({
    page,
  }) => {
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
    await expect(
      page.locator('.area-edit-color-swatch[title="Blue"]'),
    ).toHaveAttribute('data-active', 'true');
  });

});
