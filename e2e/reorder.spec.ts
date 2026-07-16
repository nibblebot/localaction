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
  await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
  await page.locator('.modal-input').fill(name);
  await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
  await expect(page.locator('.area-header-name')).toContainText(name);
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('.area-tab', { hasText: 'Projects' }).click();
  await page.locator('.area-tab-add', { hasTitle: 'New project' }).click();
  await page.locator('.modal-input').fill(name);
  await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
  await expect(page.locator('.project-row-name', { hasText: name })).toBeVisible();
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.locator('.area-tab', { hasText: 'Tasks' }).click();
  await page.locator('.area-tab-add', { hasTitle: 'New task' }).click();
  await page.locator('.modal-input').fill(title);
  await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
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
    // Wait for the last task to settle into the list.
    await expect(
      page.locator(`.task-line-title[value="Task three ${tok}"]`),
    ).toBeVisible();
    const order = await taskOrder(page, tok);
    expect(order).toEqual([
      `Task one ${tok}`,
      `Task two ${tok}`,
      `Task three ${tok}`,
    ]);
  });
});