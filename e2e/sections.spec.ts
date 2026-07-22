import { test, expect, type Page } from '@playwright/test';

// Journey: project sections. A section groups top-level tasks inside a
// project; the user adds one via the new-section input under the
// new-task input in the card footer, renames it inline, drags it to
// reorder, and deletes it (with its tasks) after confirmation. See
// reorder.spec.ts for the shared
// OPFS-cleaning / unique-token conventions.
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

/** Rows of the project task tree in render order: `S:name` for section
 * headers, `T:title` for tasks. */
async function treeRows(page: Page, token: string): Promise<string[]> {
  const rows = await page
    .locator('.project-row-tasks .sortable-list .section-row, .project-row-tasks .sortable-list .task-line')
    .evaluateAll((els: HTMLElement[]) =>
      els.map((el) =>
        el.classList.contains('section-row')
          ? `S:${(el.querySelector('.editable-title') as HTMLInputElement | null)?.value ?? ''}`
          : `T:${(el.querySelector('.task-line-title') as HTMLTextAreaElement | null)?.value ?? ''}`,
      ),
    );
  return rows.filter((r) => r.includes(token));
}

async function openProject(page: Page, areaName: string, projectName: string): Promise<void> {
  await page.locator('.sidebar-section-add .inline-add-input').fill(areaName);
  await page.locator('.sidebar-section-add .inline-add-input').press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(areaName);
  await page.locator('.projects-tab > .inline-add-input').fill(projectName);
  await page.locator('.projects-tab > .inline-add-input').press('Enter');
  // The project card is expanded by default — its task tree is ready.
  await expect(page.locator('.project-row-tasks')).toBeVisible();
}

async function addSection(page: Page, name: string): Promise<void> {
  const input = page.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New section"]');
  await input.fill(name);
  await input.press('Enter');
  // New sections append at the end.
  await expect(page.locator('.section-row .editable-title').last()).toHaveValue(name);
}

test.describe('Project sections', () => {
  test.beforeEach(async ({ page }) => {
    await cleanOpfs(page);
    await page.goto('/#/');
  });

  test('add section, fill it with a task, order persists after reload', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await page.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New task"]').fill(`Top task ${tok}`);
    await page.locator('.project-row-tasks .tasks-tab-footer input[aria-label="New task"]').press('Enter');

    await addSection(page, `Phase ${tok}`);

    // Add a task inside the section via its row action.
    await page
      .locator('.section-row button[aria-label="Add task to section"]')
      .click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Section task ${tok}`);
    await page.keyboard.press('Enter');

    expect(await treeRows(page, tok)).toEqual([
      `T:Top task ${tok}`,
      `S:Phase ${tok}`,
      `T:Section task ${tok}`,
    ]);

    await page.reload();
    await expect(page.locator('.project-row-tasks')).toBeVisible();
    expect(await treeRows(page, tok)).toEqual([
      `T:Top task ${tok}`,
      `S:Phase ${tok}`,
      `T:Section task ${tok}`,
    ]);
  });

  test('sections drag to reorder', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await addSection(page, `First ${tok}`);
    await addSection(page, `Second ${tok}`);
    expect(await treeRows(page, tok)).toEqual([`S:First ${tok}`, `S:Second ${tok}`]);

    // Drag the second section's handle above the first.
    const second = page.locator('.section-row').nth(1);
    const first = page.locator('.section-row').nth(0);
    const handle = second.locator('.task-line-drag-handle');
    const hb = await handle.boundingBox();
    const fb = await first.boundingBox();
    expect(hb).not.toBeNull();
    expect(fb).not.toBeNull();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y - 20, { steps: 5 });
    await page.mouse.move(fb!.x + fb!.width / 2, fb!.y + 2, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(() => treeRows(page, tok))
      .toEqual([`S:Second ${tok}`, `S:First ${tok}`]);
  });

  test('empty sections show in the area view, fully editable', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await addSection(page, `Empty ${tok}`);

    // The section header lives inside the expanded project card — the
    // same editable row everywhere: rename input plus add-task and
    // delete actions (the project has no other sections).
    const header = page.locator('.section-row');
    await expect(header).toHaveCount(1);
    await expect(header.locator('.editable-title')).toHaveValue(`Empty ${tok}`);
    await expect(header.locator('button[aria-label="Add task to section"]')).toBeAttached();
    await expect(header.locator('button[aria-label="Delete section"]')).toBeAttached();
  });

  test('deleting a section deletes its tasks after confirmation', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await addSection(page, `Doomed ${tok}`);
    await page
      .locator('.section-row')
      .locator('button[aria-label="Add task to section"]')
      .click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Doomed task ${tok}`);
    await page.keyboard.press('Enter');

    await page.locator('.section-row button[aria-label="Delete section"]').click();
    await expect(page.locator('.modal')).toContainText('and its tasks will be deleted');
    await page.locator('.modal .btn-danger').click();

    await expect(page.locator('.section-row')).toHaveCount(0);
    expect(await treeRows(page, tok)).toEqual([]);
  });
});
