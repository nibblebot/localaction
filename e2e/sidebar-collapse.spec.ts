import { test, expect, type Page } from '@playwright/test';

// There is no caret: clicking an area with children navigates to it
// AND toggles its sub-areas collapsed/expanded; the row's aria-expanded
// carries the state. Collapse state persists to localStorage, but
// Playwright gives each test a fresh browser context, so no cross-test
// cleanup is needed.

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
  await page.locator('button[aria-label="New area"]').click();
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

  test('clicking an area with children toggles its sub-areas', async ({ page }) => {
    const token = uniq();
    const parent = `Parent-${token}`;
    const child = `Child-${token}`;
    const leaf = `Leaf-${token}`;

    await createArea(page, parent);
    await createSubArea(page, child);
    await createArea(page, leaf);

    const sidebar = page.locator('.sidebar');
    const parentRow = sidebar.getByRole('button', { name: parent, exact: true });
    const childRow = sidebar.getByRole('button', { name: child, exact: true });
    const leafRow = sidebar.getByRole('button', { name: leaf, exact: true });

    // Expanded by default; a leaf row carries no expand state at all.
    await expect(parentRow).toHaveAttribute('aria-expanded', 'true');
    await expect(leafRow).not.toHaveAttribute('aria-expanded');

    // Clicking the parent navigates to it and collapses its sub-areas.
    await parentRow.click();
    await expect(page.locator('.area-header-name')).toContainText(parent);
    await expect(parentRow).toHaveAttribute('aria-expanded', 'false');
    await expect(childRow).toBeHidden();

    // Clicking again re-expands.
    await parentRow.click();
    await expect(parentRow).toHaveAttribute('aria-expanded', 'true');
    await expect(childRow).toBeVisible();
  });

  test('clicking a sub-area toggles its own children; collapse-all reaches nested areas', async ({
    page,
  }) => {
    const token = uniq();
    const parent = `Parent-${token}`;
    const child = `Child-${token}`;
    const grandchild = `Grand-${token}`;

    await createArea(page, parent);
    await createSubArea(page, child);
    await createSubArea(page, grandchild);

    const sidebar = page.locator('.sidebar');
    const parentRow = sidebar.getByRole('button', { name: parent, exact: true });
    const childRow = sidebar.getByRole('button', { name: child, exact: true });
    const grandchildRow = sidebar.getByRole('button', { name: grandchild, exact: true });

    // The sub-area toggles the grandchild, just like a root-level area.
    await expect(childRow).toHaveAttribute('aria-expanded', 'true');
    await childRow.click();
    await expect(page.locator('.area-header-name')).toContainText(child);
    await expect(childRow).toHaveAttribute('aria-expanded', 'false');
    await expect(grandchildRow).toBeHidden();

    // Collapse-all reaches nested areas too. Navigate off the tree
    // first: collapse-all keeps the selected area's ancestors expanded.
    await page.locator('.sidebar-inbox-link').click();
    await page.getByRole('button', { name: 'Collapse all areas' }).click();
    await expect(parentRow).toHaveAttribute('aria-expanded', 'false');
    await expect(childRow).toBeHidden();
    // Expanding the parent (by clicking it) reveals the sub-area
    // still collapsed.
    await parentRow.click();
    await expect(parentRow).toHaveAttribute('aria-expanded', 'true');
    await expect(childRow).toHaveAttribute('aria-expanded', 'false');
    await expect(grandchildRow).toBeHidden();
  });

  test('collapse-all flips to expand-all while the selected area stays open', async ({ page }) => {
    const token = uniq();
    const parent = `Parent-${token}`;
    const child = `Child-${token}`;
    const other = `Other-${token}`;
    const otherChild = `OtherChild-${token}`;

    // The selected area (`other`, created last) is the kept-open
    // context; `parent` is the collapsible tree outside it.
    await createArea(page, parent);
    await createSubArea(page, child);
    await createArea(page, other);
    await createSubArea(page, otherChild);

    const sidebar = page.locator('.sidebar');
    const parentRow = sidebar.getByRole('button', { name: parent, exact: true });
    const childRow = sidebar.getByRole('button', { name: child, exact: true });
    const otherRow = sidebar.getByRole('button', { name: other, exact: true });
    const otherChildRow = sidebar.getByRole('button', { name: otherChild, exact: true });

    // Collapse-all collapses every tree except the selected area's.
    await page.getByRole('button', { name: 'Collapse all areas' }).click();
    await expect(parentRow).toHaveAttribute('aria-expanded', 'false');
    await expect(childRow).toBeHidden();
    await expect(otherRow).toHaveAttribute('aria-expanded', 'true');
    await expect(otherChildRow).toBeVisible();

    // With everything outside the kept-open context collapsed, the
    // button becomes expand-all — and clicking it expands again.
    await page.getByRole('button', { name: 'Expand all areas' }).click();
    await expect(parentRow).toHaveAttribute('aria-expanded', 'true');
    await expect(childRow).toBeVisible();
    await expect(otherRow).toHaveAttribute('aria-expanded', 'true');
  });
});
