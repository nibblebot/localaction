import { test, expect, type Page } from '@playwright/test';
import { createArea, createRootTask, uniq } from './helpers.ts';

// Each test uses a unique, timestamped token so state from prior runs
// is harmless — we only inspect the rows that match our token.

async function sidebarOrder(page: Page, token: string): Promise<string[]> {
  const names = await page.locator('.sidebar-item-name', { hasText: token }).allTextContents();
  return names;
}

/** Root-task labels in Active/Backlog group order, by token. Roots are
 * leaf-shaped unless they carry sub-tasks, so read both the parent name
 * button and the leaf title textarea. */
async function rootOrder(page: Page, token: string): Promise<string[]> {
  const rows = page.locator('.sortable-list .task-line', { hasText: token });
  return rows.evaluateAll((els) =>
    els.map((el) => {
      const name = el.querySelector<HTMLElement>('.project-row-name');
      if (name) return name.textContent ?? '';
      const title = el.querySelector<HTMLTextAreaElement>('.task-line-title');
      return title ? title.value : '';
    }),
  );
}

test.describe('Reorder rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/');
  });

  test('top-level areas render in created order', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Alpha ${tok}`);
    await createArea(page, `Bravo ${tok}`);
    await createArea(page, `Charlie ${tok}`);
    const order = await sidebarOrder(page, tok);
    expect(order).toEqual([
      `Alpha ${tok}`,
      `Bravo ${tok}`,
      `Charlie ${tok}`,
    ]);
  });

  test('root tasks render in created order', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Reorder-Area ${tok}`);
    await createRootTask(page, `Task Alpha ${tok}`);
    await createRootTask(page, `Task Bravo ${tok}`);
    await createRootTask(page, `Task Charlie ${tok}`);
    const order = await rootOrder(page, tok);
    expect(order).toEqual([
      `Task Alpha ${tok}`,
      `Task Bravo ${tok}`,
      `Task Charlie ${tok}`,
    ]);
  });

  test('sub-tasks render under their parent after creation', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Task-Area ${tok}`);
    await createRootTask(page, `My Task ${tok}`);
    // Add two sub-tasks via the parent row's affordance; each commits
    // through a focused draft row that opens in place.
    const parent = page.locator('.task-line', { hasText: `My Task ${tok}` });
    await parent.locator('button[aria-label="Add sub-task"]').click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Sub one ${tok}`);
    await page.keyboard.press('Enter');
    await parent.locator('button[aria-label="Add sub-task"]').click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Sub two ${tok}`);
    await page.keyboard.press('Enter');

    // Rows render in canonical order: parent first, then its sub-tasks
    // (the parent is a `.project-row-name` button; the sub-tasks are
    // leaf `.task-line-title` textareas — match both shapes).
    const rowLabels = await page
      .locator(
        '.sortable-list .task-line .project-row-name, .sortable-list .task-line .task-line-title',
      )
      .evaluateAll((els) =>
        els.map((el) =>
          el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? ''),
        ),
      );
    expect(rowLabels.filter((v) => v.includes(tok))).toEqual([
      `My Task ${tok}`,
      `Sub one ${tok}`,
      `Sub two ${tok}`,
    ]);
  });

  test('dropping a root task on the Backlog group header shelves it', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Shelf-Area ${tok}`);
    await createRootTask(page, `Alpha ${tok}`);
    await createRootTask(page, `Bravo ${tok}`);

    const alphaRow = page.locator('.task-line', { hasText: `Alpha ${tok}` });
    const handle = alphaRow.locator('button[aria-label="Drag to reorder"]');
    // Scope via the header toggle's accessible name — group text
    // includes every descendant row, which can false-match.
    const backlogHead = page.locator('.tab-group-head', {
      has: page.getByRole('button', { name: /^Backlog/ }),
    });
    const backlogGroup = page.locator('.tab-group', {
      has: page.getByRole('button', { name: /^Backlog/ }),
    });
    const activeGroup = page.locator('.tab-group', {
      has: page.getByRole('button', { name: /^Active/ }),
    });
    const hb = await handle.boundingBox();
    const bb = await backlogHead.boundingBox();
    expect(hb).not.toBeNull();
    expect(bb).not.toBeNull();

    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    try {
      // Intermediate moves: dnd-kit's distance activation and collision
      // recalculation need real pointer travel, not a single jump.
      await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + 20, { steps: 5 });
      await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2, { steps: 10 });

      // While the dragged row hovers the header, the header paints the
      // drop indication (solid accent outline + tinted background).
      await expect
        .poll(() => backlogHead.evaluate((el) => getComputedStyle(el).outlineStyle))
        .toBe('solid');
    } finally {
      await page.mouse.up();
    }

    // Alpha lands in Backlog; Bravo stays Active (roots are leaf rows
    // here, so scope by `.task-line`).
    await expect(
      backlogGroup.locator('.task-line', { hasText: `Alpha ${tok}` }),
    ).toBeVisible();
    await expect(
      activeGroup.locator('.task-line', { hasText: `Bravo ${tok}` }),
    ).toBeVisible();

    // The shelf persists across reload.
    await page.reload();
    await expect(
      backlogGroup.locator('.task-line', { hasText: `Alpha ${tok}` }),
    ).toBeVisible();
  });
});
