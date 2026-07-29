import { test, expect, type Page } from '@playwright/test';

// Each test uses a unique, timestamped token so OPFS / sync-server
// state from prior runs is harmless — we only inspect the rows that
// match our token.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Drop everything that survived from prior runs: in-memory OPFS in the
// browser context.
async function cleanOpfs(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.evaluate(async () => {
    try {
      // FileSystemDirectoryHandle is a real DOM type; this file's
      // ambient types only declare the sync methods we need, so we
      // extend the type locally instead of casting at the use site.
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

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="Add project to Active"]').click();
  const input = page.locator('input[aria-label="New project"]');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.project-row-name', { hasText: name })).toBeVisible();
}

async function createTask(page: Page, title: string): Promise<void> {
  // Single-project contexts: the one project card's header add-task icon.
  await page
    .locator('li.project-row')
    .first()
    .locator('button[aria-label^="Add task to "]')
    .click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

// The SortableList reports its current render order back as a list of
// row ids in DOM order. We use this to assert that a reorder actually
// changed the displayed order, without depending on the brittle
// dnd-kit keyboard-sensor integration with focused buttons.
async function sidebarOrder(page: Page, token: string): Promise<string[]> {
  const names = await page.locator('.sidebar-item-name', { hasText: token }).allTextContents();
  return names;
}

async function projectOrder(page: Page, token: string): Promise<string[]> {
  const names = await page
    .locator('.sortable-list .project-row-name', { hasText: token })
    .allTextContents();
  return names;
}

async function taskOrder(page: Page, token: string): Promise<string[]> {
  const inputs = await page
    .locator('.sortable-list .task-line-title')
    .evaluateAll((els: HTMLInputElement[]) => els.map((e) => e.value));
  return inputs.filter((v) => v.includes(token));
}

test.describe('Reorder rendering', () => {
  test.beforeEach(async ({ page }) => {
    await cleanOpfs(page);
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

  test('projects render in created order', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Reorder-Area ${tok}`);
    await createProject(page, `Project Alpha ${tok}`);
    await createProject(page, `Project Bravo ${tok}`);
    await createProject(page, `Project Charlie ${tok}`);
    const order = await projectOrder(page, tok);
    expect(order).toEqual([
      `Project Alpha ${tok}`,
      `Project Bravo ${tok}`,
      `Project Charlie ${tok}`,
    ]);
  });

  test('tasks render under their project after creation', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Task-Area ${tok}`);
    await createProject(page, `My Project ${tok}`);
    await createTask(page, `Task one ${tok}`);
    await createTask(page, `Task two ${tok}`);
    await createTask(page, `Task three ${tok}`);
    // Wait for the last task to settle into the list. (Controlled
    // textareas expose their text via the value property, never the
    // attribute, so match by position + toHaveValue.)
    await expect(
      page.locator('.project-row-tasks .task-line-title').last(),
    ).toHaveValue(`Task three ${tok}`);
    const order = await taskOrder(page, tok);
    expect(order).toEqual([
      `Task one ${tok}`,
      `Task two ${tok}`,
      `Task three ${tok}`,
    ]);
  });

  test('dropping a project on the Backlog header shelves it', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Shelf-Area ${tok}`);
    await createProject(page, `Alpha ${tok}`);
    await createProject(page, `Bravo ${tok}`);

    const alphaCard = page.locator('li.project-row', { hasText: `Alpha ${tok}` });
    const handle = alphaCard.locator('button[aria-label="Drag to reorder"]');
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

    // Alpha lands in Backlog; Bravo stays Active.
    await expect(
      backlogGroup.locator('.project-row-name', { hasText: `Alpha ${tok}` }),
    ).toBeVisible();
    await expect(
      activeGroup.locator('.project-row-name', { hasText: `Bravo ${tok}` }),
    ).toBeVisible();

    // The status change persists across reload.
    await page.reload();
    await expect(
      backlogGroup.locator('.project-row-name', { hasText: `Alpha ${tok}` }),
    ).toBeVisible();
  });
});