import { test, expect, type Page } from '@playwright/test';

// Selecting a collapsed area's label in the sidebar navigates to the
// area detail AND expands the area so its sub-areas become visible.
// Collapse state persists to localStorage, but Playwright gives each
// test a fresh browser context, so no cross-test cleanup is needed.

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function cleanOpfs(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.evaluate(async () => {
    try {
      type OpfsRoot = FileSystemDirectoryHandle & {
        entries(): AsyncIterable<[string, FileSystemHandle]>;
      };
      const opfsRoot: OpfsRoot = await navigator.storage.getDirectory();
      for await (const [name] of opfsRoot.entries()) {
        try {
          await opfsRoot.removeEntry(name, { recursive: true });
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* OPFS may be unavailable */
    }
  });
}

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

async function createSubArea(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add sub-area' }).click();
  const input = page.getByRole('textbox', { name: 'Sub-area name' });
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

test.describe('Sidebar area collapse', () => {
  test.beforeEach(async ({ page }) => {
    await cleanOpfs(page);
    await page.goto('/#/');
  });

  test('clicking a collapsed area label navigates and expands it', async ({ page }) => {
    const token = uniq();
    const parent = `Parent-${token}`;
    const child = `Child-${token}`;

    await createArea(page, parent);
    await createSubArea(page, child);

    const sidebar = page.locator('.sidebar');
    const label = sidebar.getByRole('button', { name: parent, exact: true });
    const childLabel = sidebar.getByRole('button', { name: child, exact: true });

    // Collapse via the caret; the sub-area row disappears.
    await page.getByRole('button', { name: `Collapse ${parent}` }).click();
    await expect(page.getByRole('button', { name: `Expand ${parent}` })).toBeVisible();
    await expect(childLabel).toBeHidden();

    // Clicking the collapsed label shows the area detail and re-expands.
    await label.click();
    await expect(page.locator('.area-header-name')).toContainText(parent);
    await expect(page.getByRole('button', { name: `Collapse ${parent}` })).toBeVisible();
    await expect(childLabel).toBeVisible();
  });
});
