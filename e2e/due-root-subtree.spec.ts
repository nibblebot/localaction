import { test, expect } from '@playwright/test';
import {
  createArea,
  createRootTask,
  addSubTaskToNamed,
  navigateToToday,
  navigateToWeek,
  setDueDateOnRow,
  uniq,
} from './helpers.ts';

// Fixed desktop viewport so the layout is stable across CI / local runs.
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Due panes render a due root like the area-view parent row', () => {
  test('a due root task expands its interactive subtree in Week and Today alike', async ({
    page,
  }) => {
    const tok = uniq();
    const area = `Due subtree ${tok}`;
    const root = `Root ${tok}`;
    const sub = `Sub ${tok}`;

    await page.goto('/#/');
    await createArea(page, area);
    await createRootTask(page, root);
    await addSubTaskToNamed(page, root, sub);
    // Due today always lands inside both views' ranges.
    await setDueDateOnRow(page, root, new Date().getDate());

    // Week view: the root-due row carries the collapse caret and the
    // derived progress meter (no checkbox), and the subtree below it is
    // the fully interactive TaskTree — the same chrome as the area view.
    await navigateToWeek(page);
    const dueRow = page.locator('.today-project-due-row', { hasText: root });
    await expect(dueRow.locator('button[title="Collapse subtasks"]')).toBeVisible();
    await expect(dueRow.locator('.project-row-progress-count')).toHaveText('0 / 1');

    const subRow = page.locator('.task-line', { hasText: sub });
    // The subtree checkbox is live: checking the only subtask off makes
    // the root derived-done, so the whole root group leaves the open
    // due list (same rule as the area view) and the subtask lands in the
    // Done section — where its checkbox reopens it.
    await subRow.locator(`input[aria-label="Mark “${sub}” done"]`).click();
    await expect(dueRow).toHaveCount(0);
    const doneRow = page
      .locator('section[aria-label="Done"]')
      .locator('.task-line', { hasText: sub });
    await expect(doneRow).toBeVisible();
    await doneRow.locator(`input[aria-label="Mark “${sub}” not done"]`).click();
    await expect(dueRow.locator('.project-row-progress-count')).toHaveText('0 / 1');

    // The caret collapses and re-expands the subtree in place.
    await dueRow.locator('button[title="Collapse subtasks"]').click();
    await expect(subRow).toHaveCount(0);
    await dueRow.locator('button[title="Expand subtasks"]').click();
    await expect(subRow).toBeVisible();

    // Today view: identical row chrome and subtree behavior.
    await navigateToToday(page);
    const todayDueRow = page.locator('.today-project-due-row', { hasText: root });
    await expect(todayDueRow.locator('button[title="Collapse subtasks"]')).toBeVisible();
    await expect(todayDueRow.locator('.project-row-progress-count')).toHaveText('0 / 1');
    await expect(page.locator('.task-line', { hasText: sub })).toBeVisible();
  });
});
