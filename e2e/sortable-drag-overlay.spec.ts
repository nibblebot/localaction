import { test, expect, type Page, type Locator } from '@playwright/test';

// NOTE: this file must sort AFTER `inbox.spec.ts` alphabetically. The
// dev server's sync store (sqlite-backed) is shared by every test in a
// run and replays accumulated state into each fresh browser context;
// `inbox.spec.ts` asserts absolute inbox counts and only passes while
// it runs first. Every other spec (this one included) uses unique
// tokens so replayed leftovers are harmless.

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
  await page.locator('button[aria-label="New area"]').click();
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
    await cleanOpfs(page);
    await page.goto('/#/');
  });

  test('dragging a project row shows its name in the overlay', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Overlay-Area ${tok}`);
    await createProject(page, `Project Alpha ${tok}`);
    await createProject(page, `Project Bravo ${tok}`);

    const name = `Project Alpha ${tok}`;
    const handle = page
      .locator('.project-row', { hasText: name })
      .locator('.project-row-drag-handle');
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

  test('dragging a task row shows its title in the overlay', async ({ page }) => {
    const tok = uniq();
    await createArea(page, `Overlay-Area ${tok}`);
    await createProject(page, `Project ${tok}`);
    await createTask(page, `Task Alpha ${tok}`);
    await createTask(page, `Task Bravo ${tok}`);

    const first = page.locator('.task-line').first();
    const title = await first.locator('.task-line-title').inputValue();
    await dragHandle(page, first.locator('.task-line-drag-handle'), 50);
    await expect(page.locator('.drag-overlay .task-line-title')).toHaveValue(title);
    await page.mouse.up();
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
  });
});
