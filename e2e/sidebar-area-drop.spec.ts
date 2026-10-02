import { test, expect, type Page, type Locator } from '@playwright/test';
import { createArea, createRootTask, nestArea, uniq, groupCount } from './helpers.ts';

// Desktop only: the sidebar is a drawer below 768px, and the shell-level
// drag under test crosses sidebar ⇄ main pane, which the drawer hides.

/** Grab a task row's drag handle and hold the drag in place. dnd-kit's
 * PointerSensor activation constraint is { distance: 4 }, so the initial
 * stepped move starts the drag. */
async function grabTask(page: Page, row: Locator): Promise<void> {
  const handle = row.locator('.task-line-drag-handle');
  const hb = await handle.boundingBox();
  expect(hb).not.toBeNull();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  // Stepped travel past the distance-4 activation, staying on the row so
  // no droppable claims the pointer before we head to the sidebar.
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + 20, { steps: 5 });
}

/** Drop the held drag onto a sidebar area row (pointer up while the
 * pointer sits on the row). */
async function dropOnAreaRow(page: Page, areaButton: Locator): Promise<void> {
  const ab = await areaButton.boundingBox();
  expect(ab).not.toBeNull();
  // Stepped run across the pane into the sidebar: collision recalculation
  // needs real pointer travel, not a single jump.
  await page.mouse.move(ab!.x + ab!.width / 2, ab!.y + ab!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.drag-overlay')).toHaveCount(0);
}

/** The sidebar area row's button for `name`. Class-scoped: the main pane
 * can render same-named sub-area headers (`.subarea-header-name`), which
 * would collide with an unqualified name match. */
function sidebarAreaButton(page: Page, name: string): Locator {
  return page.locator('button.sidebar-item', { hasText: name });
}

/** Click a sidebar area button and wait for navigation to its pane.
 * Retries the click: immediately after a drop the row's `isDragging`
 * guard can swallow the first click's navigation. */
async function openArea(page: Page, name: string): Promise<void> {
  const button = sidebarAreaButton(page, name);
  await expect(async () => {
    await button.click();
    await expect(page.locator('.area-header-name')).toContainText(name, { timeout: 1500 });
  }).toPass({ timeout: 8000 });
}

test.describe('Sidebar area drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
  });

  test('dropping an inbox task on a sidebar area row moves it there', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Drop-Area ${tok}`);
    await page.click('.sidebar-inbox-link');
    // Inbox tasks are added through the Active group header's "+" button,
    // which reveals the input on demand.
    await page.locator('main[aria-label="Inbox"] button[aria-label="Add task to Active"]').click();
    const input = page.locator('main[aria-label="Inbox"] input[aria-label="New inbox task"]');
    await input.fill(`Task ${tok}`);
    await input.press('Enter');
    await expect(page.locator('.task-line-title', { hasText: `Task ${tok}` })).toHaveCount(1);

    await grabTask(page, page.locator('.task-line', { hasText: `Task ${tok}` }));
    await dropOnAreaRow(page, sidebarAreaButton(page, `Drop-Area ${tok}`));

    // The inbox no longer lists the task: its sidebar count badge drops to zero.
    await expect(page.locator('.sidebar-inbox-link .sidebar-link-count')).toHaveCount(0);

    // The drop doesn't navigate — open the area to view it, where the
    // task now sits in the Active group.
    await openArea(page, `Drop-Area ${tok}`);
    await expect(page.locator('.task-line-title', { hasText: `Task ${tok}` })).toHaveCount(1);
    expect(await groupCount(page, 'Active')).toBe(1);
  });

  test('dropping a task on its own area row is a no-op', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Same-Area ${tok}`);
    await createRootTask(page, `Task ${tok}`);

    await grabTask(page, page.locator('.task-line', { hasText: `Task ${tok}` }));
    await dropOnAreaRow(page, sidebarAreaButton(page, `Same-Area ${tok}`));

    // Still exactly one Active root, still the same task.
    await expect(page.locator('.area-header-name')).toContainText(`Same-Area ${tok}`);
    expect(await groupCount(page, 'Active')).toBe(1);
    await expect(page.locator('.task-line-title', { hasText: `Task ${tok}` })).toHaveCount(1);
  });

  test('dropping a task on a subarea row moves it to that subarea', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Parent ${tok}`);
    await createArea(page, `Sub ${tok}`);
    await nestArea(page, `Parent ${tok}`, `Sub ${tok}`);
    // Stop lingering on the sub-area's pane: navigate to the parent so
    // the task we create lands in the parent area.
    await openArea(page, `Parent ${tok}`);
    await createRootTask(page, `Task ${tok}`);

    await grabTask(page, page.locator('.task-line', { hasText: `Task ${tok}` }));
    await dropOnAreaRow(page, sidebarAreaButton(page, `Sub ${tok}`));

    // The drop doesn't navigate — open the sub area to view it, where the
    // task now sits in the Active group.
    await openArea(page, `Sub ${tok}`);
    await expect(page.locator('.task-line-title', { hasText: `Task ${tok}` })).toHaveCount(1);
    expect(await groupCount(page, 'Active')).toBe(1);
  });
});
