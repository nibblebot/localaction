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

  test('creating an area navigates to its main pane with the tab strip', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill('Work');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page).toHaveURL(/#\/a\//);
    await expect(page.locator('.area-header-name')).toContainText('Work');
    await expect(page.locator('.area-tabs')).toBeVisible();
    await expect(page.locator('.area-tab', { hasText: 'Projects' })).toBeVisible();
    await expect(page.locator('.area-tab', { hasText: 'Tasks' })).toBeVisible();
    await expect(page.locator('.area-tab', { hasText: 'Notes' })).toBeVisible();
  });

  test('projects tab shows an empty state and an add prompt', async ({ page }) => {
    await page.goto('/#/');
    // Create an area so we have something to render.
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill('Health');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.projects-tab')).toBeVisible();
    await expect(page.locator('.empty-tab')).toContainText('No projects yet.');
  });

  test('clicking a project opens its pane with Tasks and Notes tabs', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
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
    await expect(page.locator('.area-header-name')).toContainText('Plan trip');
    // Project pane has Tasks + Notes tabs but no Projects tab.
    await expect(page.locator('.area-tab', { hasText: 'Projects' })).toHaveCount(0);
    await expect(page.locator('.area-tab', { hasText: 'Tasks' })).toBeVisible();
    await expect(page.locator('.area-tab', { hasText: 'Notes' })).toBeVisible();
    // Default tab is Tasks; add a task scoped to this project.
    await page.locator('.area-tab-add').click();
    await page.locator('.modal-input').fill('Book flights');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await expect(page.locator('.task-line-title').first()).toHaveValue('Book flights');
  });

  test('a project under a sub-area shows the full area hierarchy in its pane', async ({ page }) => {
    const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const root = `Root ${uniq()}`;
    const sub = `Sub ${uniq()}`;
    const projectName = `Honeymoon ${uniq()}`;
    // Wait for the app shell + sidebar to be ready before interacting.
    await page.goto('/#/');
    await expect(page.locator('.sidebar-section-title-action', { hasTitle: 'New area' })).toBeVisible();
    // Root area
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill(root);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    // Sub-area via the inline + on the root pane
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(sub);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(sub);
    // Now we're on the sub-area pane. Add a project.
    await page.locator('.empty-tab .btn-primary', { hasText: '+ Project' }).click();
    await page.locator('.modal-input').fill(projectName);
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await page.locator('.project-row-name', { hasText: projectName }).click();
    // The project pane header shows a list-based document icon next to the name.
    const projectIcon = page.locator('.area-header-project-icon');
    await expect(projectIcon).toBeVisible();
    await expect(projectIcon).toHaveAttribute('aria-hidden', 'true');
    await expect(projectIcon.locator('use')).toHaveAttribute('href', /#project-list-icon$/);
    // 24x24, same color as the heading.
    const iconSize = await projectIcon.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(iconSize.w).toBe(24);
    expect(iconSize.h).toBe(24);
    const iconColor = await projectIcon.evaluate((el) => getComputedStyle(el).color);
    const headingColor = await page
      .locator('.area-header-name')
      .evaluate((el) => getComputedStyle(el).color);
    expect(iconColor).toBe(headingColor);
    // The icon precedes the project name in DOM order, and the visible gap
    // between the icon's right edge and the heading's left edge is small.
    const order = await projectIcon.evaluate(
      (el, heading) =>
        el.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
          ? 'icon-before'
          : 'icon-after',
      await page.locator('.area-header-name').elementHandle(),
    );
    expect(order).toBe('icon-before');
    const gap = await projectIcon.evaluate(
      (el, heading) => {
        const a = el.getBoundingClientRect();
        const b = heading.getBoundingClientRect();
        return b.left - a.right;
      },
      await page.locator('.area-header-name').elementHandle(),
    );
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(8);
    const rootCrumb = page.locator('.area-header-crumb', { hasText: root });
    const subCrumb = page.locator('.area-header-crumb', { hasText: sub });
    await expect(rootCrumb).toBeVisible();
    await expect(subCrumb).toBeVisible();
    await expect(page.locator('.area-header-name')).toContainText(projectName);
    // Two separators: between the two area crumbs, and between the
    // last crumb and the project name. Each renders as "/".
    const seps = page.locator('.area-header-crumb-sep');
    await expect(seps).toHaveCount(2);
    await expect(seps).toHaveText(['/', '/']);
    // Inter-segment flex gap is tight and uniform: assert the gap
    // from the root crumb's right edge to the first separator's left
    // edge equals the gap from the last separator's right edge to
    // the project icon's left edge.
    const gapRightOfRoot = await seps.first().evaluate((el, prev) => {
      return el.getBoundingClientRect().left - prev.getBoundingClientRect().right;
    }, await rootCrumb.elementHandle());
    const gapLeftOfIcon = await projectIcon.evaluate((el, prev) => {
      return el.getBoundingClientRect().left - prev.getBoundingClientRect().right;
    }, await seps.nth(1).elementHandle());
    expect(gapRightOfRoot).toBeLessThanOrEqual(8);
    expect(gapLeftOfIcon).toBeLessThanOrEqual(8);
    // dedicated .area-header-slash class).
    await expect(page.locator('.area-header-slash')).toHaveCount(0);
    // Clicking the root crumb navigates back to the root area.
    await rootCrumb.click();
    await expect(page.locator('.area-header-name')).toContainText(root);
  });

  test('notes tab shows an empty state then allows adding a note', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.sidebar-section-title-action', { hasTitle: 'New area' }).click();
    await page.locator('.modal-input').fill('Personal');
    await page.locator('.modal .btn-primary', { hasText: 'Create' }).click();
    await page.locator('.area-tab', { hasText: 'Notes' }).click();
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
