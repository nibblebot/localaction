import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Shared e2e seeds/selectors for the post-Projects/Sections app.
 *
 * The cutover replaced project cards with unified root-task rows and
 * gave every view the same Active / Backlog / Done tri-state groups.
 * These helpers encode the row affordances that replaced the old
 * project APIs — every selector is grounded in the current src:
 *
 *  - The area view's Active add-task trigger is the "+" pinned to the
 *    Active group header (`button[aria-label="Add task to Active"]`,
 *    src/components/area/RootTaskGroups.tsx); it reveals a focused
 *    `input[aria-label="New task"]` (InlineAddField) that commits a root
 *    task on Enter — this is the createRootTask fixture.
 *  - Rows are `.task-line`; a parent row's name is the `.project-row-name`
 *    button (src/components/tasks/TaskTree.tsx) — clicking it navigates
 *    to `#/t/<id>`.
 *  - A task's subtask affordance is `button[aria-label="Add sub-task"]`,
 *    which opens a focused TaskDraftRow (`textarea.task-line-title`).
 */

/** Unique token so replayed state from prior runs is harmless. */
export const uniq = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Create an area from the sidebar and land on its main pane. */
export async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

/** Create an Active root task in the current area via its add-task affoardance. */
export async function createRootTask(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="Add task to Active"]').click();
  const input = page.locator('input[aria-label="New task"]');
  await input.fill(name);
  await input.press('Enter');
  // The committed root is a leaf `.task-line` holding a
  // `.task-line-title` (a root gains `.project-row-name` chrome only
  // once it has sub-tasks).
  await expect(page.locator('.task-line-title', { hasText: name })).toHaveCount(1);
}

/** Root-row locator for a task by name (a `.task-line` holding its title). */
export function rootRow(page: Page, name: string): Locator {
  return page.locator('.task-line', { hasText: name });
}

/** Add a sub-task under the given `.task-line` row and commit its title. */
export async function addSubTask(page: Page, row: Locator, title: string): Promise<void> {
  await row.locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

/** Add a sub-task under whatever row's name matches. */
export async function addSubTaskToNamed(page: Page, parent: string, title: string): Promise<void> {
  await addSubTask(page, rootRow(page, parent), title);
}

/** The tri-state group header whose toggle title begins with `title`. */
export function groupHead(page: Page, title: 'Active' | 'Backlog' | 'Done'): Locator {
  return page.locator('.tab-group-head', {
    has: page.getByRole('button', { name: new RegExp(`^${title}`) }),
  });
}

/** The `.tab-group` whose header toggle title begins with `title`. */
export function groupBox(page: Page, title: 'Active' | 'Backlog' | 'Done'): Locator {
  return page.locator('.tab-group', {
    has: page.getByRole('button', { name: new RegExp(`^${title}`) }),
  });
}

/** Numeric row count rendered in a group header's `.tab-group-count`. */
export async function groupCount(page: Page, title: 'Active' | 'Backlog' | 'Done'): Promise<number> {
  const count = groupHead(page, title).locator('.tab-group-count');
  const text = (await count.textContent()) ?? '';
  return Number.parseInt(text, 10) || 0;
}