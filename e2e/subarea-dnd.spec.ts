import { test, expect, type Page } from '@playwright/test';

// Unique tokens per test: the dev server's sync DB is shared across
// tests in a run, so rows from other tests coexist — we only inspect
// the rows matching our token.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface SidebarRow {
  name: string;
  depth: number;
}

async function sidebarTree(page: Page): Promise<SidebarRow[]> {
  return page
    .locator('aside [role="list"][aria-label="Areas"] .sortable-item-slot')
    .evaluateAll((slots) =>
      slots.map((s) => ({
        name: (s.querySelector('.sidebar-item-name')?.textContent ?? '').trim(),
        depth: Number(s.getAttribute('data-depth') ?? '-1'),
      })),
    );
}

/** Parent area P with three sibling sub-areas S1, S2, S3. */
async function seedAreas(page: Page) {
  const token = uniq();
  const names = { P: `P-${token}`, S1: `S1-${token}`, S2: `S2-${token}`, S3: `S3-${token}` };
  await page.goto('/#/');
  await page.locator('button[aria-label="New area"]').click();
  const addInput = page.locator('.sidebar-section-add .inline-add-input');
  await addInput.fill(names.P);
  await addInput.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(names.P);
  for (const name of [names.S1, names.S2, names.S3]) {
    await createSubArea(page, names.P, name);
  }
  return names;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Drags `fromName`'s row onto `toName`'s row, landing at `point`
 * (a position derived from the target's box). Both rows are scrolled
 * into view before measuring — the sidebar accumulates every area
 * created by earlier specs in a full-suite run, and scrolling one row
 * shifts the other.
 *
 * Mid-drag the aim is re-computed from the target's LIVE box every
 * step: dnd-kit translates rows to open the drop gap, so the pre-drag
 * box points where the row used to be and a fixed landing races the
 * transform animation. The pointer is released only once the target
 * itself reports being the drop row (`data-drag-over`), which pins
 * `over` at drop time regardless of animation timing. */
async function dragRow(
  page: Page,
  fromName: string,
  toName: string,
  point: (target: Box) => { x: number; y: number },
): Promise<void> {
  const from = page.locator('.sidebar-area-row', { hasText: fromName }).first();
  const to = page.locator('.sidebar-area-row', { hasText: toName }).first();
  await from.waitFor();
  await to.waitFor();
  await from.scrollIntoViewIfNeeded();
  await to.scrollIntoViewIfNeeded();
  const fromBox = await from.boundingBox();
  if (!fromBox) throw new Error(`no box for ${fromName}`);
  const startX = fromBox.x + fromBox.width / 2;
  const startY = fromBox.y + fromBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 6, { steps: 2 });
  for (let i = 0; i < 25; i += 1) {
    const live = await to.boundingBox();
    if (!live) break;
    const landing = point(live);
    await page.mouse.move(landing.x, landing.y, { steps: 2 });
    if ((await to.getAttribute('data-drag-over')) === 'true') break;
  }
  await page.mouse.up();
}

/** Adds a sub-area under the named area via its header, navigating
 * back to the parent first (creation navigates into the new area). */
async function createSubArea(page: Page, parentName: string, name: string) {
  await page.locator('.sidebar-item', { hasText: parentName }).first().click();
  await expect(page.locator('.area-header-name')).toContainText(parentName);
  await page.locator('button[aria-label="Add sub-area"]').click();
  const field = page.locator('input[aria-label="Sub-area name"]');
  await field.fill(name);
  await field.press('Enter');
  await expect(page.locator('.sidebar-item-name', { hasText: name })).toBeVisible();
}

/** P → A → {X, Y}: a top-level area with a sub-area that holds two
 * level-2 sub-areas. */
async function seedNestedAreas(page: Page) {
  const token = uniq();
  const names = { P: `P-${token}`, A: `A-${token}`, X: `X-${token}`, Y: `Y-${token}` };
  await page.goto('/#/');
  await page.locator('button[aria-label="New area"]').click();
  const addInput = page.locator('.sidebar-section-add .inline-add-input');
  await addInput.fill(names.P);
  await addInput.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(names.P);
  await createSubArea(page, names.P, names.A);
  await createSubArea(page, names.A, names.X);
  await createSubArea(page, names.A, names.Y);
  return names;
}

test.describe('Sub-area drag and drop', () => {
  /** The test's own rows (filtered by token) as [name, depth] pairs —
   * asserting depths too, so a row landing under the wrong sibling or
   * at the wrong level can't slip through an order-only check. */
  async function ownTree(page: Page, token: string): Promise<SidebarRow[]> {
    return (await sidebarTree(page)).filter((r) => r.name.endsWith(token));
  }

  test('dragging a sub-area up one position reorders within its parent', async ({
    page,
  }) => {
    const { P, S1, S2, S3 } = await seedAreas(page);
    await dragRow(page, S2, S1, (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 4 }));

    await expect.poll(() => ownTree(page, P.slice(2))).toEqual([
      { name: P, depth: 0 },
      { name: S2, depth: 1 },
      { name: S1, depth: 1 },
      { name: S3, depth: 1 },
    ]);
  });

  test('dragging a sub-area up onto its parent row keeps it in the parent', async ({
    page,
  }) => {
    // The parent row sits directly above the first sibling, so a drag
    // aimed at the top of the group easily lands on it. The drop must
    // keep the sub-area inside the parent (as its first child) instead
    // of ejecting it to the parent's own level.
    const { P, S1, S2, S3 } = await seedAreas(page);
    await dragRow(page, S2, P, (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));

    await expect.poll(() => ownTree(page, P.slice(2))).toEqual([
      { name: P, depth: 0 },
      { name: S2, depth: 1 },
      { name: S1, depth: 1 },
      { name: S3, depth: 1 },
    ]);
  });

  test('reordering a level-2 sub-area keeps it at level 2', async ({ page }) => {
    // Level-2 rows drag like any other level: moving Y up over X must
    // reorder within A, not eject Y to the parent's level.
    const { P, A, X, Y } = await seedNestedAreas(page);
    await dragRow(page, Y, X, (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 4 }));

    await expect.poll(() => ownTree(page, P.slice(2))).toEqual([
      { name: P, depth: 0 },
      { name: A, depth: 1 },
      { name: Y, depth: 2 },
      { name: X, depth: 2 },
    ]);
  });

  test('dragging a level-2 sub-area up onto its parent row keeps it there', async ({
    page,
  }) => {
    // The ancestor-overshoot rule at depth 2: X dropped onto A's row
    // stays a child of A (as its first child), not ejected under P.
    const { P, A, X, Y } = await seedNestedAreas(page);
    await dragRow(page, X, A, (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));

    await expect.poll(() => ownTree(page, P.slice(2))).toEqual([
      { name: P, depth: 0 },
      { name: A, depth: 1 },
      { name: X, depth: 2 },
      { name: Y, depth: 2 },
    ]);
  });

  test('dragging right nests a sub-area under its sibling', async ({ page }) => {
    // Horizontal intent: X dragged down onto Y and to the right becomes
    // Y's first child (level 3).
    const { P, A, X, Y } = await seedNestedAreas(page);
    await dragRow(page, X, Y, (b) => ({
      x: b.x + b.width / 2 + 40,
      y: b.y + b.height / 2,
    }));

    await expect.poll(() => ownTree(page, P.slice(2))).toEqual([
      { name: P, depth: 0 },
      { name: A, depth: 1 },
      { name: Y, depth: 2 },
      { name: X, depth: 3 },
    ]);
  });
});
