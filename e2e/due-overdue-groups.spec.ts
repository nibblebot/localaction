import { test, expect, type Page } from '@playwright/test';
import { navigateToToday, navigateToWeek, uniq } from './helpers.ts';

// Regression coverage for the DuePane overdue section's Area grouping and
// the semantic divider (hr.today-overdue-divider) separating it from the
// remaining in-range items. UI contract:
//   - overdue open items group under the same Area → Root headings as
//     in-range items (Inbox first, no colour dot), and every overdue row
//     carries its actual weekday + date label — due sub-task leaves
//     through the read-only list (ul.task-list .task-line) and roots that
//     are themselves overdue through their due-root row
//     (button.today-project-due) alike; never just a generic badge
//   - hr.today-overdue-divider renders only when BOTH the overdue section
//     and remaining in-range items exist, sits between them (direct child
//     of .main-body), and stays visible while Overdue is collapsed
// Seeding goes through the dev store hook (window.__LOCALACTION.store,
// dev server only) so due dates can reach into the past: the due-date
// picker is bound to the current calendar month and cannot express
// "yesterday" on the 1st, which would make the data run-date dependent.

// Serial in declaration order: the divider-absence case seeds overdue-only
// state and must run before the grouped cases add their own due-today
// items to the pane.
test.describe.configure({ mode: 'serial' });

// Fixed desktop viewport so the layout is stable across CI / local runs.
test.use({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------------------
// Local mirrors of src/components/shared/dates.ts — e2e stays self-contained
// (no src imports in this tree), mirroring the pattern used by
// week-due-days.spec.ts. All helpers work on LOCAL calendar dates, never
// Date#toISOString, which is UTC and lands a day off near midnight.
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
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(year, month, day).getDay()
  ];
}

function monthDayShort(iso: string): string {
  const { year, month, day } = partsOf(iso);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(year, month, day),
  );
}

/** Mirror of src `weekdayWithDate` — the per-row due-date label text. */
function weekdayWithDate(iso: string): string {
  return `${weekdayShort(iso)}, ${monthDayShort(iso)}`;
}

