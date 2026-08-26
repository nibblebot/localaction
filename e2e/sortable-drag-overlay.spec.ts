import { test, expect, type Page, type Locator } from '@playwright/test';
import { createArea, createRootTask, uniq } from './helpers.ts';

// Grab a drag handle and hold the drag mid-air. dnd-kit's keyboard
// sensor doesn't compose with these focused buttons, so drags are
// simulated with raw mouse events.
async function dragHandle(page: Page, locator: Locator, dy: number): Promise<void> {
  // Drive the drag with raw mouse geometry instead of locator.hover():
  // direct mouse moves skip Playwright's actionability scrolling and
  // fire the mouseover that lights the dnd-kit PointerSensor.
  const center = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  // PointerSensor activationConstraint is { distance: 4 } — a stepped
  // move past that starts the drag.
  await page.mouse.move(center.x, center.y + dy, { steps: 5 });
}

test.describe('Drag overlay preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
  });

  test('dragging a parent task row shows its name in the overlay', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Overlay-Area ${tok}`);
    await createRootTask(page, `Task Alpha ${tok}`);
    await createRootTask(page, `Task Bravo ${tok}`);
    // Two rows guarantee a second row exists to reorder against.
    await expect(page.locator('.task-line')).toHaveCount(2);

    const name = `Task Alpha ${tok}`;
    const handle = page
      .locator('.task-line', { hasText: name })
      .locator('.task-line-drag-handle');
    await dragHandle(page, handle, 60);
    await expect(page.locator('.drag-overlay')).toContainText(name);
    await page.mouse.up();
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
  });

  test('dragging a sidebar area shows its name in the overlay', async ({ page }) => {
    const tok = uniq();
    const name = `Alpha ${tok}`;
    await createArea(page, name);
    await createArea(page, `Bravo ${tok}`);

    const handle = page.getByRole('button', { name, exact: true });
    await dragHandle(page, handle, 40);
    await expect(page.locator('.drag-overlay')).toContainText(name);
    await page.mouse.up();
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
  });

  test('dragging a leaf task row shows its title in the overlay', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Overlay-Area ${tok}`);
    await createRootTask(page, `Task Alpha ${tok}`);
    await createRootTask(page, `Task Bravo ${tok}`);
    await expect(page.locator('.task-line')).toHaveCount(2);

    const first = page.locator('.task-line').first();
    const title = await first.locator('.task-line-title').inputValue();
    await dragHandle(page, first.locator('.task-line-drag-handle'), 50);
    await expect(page.locator('.drag-overlay .task-line-title')).toHaveValue(title);
    await page.mouse.up();
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
  });
});
