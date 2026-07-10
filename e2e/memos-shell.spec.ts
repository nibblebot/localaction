import { test, expect } from '@playwright/test';

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

  test('creating a domain navigates to its main pane with the tab strip', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New domain' }).click();
    await page.locator('.modal-input').fill('Work');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page).toHaveURL(/#\/d\//);
    await expect(page.locator('.domain-header-name')).toContainText('Work');
    await expect(page.locator('.domain-tabs')).toBeVisible();
    await expect(page.locator('.domain-tab', { hasText: 'Projects' })).toBeVisible();
    await expect(page.locator('.domain-tab', { hasText: 'Tasks' })).toBeVisible();
    await expect(page.locator('.domain-tab', { hasText: 'Notes' })).toBeVisible();
  });

  test('projects tab shows an empty state and an add prompt', async ({ page }) => {
    await page.goto('/#/');
    // Create a domain so we have something to render.
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New domain' }).click();
    await page.locator('.modal-input').fill('Health');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.projects-tab')).toBeVisible();
    await expect(page.locator('.empty-tab')).toContainText('No projects yet.');
  });

  test('clicking a project opens its pane with Tasks and Notes tabs', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New domain' }).click();
    await page.locator('.modal-input').fill('Family');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    // Projects tab: add a project.
    await page.locator('.empty-tab .btn-primary', { hasText: '+ Project' }).click();
    await page.locator('.modal-input').fill('Plan trip');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.project-row-name', { hasText: 'Plan trip' })).toBeVisible();
    // Clicking the project navigates to the project pane (no inline expand).
    await page.locator('.project-row-name', { hasText: 'Plan trip' }).click();
    await expect(page).toHaveURL(/#\/p\//);
    await expect(page.locator('.domain-header-name')).toContainText('Plan trip');
    // Project pane has Tasks + Notes tabs but no Projects tab.
    await expect(page.locator('.domain-tab', { hasText: 'Projects' })).toHaveCount(0);
    await expect(page.locator('.domain-tab', { hasText: 'Tasks' })).toBeVisible();
    await expect(page.locator('.domain-tab', { hasText: 'Notes' })).toBeVisible();
    // Default tab is Tasks; add a task scoped to this project.
    await page.locator('.domain-tab-add').click();
    await page.locator('.modal-input').fill('Book flights');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.task-line-title').first()).toHaveValue('Book flights');
  });

  test('notes tab shows an empty state then allows adding a note', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New domain' }).click();
    await page.locator('.modal-input').fill('Personal');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await page.locator('.domain-tab', { hasText: 'Notes' }).click();
    await expect(page.locator('.empty-tab')).toContainText('No notes yet.');
    await page.locator('.empty-tab .btn-primary', { hasText: '+ Note' }).click();
    await page.locator('.modal-input').fill('Quick thought');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.note-line-title', { hasText: 'Quick thought' })).toBeVisible();
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

  test('unknown hash shows the welcome state', async ({ page }) => {
    await page.goto('/#/unknown/x');
    await expect(page.locator('.main-empty')).toBeVisible();
  });
});
