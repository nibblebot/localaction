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

test('per-project caret collapses one card; collapse persists across reload', async ({
  page,
}) => {
  const tok = uniq();
  const area = `Area ${tok}`;
  const project = `Project ${tok}`;
  await page.goto('/#/');
  await createArea(page, area);
  await createProject(page, project);

  // Project cards are expanded by default.
  const card = page.locator('li.project-row', { hasText: project });
  await expect(card.locator('.project-row-tasks')).toHaveCount(1);

  // Collapse via the per-card caret; the row and its meter stay visible.
  await card.locator(`button[aria-label="Collapse ${project}"]`).click();
  await expect(page.locator('.project-row-tasks')).toHaveCount(0);
  await expect(card.locator(`button[aria-label="Expand ${project}"]`)).toBeVisible();

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