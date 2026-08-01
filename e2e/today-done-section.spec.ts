import { test, expect, type Page } from '@playwright/test';

// Unique tokens keep replayed state from prior specs harmless.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Fixed desktop viewport so the layout is stable across CI / local runs.
test.use({ viewport: { width: 1440, height: 900 } });

async function createArea(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="New area"]').click();
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator('.area-header-name')).toContainText(name);
}

async function addAreaTask(page: Page, title: string): Promise<void> {
  const section = page.locator('.pane-section', { hasText: 'Area tasks' });
  await section.locator('button[aria-label="Add task"]').click();
  await expect(section.locator('.task-line-title:focus')).toBeVisible();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  // The line collapses to read-only after the focused title commits.
  await expect(section.locator('.task-line', { hasText: title })).toBeVisible();
}

/**
 * Set the due date on the row whose title matches `title` to the given
 * day-of-month. The caller must pass a day inside the calendar's current
 * month (today's date always qualifies — no month navigation needed for
 * the flows in this spec). The "Set due date" button sits in the row's
 * action strip on desktop and behind the "Task actions" trigger on
 * touch — pointer:coarse hides the strip until the menu opens.
 */
async function setDueDateOnRow(page: Page, title: string, day: number): Promise<void> {
  const row = page.locator('.task-line', { hasText: title });
  await row.hover();
  const setDueDate = row.locator('button[aria-label="Set due date"]');
  if (await setDueDate.isVisible()) {
    await setDueDate.click();
  } else {
    await row.locator('button[aria-label="Task actions"]').click();
    await setDueDate.click();
  }
  const dialog = page.getByRole('dialog', { name: 'Pick due date' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('gridcell', { name: String(day), exact: true }).click();
  // Calendar auto-closes on pick.
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
}

async function navigateToToday(page: Page): Promise<void> {
  await page.click('.sidebar-today-link');
  await expect(page.locator('main[aria-label="Today"]')).toBeVisible();
}

async function navigateToWeek(page: Page): Promise<void> {
  await page.click('.sidebar-week-link');
  await expect(page.locator('main[aria-label^="Week"]')).toBeVisible();
}

test.describe('Today / Week Done section', () => {
  test('the Done section on Today shows completed tasks — with and without a due date — under a single bucket', async ({
    page,
  }) => {
    const tok = uniq();
    const area = `Done Today ${tok}`;
    const tDue = `Task due today ${tok}`;
    const tNoDue = `Task no due ${tok}`;

    await page.goto('/#/');
    await createArea(page, area);

    // One task with a due date today, one with no due date at all —
    // the Done section must show both, gated on completion alone.
    await addAreaTask(page, tDue);
    await addAreaTask(page, tNoDue);

    const today = new Date();
    await setDueDateOnRow(page, tDue, today.getDate());

    const rows = page.locator('.task-line', { hasText: tok });
    await rows.locator(`input[aria-label="Mark “${tDue}” done"]`).click();
    await rows.locator(`input[aria-label="Mark “${tNoDue}” done"]`).click();

    // Today pane: Done section is present with both tasks under the
    // single "Done today" bucket (no per-day breakdown on a one-day view).
    await navigateToToday(page);
    const doneSection = page.locator('section[aria-label="Done"]');
    await expect(doneSection).toBeVisible();
    await expect(
      doneSection.locator('section[aria-label="Done today"]'),
    ).toBeVisible();
    await expect(doneSection.locator('.task-line', { hasText: tDue })).toBeVisible();
    await expect(doneSection.locator('.task-line', { hasText: tNoDue })).toBeVisible();

    const badge = doneSection.locator('.today-section-toggle .sidebar-link-count');
    await expect(badge).toHaveText('2');

    // Reopening a task drops it from the Done section. The Done
    // section's task rows carry the checkbox with the same
    // "Mark … not done" label, so we click it from the Today view
    // rather than navigating back to the area (where the row is
    // pruned by default).
    await doneSection
      .locator(`input[aria-label="Mark “${tNoDue}” not done"]`)
      .click();
    await expect(
      doneSection.locator('.task-line', { hasText: tNoDue }),
    ).toHaveCount(0);
    await expect(doneSection.locator('.task-line', { hasText: tDue })).toBeVisible();
  });

  test('the Done section on Week shows completed tasks — with and without a due date — under their completion day', async ({
    page,
  }) => {
    const tok = uniq();
    const area = `Done Week ${tok}`;
    const tDue = `Task due today ${tok}`;
    const tNoDue = `Task no due ${tok}`;

    await page.goto('/#/');
    await createArea(page, area);
    await addAreaTask(page, tDue);
    await addAreaTask(page, tNoDue);

    const today = new Date();
    await setDueDateOnRow(page, tDue, today.getDate());

    const rows = page.locator('.task-line', { hasText: tok });
    await rows.locator(`input[aria-label="Mark “${tDue}” done"]`).click();
    await rows.locator(`input[aria-label="Mark “${tNoDue}” done"]`).click();

    // Both tasks complete now, so both land in today's day bucket
    // regardless of due date. (Multi-day grouping is covered
    // deterministically by the data-layer unit tests — the UI cannot
    // complete tasks across days.)
    await navigateToWeek(page);
    const doneSection = page.locator('section[aria-label="Done"]');
    await expect(doneSection).toBeVisible();

    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const bucket = doneSection.locator(
      `section.today-done-day[aria-label="${weekdayWithDate(iso)}"]`,
    );
    await expect(bucket).toBeVisible();
    await expect(bucket.locator('.task-line', { hasText: tDue })).toBeVisible();
    await expect(bucket.locator('.task-line', { hasText: tNoDue })).toBeVisible();

    const badge = doneSection.locator('.today-section-toggle .sidebar-link-count');
    await expect(badge).toHaveText('2');
  });
});

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(y, m - 1, d).getDay()];
}

function weekdayWithDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${weekdayShort(iso)} · ${Number(month)}/${Number(day)}`;
}
