import { test, expect, type Page } from '@playwright/test';

// Sidebar resize — the user can grab the right edge of the sidebar
// and drag horizontally to widen it up to 260px. Width persists to
// localStorage (per-device view state, not synced). Playwright gives
// each test a fresh browser context, so no cross-test cleanup.

const MIN_PX = 200;
const MAX_PX = 260;

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

async function readPersistedWidth(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('localaction:sidebar-w'));
}

test.describe('Sidebar resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('starts at the default minimum width', async ({ page }) => {
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX);
    await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toBeVisible();
  });

  test('dragging right widens the sidebar and commits the new width', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    // Drag 30px to the right. The committed width should be MIN + 30 = 230.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // A few intermediate moves mirror how a real user drags — the
    // resizer uses pointer events and the read-back is only at the
    // end, so intermediate frames don't need to be checked here.
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(startX + (30 * i) / 5, startY);
    }
    await page.mouse.up();

    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX + 30);
    await expect(readPersistedWidth(page)).resolves.toBe(String(MIN_PX + 30));
  });

  test('clamped to the maximum of 260px on a long drag', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    // Drag 400px to the right — far past the 260 ceiling.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 400, startY, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => readSidebarWidth(page)).toBe(MAX_PX);
    await expect(readPersistedWidth(page)).resolves.toBe(String(MAX_PX));
  });

  test('clamped to the minimum of 200px on a long drag left', async ({ page }) => {
    // First push it past the max so the test exercises both clamps.
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    const startBox = await handle.boundingBox();
    expect(startBox).not.toBeNull();
    const startY = startBox!.y + startBox!.height / 2;

    await page.mouse.move(startBox!.x + startBox!.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(startBox!.x + 400, startY, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => readSidebarWidth(page)).toBe(MAX_PX);

    // Now drag way to the left and confirm we land on the floor.
    const widenedBox = await handle.boundingBox();
    expect(widenedBox).not.toBeNull();
    const startX2 = widenedBox!.x + widenedBox!.width / 2;
    await page.mouse.move(startX2, startY);
    await page.mouse.down();
    await page.mouse.move(startX2 - 800, startY, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX);
    await expect(readPersistedWidth(page)).resolves.toBe(String(MIN_PX));
  });

  test('keyboard arrow keys resize the sidebar', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize sidebar' });
    await handle.focus();
    // 4px step by default; press 3 times to grow by 12.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX + 12);
    await expect(readPersistedWidth(page)).resolves.toBe(String(MIN_PX + 12));

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
    await page.mouse.move(startX + 50, startY, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX + 50);

    // Reload — the hook reads localStorage on mount and reapplies the
    // committed width.
    await page.reload();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect.poll(() => readSidebarWidth(page)).toBe(MIN_PX + 50);
  });
});
