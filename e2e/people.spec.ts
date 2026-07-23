import { test, expect, type Page } from '@playwright/test';

// The e2e suite shares one DB across specs (and retries re-run the
// creation), so person names must be unique per run to keep locators
// single-match.
const uniq = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createArea(page: Page, name: string): Promise<void> {
  const input = page.locator('.sidebar-section-add .inline-add-input');
  await input.fill(name);
  await input.press('Enter');
}

async function createPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New person' }).click();
  const input = page.locator('.person-filter-new-form .inline-add-input');
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press('Enter');
}

test.describe('People', () => {
  test('the sidebar People header + is the single way to add a person', async ({ page }) => {
    const name = `Mom ${uniq()}`;
    await page.goto('/#/');
    await createPerson(page, name);
    // The new person appears as a filter chip.
    await expect(page.locator('.person-filter-chip', { hasText: name })).toBeVisible();
  });

  test('a sidebar-created person is assignable from any entity popover', async ({ page }) => {
    const name = `Dad ${uniq()}`;
    await page.goto('/#/');
    await createPerson(page, name);
    await createArea(page, `Family ${uniq()}`);
    // Open the area cast popover from the header chips.
    await page.locator('.area-header-cast-chip').first().click();
    const popover = page.locator('.person-picker');
    await expect(popover).toBeVisible();
    // Every present person is listed; there is no in-popover creation.
    await expect(popover.locator('.person-picker-row', { hasText: 'Self' })).toBeVisible();
    await expect(popover.locator('.person-picker-row', { hasText: name })).toBeVisible();
    await expect(popover.getByText('+ New person')).toHaveCount(0);
    // Checking the person assigns them; their chip joins the header cast.
    await popover.locator('.person-picker-row', { hasText: name }).click();
    await expect(page.locator(`.area-header-cast .person-avatar[title="${name}"]`)).toBeVisible();
  });

  test('escape cancels the inline create form without adding a person', async ({ page }) => {
    await page.goto('/#/');
    await page.getByRole('button', { name: 'New person' }).click();
    const input = page.locator('.person-filter-new-form .inline-add-input');
    await input.fill('Ghost');
    await input.press('Escape');
    await expect(page.locator('.person-filter-new-form')).toHaveCount(0);
    await expect(page.locator('.person-filter-chip', { hasText: 'Ghost' })).toHaveCount(0);
  });

  test('Self can be renamed from the sidebar and stays the canonical default', async ({ page }) => {
    const newName = `Me ${uniq()}`;
    await page.goto('/#/');

    // Edit affordance lives on the chip (hover reveals it).
    const selfChip = page.locator('.person-filter-chip-wrap', { hasText: 'Self' });
    await selfChip.hover();
    await selfChip.getByRole('button', { name: 'Edit Self' }).click();
    const editor = page.locator('.person-edit');
    await expect(editor).toBeVisible();
    // Canonical: Self stays non-deletable even while being renamed.
    await expect(editor.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await editor.locator('.person-edit-name').fill(newName);
    await editor.getByRole('button', { name: 'Done' }).click();

    // The chip shows the new display name, still first in canonical order.
    const renamedChip = page.locator('.person-filter-chip-wrap', { hasText: newName });
    await expect(renamedChip).toBeVisible();
    await expect(page.locator('.person-filter-chip-wrap').first()).toHaveText(new RegExp(newName));

    // In the assignment popover the renamed Self is still locked-on
    // and tagged "default".
    await createArea(page, `Fam ${uniq()}`);
    await page.locator('.area-header-cast-chip').first().click();
    const popover = page.locator('.person-picker');
    await expect(popover).toBeVisible();
    const selfRow = popover.locator('.person-picker-row', { hasText: newName });
    await expect(selfRow).toBeVisible();
    await expect(selfRow.locator('.person-picker-row-note')).toHaveText('default');
    await expect(selfRow.locator('input[type="checkbox"]')).toBeDisabled();
    await page.keyboard.press('Escape');

    // Restore the seeded name — the suite shares one DB across specs.
    await renamedChip.hover();
    await renamedChip.getByRole('button', { name: `Edit ${newName}` }).click();
    await editor.locator('.person-edit-name').fill('Self');
    await editor.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.person-filter-chip-wrap', { hasText: 'Self' })).toBeVisible();
  });
});
