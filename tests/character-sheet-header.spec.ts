import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const longName = 'Элеонора Серебряная Звезда из Далёкого Лунного Леса Хранительница Древних Преданий';
/** `setup`: switch the sheet to setup mode, for tests that edit set-once data such as the name. */
async function openSheet(page: Page, mode: 'play' | 'setup' = 'play') {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: longName, race: 'Эльф', className: 'Волшебник', experience: 350, nextLevelExperience: 900 };
  const saved = await serveCharacterSheet(page, { id: 'hero', title: 'Старое название', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  });
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue(longName);
  if (mode === 'setup') {
    await page.locator('.dnd-mode-button').click();
    await expect(page.locator('.dnd-mode-button')).toHaveAttribute('aria-pressed', 'true');
  }
  return saved as () => { title: string; data: any };
}

for (const width of [320, 1280]) {
  test(`HP actions, modal keyboard controls and account menu at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    await expect(page.getByText('Интерактивный шаблон', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Истощение', { exact: true })).toHaveCount(0);
    await page.locator('[data-account-menu-trigger]').click();
    await expect(page.locator('[data-account-menu] a[href="/plugins"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Hit points are read on the sheet and changed through the HP button: damage, healing, temporary.
    const temp = page.getByLabel('Временные HP', { exact: true });
    const current = page.getByLabel('Текущие HP', { exact: true });
    await expect(current).toHaveAttribute('readonly', '');
    await expect(temp).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Урон', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Лечение', exact: true })).toHaveCount(0);
    const hpButton = page.getByRole('button', { name: 'HP: урон, лечение, временные', exact: true });
    await expect(hpButton).toHaveText('HP');
    const hpLine = (await page.locator('.dnd-cs-hp').boundingBox())!;
    const hpButtonBox = (await hpButton.boundingBox())!;
    const initiative = (await page.getByRole('button', { name: 'Бросить инициативу', exact: true }).boundingBox())!;
    // HP on the left of the line, the initiative roll on its right (on a phone the rest follows it), nothing clipped.
    expect(hpButtonBox.x - hpLine.x).toBeLessThanOrEqual(1);
    const rest = page.getByRole('button', { name: 'Отдых', exact: true });
    await expect(rest).toHaveCount(1);
    const restBox = (await rest.boundingBox())!;
    if (width <= 760) {
      // One row: HP ... initiative, rest.
      expect(Math.abs(restBox.y + restBox.height / 2 - (initiative.y + initiative.height / 2))).toBeLessThanOrEqual(2);
      expect(restBox.x).toBeGreaterThanOrEqual(initiative.x + initiative.width);
      expect(hpLine.x + hpLine.width - (restBox.x + restBox.width)).toBeLessThanOrEqual(1);
      expect(restBox.height).toBeGreaterThanOrEqual(44);
    } else {
      expect(hpLine.x + hpLine.width - (initiative.x + initiative.width)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('region', { name: 'Состояния' }).getByRole('button', { name: 'Отдых', exact: true })).toBeVisible();
    }
    expect(Math.abs(hpButtonBox.y + hpButtonBox.height / 2 - (initiative.y + initiative.height / 2))).toBeLessThanOrEqual(2);
    expect(hpLine.x + hpLine.width).toBeLessThanOrEqual(width);
    for (const field of [current, page.getByLabel('Максимум HP', { exact: true })]) expect(await field.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (width <= 760) expect(hpButtonBox.height).toBeGreaterThanOrEqual(44);

    await hpButton.click();
    const dialog = page.getByRole('dialog', { name: 'HP', exact: true });
    const amount = dialog.getByLabel('Количество HP', { exact: true });
    await expect(amount).toBeFocused();
    await expect(dialog.locator('.dnd-hp-now')).toHaveText('Сейчас: 10 / 10 (+0 врем.)');
    const frame = (await dialog.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(width);
    const actions = dialog.locator('.dnd-hp-dialog-actions button');
    await expect(actions).toHaveText(['Урон', 'Лечение', 'Временные']);
    for (const control of await dialog.getByRole('button').all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(frame.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      expect(await control.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    for (const action of await actions.all()) await expect(action).toBeDisabled();

    // Temporary HP first: they replace what there was.
    await amount.fill('5');
    await expect(dialog.locator('.dnd-hp-results li')).toHaveText(['Урон: 5 / 10 (+0 врем.)', 'Лечение: 10 / 10 (+0 врем.)', 'Временные: 10 / 10 (+5 врем.)']);
    // Enter does not choose between damage and healing.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Временные', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(hpButton).toBeFocused();
    await expect(temp).toHaveValue('5');
    await expect.poll(() => saved().data.combat.temporaryHp).toBe(5);

    // Damage eats the temporary HP first.
    await hpButton.click();
    await amount.fill('8');
    await expect(dialog.locator('.dnd-hp-results li').first()).toHaveText('Урон: 7 / 10 (+0 врем.)');
    // Tab stays inside the dialog.
    await dialog.getByRole('button', { name: 'Временные', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Урон', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(current).toHaveValue('7');
    await expect(temp).toHaveValue('0');
    await expect.poll(() => saved().data.combat.currentHp).toBe(7);

    await hpButton.click();
    await amount.fill('100');
    await dialog.getByRole('button', { name: 'Лечение', exact: true }).click();
    await expect(current).toHaveValue('10');

    // Closing applies nothing: Escape, the backdrop, the cross.
    await hpButton.click(); await amount.fill('3'); await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(hpButton).toBeFocused();
    await hpButton.click(); await amount.fill('3');
    await page.locator('.dnd-hp-backdrop').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toHaveCount(0);
    await hpButton.click(); await amount.fill('3');
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => saved().data.combat.currentHp).toBe(10);
    await page.reload();
    await expect(page.getByLabel('Текущие HP', { exact: true })).toHaveValue('10');
  });
}

for (const width of [320, 390, 760, 1280]) {
  test(`character header and full ability tiles fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page, 'setup');
    const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
    await expect.poll(() => name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    expect((await name.boundingBox())!.height).toBeGreaterThan(45);
    await expect(page.getByText('Название в дашборде')).toHaveCount(0);
    const race = await page.getByRole('combobox', { name: 'Раса', exact: true }).boundingBox();
    const nameBox = (await name.boundingBox())!;
    expect(race!.y).toBeLessThan(nameBox.y + nameBox.height);
    const classBox = (await page.getByRole('combobox', { name: 'Класс', exact: true }).boundingBox())!;
    expect(classBox.y).toBeGreaterThanOrEqual(race!.y + race!.height);
    const level = (await page.getByLabel('Уровень', { exact: true }).boundingBox())!;
    const xp = (await page.locator('.dnd-cs-xp-bar').boundingBox())!;
    expect(xp.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
    const badge = (await page.locator('.dnd-cs-level').boundingBox())!;
    const portrait = (await page.locator('.dnd-cs-portrait').boundingBox())!;
    expect(badge.y).toBeGreaterThanOrEqual(portrait.y + portrait.height);
    expect(Math.abs(badge.x - portrait.x)).toBeLessThanOrEqual(1);
    expect(badge.height).toBeLessThanOrEqual(28);
    expect(Math.abs(badge.x + badge.width - xp.x)).toBeLessThanOrEqual(1);
    expect(level.y).toBeLessThan(xp.y + xp.height);
    await expect(page.locator('.dnd-cs-xp-bar').getByLabel('Опыт', { exact: true })).toHaveValue('350');
    const ac = (await page.getByLabel('Класс доспеха', { exact: true }).boundingBox())!;
    if (width > 760) expect(ac.x).toBeGreaterThan(nameBox.x + nameBox.width);
    else expect(ac.y).toBeGreaterThan(xp.y + xp.height);
    const hp = (await page.locator('.dnd-cs-hp').boundingBox())!;
    const hpBar = (await page.locator('.dnd-cs-hp-bar').boundingBox())!;
    expect(hpBar.height).toBeLessThanOrEqual(10);
    expect(ac.y).toBeGreaterThanOrEqual(hp.y + hp.height);
    expect(ac.y).toBeGreaterThanOrEqual(hpBar.y + hpBar.height);
    const combatCells = await page.locator('.dnd-cs-combat-stats > *').evaluateAll(elements => elements.map(element => {
      const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, right: b.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    }));
    // Armor class, speed, proficiency (in the abilities section on a phone); the initiative is a button among the actions.
    expect(combatCells).toHaveLength(3);
    expect(Math.max(...combatCells.map(c => c.y)) - Math.min(...combatCells.map(c => c.y))).toBeLessThanOrEqual(1);
    expect(combatCells.every(c => c.x >= 0 && c.right <= width && c.scrollWidth <= c.clientWidth + 1)).toBe(true);
    await expect(page.getByLabel('Бонус инициативы', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Бросить инициативу', exact: true }).click();
    await expect(page.locator('.dnd-cs-toast')).toContainText('Инициатива');
    await page.locator('.dnd-cs-toast').getByRole('button', { name: 'Закрыть', exact: true }).click();

    const tiles = await page.locator('.dnd-cs-ability').evaluateAll(elements => elements.map(element => {
      const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right };
    }));
    expect(tiles).toHaveLength(6);
    expect(Math.abs(tiles[0]!.y - tiles[1]!.y)).toBeLessThanOrEqual(1);
    expect(tiles[1]!.x).toBeGreaterThan(tiles[0]!.x);
    const passives = await page.locator('.dnd-cs-passive').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
    expect(passives).toHaveLength(3);
    expect(Math.max(...passives) - Math.min(...passives)).toBeLessThanOrEqual(1);
    await expect(page.locator('.dnd-cs-passives').getByRole('heading')).toHaveCount(0);
    if (width > 760) {
      const passive = page.locator('.dnd-cs-passive').first();
      const label = (await passive.locator('span').boundingBox())!;
      const value = (await passive.locator('strong').boundingBox())!;
      expect(label.x).toBeGreaterThan(value.x + value.width);
      expect(Math.abs(label.y + label.height / 2 - value.y - value.height / 2)).toBeLessThanOrEqual(1);
    }
    const back = (await page.locator('.template-header .back-btn').boundingBox())!;
    expect(back.width).toBe(36);
    expect(await page.locator('.template-header .back-btn').evaluate(element => getComputedStyle(element).borderRadius)).toBe('999px');
    if (width <= 760) {
      for (const tile of await page.locator('.dnd-cs-ability').all()) {
        const title = (await tile.locator('.dnd-cs-ability-name').boundingBox())!;
        const score = (await tile.locator('.dnd-cs-ability-score').boundingBox())!;
        expect(await tile.locator('.dnd-cs-ability-score').evaluate(element => {
          const input = element as HTMLInputElement, style = getComputedStyle(input);
          const context = document.createElement('canvas').getContext('2d')!;
          context.font = style.font;
          return context.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        })).toBe(true);
        expect(Math.max(title.y, score.y)).toBeLessThan(Math.min(title.y + title.height, score.y + score.height));
        const rolls = await tile.locator('.dnd-cs-roll-row .dnd-cs-roll').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
        expect(Math.max(...rolls) - Math.min(...rolls)).toBeLessThanOrEqual(1);
        const row = (await tile.locator('.dnd-cs-roll-row').boundingBox())!;
        const check = (await tile.locator('.dnd-cs-roll-row > button').boundingBox())!;
        const save = (await tile.locator('.dnd-cs-save-cell').boundingBox())!;
        expect(Math.abs(check.width - save.width)).toBeLessThanOrEqual(1);
        expect(check.x).toBe(row.x);
        expect(Math.abs(save.x + save.width - row.x - row.width)).toBeLessThanOrEqual(1);
        expect(check.height).toBeGreaterThanOrEqual(32);
        expect(await tile.locator('.dnd-cs-ability-name').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
      }
    }
    for (const label of ['Сила', 'Ловкость', 'Телосложение', 'Интеллект', 'Мудрость', 'Харизма']) {
      const title = page.locator('.dnd-cs-ability-name').getByText(label, { exact: true });
      await expect(title).toHaveCount(1);
      expect(await title.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    const overflows = await page.locator('.dnd-cs-topcard input, .dnd-cs-topcard textarea, .dnd-cs-ability button, .dnd-cs-ability input').evaluateAll(elements => elements.filter(element => {
      const bounds = element.getBoundingClientRect();
      // Not rendered (temporary HP are hidden on a phone while there are none): nothing to overflow.
      if (!bounds.width && !bounds.height) return false;
      const parent = element.closest('.dnd-cs-ability, .dnd-cs-topcard')!.getBoundingClientRect();
      return bounds.x < parent.x || bounds.right > parent.right || bounds.x < 0 || bounds.right > innerWidth;
    }).map(element => element.outerHTML));
    expect(overflows).toEqual([]);
    await page.screenshot({ path: `/tmp/qcanva-character-header-long-${width}.png`, fullPage: true });
    await name.fill('Короткое имя');
    await name.blur();
    await expect.poll(() => saved().title).toBe('Короткое имя');
    expect(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    await page.screenshot({ path: `/tmp/qcanva-character-header-${width}.png`, fullPage: true });
  });
}

test('name height follows viewport changes and reloading keeps the name and title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const saved = await openSheet(page, 'setup');
  const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
  const height = (await name.boundingBox())!.height;
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(async () => (await name.boundingBox())!.height).toBeGreaterThan(height);
  await expect.poll(() => name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  await name.fill('Лира'); await name.blur();
  await expect.poll(() => saved().title).toBe('Лира');
  const race = (await page.getByRole('combobox', { name: 'Раса', exact: true }).boundingBox())!;
  const classBox = (await page.getByRole('combobox', { name: 'Класс', exact: true }).boundingBox())!;
  expect(Math.abs(race.y - classBox.y)).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(name).toHaveValue('Лира');
  await expect(page.getByLabel('Опыт', { exact: true })).toHaveValue('350');
});

test('name height adapts when font metrics change after initial layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openSheet(page, 'setup');
  const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
  await expect.poll(() => name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  await page.addStyleTag({ content: '.dnd-cs textarea.dnd-cs-name, .dnd-cs-name-measure { font-size: 28px !important; }' });
  await expect.poll(() => name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
});

test('long names shrink but one or two lines retain the normal font', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openSheet(page, 'setup');
  const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
  await expect.poll(() => name.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(20);
  expect(await name.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  await name.fill('Лира\nЛунная');
  await expect.poll(() => name.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(20);
  await name.fill('Лира');
  await expect.poll(() => name.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(20);
  await expect.poll(() => name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
});

for (const width of [320, 1280]) {
  test(`conditions and passive help work and persist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    const states = page.getByRole('region', { name: 'Состояния', exact: true });
    const passives = page.getByRole('region', { name: 'Пассивные характеристики', exact: true });
    const stateBox = (await states.boundingBox())!;
    const passiveBox = (await passives.boundingBox())!;
    if (width > 760) {
      expect(Math.abs(stateBox.y - passiveBox.y)).toBeLessThanOrEqual(1);
      expect(stateBox.x).toBeGreaterThanOrEqual(passiveBox.x + passiveBox.width);
    } else {
      // On a phone the passive scores are in the abilities section, under the tabs; the conditions stay on top.
      expect(passiveBox.y).toBeGreaterThanOrEqual(stateBox.y + stateBox.height);
      expect(passiveBox.height).toBeLessThanOrEqual(62);
    }
    await expect(states.getByRole('heading')).toHaveCount(0);
    await expect(states.locator('.dnd-cs-add-condition')).toHaveText('+ состояние');
    await states.getByRole('button', { name: 'Вдохновение' }).click();
    const add = states.getByRole('button', { name: 'Добавить состояние', exact: true });
    await add.click();
    const menu = page.getByRole('group', { name: 'Доступные состояния', exact: true });
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
    await menu.getByRole('button', { name: 'Добавить: Отравлен', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect.poll(() => saved().data.combat.conditions).toEqual(['poisoned']);
    await page.reload();
    await expect(states.getByRole('button', { name: 'Вдохновение' })).toHaveAttribute('aria-pressed', 'true');
    await expect(states.getByRole('button', { name: 'Удалить состояние: Отравлен', exact: true })).toBeVisible();
    await add.click();
    await expect(menu.getByRole('button', { name: 'Добавить: Отравлен', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.click(); await page.locator('.dnd-cs-hp').click();
    await expect(menu).toHaveCount(0);
    await states.getByRole('button', { name: 'Удалить состояние: Отравлен', exact: true }).click();
    await expect.poll(() => saved().data.combat.conditions).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    if (width <= 760) {
      expect((await passives.boundingBox())!.height).toBeLessThanOrEqual(62);
    }
    for (const label of ['О пассивном восприятии', 'О пассивном анализе', 'О пассивной проницательности']) {
      const button = page.getByRole('button', { name: label, exact: true });
      const passiveBefore = await passives.boundingBox();
      const stateBefore = await states.boundingBox();
      await button.click();
      await expect(page.getByRole('tooltip')).toContainText('Пассивная характеристика:');
      await expect(page.getByRole('tooltip')).toContainText('без броска');
      const bounds = (await page.getByRole('tooltip').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const buttonBox = (await button.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(buttonBox.y);
      expect(await page.getByRole('tooltip').evaluate(element => getComputedStyle(element).position)).toBe('fixed');
      expect(await passives.boundingBox()).toEqual(passiveBefore);
      expect(await states.boundingBox()).toEqual(stateBefore);
      expect(await page.getByRole('tooltip').evaluate(element => {
        const box = element.getBoundingClientRect();
        const hint = element as HTMLElement;
        const original = hint.style.pointerEvents;
        hint.style.pointerEvents = 'auto';
        const topmost = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        hint.style.pointerEvents = original;
        return topmost === element;
      })).toBe(true);
      if (label === 'О пассивном восприятии') await page.screenshot({ path: `/tmp/qcanva-passive-hint-${width}.png`, fullPage: true, animations: 'disabled' });
      await button.click();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
  });
}

test('desktop status cards stay equal-height while condition choices overlay the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet(page);
  await page.evaluate(() => document.fonts.ready);
  const states = page.getByRole('region', { name: 'Состояния', exact: true });
  const passives = page.getByRole('region', { name: 'Пассивные характеристики', exact: true });
  const add = states.getByRole('button', { name: 'Добавить состояние', exact: true });
  const menu = page.getByRole('group', { name: 'Доступные состояния', exact: true });
  for (const condition of ['Ослеплён', 'Очарован', 'Оглохший', 'Испуган', 'Отравлен']) {
    const before = [await states.boundingBox(), await passives.boundingBox()];
    expect(Math.abs(before[0]!.height - before[1]!.height)).toBeLessThanOrEqual(1);
    await add.click();
    await expect(menu).toBeVisible();
    expect([await states.boundingBox(), await passives.boundingBox()]).toEqual(before);
    expect(await menu.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    const option = menu.getByRole('button', { name: `Добавить: ${condition}`, exact: true });
    await option.click();
    await expect(menu).toHaveCount(0);
    await expect(add).toBeFocused();
  }
  const before = [await states.boundingBox(), await passives.boundingBox()];
  expect(Math.abs(before[0]!.height - before[1]!.height)).toBeLessThanOrEqual(1);
  await add.click();
  await page.screenshot({ path: '/tmp/qcanva-status-overlay-desktop.png', animations: 'disabled' });
  await add.click();
  await expect(menu).toHaveCount(0);
});

test('keyboard opening conditions focuses the choices and Escape returns to the trigger', async ({ page }) => {
  await openSheet(page);
  const add = page.getByRole('button', { name: 'Добавить состояние', exact: true });
  await add.focus(); await page.keyboard.press('Enter');
  const first = page.getByRole('group', { name: 'Доступные состояния', exact: true }).getByRole('button').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
});

test('condition choices escape card stacking contexts and track viewport changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet(page);
  const add = page.getByRole('button', { name: 'Добавить состояние', exact: true });
  const menu = page.getByRole('group', { name: 'Доступные состояния', exact: true });
  await add.click();
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await page.setViewportSize({ width: 320, height: 700 });
  await add.scrollIntoViewIfNeeded();
  await expect.poll(async () => {
    const box = (await menu.boundingBox())!;
    return box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 700;
  }).toBe(true);
  await menu.getByRole('button', { name: 'Добавить: Отравлен', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Удалить состояние: Отравлен', exact: true })).toBeVisible();
});

test('the HP dialog\'s buttons center their contents on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openSheet(page);
  await page.locator('.dnd-cs-hp-button').click();
  const dialog = page.getByRole('dialog', { name: 'HP', exact: true });
  for (const button of await dialog.locator('.dnd-hp-dialog-actions button').all()) {
    expect(await button.evaluate(element => getComputedStyle(element).justifyContent)).toBe('center');
    expect(await button.evaluate(element => getComputedStyle(element).textAlign)).toBe('center');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
