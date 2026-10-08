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
  data.identity = { ...data.identity, name: 'Мириэль', className: 'Жрец', level: 5 };
  data.abilities.wisdom.score = 16;
  data.activeTab = 'spells';
  data.spellcasting.ability = 'wisdom';
  data.spellcasting.slots.l1 = { max: 4, spent: 1 };
  data.spellcasting.slots.l2 = { max: 3, spent: 0 };
  data.spells = [
    { id: 'c1', name: 'Священное пламя', level: 0, rollKind: 'save', saveAbility: 'dexterity', damage: '2d8', damageType: 'излучение' },
    { id: 's1', name: 'Направленный снаряд', level: 1, prepared: true, rollKind: 'attack', damage: '4d6', damageType: 'излучение' },
    { id: 's2', name: 'Лечение ран', level: 1, prepared: true, damage: '1d8+3' },
    { id: 's3', name: 'Божественное оружие', level: 2, description: 'Бонусное действие, концентрация' },
  ];
  const saved = await serveCharacterSheet(page, { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' });
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, theme);
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Мириэль');
  return saved as () => { data: any };
}

for (const width of [320, 1280]) {
  test(`spell slots, DC and rolls work and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    await toSetup(page);
    const panel = page.locator('.dnd-cs-tab-panel');
    await expect(panel.locator('.dnd-cs-spell-summary')).toContainText('Сл спасброска14');
    await expect(panel.getByRole('button', { name: /Атака заклинанием \+6/ })).toBeVisible();

    // Nothing in the tab runs past the panel, even on the narrowest phone.
    const frame = (await panel.boundingBox())!;
    for (const row of await panel.locator('.dnd-cs-spell-row, .dnd-cs-spell-level, .dnd-cs-spell-summary').all()) {
      const box = (await row.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(frame.x);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }

    const slots = page.getByRole('group', { name: 'Ячейки 1 уровня' });
    await expect(slots).toContainText('3/');
    await page.getByRole('button', { name: 'Потратить ячейку 1 уровня' }).click();
    await expect(slots).toContainText('2/');
    await expect.poll(() => saved().data.spellcasting.slots.l1.spent).toBe(2);
    await page.getByRole('button', { name: 'Вернуть ячейку 1 уровня' }).click();
    await expect.poll(() => saved().data.spellcasting.slots.l1.spent).toBe(1);

    await page.getByLabel('Всего ячеек 3 уровня').fill('2');
    await page.getByLabel('Всего ячеек 3 уровня').blur();
    await expect.poll(() => saved().data.spellcasting.slots.l3.max).toBe(2);
    await expect(page.getByRole('group', { name: 'Ячейки 4 уровня' })).toBeVisible();

    await expect(panel.locator('.dnd-cs-spell-dc')).toHaveText('Сл 14 · ЛОВ');
    await panel.getByRole('button', { name: 'Атака +6: бросить' }).click();
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Направленный снаряд');

    // Roll settings open inside the row and are saved field by field.
    await panel.getByRole('button', { name: 'Бросок и урон заклинания' }).nth(3).click();
    const fields = page.getByRole('group', { name: 'Параметры заклинания: Божественное оружие' });
    await fields.getByLabel('Формула заклинания').fill('1d8');
    await fields.getByLabel('Формула заклинания').blur();
    await expect.poll(() => saved().data.spells[3].damage).toBe('1d8');
    const fieldBox = (await fields.boundingBox())!;
    expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);

    // A long rest gives the slots back.
    await page.getByRole('button', { name: 'Отдых', exact: true }).click();
    await page.getByRole('radio', { name: 'Длинный', exact: true }).click();
    const rest = page.getByRole('dialog', { name: 'Длинный отдых', exact: true });
    await expect(rest).toContainText('Ячейки заклинаний: возвращается 1');
    await rest.getByRole('button', { name: 'Длинный отдых', exact: true }).click();
    await expect.poll(() => saved().data.spellcasting.slots.l1.spent).toBe(0);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Ячейки 1 уровня' })).toContainText('4/');
  });
}

for (const width of [320, 1280]) {
  test(`class, prepared limit and the spell catalog work and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    await toSetup(page);
    const panel = page.locator('.dnd-cs-tab-panel');

    // Choosing a class sets the ability and the slots for level 5.
    await chooseOption(page, 'Заклинательный класс', 'Жрец');
    await expect.poll(() => saved().data.spellcasting.casterClass).toBe('cleric');
    await expect.poll(() => [1, 2, 3, 4].map((level) => saved().data.spellcasting.slots[`l${level}`].max)).toEqual([4, 3, 2, 0]);
    await expect(panel.locator('.dnd-cs-spell-prepared')).toHaveText('Подготовлено: 2 из 8');

    await panel.getByRole('button', { name: '+ Из списка заклинаний' }).click();
    const dialog = page.getByRole('dialog', { name: 'Заклинания из списка' });
    await expect(dialog).toContainText('Только доступные: Жрец, до 3 уровня');
    const frame = (await dialog.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(width);
    const search = dialog.getByLabel('Поиск заклинания');
    await expect(search).toBeFocused();

    await search.fill('возрожд');
    const revivify = dialog.getByRole('button', { name: 'Добавить: Возрождение' });
    const item = (await revivify.boundingBox())!;
    expect(item.x + item.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    await revivify.click();
    await expect.poll(() => saved().data.spells.map((spell: any) => spell.catalogKey).filter(Boolean)).toEqual(['revivify']);
    // Still open, and the spell is marked as taken.
    const taken = dialog.getByRole('button', { name: 'Уже в листе: Возрождение' });
    await expect(taken).toHaveAttribute('aria-disabled', 'true');
    await expect(taken).toBeFocused();
    await taken.click({ force: true }); // Playwright treats aria-disabled as not clickable
    expect(saved().data.spells.filter((spell: any) => spell.catalogKey === 'revivify')).toHaveLength(1);

    await search.fill('fireball');
    await expect(dialog).toContainText('Ничего не нашлось');
    await dialog.getByText('Только доступные').click();
    await dialog.getByRole('button', { name: 'Добавить: Огненный шар' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '+ Из списка заклинаний' })).toBeFocused();

    // The added spell is ready to roll and survives a reload.
    await expect(panel.locator('.dnd-cs-spell-dc').last()).toHaveText('Сл 14 · ЛОВ');
    await panel.getByRole('button', { name: 'Урон 8d6: бросить' }).click();
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Огненный шар');
    await page.reload();
    await expect(selectControl(page, 'Заклинательный класс')).toHaveText('Жрец');
    await expect(page.locator('input[aria-label="Название заклинания"]').last()).toHaveValue('Огненный шар');
  });
}

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`catalog screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 860 });
        await openSheet(page, theme);
        await chooseOption(page, 'Заклинательный класс', 'Жрец');
        await page.locator('.dnd-cs-tab-panel').getByRole('button', { name: '+ Из списка заклинаний' }).click();
        await page.getByRole('button', { name: 'Добавить: Лечение ран' }).waitFor();
        await page.mouse.move(1, 1);
        await page.screenshot({ path: `${SHOTS}/catalog-${theme}-${width}.png` });
      });
    }
  }
}

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`spell screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width > 500 ? 1100 : 2400 });
        await openSheet(page, theme);
        await page.locator('.dnd-cs-tab-panel').getByRole('button', { name: 'Бросок и урон заклинания' }).nth(1).click();
        await page.mouse.move(1, 1);
        await page.locator('.dnd-cs-tab-panel').screenshot({ path: `${SHOTS}/spells-${theme}-${width}.png` });
      });
    }
  }
}
