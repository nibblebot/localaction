/**
 * Row-chrome contract for the PersonAssignment icon:
 *
 *   - Project-row and task-row Edit-persons chips ALWAYS render —
 *     there is no single-person suppression gate. The chip is the
 *     only in-row way to open the assignment popover, and any person
 *     may be assigned to any entity.
 *
 *   - Assignment popovers list every present person, regardless of
 *     hierarchy. There is no subset rule: a person assigned to no
 *     area or project is still offered on (and assignable from) any
 *     entity's popover.
 *
 * The Edit-persons trigger sits at the LEFT of its right-aligned
 * action cluster (first child of `.project-row-actions` /
 * `.task-line-actions`).
 *
 * Locator note: a project row (`li.project-row`) WRAPS its task list,
 * so the chip lookups are scoped to the row's own action cluster
 * (`.project-row-actions` / `.task-line-actions`) — never a bare
 * descendant search, which would also match nested task chips.
 *
 * The e2e suite shares one DB across specs (and retries re-run the
 * creation), so every name is uniqued per run.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** The project row's own Edit-persons trigger (excludes nested task chips). */
const projectPersonsChip = (projectRow: Locator): Locator =>
  projectRow.locator('.project-row-actions button[aria-label="Edit persons"]');

/** The task row's own Edit-persons trigger (excludes nested subtask chips). */
const taskPersonsChip = (taskRow: Locator): Locator =>
  taskRow.locator('.task-line-actions button[aria-label="Edit persons"]');

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New person' }).click();
  const input = page.locator('.person-filter-new-form .inline-add-input');
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('.projects-tab > .inline-add-button[aria-label="Add project"]').click();
  const input = page.locator('.projects-tab .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createTask(page: Page, projectName: string, title: string): Promise<void> {
  // Scope to the named project card: the shared DB carries projects
  // from every other spec, so a bare `.first()` could land elsewhere.
  const card = page.locator('li.project-row', { hasText: projectName });
  await card.locator('.tasks-tab-footer button[aria-label="Add task"]').click();
  const input = card.locator('.tasks-tab-footer input[aria-label="New task"]');
  await input.fill(title);
  await input.press('Enter');
}

test.describe('Person-assignment row chrome', () => {
  test('both rows render the Edit-persons chip when only Self exists', async ({ page }) => {
    const area = `Solo ${uniq()}`;
    const project = `Single-person project ${uniq()}`;
    const task = `Lonely task ${uniq()}`;

    await page.goto('/#/');
    await createArea(page, area);
    await createProject(page, project);
    await createTask(page, project, task);

    const projectRow = page.locator('li.project-row', { hasText: project });
    const taskRow = page.locator('.task-line', { hasText: task });

    // No suppression gate: both chips render even with just Self.
    await expect(projectPersonsChip(projectRow)).toBeVisible();
    await expect(taskPersonsChip(taskRow)).toBeVisible();

    // Edit persons is the FIRST child of each right-aligned cluster —
    // i.e. left of DueDate / Notes / Rename / Trash (project) and
    // DueDate / AddSubtask / Trash (task).
    await expect(projectRow.locator('.project-row-actions > *').first()).toHaveAttribute(
      'aria-label',
      'Edit persons',
    );
    await expect(taskRow.locator('.task-line-actions > *').first()).toHaveAttribute(
      'aria-label',
      'Edit persons',
    );
  });

  test('a task popover offers every present person and assigns directly', async ({ page }) => {
    // The person is assigned to NOTHING upstream (no area, no project)
    // — with no hierarchical narrowing they are still offered on, and
    // assignable from, the task's popover.
    const person = `Teammate ${uniq()}`;
    const area = `Area ${uniq()}`;
    const project = `Project ${uniq()}`;
    const task = `Task ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, area);
    await createProject(page, project);
    await createTask(page, project, task);

    const taskRow = page.locator('.task-line', { hasText: task });
    await expect(taskRow).toBeVisible();

    await taskPersonsChip(taskRow).click();
    const popover = page.locator('.person-picker');
    await expect(popover).toBeVisible();
    const personRow = popover.locator('.person-picker-row', { hasText: person });
    await expect(personRow).toBeVisible();
    // Click the checkbox directly — the row is a <label> wrapping a
    // checkbox and an "Edit person" button; a row-level click can land
    // on the button and open the rename form without toggling assignment.
    await personRow.locator('input[type="checkbox"]').check();
    await page.keyboard.press('Escape');

    // The assignment took: the person's avatar renders on the row chip.
    await expect(taskPersonsChip(taskRow).locator(`.person-avatar[title="${person}"]`)).toBeVisible();
  });

  test('a project popover offers people not on the parent area', async ({ page }) => {
    // No subset rule: a person assigned to nothing (present but off
    // the area) is offered on the project's popover and checks
    // successfully.
    const person = `Collaborator ${uniq()}`;
    const area = `Area ${uniq()}`;
    const project = `Project ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, area);
    await createProject(page, project);

    const projectRow = page.locator('li.project-row', { hasText: project });
    await expect(projectPersonsChip(projectRow)).toBeVisible();
    await projectPersonsChip(projectRow).click();
    const popover = page.locator('.person-picker');
    await expect(popover).toBeVisible();
    const personRow = popover.locator('.person-picker-row', { hasText: person });
    await expect(personRow).toBeVisible();
    // Click the checkbox directly — the row is a <label> wrapping a
    // checkbox and an "Edit person" button; a row-level click can land
    // on the button and open the rename form without toggling assignment.
    await personRow.locator('input[type="checkbox"]').check();
    await page.keyboard.press('Escape');

    // The assignment took: the person's avatar renders on the row chip.
    await expect(
      projectPersonsChip(projectRow).locator(`.person-avatar[title="${person}"]`),
    ).toBeVisible();
  });

  test('an Inbox-rooted task always renders the Edit-persons chip', async ({ page }) => {
    // Inbox tasks have no containing project, and there is no
    // suppression gate — the chip always renders.
    await page.goto('/#/');
    await page.locator('.sidebar-inbox-link').click();
    await expect(page.locator('main[aria-label="Inbox"]')).toBeVisible();

    // The Inbox exposes a persistent inline-add input (no toggle).
    const title = `Inbox task ${uniq()}`;
    const input = page.locator('main[aria-label="Inbox"] input[aria-label="New inbox task"]');
    await input.fill(title);
    await input.press('Enter');

    const row = page.locator('.task-line', { hasText: title });
    await expect(row.locator('.task-line-actions')).toBeVisible();
    await expect(taskPersonsChip(row)).toBeVisible();
  });
});
