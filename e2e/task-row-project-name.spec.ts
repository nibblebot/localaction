import { test, expect, type Page } from '@playwright/test';

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  const input = page.locator('.projects-tab > .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createTask(page: Page, title: string): Promise<void> {
  // Each expanded project card carries its own footer add input; the
  // first card's matches the old tab-level default target.
  const input = page.locator('.project-row-tasks .tasks-tab-footer .inline-add-input').first();
  await input.fill(title);
  await input.press('Enter');
}

test.describe('Task row project name', () => {
  test('hides the per-row project name in the area view when grouped by project', async ({
    page,
  }) => {
    await page.goto('/#/');
    await createArea(page, 'TasksRow');
    await createProject(page, 'Alpha');
    await createProject(page, 'Beta');
    await createTask(page, 'Open task');
    // Project names are on the expanded cards themselves.
    await expect(page.locator('.project-row-name')).toHaveCount(2);
    // No per-row project-name span should appear: rows are grouped under the card.
    await expect(page.locator('.task-line-project')).toHaveCount(0);
  });
});
