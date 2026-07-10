import { test, expect } from '@playwright/test';

test.describe('Memos-style shell', () => {
  test('renders the two-zone layout with sidebar and main pane', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.main')).toBeVisible();
    await expect(page.locator('.sidebar-search input')).toBeVisible();
    await expect(page.locator('.main-header-title')).toBeVisible();
  });

  test('navigating to the home hash shows the home selection', async ({ page }) => {
    await page.goto('/#/d/anything');
    // No rail — navigate via URL hash
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.main-header-title')).toContainText('Home');
  });

  test('sidebar search filters the domain list', async ({ page }) => {
    await page.goto('/');
    // Ensure at least one domain exists
    const domains = await page.locator('.sidebar-section .sidebar-item-name').allTextContents();
    if (domains.length === 0) {
      await page.locator('.sidebar-link', { hasText: 'New domain' }).click();
      // Modal submission will create a domain; no rail to click for "home"
    }
    await page.locator('.sidebar-search input').fill('zzz-no-match-zzz');
    await expect(page.locator('.sidebar-empty')).toBeVisible();
    await page.locator('.sidebar-search input').fill('');
  });

  test('home view shows the composer with disabled Save', async ({ page }) => {
    await page.goto('/#/');
    const composer = page.locator('.composer');
    await expect(composer).toBeVisible();
    const saveBtn = composer.locator('.btn-primary', { hasText: 'Save' });
    await expect(saveBtn).toBeDisabled();
    await composer.locator('.composer-textarea').fill('Test note from playwright #e2e');
    await expect(saveBtn).toBeEnabled();
  });

  test('composer saves a note and routes to its editor', async ({ page }) => {
    await page.goto('/#/');
    const stamp = `e2e-${Date.now()}`;
    await page.locator('.composer-textarea').fill(`${stamp} body #e2eautomated`);
    await page.locator('.composer .btn-primary', { hasText: 'Save' }).click();
    await expect(page).toHaveURL(/#\/n\//);
    await expect(page.locator('.main-header-title')).toContainText('Note');
    // Back home via URL hash (no rail), then verify the new tag appears in the sidebar and click it.
    // Persisted store can take a tick to flush; allow retries.
    await page.goto('/#/');
    const tagLink = page.locator('.sidebar-link', { hasText: '#e2eautomated' });
    await expect(tagLink).toBeVisible({ timeout: 10_000 });
    await tagLink.click();
    await expect(page).toHaveURL(/#\/g\/e2eautomated/);
    await expect(page.locator('.memo-card', { hasText: stamp })).toBeVisible();
  });

  test('mobile drawer opens via hamburger and closes via close button / ESC / backdrop', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/#/');
    await expect(page.locator('.drawer')).toBeHidden();
    // Open
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.drawer-open')).toBeVisible();
    // Close via ESC
    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer-open')).toHaveCount(0);
    // Open again, close via the X button
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.drawer-open')).toBeVisible();
    await page.locator('.drawer-close').click();
    await expect(page.locator('.drawer-open')).toHaveCount(0);
    // Open again, close via backdrop (click at a point outside the drawer's 280px width)
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.drawer-open')).toBeVisible();
    await page.locator('.drawer-backdrop').click({ position: { x: 400, y: 400 } });
    await expect(page.locator('.drawer-open')).toHaveCount(0);
  });
});
