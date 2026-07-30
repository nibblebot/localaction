import { test, expect, type Page } from '@playwright/test';

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="Add project to Active"]').click();
  const input = page.locator('input[aria-label="New project"]');
  await input.fill(name);
  await input.press('Enter');
}

test.describe('LocalAction shell', () => {
  test('renders the two-zone layout with sidebar and main pane', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.main')).toBeVisible();
    await expect(page.locator('.sidebar-app-name')).toContainText('LocalAction');
  });

  test('home hash shows the welcome empty state', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.main-empty')).toContainText('Welcome to LocalAction');
  });

  test('creating an area navigates to its main pane with the two sections', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'Work');
    await expect(page).toHaveURL(/#\/a\//);
    await expect(page.locator('.area-header-name')).toContainText('Work');
    await expect(page.locator('.pane-section-toggle', { hasText: 'Area tasks' })).toBeVisible();
    await expect(page.locator('.pane-section-toggle', { hasText: 'Projects' })).toBeVisible();
  });

  test('projects tab renders an inline add input', async ({ page }) => {
    await page.goto('/#/');
    // Create an area so we have something to render.
    await createArea(page, 'Health');
    await expect(page.locator('.projects-tab')).toBeVisible();
    await expect(page.locator('button[aria-label="Add project to Active"]')).toBeVisible();
  });

  test('caret toggles a project card; clicking the row opens the project detail pane', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'Family');
    // Projects tab: add a project; its card is expanded by default.
    await createProject(page, 'Plan trip');
    const card = page.locator('li.project-row', { hasText: 'Plan trip' });
    await expect(card.locator('.project-row-tasks')).toBeVisible();
    // Add a task via the card's header add-task icon.
    await card.locator('button[aria-label="Add task to Plan trip"]').click();
    await expect(card.locator('.task-line-title:focus')).toBeVisible();
    await page.keyboard.type('Book flights');
    await page.keyboard.press('Enter');
    await expect(card.locator('.task-line-title').first()).toHaveValue('Book flights');
    // Clicking the project name navigates to the detail pane — it does
    // NOT collapse the card.
    await card.locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/p\/[^/]+$/);
    await expect(page.locator('.area-header-name')).toContainText('Plan trip');
    // The detail pane shows the same task surface as the expanded card.
    await expect(page.locator('.task-line-title').first()).toHaveValue('Book flights');
    // The breadcrumb returns to the area, where the card stayed expanded.
    await page.locator('.area-header-crumb', { hasText: 'Family' }).click();
    await expect(page).toHaveURL(/#\/a\/[^/]+$/);
    await expect(card.locator('.project-row-tasks')).toBeVisible();
    // Only the caret toggles the card; again expands it.
    await card.locator('button[aria-label="Collapse Plan trip"]').click();
    await expect(card.locator('.project-row-tasks')).toHaveCount(0);
    await card.locator('button[aria-label="Expand Plan trip"]').click();
    await expect(card.locator('.project-row-tasks')).toBeVisible();
    // Management affordances (rename, delete) are not on the card —
    // they live on the project detail pane header only.
    await expect(card.locator('button[aria-label="Rename project"]')).toHaveCount(0);
    await expect(card.locator('button[aria-label="Delete project"]')).toHaveCount(0);
  });

  test('legacy task / note deep links show the welcome state', async ({ page }) => {
    await page.goto('/#/t/whatever');
    await expect(page.locator('.main-empty')).toBeVisible();
    await page.goto('/#/n/whatever');
    await expect(page.locator('.main-empty')).toBeVisible();
  });

  test('a deep link to a missing project shows the welcome state', async ({ page }) => {
    await page.goto('/#/p/does-not-exist');
    await expect(page.locator('.main-empty')).toBeVisible();
  });

  test('project row due date: pick from calendar, shows MM/DD, clears', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'Family');
    await createProject(page, 'Plan trip');
    const row = page.locator('.project-row', { hasText: 'Plan trip' });

    // No due date yet: the row shows a calendar-icon affordance.
    const dueButton = row.getByRole('button', { name: 'Set due date' });
    await expect(dueButton).toBeVisible();

    // Open the calendar and pick the 14th of the displayed (current) month.
    await dueButton.click();
    const calendar = page.getByRole('dialog', { name: 'Pick due date' });
    await expect(calendar).toBeVisible();
    await calendar.getByRole('gridcell', { name: '14', exact: true }).click();

    // Popover closes and the row shows MM/DD for the 14th of this month.
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    await expect(calendar).toHaveCount(0);
    await expect(row.locator('.due-date-label')).toHaveText(`${mm}/14`);

    // Reopen and clear: the MM/DD label disappears.
    await row.getByRole('button', { name: /Due .* — change/ }).click();
    await page.getByRole('dialog', { name: 'Pick due date' })
      .getByRole('button', { name: 'Clear' })
      .click();
    await expect(row.locator('.due-date-label')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Set due date' })).toBeVisible();
  });

  test('unknown hash shows the welcome state', async ({ page }) => {
    await page.goto('/#/unknown/x');
    await expect(page.locator('.main-empty')).toBeVisible();
  });
});
