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

async function createNote(page: Page, title: string): Promise<void> {
  await page.locator('section[aria-label="Notes"] button[aria-label="Add note"]').click();
  const input = page.locator('section[aria-label="Notes"] input[aria-label="New note"]');
  await input.fill(title);
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

  test('creating an area navigates to its main pane with the three sections', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'Work');
    await expect(page).toHaveURL(/#\/a\//);
    await expect(page.locator('.area-header-name')).toContainText('Work');
    await expect(page.locator('.pane-section-toggle', { hasText: 'Area tasks' })).toBeVisible();
    await expect(page.locator('.pane-section-toggle', { hasText: 'Projects' })).toBeVisible();
    await expect(page.locator('.pane-section-toggle', { hasText: 'Notes' })).toBeVisible();
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
    // Management affordances (notes, rename, delete) are not on the
    // card — they live on the project detail pane header only.
    await expect(card.locator('button[aria-label="Open notes for Plan trip"]')).toHaveCount(0);
    await expect(card.locator('button[aria-label="Rename project"]')).toHaveCount(0);
    await expect(card.locator('button[aria-label="Delete project"]')).toHaveCount(0);
    // Open the detail pane; its header's note icon opens the notes pane.
    await card.locator('.project-row-name').click();
    await expect(page).toHaveURL(/#\/p\/[^/]+$/);
    await page.locator('button[aria-label="Open notes for Plan trip"]').click();
    await expect(page).toHaveURL(/#\/p\/[^/]+\/notes$/);
    await expect(page.locator('.area-header-name')).toContainText('Plan trip');
    await page.locator('.notes-tab .inline-add-input').fill('Passports');
    await page.locator('.notes-tab .inline-add-input').press('Enter');
    await expect(page.locator('.note-line')).toHaveCount(1);
  });

  test('a project under a sub-area shows the full area hierarchy in its notes pane', async ({ page }) => {
    const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const root = `Root ${uniq()}`;
    const sub = `Sub ${uniq()}`;
    const projectName = `Honeymoon ${uniq()}`;
    // Wait for the app shell + sidebar to be ready before interacting.
    await page.goto('/#/');
    await expect(page.getByRole('button', { name: 'New area' })).toBeVisible();
    // Root area
    await createArea(page, root);
    // Sub-area via the inline + on the root pane
    await page.locator('.area-header-add', { hasTitle: 'Add sub-area' }).click();
    await page.locator('.area-header-add-input').fill(sub);
    await page.locator('.area-header-add-input').press('Enter');
    await expect(page.locator('.area-header-name')).toContainText(sub);
    // Now we're on the sub-area pane. Add a project.
    await createProject(page, projectName);
    // Open the project detail pane; its header's note icon opens the
    // project's notes pane, whose header shows a list-based document
    // icon next to the name.
    await page.locator('li.project-row .project-row-name', { hasText: projectName }).click();
    await expect(page).toHaveURL(/#\/p\/[^/]+$/);
    await page.locator(`button[aria-label="Open notes for ${projectName}"]`).click();
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

  test('notes section renders an inline add input', async ({ page }) => {
    await page.goto('/#/');
    await createArea(page, 'Personal');
    await expect(page.locator('section[aria-label="Notes"] button[aria-label="Add note"]')).toBeVisible();
    await createNote(page, 'Quick thought');
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
