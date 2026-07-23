// NOTE: this file must sort AFTER inbox.spec.ts alphabetically. inbox.spec
// asserts exact inbox counts, which only holds while no earlier spec has
// written to the shared e2e sync server: TinyBase's WsServer tears down the
// per-path store on last-client-close, but the async close handler races the
// next page's connect — once a backlog exists, leftover rows sync down into
// the next test's fresh store. Keep the `main-pane-*` prefix.
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

  test('a sub-area header edits the sub-area, not its parent', async ({ page }) => {
    const parent = `Family ${uniq()}`;
    const child = `Kids ${uniq()}`;
    const renamed = `School ${uniq()}`;
    await createArea(page, parent);
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);

    await page.locator('.area-header-name-edit').click();
    const input = page.locator('.area-edit-name');
    await expect(input).toHaveValue(child);
    await input.fill(renamed);
    await input.press('Enter');
    await page.keyboard.press('Escape');

    await expect(page.locator('.area-header-name')).toContainText(renamed);
    // The parent crumb keeps its name.
    await expect(page.locator('.area-header-crumb')).toContainText(parent);
  });
});
