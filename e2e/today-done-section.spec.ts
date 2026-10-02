import { test, expect } from '@playwright/test';
import {
  createArea,
  createRootTask,
  navigateToToday,
  navigateToWeek,
  setDueDateOnRow,
  uniq,
} from './helpers.ts';

// Fixed desktop viewport so the layout is stable across CI / local runs.
test.use({ viewport: { width: 1440, height: 900 } });

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
    await createRootTask(page, tDue);
    await createRootTask(page, tNoDue);

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
    await expect(doneSection.locator('section[aria-label="Done today"]')).toBeVisible();
    await expect(doneSection.locator('.task-line', { hasText: tDue })).toBeVisible();
    await expect(doneSection.locator('.task-line', { hasText: tNoDue })).toBeVisible();

    const badge = doneSection.locator('.today-section-toggle .sidebar-link-count');
    await expect(badge).toHaveText('2');

    // Reopening a task drops it from the Done section. The Done
    // section's task rows carry the checkbox with the same
    // "Mark … not done" label, so we click it from the Today view
    // rather than navigating back to the area.
    await doneSection.locator(`input[aria-label="Mark “${tNoDue}” not done"]`).click();
    await expect(doneSection.locator('.task-line', { hasText: tNoDue })).toHaveCount(0);
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
    await createRootTask(page, tDue);
    await createRootTask(page, tNoDue);

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
  // The ISO comes from today's local date, so getDay() is in 0–6.
  return days[new Date(y, m - 1, d).getDay()]!;
}

// Mirror of src/components/shared/dates.ts `weekdayWithDate` — kept
// local so e2e stays self-contained (no src imports in this tree).
function weekdayWithDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  // The caller builds YYYY-MM-DD from today's valid local date.
  const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(y!, m! - 1, d!),
  );
  return `${weekdayShort(iso)}, ${monthDay}`;
}
