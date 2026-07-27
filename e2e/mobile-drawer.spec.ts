import { test, expect, type Page } from '@playwright/test';

// Mobile drawer navigation, exercised at a phone viewport with touch.
// Regression guards for two drawer bugs:
//  - the section-title action halo (a 44px ::after without a positioning
//    context) covered the whole drawer on coarse pointers, swallowing
//    every tap on Inbox / Today / Week and the area rows;
//  - re-tapping the current route never fired hashchange, so the drawer
//    stayed open over the view the user asked for.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function openDrawer(page: Page): Promise<void> {
  await page.tap('.drawer-toggle');
  await expect(page.locator('.app-shell')).toHaveClass(/drawer-open/);
}

async function expectDrawerClosed(page: Page): Promise<void> {
  await expect(page.locator('.app-shell')).not.toHaveClass(/drawer-open/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
});

test('quick links navigate and close the drawer', async ({ page }) => {
  const cases: { link: string; main: string }[] = [
    { link: '.sidebar-inbox-link', main: 'main[aria-label="Inbox"]' },
    { link: '.sidebar-today-link', main: 'main[aria-label="Today"]' },
    // Week titles its pane "Week · <range>".
    { link: '.sidebar-week-link', main: 'main[aria-label^="Week"]' },
  ];
  for (const { link, main } of cases) {
    await openDrawer(page);
    await page.tap(link);
    await expect(page.locator(main)).toBeVisible();
    await expectDrawerClosed(page);
  }
});

test('re-tapping the current route still closes the drawer', async ({ page }) => {
  await page.goto('/#/inbox');
  await expect(page.locator('main[aria-label="Inbox"]')).toBeVisible();
  await openDrawer(page);
  await page.tap('.sidebar-inbox-link');
  await expectDrawerClosed(page);
  await expect(page.locator('main[aria-label="Inbox"]')).toBeVisible();
});

test('section-title actions stay tappable next to their touch halos', async ({
  page,
}) => {
  await openDrawer(page);
  await page.tap('button[aria-label="New area"]');
  await expect(page.locator('.sidebar-section-add .inline-add-input')).toBeFocused();
});

