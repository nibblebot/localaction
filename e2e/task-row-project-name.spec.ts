import { test, expect, type Page } from '@playwright/test';

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  const input = page.locator('.projects-tab .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createTask(page: Page, title: string): Promise<void> {
  // Each project group carries its own add-task input; the first
  // group's matches the old tab-level default target (first project).
  const input = page.locator('.tasks-tab .inline-add-input').first();
  await input.fill(title);
  await input.press('Enter');
}

test.describe('Task row project name', () => {
  test('hides the per-row project name in the area tasks tab when grouped by project', async ({
    page,
  }) => {
    await page.goto('/#/');
    await createArea(page, 'TasksRow');
    await createProject(page, 'Alpha');
    await createProject(page, 'Beta');
    // Switch to Tasks tab so the grouped layout renders.
    await page.locator('.area-tab', { hasText: 'Tasks' }).click();
    await createTask(page, 'Open task');
    // Each project has a ProjectHeader — the project name is shown there.
    await expect(page.locator('.project-header-name')).toHaveCount(2);
    // No per-row project-name span should appear: rows are grouped under the header.
    await expect(page.locator('.task-line-project')).toHaveCount(0);
  });

  test('hides the per-row project name on the single-project tasks tab', async ({
    page,
  }) => {
    await page.goto('/#/');
    await createArea(page, 'TasksRowSolo');
    await createProject(page, 'Solo');
    await page.locator('.project-row-name', { hasText: 'Solo' }).click();
    await page.locator('.area-tab', { hasText: 'Tasks' }).click();
    await createTask(page, 'Solo task');
    // No per-row project-name span: the project name is in the page header
    // (`.area-header-name`), so the row carries no project context.
    await expect(page.locator('.task-line-project')).toHaveCount(0);
    await expect(page.locator('.area-header-name')).toContainText('Solo');
  });
});
