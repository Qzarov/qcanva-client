import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';
import { chooseOption, selectControl } from './support/dnd-select';

const SHOTS = process.env.SHOT_DIR;

/** Set-once data (race, class, slot counts, recharge...) is edited in setup mode (character-sheet-edit-modes.md). */
async function toSetup(page: Page) {
  await page.locator('.dnd-mode-button').click();
  await expect(page.locator('.dnd-mode-button')).toHaveAttribute('aria-pressed', 'true');
}

async function openSheet(page: Page, theme: 'dark' | 'light' = 'dark') {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', level: 4 };
  data.abilities.constitution.score = 14;
  data.combat = { ...data.combat, currentHp: 6, maxHp: 30, temporaryHp: 3, hitDiceSpent: 1, conditions: ['exhaustion'] };
  data.activeTab = 'features';
  data.features = [
    { id: 's', name: 'Второе дыхание', currentUses: 0, maxUses: 1, recharge: 'short' },
    { id: 'l', name: 'Ярость', currentUses: 0, maxUses: 2, recharge: 'long' },
  ];
  const saved = await serveCharacterSheet(page, { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' });
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, theme);
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return saved as () => { data: any };
}

for (const width of [320, 1280]) {
  test(`short rest spends hit dice, long rest restores the sheet at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);

    const shortRest = page.getByRole('button', { name: 'Отдых', exact: true });
    await shortRest.click();
    const dialog = page.getByRole('dialog', { name: 'Короткий отдых', exact: true });
    await expect(dialog).toContainText('Кости хитов: 3 из 4');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // Every button stays inside the dialog (the app's phone rule would stretch them past it).
    for (const control of await dialog.getByRole('button').all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(box.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }

    // Spending a die keeps the dialog (and the focus) where it was, so the next one is one tap away.
    const spend = dialog.getByRole('button', { name: /Потратить кость: 1d8\+2/ });
    await spend.click();
    await expect(dialog).toContainText('Кости хитов: 2 из 4');
    await expect(spend).toBeFocused();
    await expect.poll(() => saved().data.combat.hitDiceSpent).toBe(2);
    const healed = saved().data.combat.currentHp;
    expect(healed).toBeGreaterThanOrEqual(9);
    expect(healed).toBeLessThanOrEqual(16);
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Кость хитов');

    await dialog.getByRole('button', { name: 'Короткий отдых', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(shortRest).toBeFocused();
    await expect.poll(() => saved().data.features.map((item: any) => item.currentUses)).toEqual([1, 0]);

    await page.getByRole('button', { name: 'Отдых', exact: true }).click();
    await page.getByRole('radio', { name: 'Длинный', exact: true }).click();
    const long = page.getByRole('dialog', { name: 'Длинный отдых', exact: true });
    await expect(long).toContainText(`HP: ${healed} → 30`);
    await expect(long).toContainText('Истощение снимается');
    await page.keyboard.press('Escape');
    await expect(long).toHaveCount(0);
    expect(saved().data.combat.currentHp).toBe(healed);

    await page.getByRole('button', { name: 'Отдых', exact: true }).click();
    await page.getByRole('radio', { name: 'Длинный', exact: true }).click();
    await long.getByRole('button', { name: 'Длинный отдых', exact: true }).click();
    await expect.poll(() => saved().data.combat).toMatchObject({ currentHp: 30, temporaryHp: 0, hitDiceSpent: 0, conditions: [] });
    await expect(page.getByLabel('Текущие HP', { exact: true })).toHaveValue('30');
    await page.reload();
    await expect(page.getByLabel('Текущие HP', { exact: true })).toHaveValue('30');
  });

  test(`death saves appear at 0 HP and clear on healing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    const saves = page.getByRole('group', { name: 'Спасброски от смерти' });
    await expect(saves).toHaveCount(0);

    await page.getByRole('button', { name: 'Урон', exact: true }).click();
    await page.getByLabel('Количество HP', { exact: true }).fill('50');
    await page.keyboard.press('Enter');
    await expect(saves).toBeVisible();
    const box = (await saves.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);

    await saves.getByRole('button', { name: 'Спасбросок от смерти' }).click();
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Спасбросок от смерти');
    await expect.poll(() => {
      const { currentHp, deathSaves } = saved().data.combat;
      return currentHp === 1 || deathSaves.successes + deathSaves.failures > 0;
    }).toBe(true);

    // Whatever was rolled, three failures by hand read as "dead" and a heal starts over.
    if (saved().data.combat.currentHp === 0) {
      await saves.getByRole('button', { name: 'Провал 3 из 3' }).click();
      await expect(saves).toContainText('Мёртв');
      if (SHOTS) await page.locator('.dnd-cs-topcard').screenshot({ path: `${SHOTS}/death-${width}.png` });
      await page.getByRole('button', { name: 'Лечение', exact: true }).click();
      await page.getByLabel('Количество HP', { exact: true }).fill('4');
      await page.keyboard.press('Enter');
    }
    await expect(saves).toHaveCount(0);
    await expect.poll(() => saved().data.combat.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
}

test('feature recharge is saved and survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const saved = await openSheet(page);
  await toSetup(page);
  const selects = page.getByRole('combobox', { name: 'Когда восстанавливаются заряды' });
  await expect(selects).toHaveCount(2);
  await chooseOption(page, 'Когда восстанавливаются заряды', 'Короткий отдых', 1);
  await expect.poll(() => saved().data.features[1].recharge).toBe('short');
  await page.reload();
  await expect(selectControl(page, 'Когда восстанавливаются заряды', 1)).toHaveText('Короткий отдых');
});

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width > 500 ? 900 : 1500 });
        await openSheet(page, theme);
        await page.getByRole('button', { name: 'Урон', exact: true }).click();
        await page.getByLabel('Количество HP', { exact: true }).fill('50');
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Успех 1 из 3' }).click();
        await page.getByRole('button', { name: 'Провал 2 из 3' }).click();
        await page.locator('.dnd-cs').screenshot({ path: `${SHOTS}/stage1-${theme}-${width}.png` });
        await page.getByRole('button', { name: 'Отдых', exact: true }).click();
        await page.screenshot({ path: `${SHOTS}/stage1-short-${theme}-${width}.png` });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Отдых', exact: true }).click();
        await page.getByRole('radio', { name: 'Длинный', exact: true }).click();
        await page.screenshot({ path: `${SHOTS}/stage1-long-${theme}-${width}.png` });
      });
    }
  }
}
