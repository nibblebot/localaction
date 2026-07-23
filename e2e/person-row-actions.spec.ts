/**
 * Row-chrome contract for the PersonAssignment icon, pinned to the
 * implementation's two independent suppression rules:
 *
 *   - Project-row chip: hidden while the project's containing AREA
 *     (the immediate `areaId`, which may be a sub-area) resolves to a
 *     single person (just Self). Reading the area, not the project.
 *
 *   - Task-row chip: hidden while the task's containing PROJECT
 *     resolves to a single person (just Self). Reading the project,
 *     not the area. Tasks rooted in the Inbox have no project to
 *     test, so their chip always renders.
 * Because the two rules read different scopes, assigning a second
 * person to the area alone unhides only the project chip (the task
 * chip still reads the single-person project). A project assignee
 * must already belong to the area (subset rule), so a second person
 * on the project implies one on the area too.
 *
 * When visible, the Edit-persons trigger sits at the LEFT of its
 * right-aligned action cluster (first child of `.project-row-actions`
 * / `.task-line-actions`).
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

/**
 * Toggle a person onto the area (or sub-area) currently in view via
 * the header cast chip. The project-row rule reads this scope.
 */
async function assignAreaPerson(page: Page, personName: string): Promise<void> {
  await page.locator('.area-header-cast-chip').first().click();
  const popover = page.locator('.person-picker');
  await expect(popover).toBeVisible();
  await popover.locator('.person-picker-row', { hasText: personName }).click();
  await page.keyboard.press('Escape');
}

/**
 * Toggle a person onto a project. The row-level chip is suppressed
 * while the area is single-person, so the only always-on Edit-persons
 * trigger is the one in the project's notes-pane header. Returns to
 * the area Projects tab before continuing.
 */
async function assignProjectPerson(
  page: Page,
  projectName: string,
  personName: string,
): Promise<void> {
  const projectRow = page.locator('li.project-row', { hasText: projectName });
  await projectRow.locator('button[aria-label^="Open notes for"]').click();
  await expect(page.locator('.area-header-project-icon')).toBeVisible();
  await page.locator('.area-header button[aria-label="Edit persons"]').click();
  const popover = page.locator('.person-picker');
  await expect(popover).toBeVisible();
  // Click the checkbox directly — the row is a <label> wrapping a
  // checkbox and an "Edit person" button; a row-level click can land
  // on the button and open the rename form without toggling assignment.
  await popover
    .locator('.person-picker-row', { hasText: personName })
    .locator('input[type="checkbox"]')
    .check();
  await page.keyboard.press('Escape');
  await page.locator('.area-header-crumb').first().click();
}

