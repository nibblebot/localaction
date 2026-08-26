import { test, expect, type Page } from '@playwright/test';

// Sidebar resize — the user can grab the right edge of the sidebar
// and drag horizontally to widen or narrow it within bounds. Width
// persists to localStorage (per-device view state, not synced).
// Playwright gives each test a fresh browser context, so no
// cross-test cleanup.

const MIN_PX = 200;
const MAX_PX = 260;
const DEFAULT_PX = 240;

async function readSidebarWidth(page: Page): Promise<number> {
  // The grid template column resolves to a real pixel value; query the
  // computed style of the first grid track via the shell.
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    if (!shell) throw new Error('app shell not found');
    const tracks = getComputedStyle(shell).gridTemplateColumns.split(' ');
    const first = tracks[0];
    if (!first) throw new Error('grid track not found');
    const n = Number.parseFloat(first);
    if (!Number.isFinite(n)) throw new Error(`bad track: ${first}`);
    return n;
  });
}

test.describe('Sidebar resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('pointer drag is clamped to the configured bounds', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    await expect(handle).toBeVisible();
    const startBox = await handle.boundingBox();
    expect(startBox).not.toBeNull();
    const startY = startBox!.y + startBox!.height / 2;

    // Drag 400px right — far past the 260 ceiling — should clamp to MAX.
    await page.mouse.move(startBox!.x + startBox!.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(startBox!.x + startBox!.width / 2 + 400, startY, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => readSidebarWidth(page)).toBe(MAX_PX);

    // Drag 800px left from the new position — should clamp to MIN.
    const widenedBox = await handle.boundingBox();
    expect(widenedBox).not.toBeNull();
    const startX2 = widenedBox!.x + widenedBox!.width / 2;
    await page.mouse.move(startX2, startY);
    await page.mouse.down();
    await page.mouse.move(startX2 - 800, startY, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX);

    // Settle back at the default before keyboard test runs below.
  });

  test('keyboard arrow keys resize the sidebar', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    await handle.focus();
    // 4px step by default; press 3 times to grow by 12.
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect.poll(() => readSidebarWidth(page)).toBe(DEFAULT_PX + 12);

    // End jumps to the max.
    await page.keyboard.press('End');
    await expect.poll(() => readSidebarWidth(page)).toBe(MAX_PX);

    // Home jumps back to the min.
    await page.keyboard.press('Home');
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX);
  });

  test('a manually-set width survives reload', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 10, startY, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => readSidebarWidth(page)).toBe(DEFAULT_PX + 10);

    // Reload — the hook reads localStorage on mount and reapplies the
    // committed width.
    await page.reload();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect.poll(() => readSidebarWidth(page)).toBe(DEFAULT_PX + 10);
  });
});
