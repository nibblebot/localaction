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
  await page.locator('button[aria-label="New area"]').click();
  await page.locator('.sidebar-section-add .inline-add-input').fill(areaName);
  await page.locator('.sidebar-section-add .inline-add-input').press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(areaName);
  await page.locator('button[aria-label="Add project to Active"]').click();
  const projectInput = page.locator('input[aria-label="New project"]');
  await projectInput.fill(projectName);
  await projectInput.press('Enter');
  // The project card is expanded by default — its task tree is ready.
  await expect(page.locator('.project-row-tasks')).toBeVisible();
}

async function addSection(page: Page, name: string): Promise<void> {
  await page.locator('li.project-row .project-row-action[aria-label^="Add section to "]').first().click();
  await expect(page.locator('.section-row .editable-title:focus')).toBeVisible();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
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
    await page.locator('li.project-row .project-row-action[aria-label^="Add task to "]').first().click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Top task ${tok}`);
    await page.keyboard.press('Enter');

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

  test('section drags over another section’s tasks hit the nearest section boundary', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await page.locator('li.project-row .project-row-action[aria-label^="Add task to "]').first().click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Top task ${tok}`);
    await page.keyboard.press('Enter');
    await addSection(page, `First ${tok}`);
    await page
      .locator('.section-row')
      .nth(0)
      .locator('button[aria-label="Add task to section"]')
      .click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`First task ${tok}`);
    await page.keyboard.press('Enter');
    await addSection(page, `Second ${tok}`);
    await page
      .locator('.section-row')
      .nth(1)
      .locator('button[aria-label="Add task to section"]')
      .click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Second task ${tok}`);
    await page.keyboard.press('Enter');

    const rest = [
      `T:Top task ${tok}`,
      `S:First ${tok}`,
      `T:First task ${tok}`,
      `S:Second ${tok}`,
      `T:Second task ${tok}`,
    ];
    const flipped = [
      `T:Top task ${tok}`,
      `S:Second ${tok}`,
      `T:Second task ${tok}`,
      `S:First ${tok}`,
      `T:First task ${tok}`,
    ];
    expect(await treeRows(page, tok)).toEqual(rest);

    const dragOverNestedTask = async (sectionIdx: number): Promise<void> => {
      const handle = page.locator('.section-row').nth(sectionIdx).locator('.task-line-drag-handle');
      const target = page.locator('.task-line', { hasText: `First task ${tok}` });
      const hb = await handle.boundingBox();
      expect(hb).not.toBeNull();
      await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb!.x + hb!.width / 2, hb!.y - 20, { steps: 5 });
      // Re-measure mid-drag: the dragged section's child rows unmount
      // once the drag starts, shifting every row below the handle.
      const tb = await target.boundingBox();
      expect(tb).not.toBeNull();
      await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + 2, { steps: 10 });
      await page.mouse.up();
    };

    // Dropping the second section over the first section's nested task
    // (no root sibling follows the drop point) must still reorder — the
    // drop resolves to the top of the block the pointer is in.
    await dragOverNestedTask(1);
    await expect.poll(() => treeRows(page, tok)).toEqual(flipped);

    // Dragging it back down over the same nested task lands it after
    // the first section's block — the boundary in the drag direction.
    await dragOverNestedTask(0);
    await expect.poll(() => treeRows(page, tok)).toEqual(rest);
  });

  test('dragging a task onto a sibling nests it, persists after reload', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    const addTask = async (title: string): Promise<void> => {
      await page.locator('li.project-row .project-row-action[aria-label^="Add task to "]').first().click();
      await expect(page.locator('.task-line-title:focus')).toBeVisible();
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
    };
    await addTask(`Task one ${tok}`);
    await addTask(`Task two ${tok}`);

    // Drag Task one down onto Task two and to the right — the
    // horizontal intent makes it Task two's first sub-task.
    const one = page.locator('.task-line', { hasText: `Task one ${tok}` });
    const two = page.locator('.task-line', { hasText: `Task two ${tok}` });
    const hb = await one.locator('.task-line-drag-handle').boundingBox();
    expect(hb).not.toBeNull();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y - 12, { steps: 4 });
    const tb = await two.boundingBox();
    expect(tb).not.toBeNull();
    await page.mouse.move(tb!.x + tb!.width / 2 + 40, tb!.y + tb!.height / 2, { steps: 10 });
    await page.mouse.up();

    // Task one renders indented under Task two — and stays after reload.
    await expect.poll(() => treeRows(page, tok)).toEqual([`T:Task two ${tok}`, `T:Task one ${tok}`]);
    const parentBox = await two.boundingBox();
    const nestedBox = await one.boundingBox();
    expect(parentBox).not.toBeNull();
    expect(nestedBox).not.toBeNull();
    expect(nestedBox!.x).toBeGreaterThan(parentBox!.x);

    await page.reload();
    await expect(page.locator('.project-row-tasks')).toBeVisible();
    expect(await treeRows(page, tok)).toEqual([`T:Task two ${tok}`, `T:Task one ${tok}`]);
    const reloadedParent = await two.boundingBox();
    const reloadedNested = await one.boundingBox();
    expect(reloadedNested!.x).toBeGreaterThan(reloadedParent!.x);
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

  test('project row icon toggles empty-section visibility, persists after reload', async ({ page }) => {
    const tok = uniq();
    await openProject(page, `Area ${tok}`, `Project ${tok}`);
    await addSection(page, `Empty ${tok}`);
    await addSection(page, `Full ${tok}`);
    await page
      .locator('.section-row')
      .nth(1)
      .locator('button[aria-label="Add task to section"]')
      .click();
    await expect(page.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type(`Section task ${tok}`);
    await page.keyboard.press('Enter');

    // Default: every section header renders, empty ones included.
    expect(await treeRows(page, tok)).toEqual([
      `S:Empty ${tok}`,
      `S:Full ${tok}`,
      `T:Section task ${tok}`,
    ]);

    const toggle = page.getByRole('button', { name: /empty sections in/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();

    // Hidden: the empty header is pruned, the filled section stays.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await treeRows(page, tok)).toEqual([
      `S:Full ${tok}`,
      `T:Section task ${tok}`,
    ]);

    // The per-project flag survives a reload (device-local state).
    await page.reload();
    await expect(page.locator('.project-row-tasks')).toBeVisible();
    expect(await treeRows(page, tok)).toEqual([
      `S:Full ${tok}`,
      `T:Section task ${tok}`,
    ]);

    // Toggling back restores the empty header.
    await toggle.click();
    expect(await treeRows(page, tok)).toEqual([
      `S:Empty ${tok}`,
      `S:Full ${tok}`,
      `T:Section task ${tok}`,
    ]);
  });
});