test.describe('Person-assignment row chrome', () => {
  test('both rows hide the Edit-persons chip when only Self exists anywhere', async ({ page }) => {
    const area = `Solo ${uniq()}`;
    const project = `Single-person project ${uniq()}`;
    const task = `Lonely task ${uniq()}`;

    await page.goto('/#/');
    await createArea(page, area);
    await createProject(page, project);
    await createTask(page, project, task);

    const projectRow = page.locator('li.project-row', { hasText: project });
    const taskRow = page.locator('.task-line', { hasText: task });

    // The right-aligned clusters always exist; only the chip is gated.
    await expect(projectRow.locator('.project-row-actions')).toBeVisible();
    await expect(taskRow.locator('.task-line-actions')).toBeVisible();

    // Area and project both resolve to {Self} → both chips suppressed.
    await expect(projectPersonsChip(projectRow)).toHaveCount(0);
    await expect(taskPersonsChip(taskRow)).toHaveCount(0);
  });

  test('a second person on the AREA unhides only the project-row chip', async ({ page }) => {
    // Project-rule reads the area; task-rule still reads the
    // single-person project, so the task chip stays hidden.
    const person = `Teammate ${uniq()}`;
    const area = `Pair area ${uniq()}`;
    const project = `Project under pair area ${uniq()}`;
    const task = `Task in solo project ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, area);
    await createProject(page, project);
    await createTask(page, project, task);

    const projectRow = page.locator('li.project-row', { hasText: project });
    const taskRow = page.locator('.task-line', { hasText: task });
    await expect(taskRow).toBeVisible();

    await assignAreaPerson(page, person);

    // Area now has 2 people → project-row chip appears.
    await expect(projectPersonsChip(projectRow)).toBeVisible();
    // Project still {Self} → task-row chip absent.
    await expect(taskPersonsChip(taskRow)).toHaveCount(0);
  });

  test('a project popover only offers people already on the parent area', async ({ page }) => {
    // Subset rule: a project may only draw assignees from its area's
    // resolved people. A person present but not on the area is absent
    // from the project's assignment popover until they join the area.
    const person = `Collaborator ${uniq()}`;
    const area = `Scoped area ${uniq()}`;
    const project = `Scoped project ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, area);
    await createProject(page, project);

    const projectRow = page.locator('li.project-row', { hasText: project });

    // Open the project's Edit-persons popover via the notes-pane header
    // (the row chip is suppressed while the area is single-person).
    await projectRow.locator('button[aria-label^="Open notes for"]').click();
    await expect(page.locator('.area-header-project-icon')).toBeVisible();
    await page.locator('.area-header button[aria-label="Edit persons"]').click();
    const popover = page.locator('.person-picker');
    await expect(popover).toBeVisible();
    // Area is {Self}: the project popover lists only Self, never the
    // off-area person.
    await expect(popover.locator('.person-picker-row', { hasText: person })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('.area-header-crumb').first().click();

    // Add the person to the area; the project popover now offers them.
    await assignAreaPerson(page, person);
    await projectRow.locator('button[aria-label^="Open notes for"]').click();
    await expect(page.locator('.area-header-project-icon')).toBeVisible();
    await page.locator('.area-header button[aria-label="Edit persons"]').click();
    const popoverAfter = page.locator('.person-picker');
    await expect(popoverAfter).toBeVisible();
    await expect(popoverAfter.locator('.person-picker-row', { hasText: person })).toBeVisible();
  });

  test('with a second person on both scopes, both chips show and sit leftmost in their clusters', async ({
    page,
  }) => {
    const person = `Partner ${uniq()}`;
    const area = `Duo area ${uniq()}`;
    const project = `Duo project ${uniq()}`;
    const task = `Duo task ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, area);
    await createProject(page, project);
    await createTask(page, project, task);

    const projectRow = page.locator('li.project-row', { hasText: project });
    const taskRow = page.locator('.task-line', { hasText: task });

    await assignAreaPerson(page, person);
    await assignProjectPerson(page, project, person);

    await expect(taskRow).toBeVisible();

    // Both rules fire: area and project each carry 2 people.
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

  test('a project under a sub-area hides its chip until the sub-area gains a second person', async ({
    page,
  }) => {
    // The project-rule reads the project's immediate areaId — for a
    // project rooted in a sub-area that is the SUB-AREA, not the
    // parent. So a single-person sub-area hides the chip, and a second
    // person on the sub-area (not the parent) reveals it.
    const person = `Cousin ${uniq()}`;
    const parent = `Family ${uniq()}`;
    const child = `Kids ${uniq()}`;
    const project = `Sub-area project ${uniq()}`;
    const task = `Sub-area task ${uniq()}`;

    await page.goto('/#/');
    await createPerson(page, person);
    await createArea(page, parent);
    // Subset rule: a sub-area may only draw assignees from its parent
    // area, so seed the person on the parent before entering the child.
    await assignAreaPerson(page, person);
    // Create + navigate into the sub-area.
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(child);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(child);

    await createProject(page, project);
    await createTask(page, project, task);

    const projectRow = page.locator('li.project-row', { hasText: project });
    const taskRow = page.locator('.task-line', { hasText: task });
    await expect(taskRow).toBeVisible();

    // Sub-area and project both {Self} → both chips hidden.
    await expect(projectPersonsChip(projectRow)).toHaveCount(0);
    await expect(taskPersonsChip(taskRow)).toHaveCount(0);

    // Second person on the SUB-AREA (its header cast chip).
    await assignAreaPerson(page, person);

    // Sub-area now 2 people → project-row chip visible. Project still
    // {Self} → task-row chip stays hidden.
    await expect(projectPersonsChip(projectRow)).toBeVisible();
    await expect(taskPersonsChip(taskRow)).toHaveCount(0);
  });

  test('an Inbox-rooted task always renders the Edit-persons chip', async ({ page }) => {
    // Inbox tasks have no containing project to test, so the chip is
    // never suppressed — the user can add a non-Self assignee.
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