/** Local ISO date `offset` days from today (negative = past). */
function isoDaysFromToday(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return toIso(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------------------------------------------------------------------------
// Dev-store seeding
// ---------------------------------------------------------------------------

type SeedArea = { name: string; color: string; order: number };
type SeedTask = {
  title: string;
  /** Owning area name for a root task; absent for an Inbox root. */
  area?: string;
  /** Parent task title for a sub-task; seed arrays list roots first. */
  parent?: string;
  dueDate?: string;
  order?: number;
};

/**
 * Seed areas/tasks straight into the reactive store through the dev hook
 * and return how many OPEN tasks are due today afterwards — a non-zero
 * count means a parallel spec left in-range items in the run's shared
 * state, which callers can use to skip divider-absence assertions.
 */
async function seedViaStore(
  page: Page,
  areas: SeedArea[],
  tasks: SeedTask[],
  today: string,
): Promise<number> {
  return page.evaluate(
    async ([areaSeeds, taskSeeds, todayIso]) => {
      type DevStore = {
        getRowIds(table: string): string[];
        getCell(table: string, rowId: string, col: string): unknown;
        setRow(table: string, rowId: string, row: Record<string, string | number>): unknown;
        transaction(fn: () => void): unknown;
      };
      const w = window as unknown as { __LOCALACTION?: { store?: DevStore } };
      let store = w.__LOCALACTION?.store;
      // Wait for the store to be exposed (dev hook) — same loop as
      // nestArea in helpers.ts.
      for (let i = 0; i < 50 && !store; i += 1) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 100);
        await promise;
        store = w.__LOCALACTION?.store;
      }
      if (!store) throw new Error('localaction store not exposed on window');
      const ts = new Date().toISOString();
      store.transaction(() => {
        const areaIds = new Map<string, string>();
        for (const a of areaSeeds) {
          const id = crypto.randomUUID();
          areaIds.set(a.name, id);
          store.setRow('areas', id, {
            id,
            name: a.name,
            color: a.color,
            order: a.order,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        const taskIds = new Map<string, string>();
        for (const t of taskSeeds) {
          const id = crypto.randomUUID();
          taskIds.set(t.title, id);
          const row: Record<string, string | number> = {
            id,
            title: t.title,
            status: 'open',
            order: t.order ?? 0,
            createdAt: ts,
            updatedAt: ts,
          };
          // Placement chain: `area:<id>` roots a task in an area,
          // `task:<parentId>` nests it (roots are seeded before their
          // sub-tasks); absent placement is an Inbox root.
          if (t.area) row.placement = `area:${areaIds.get(t.area)}`;
          else if (t.parent) row.placement = `task:${taskIds.get(t.parent)}`;
          if (t.dueDate) row.dueDate = t.dueDate;
          store.setRow('tasks', id, row);
        }
      });
      let openDueToday = 0;
      for (const tid of store.getRowIds('tasks')) {
        if (store.getCell('tasks', tid, 'status') !== 'open') continue;
        if (store.getCell('tasks', tid, 'dueDate') === todayIso) openDueToday += 1;
      }
      return openDueToday;
    },
    [areas, tasks, today] as const,
  );
}

/**
 * The divider must sit between the Overdue section and the pane's first
 * in-range block: document order, not sibling adjacency, so it holds for
 * both the Today groups and the Week day buckets.
 */
async function dividerBetween(page: Page, inRangeSelector: string): Promise<boolean> {
  return page.evaluate(
    ([beforeSel]) => {
      const body = document.querySelector('.main-body');
      const overdue = body?.querySelector(':scope > section.today-overdue') ?? null;
      const divider = body?.querySelector(':scope > hr.today-overdue-divider') ?? null;
      const inRange = body?.querySelector(`:scope > ${beforeSel}`) ?? null;
      if (!overdue || !divider || !inRange) return false;
      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      return (
        (overdue.compareDocumentPosition(divider) & following) !== 0 &&
        (divider.compareDocumentPosition(inRange) & following) !== 0
      );
    },
    [inRangeSelector] as const,
  );
}

test.describe('Due pane overdue Area grouping and divider', () => {
  test('keeps the divider out when nothing remains in range', async ({ page }) => {
    const tok = uniq();
    const area = `Solo overdue ${tok}`;
    const root = `Solo root ${tok}`;
    const leaf = `Solo leaf ${tok}`;
    const yesterday = isoDaysFromToday(-1);

    await page.goto('/#/');
    const openDueToday = await seedViaStore(
      page,
      [{ name: area, color: 'gray', order: 1 }],
      [
        { title: root, area },
        { title: leaf, parent: root, dueDate: yesterday },
      ],
      isoDaysFromToday(0),
    );
    if (openDueToday > 0) {
      test.skip(
        true,
        'a parallel spec left open due-today items in the run; the divider-absence case needs an empty in-range pane',
      );
    }

    await navigateToToday(page);

    // The overdue grouping still renders: an Area → Root section whose
    // seeded leaf carries its actual date label.
    const overdue = page.locator('section.today-overdue');
    await expect(overdue).toBeVisible();
    await expect(
      overdue.locator('h3.today-group-title', { hasText: area }),
    ).toBeVisible();
    const row = overdue.locator('.task-line', { hasText: leaf });
    await expect(row).toBeVisible();
    await expect(row.locator('.task-line-due-date')).toHaveText(weekdayWithDate(yesterday));

    // Nothing is due in range, so the divider must not exist and the
    // area gets no in-range group in the pane body.
    await expect(page.locator('hr.today-overdue-divider')).toHaveCount(0);
    await expect(
      page
        .locator('.main-body > section.today-group:not(.today-overdue)')
        .filter({ has: page.locator('h3.today-group-title', { hasText: area }) }),
    ).toHaveCount(0);
  });

  test('groups overdue by area with real dates and keeps the divider through collapse in Today', async ({
    page,
  }) => {
    const tok = uniq();
    const areaA = `Alpha ${tok}`;
    const areaB = `Beta ${tok}`;
    const rootA = `Alpha root ${tok}`;
    const dueRootB = `Beta root ${tok}`; // itself overdue → due-root row
    const inboxRoot = `Inbox root ${tok}`;
    const leafA = `Alpha leaf ${tok}`; // overdue yesterday
    const todayA = `Alpha today ${tok}`; // due today
    const leafInbox = `Inbox leaf ${tok}`; // overdue yesterday
    const todayInbox = `Inbox today ${tok}`; // due today

    const yesterday = isoDaysFromToday(-1);
    const older = isoDaysFromToday(-2);
    const today = isoDaysFromToday(0);

    await page.goto('/#/');
    await seedViaStore(
      page,
      [
        { name: areaA, color: 'purple', order: 1 },
        { name: areaB, color: 'blue', order: 2 },
      ],
      [
        { title: rootA, area: areaA, order: 1 },
        { title: leafA, parent: rootA, dueDate: yesterday, order: 1 },
        { title: todayA, parent: rootA, dueDate: today, order: 2 },
        { title: dueRootB, area: areaB, dueDate: older, order: 2 },
        { title: inboxRoot, order: 3 },
        { title: leafInbox, parent: inboxRoot, dueDate: yesterday, order: 1 },
        { title: todayInbox, parent: inboxRoot, dueDate: today, order: 2 },
      ],
      today,
    );

    await navigateToToday(page);

    const overdue = page.locator('section.today-overdue');
    await expect(overdue).toBeVisible();

    // Inbox groups first, then the areas in their order: Alpha before Beta.
    // The inner AreaGroups sections are direct children of the overdue
    // section, whose own toggle heading is excluded by the `:scope >`
    // pin.
    const headings = overdue.locator(
      ':scope > section.today-group > h3.today-group-title',
    );
    await expect(headings.first()).toHaveText('Inbox');
    await expect(headings.filter({ hasText: areaA }).first()).toBeVisible();
    await expect(headings.filter({ hasText: areaB }).first()).toBeVisible();
    const names = await headings.evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    const inboxIdx = names.findIndex((t) => t === 'Inbox');
    const alphaIdx = names.findIndex((t) => t === areaA);
    const betaIdx = names.findIndex((t) => t === areaB);
    expect(inboxIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeGreaterThan(inboxIdx);
    expect(betaIdx).toBeGreaterThan(alphaIdx);

    // Every overdue row shows its actual date — due sub-task leaves
    // through the read-only list…
    for (const [leaf, day] of [
      [leafA, yesterday],
      [leafInbox, yesterday],
    ] as const) {
      const leafRow = overdue.locator('.task-line', { hasText: leaf });
      await expect(leafRow).toBeVisible();
      await expect(leafRow.locator('.task-line-due-date')).toHaveText(weekdayWithDate(day));
    }
    // …and a root that is itself overdue through its due-root row —
    // never a generic badge without the date.
    const dueRootRow = overdue.locator('button.today-project-due', { hasText: dueRootB });
    await expect(dueRootRow).toBeVisible();
    await expect(dueRootRow.locator('.task-line-due-date')).toHaveText(weekdayWithDate(older));

    // In-range items stay out of the overdue section.
    await expect(overdue.locator('.task-line', { hasText: todayA })).toHaveCount(0);
    await expect(overdue.locator('.task-line', { hasText: todayInbox })).toHaveCount(0);

    // The divider marks the section boundary: one, visible, between the
    // overdue section and the in-range area groups.
    const divider = page.locator('hr.today-overdue-divider');
    await expect(divider).toHaveCount(1);
    await expect(divider).toBeVisible();
    expect(await dividerBetween(page, 'section.today-group:not(.today-overdue)')).toBe(true);

    // The remaining in-range items group under their areas: Alpha's group
    // holds today's leaf and nothing overdue; Beta (overdue-only) gets no
    // in-range group at all.
    const groupA = page
      .locator('.main-body > section.today-group:not(.today-overdue)')
      .filter({ has: page.locator('h3.today-group-title', { hasText: areaA }) });
    await expect(groupA.locator('.task-line', { hasText: todayA })).toBeVisible();
    await expect(groupA.locator('.task-line', { hasText: leafA })).toHaveCount(0);
    await expect(
      page
        .locator('.main-body > section.today-group:not(.today-overdue)')
        .filter({ has: page.locator('h3.today-group-title', { hasText: areaB }) }),
    ).toHaveCount(0);

    // Collapsing Overdue hides its rows but the divider persists.
    const toggle = overdue.locator('button.today-overdue-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(overdue.locator('.task-line')).toHaveCount(0);
    await expect(overdue.locator('button.today-project-due')).toHaveCount(0);
    await expect(divider).toHaveCount(1);
    await expect(divider).toBeVisible();

    // Re-expanding restores the grouped rows with their dates.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      overdue.locator('.task-line', { hasText: leafA }).locator('.task-line-due-date'),
    ).toHaveText(weekdayWithDate(yesterday));
    await expect(
      overdue
        .locator('button.today-project-due', { hasText: dueRootB })
        .locator('.task-line-due-date'),
    ).toHaveText(weekdayWithDate(older));
  });

  test('keeps overdue dates and the divider above the week day buckets', async ({ page }) => {
    const tok = uniq();
    const areaA = `Gamma ${tok}`;
    const areaB = `Delta ${tok}`;
    const rootA = `Gamma root ${tok}`;
    const rootB = `Delta root ${tok}`;
    const inboxRoot = `Inbox root ${tok}`;
    const leafA = `Gamma leaf ${tok}`; // overdue yesterday
    const todayA = `Gamma today ${tok}`; // due today
    const leafB = `Delta leaf ${tok}`; // overdue 2 days ago
    const leafInbox = `Inbox leaf ${tok}`; // overdue yesterday
    const todayInbox = `Inbox today ${tok}`; // due today

    const yesterday = isoDaysFromToday(-1);
    const older = isoDaysFromToday(-2);
    const today = isoDaysFromToday(0);

    await page.goto('/#/');
    await seedViaStore(
      page,
      [
        { name: areaA, color: 'green', order: 1 },
        { name: areaB, color: 'amber', order: 2 },
      ],
      [
        { title: rootA, area: areaA, order: 1 },
        { title: leafA, parent: rootA, dueDate: yesterday, order: 1 },
        { title: todayA, parent: rootA, dueDate: today, order: 2 },
        { title: rootB, area: areaB, order: 2 },
        { title: leafB, parent: rootB, dueDate: older, order: 1 },
        { title: inboxRoot, order: 3 },
        { title: leafInbox, parent: inboxRoot, dueDate: yesterday, order: 1 },
        { title: todayInbox, parent: inboxRoot, dueDate: today, order: 2 },
      ],
      today,
    );

    await navigateToWeek(page);

    const overdue = page.locator('section.today-overdue');
    await expect(overdue).toBeVisible();
    await expect(
      overdue.locator(':scope > section.today-group > h3.today-group-title').first(),
    ).toHaveText('Inbox');
    await expect(
      overdue.locator(':scope > section.today-group > h3.today-group-title', {
        hasText: areaA,
      }),
    ).toBeVisible();
    await expect(
      overdue.locator(':scope > section.today-group > h3.today-group-title', {
        hasText: areaB,
      }),
    ).toBeVisible();

    // Overdue rows keep their actual date labels in the Week pane too.
    for (const [leaf, day] of [
      [leafA, yesterday],
      [leafB, older],
      [leafInbox, yesterday],
    ] as const) {
      const leafRow = overdue.locator('.task-line', { hasText: leaf });
      await expect(leafRow).toBeVisible();
      await expect(leafRow.locator('.task-line-due-date')).toHaveText(weekdayWithDate(day));
    }

    // In-range items stay out of the overdue section…
    await expect(overdue.locator('.task-line', { hasText: todayA })).toHaveCount(0);
    await expect(overdue.locator('.task-line', { hasText: todayInbox })).toHaveCount(0);

    // …and the divider sits between the overdue section and the per-day
    // buckets.
    const divider = page.locator('hr.today-overdue-divider');
    await expect(divider).toHaveCount(1);
    await expect(divider).toBeVisible();
    expect(await dividerBetween(page, 'section.today-due-day')).toBe(true);

    // Today's bucket keeps the Area → Root grouping with the remaining
    // in-range items, and no overdue leaf leaks into it.
    const bucket = page.locator(`section.today-due-day[aria-label="${weekdayWithDate(today)}"]`);
    await expect(bucket).toBeVisible();
    await expect(bucket.locator('h3.today-group-title', { hasText: areaA })).toBeVisible();
    await expect(bucket.locator('.task-line', { hasText: todayA })).toBeVisible();
    await expect(bucket.locator('.task-line', { hasText: todayInbox })).toBeVisible();
    await expect(bucket.locator('.task-line', { hasText: leafA })).toHaveCount(0);
    await expect(bucket.locator('.task-line', { hasText: leafInbox })).toHaveCount(0);
  });
});
