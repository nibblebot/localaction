import { expect, type Page } from '@playwright/test';
import { createArea, createRootTask, addSubTask, rootRow, uniq } from './helpers.ts';

/**
 * Shared per-spec fixtures for the post-Projects/Sections app. Specs
 * that need a task with a pane reach it through a parent row's
 * `.project-row-name` (a real class in the current src — see
 * src/components/tasks/TaskTree.tsx), which navigates to `#/t/<id>`.
 * Only PARENT rows (≥1 descendant) carry that name button — leaf rows
 * have an inline title textarea instead — so the fixture seeds a
 * sub-task first and returns its title for later assertions.
 */

/**
 * Land on an area with one root task, seed one sub-task (making the
 * root a parent row), and open its pane (`#/t/<id>`) by clicking the
 * parent row name.
 *
 * @returns the seeded sub-task's title
 */
export async function openTaskPane(
  page: Page,
  areaName: string,
  taskName: string,
): Promise<string> {
  await page.goto('/#/');
  await createArea(page, areaName);
  await createRootTask(page, taskName);
  const seed = `Seed ${uniq()}`;
  await addSubTask(page, rootRow(page, taskName), seed);
  await page.locator('.task-line', { hasText: taskName }).locator('.project-row-name').click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await expect(page.locator('.area-header-name')).toContainText(taskName);
  return seed;
}
