import { test, expect, type Page } from '@playwright/test';

// Unique tokens keep replayed state from prior specs harmless.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

async function addCardTask(page: Page, project: string, title: string): Promise<void> {
  const card = page.locator('li.project-row', { hasText: project });
  await card.locator(`button[aria-label="Add task to ${project}"]`).click();
  await expect(card.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

test('combined Projects tab: meters, per-project caret, persistence', async ({
  page,
}) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  const project = `Project ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createProject(page, project);

  // Project cards are expanded by default; the footer input adds tasks.
  await addCardTask(page, project, `Task one ${tok}`);
  await addCardTask(page, project, `Task two ${tok}`);
  const card = page.locator('li.project-row', { hasText: project });
  await expect(card.locator('.project-row-line .project-row-progress-count')).toHaveText('0 / 2');

  // Completing a task moves the project meter (and prunes the row in
  // hidden-completed mode).
  await page.locator(`input[aria-label="Mark “Task one ${tok}” done"]`).click();
  await expect(card.locator('.project-row-line .project-row-progress-count')).toHaveText('1 / 2');

  // Add a sub-task in place — no navigation; the new title input is
  // focused inside the card. The parent task row gains its own meter.
  const taskTwo = page.locator('.task-line', { hasText: `Task two ${tok}` });
  await taskTwo.hover();
  await taskTwo.locator('button[aria-label="Add sub-task"]').click();
  await expect(page.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(`Sub task ${tok}`);
  await page.keyboard.press('Enter');
  const parentRow = page.locator('.task-line', { hasText: `Task two ${tok}` });
  await expect(parentRow.locator('.project-row-progress-count')).toHaveText('0 / 1');

  // Completing the subtask moves the task meter (effective status).
  await page.locator(`input[aria-label="Mark “Sub task ${tok}” done"]`).click();
  await expect(parentRow.locator('.project-row-progress-count')).toHaveText('1 / 1');

  // The project meter counts the deep list.
  await expect(card.locator('.project-row-line .project-row-progress-count')).toHaveText('2 / 3');

  // Per-project caret hides just that card's task tree; the row and
  // its meter stay visible.
  await card.locator(`button[aria-label="Collapse ${project}"]`).click();
  await expect(page.locator('.project-row-tasks')).toHaveCount(0);
  await expect(card.locator('.project-row-line .project-row-progress-count')).toHaveText('2 / 3');

  // Re-expand via the caret; per-card collapse is the only bulk
  // affordance now (the header collapse-all button was removed).
  await card.locator(`button[aria-label="Expand ${project}"]`).click();
  await expect(page.locator('.project-row-tasks')).toHaveCount(1);

  // Collapse state persists across reloads (localStorage).
  await card.locator(`button[aria-label="Collapse ${project}"]`).click();
  await page.reload();
  await expect(
    page.locator('li.project-row', { hasText: project }).locator(`button[aria-label="Expand ${project}"]`),
  ).toBeVisible();
  await expect(page.locator('.project-row-tasks')).toHaveCount(0);
});
