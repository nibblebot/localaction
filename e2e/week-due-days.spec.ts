import { test, expect } from '@playwright/test';
import {
  addSubTaskToNamed,
  createArea,
  createRootTask,
  navigateToWeek,
  setDueDateOnRow,
  uniq,
} from './helpers.ts';

// Fixed desktop viewport so the layout is stable across CI / local runs.
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Week view groups open due items per due day', () => {
  test('open due items land in ascending, collapsible day buckets that keep the area grouping', async ({
    page,
  }) => {
    const tok = uniq();
    const area = `Week days ${tok}`;
    const root = `Project ${tok}`;
    const sPairA = `Due pair a ${tok}`;
    const sPairB = `Due pair b ${tok}`;
    const sSolo = `Due solo ${tok}`;

    // Remaining days of the current week (today .. Sunday), ascending.
    // Past days land in Overdue and next week is out of range, so only
    // these can form day buckets from this run's seeds.
    const now = new Date();
    const { to } = weekBoundsIso(now);
    const sunday = partsOf(to);
    const sundayDate = new Date(sunday.year, sunday.month, sunday.day);
    const remaining: string[] = [];
    for (
      let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d <= sundayDate;
      d.setDate(d.getDate() + 1)
    ) {
      remaining.push(toIso(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    // The due-date picker is bound to the current calendar month (see the
    // setDueDateOnRow contract in helpers.ts), so only remaining days
    // inside today's month are settable. On top of that, the Week due
    // panes aggregate ALL areas in the run's shared database while the
    // suite runs fully parallel — and sibling specs leave open due items
    // behind: due-root-subtree.spec.ts seeds a root due today, and
    // task-pane.spec.ts seeds one due the 14th of the current month.
    // Those two days therefore can never carry an exact bucket count
    // here, so they are excluded from the pickable pool.
    const today = toIso(now.getFullYear(), now.getMonth(), now.getDate());
    const todayParts = partsOf(today);
    const pickable = remaining.filter((iso) => {
      const p = partsOf(iso);
      return p.year === todayParts.year && p.month === todayParts.month;
    });
    const usable = pickable.filter(
      (iso) => iso !== today && partsOf(iso).day !== 14,
    );
    // Deterministic for any run date: the two latest usable days keep the
    // buckets past today (never colliding with the sibling seeds above).
    // When fewer than two remain — today is Sunday, or the week's tail
    // falls entirely on today/the 14th (e.g. a Saturday the 13th) — the
    // test falls back to a single today-bucket and relaxes the exact
    // count / ordering assertions.
    const twoBuckets = usable.length >= 2;
    const pairDay = usable[usable.length - 2] ?? today;
    const soloDay = usable[usable.length - 1] ?? today;
    // Distinct only when a second usable day exists — on a Sunday every
    // remaining day is today, so all three subtasks share one bucket.
    const distinctDays = pairDay !== soloDay;

    await page.goto('/#/');
    await createArea(page, area);
    // A non-due root whose subtasks are due: inside a day bucket the root
    // keeps its plain heading and the due subtasks render through the
    // read-only list, so rows genuinely exist to (not) carry a due label.
    await createRootTask(page, root);
    await addSubTaskToNamed(page, root, sPairA);
    await addSubTaskToNamed(page, root, sPairB);
    await addSubTaskToNamed(page, root, sSolo);

    // Two subtasks share the earlier bucket, one lands in the later
    // bucket — the header counts read 2 and 1 respectively (each open
    // due item counts once, root-due items included).
    await setDueDateOnRow(page, sPairA, partsOf(pairDay).day);
    await setDueDateOnRow(page, sPairB, partsOf(pairDay).day);
    await setDueDateOnRow(page, sSolo, partsOf(soloDay).day);

    await navigateToWeek(page);

    const bucketFor = (iso: string) =>
      page.locator(`section.today-due-day[aria-label="${weekdayWithDate(iso)}"]`);
    const pairBucket = bucketFor(pairDay);
    const soloBucket = bucketFor(soloDay);

    await expect(pairBucket).toBeVisible();
    if (twoBuckets) {
      await expect(soloBucket).toBeVisible();

      // Rendered bucket order is ascending by day: the earlier day's
      // labeled section precedes the later one in the document.
      const labels = await page
        .locator('section.today-due-day')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
      const earlier = labels.indexOf(weekdayWithDate(pairDay));
      const later = labels.indexOf(weekdayWithDate(soloDay));
      expect(earlier).toBeGreaterThanOrEqual(0);
      expect(later).toBeGreaterThan(earlier);

      // Header counts match the seeded open due items per day. Both days
      // are past today and never the 14th, so no sibling spec can add
      // items to them — the counts are exact.
      await expect(
        pairBucket.locator('.today-due-day-toggle .sidebar-link-count'),
      ).toHaveText('2');
      await expect(
        soloBucket.locator('.today-due-day-toggle .sidebar-link-count'),
      ).toHaveText('1');
    } else {
      // Single-bucket fallback (today only): the two pair subtasks are
      // always open and due today, and sibling specs may leave their own
      // open due-today items in the shared DB, so assert the count only
      // as a floor at least as large as this run's contribution.
      const countText =
        (await pairBucket
          .locator('.today-due-day-toggle .sidebar-link-count')
          .textContent()) ?? '0';
      expect(Number(countText)).toBeGreaterThanOrEqual(2);
    }

    // Each task sits inside its own day bucket and nowhere else.
    await expect(
      pairBucket.locator('.task-line', { hasText: sPairA }),
    ).toBeVisible();
    await expect(
      pairBucket.locator('.task-line', { hasText: sPairB }),
    ).toBeVisible();
    if (distinctDays) {
      // When the solo subtask shares today's bucket (Sunday), this
      // cross-check would be wrong — it belongs to the same bucket.
      await expect(pairBucket.locator('.task-line', { hasText: sSolo })).toHaveCount(0);
    }
    if (twoBuckets) {
      await expect(
        soloBucket.locator('.task-line', { hasText: sSolo }),
      ).toBeVisible();
      await expect(
        soloBucket.locator('.task-line', { hasText: sPairA }),
      ).toHaveCount(0);
      await expect(
        soloBucket.locator('.task-line', { hasText: sPairB }),
      ).toHaveCount(0);
    }

    // The day bucket carries the familiar Area → Root grouping inside.
    const areaGroup = pairBucket.locator('section.today-group');
    await expect(areaGroup).toBeVisible();
    await expect(
      areaGroup.locator('h3.today-group-title', { hasText: area }),
    ).toBeVisible();

    // Day buckets collapse: rows disappear, aria-expanded flips, and a
    // second click restores the rows.
    const toggle = pairBucket.locator('button.today-due-day-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(pairBucket.locator('.today-project')).toHaveCount(0);
    await expect(pairBucket.locator('.task-line')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      pairBucket.locator('.task-line', { hasText: sPairA }),
    ).toBeVisible();

    // The day header carries the date, so read-only rows inside the
    // bucket show no per-row due-date label (the labels would appear
    // there only if the showDueDate flag leaked through).
    await expect(pairBucket.locator('.task-line-due-date')).toHaveCount(0);
    if (twoBuckets) {
      await expect(soloBucket.locator('.task-line-due-date')).toHaveCount(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Local mirrors of src/components/shared/dates.ts — e2e stays self-contained
// (no src imports in this tree), mirroring the pattern used by
// today-done-section.spec.ts. All helpers work on LOCAL calendar dates,
// never Date#toISOString, which is UTC and lands a day off near midnight.
// ---------------------------------------------------------------------------

function toIso(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Parse an ISO `YYYY-MM-DD` into local date parts (month is 0-based). */
function partsOf(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return { year: NaN, month: NaN, day: NaN };
  return { year: y, month: m - 1, day: d };
}

function weekdayShort(iso: string): string {
  const { year, month, day } = partsOf(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(year, month, day).getDay()];
}

function monthDayShort(iso: string): string {
  const { year, month, day } = partsOf(iso);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(year, month, day),
  );
}

/** Mirror of src `weekdayWithDate` — the day bucket's `aria-label`. */
function weekdayWithDate(iso: string): string {
  return `${weekdayShort(iso)}, ${monthDayShort(iso)}`;
}

/** Mirror of src `weekBoundsIso`: the current local Monday–Sunday week. */
function weekBoundsIso(now: Date = new Date()): { from: string; to: string } {
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return {
    from: toIso(monday.getFullYear(), monday.getMonth(), monday.getDate()),
    to: toIso(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()),
  };
}
