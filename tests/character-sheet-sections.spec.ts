/**
 * The sheet's four sections (abilities / equipment / spells / info) and the
 * wallet in the equipment section. Fake sheet server, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

async function openSheet(page: Page, options: { theme?: 'dark' | 'light'; role?: 'owner' | 'read'; coins?: Record<string, number>; combat?: Record<string, number> } = {}) {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', race: 'Эльф', className: 'Жрец', level: 5 };
  data.abilities.wisdom.score = 16;
  data.spellcasting.casterClass = 'cleric';
  data.spellcasting.ability = 'wisdom';
  data.spellcasting.slots.l1 = { max: 4, spent: 1 };
  data.spells = [{ id: 's1', name: 'Священное пламя', level: 0 }, { id: 's2', name: 'Лечение ран', level: 1, prepared: true }];
  data.features = [{ id: 'f1', name: 'Божественный канал', maxUses: 2, currentUses: 1, recharge: 'short' }];
  data.attacks = [{ id: 'a1', name: 'Булава', attackBonus: '+4', damage: '1d6+1', damageType: 'дробящий' }];
  data.equipment = [{ id: 'e1', name: 'Кольчуга', quantity: 1, equipped: true }, { id: 'e2', name: 'Сухпаёк', quantity: 4 }];
  data.goals = [{ id: 'g1', name: 'Найти пропавшего наставника' }];
  data.personality.traits = 'Спокойна и внимательна.';
  data.notes = 'Должна гильдии 20 зм.';
  data.proficiencies.armor = ['Лёгкие', 'Средние', 'Щиты'];
  data.proficiencies.languages = ['Общий', 'Эльфийский'];
  Object.assign(data.coins, options.coins ?? { gp: 15, sp: 4, cp: 2 });
  Object.assign(data.combat, options.combat ?? {});
  const saved = await serveCharacterSheet(
    page,
    { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' },
    options.role ?? 'owner',
  );
  await page.addInitScript((theme) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Ярослав', role: 'user' }));
  }, options.theme ?? 'dark');
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return saved;
}

const tab = (page: Page, key: string) => page.locator(`.dnd-cs-tabs [data-tab="${key}"]`);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const width of [320, 390]) {
  test(`on a phone five tabs fit in one row, and each section stands alone (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openSheet(page);
    const tabs = page.getByRole('tab');
    // Short names under the icons; the full ones are what a tab is called.
    expect((await tabs.allInnerTexts()).map((text) => text.trim())).toEqual(['Статы', 'Атаки', 'Вещи', 'Магия', 'Инфо']);
    for (const name of ['Характеристики', 'Атаки и умения', 'Снаряжение', 'Заклинания', 'Инфо']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    await expect(page.locator('.dnd-cs-tabs svg')).toHaveCount(5);
    const boxes = await Promise.all((await tabs.all()).map(async (item) => (await item.boundingBox())!));
    // One bar, segments of one size.
    const widths = boxes.map((box) => box.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const bar = (await page.locator('.dnd-cs-tabs').boundingBox())!;
    expect(boxes[0]!.x - bar.x).toBeLessThanOrEqual(6);
    expect(bar.x + bar.width - (boxes[4]!.x + boxes[4]!.width)).toBeLessThanOrEqual(6);
    for (const label of await page.locator('.dnd-cs-tab-label').all()) expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // One row without scrolling, nothing clipped, full touch targets.
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    for (const item of await tabs.all()) expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.locator('.dnd-cs-tabs').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    const tabsBottom = boxes[0]!.y + boxes[0]!.height;
    const abilities = page.locator('.dnd-cs-abilities');
    const panel = page.locator('.dnd-cs-tab-panel');

    // A sheet opens on the abilities, and that section is the abilities alone.
    await expect(tab(page, 'abilities')).toHaveAttribute('aria-selected', 'true');
    await expect(abilities).toBeVisible();
    await expect(panel).toHaveCount(0);
    // The section starts right under the tabs (with the looked-up numbers; the abilities follow them).
    expect((await page.locator('.dnd-cs-left').boundingBox())!.y - tabsBottom).toBeLessThan(24);
    expect(await noSideScroll(page)).toBe(true);
    if (SHOTS) await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sections-abilities-${width}.png`, fullPage: true });

    const expectSection = async (key: string) => {
      await tab(page, key).click();
      await expect(tab(page, key)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.dnd-cs-tabs .active')).toHaveCount(1);
      await expect(abilities).toBeHidden();
      expect((await panel.boundingBox())!.y - tabsBottom).toBeLessThan(24);
      expect(await noSideScroll(page)).toBe(true);
      if (SHOTS) await page.waitForTimeout(300);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/sections-${key}-${width}.png`, fullPage: true });
    };

    await expectSection('combat');
    await expect(page.getByLabel('Название атаки')).toHaveValue('Булава');
    await expect(page.getByLabel('Название умения')).toHaveValue('Божественный канал');

    await expectSection('equipment');
    await expect(page.getByRole('region', { name: 'Монеты' })).toBeVisible();
    await expect(page.getByLabel('Название предмета').first()).toHaveValue('Кольчуга');

    await expectSection('spells');
    await expect(page.getByLabel('Название заклинания').first()).toHaveValue('Священное пламя');

    await expectSection('info');
    await expect(page.locator('.dnd-cs-tab-panel h4')).toHaveText(['Цели', 'Характер', 'Заметки', 'Владения']);
    await expect(page.getByLabel('Заметки персонажа')).toHaveValue('Должна гильдии 20 зм.');
    await expect(page.locator('.dnd-cs-proficiencies')).toContainText('Языки и прочее');

    await tab(page, 'abilities').click();
    await expect(abilities).toBeVisible();
    await expect(panel).toHaveCount(0);
  });
}

test('on a wide screen the abilities stay in view next to every section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet(page);
  expect((await page.getByRole('tab').allInnerTexts()).map((text) => text.trim())).toEqual(['Атаки', 'Снаряжение', 'Заклинания', 'Инфо']);
  await expect(page.getByRole('tab', { name: 'Атаки и умения', exact: true })).toBeVisible();
  const wide = await Promise.all((await page.getByRole('tab').all()).map(async (item) => (await item.boundingBox())!.width));
  expect(Math.max(...wide) - Math.min(...wide)).toBeLessThanOrEqual(1);
  for (const label of await page.locator('.dnd-cs-tab-label').all()) expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The abilities have no tab here: a new sheet opens on the attacks.
  await expect(tab(page, 'combat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Название атаки')).toHaveValue('Булава');
  const abilities = page.locator('.dnd-cs-abilities');
  for (const key of ['equipment', 'spells', 'info', 'combat']) {
    await tab(page, key).click();
    await expect(tab(page, key)).toHaveAttribute('aria-selected', 'true');
    await expect(abilities).toBeVisible();
    const left = (await abilities.boundingBox())!;
    const panel = (await page.locator('.dnd-cs-tab-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThan(left.x + left.width);
    if (SHOTS) await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sections-wide-${key}.png` });
  }
  // The proficiencies moved out of the left column.
  await expect(page.locator('.dnd-cs-left .dnd-cs-proficiencies')).toHaveCount(0);
});

test('a phone and a wide screen share the stored section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openSheet(page);
  await expect(tab(page, 'abilities')).toHaveAttribute('aria-selected', 'true');
  // The same page turned wide: the abilities move to the left and the attacks open.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(tab(page, 'abilities')).toHaveCount(0);
  await expect(tab(page, 'combat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.dnd-cs-abilities')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(tab(page, 'abilities')).toHaveAttribute('aria-selected', 'true');
});

test('the chosen section survives a reload and is not synced', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const saved = await openSheet(page);
  await tab(page, 'info').click();
  await page.reload();
  await expect(tab(page, 'info')).toHaveAttribute('aria-selected', 'true');
  expect(saved().data.activeTab).toBe('attacks');
});

for (const theme of ['dark', 'light'] as const) {
  test(`coins are gained and spent from a coin's dialog, with change (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const saved = await openSheet(page, { theme });
    await tab(page, 'equipment').click();
    const wallet = page.getByRole('region', { name: 'Монеты' });
    // The coins are buttons: no fields to type over, no total, no buttons under them.
    await expect(wallet.getByRole('textbox')).toHaveCount(0);
    await expect(wallet.getByRole('spinbutton')).toHaveCount(0);
    await expect(wallet).not.toContainText('Всего');
    const coins = wallet.getByRole('button');
    await expect(coins).toHaveCount(5);
    await expect(coins).toHaveText(['пм0', 'зм15', 'эм0', 'см4', 'мм2']);
    const cells = await Promise.all((await coins.all()).map(async (cell) => (await cell.boundingBox())!));
    expect(new Set(cells.map((cell) => Math.round(cell.y))).size).toBe(1);
    expect(cells[4]!.x + cells[4]!.width).toBeLessThanOrEqual(390);
    for (const cell of cells) expect(cell.height).toBeGreaterThanOrEqual(44);
    if (SHOTS) await wallet.screenshot({ path: `${SHOTS}/wallet-${theme}.png` });

    // A coin opens the one dialog, on that coin's field.
    await wallet.getByRole('button', { name: 'Золотые монеты: 15' }).click();
    const dialog = page.getByRole('dialog', { name: 'Монеты' });
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(dialog.getByLabel('Золотые')).toBeFocused();
    await expect(dialog.locator('.dnd-coins-now')).toHaveText('В кошельке: 15 зм 4 см 2 мм');
    const gain = dialog.getByRole('button', { name: 'Получить' });
    const spend = dialog.getByRole('button', { name: 'Потратить' });
    await expect(gain).toBeDisabled();
    await expect(spend).toBeDisabled();
    for (const button of [gain, spend]) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(box.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
    }
    await dialog.getByLabel('Золотые').fill('10');
    await dialog.getByLabel('Серебряные').fill('6');
    await expect(dialog.locator('.dnd-coins-results li')).toHaveText(['Получить: 25 зм 10 см 2 мм', /Потратить:\s*4 зм 8 см 2 мм · с разменом/]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/coins-dialog-${theme}.png` });
    // Enter must not pick an action.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await gain.click();
    await expect(dialog).toHaveCount(0);
    await expect(wallet.getByRole('button', { name: 'Золотые монеты: 25' })).toBeFocused();
    await expect.poll(() => saved().data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 10, cp: 2 });

    // More than the wallet is worth: spending is refused, gaining is not.
    await wallet.getByRole('button', { name: /Медные монеты/ }).click();
    await expect(dialog.getByLabel('Медные')).toBeFocused();
    await dialog.getByLabel('Золотые').fill('99');
    await expect(dialog.locator('.dnd-coins-results li').nth(1)).toContainText('не хватает 72,98 зм');
    await expect(spend).toBeDisabled();
    await expect(gain).toBeEnabled();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/coins-short-${theme}.png` });
    // 8 copper with 2 in the purse: a silver piece is broken, the change comes back.
    await dialog.getByLabel('Золотые').fill('');
    await dialog.getByLabel('Медные').fill('8');
    await expect(dialog.locator('.dnd-coins-results li').nth(1)).toHaveText(/Потратить:\s*25 зм 9 см 4 мм · с разменом/);
    await spend.click();
    await expect(dialog).toHaveCount(0);
    await expect(coins).toHaveText(['пм0', 'зм25', 'эм0', 'см9', 'мм4']);
    await expect.poll(() => saved().data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 9, cp: 4 });

    // Closing changes nothing.
    await wallet.getByRole('button', { name: /Платиновые монеты/ }).click();
    await dialog.getByLabel('Платиновые').fill('3');
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
    expect(saved().data.coins.pp).toBe(0);
  });
}

test('a viewer sees the wallet and cannot change it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openSheet(page, { role: 'read' });
  await tab(page, 'equipment').click();
  const wallet = page.getByRole('region', { name: 'Монеты' });
  await expect(wallet.getByRole('button')).toHaveText(['пм0', 'зм15', 'эм0', 'см4', 'мм2']);
  for (const coin of await wallet.getByRole('button').all()) await expect(coin).toBeDisabled();
  await expect(page.getByRole('dialog', { name: 'Монеты' })).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`on a phone the looked-up numbers live in the abilities section; HP and initiative share a line (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openSheet(page);
    // The top card has no row of actions: the HP button and the initiative roll end the HP line.
    await expect(page.locator('.dnd-cs-hp-actions')).toHaveCount(0);
    await expect(page.locator('.dnd-cs-topcard').getByRole('button', { name: /Лечение|Урон|Атака/ })).toHaveCount(0);
    const line = (await page.locator('.dnd-cs-hp').boundingBox())!;
    expect(line.x + line.width).toBeLessThanOrEqual(width);
    for (const selector of ['.dnd-cs-hp-button', '.dnd-cs-init-button', '.dnd-cs-hp .dnd-cs-rest-button']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(line.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(line.x + line.width + 1);
      expect(await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Бросить инициативу', exact: true }).click();
    await expect(page.locator('.dnd-cs-toast')).toContainText('Инициатива');

    // HP, the numbers, the initiative and the rest: one row.
    const rowOf = async (selector: string) => { const box = (await page.locator(selector).boundingBox())!; return Math.round(box.y + box.height / 2); };
    const rows = [await rowOf('.dnd-cs-hp-button'), await rowOf('.dnd-cs-init-button'), await rowOf('.dnd-cs-hp .dnd-cs-rest-button')];
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);

    // Advantage / disadvantage live among the states, inside the screen; the rest is in the HP line here.
    const states = page.getByRole('region', { name: 'Состояния' });
    await expect(states.locator('.dnd-roll-mode button')).toHaveText(['Преим.', 'Помеха']);
    await expect(states.getByRole('button', { name: 'Отдых', exact: true })).toHaveCount(0);
    for (const control of await states.getByRole('button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(30);
    }
    await states.getByRole('button', { name: 'Преим.' }).click();
    await expect(states.getByRole('button', { name: 'Преим.' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Отдых', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Короткий отдых' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The top card has no armor class, speed or proficiency; the passive scores are not above the tabs.
    await expect(page.locator('.dnd-cs-topcard .dnd-cs-combat-stats')).toHaveCount(0);
    const tabsTop = (await page.locator('.dnd-cs-tabs').boundingBox())!.y;
    const stats = page.locator('.dnd-cs-left .dnd-cs-combat-stats');
    const passives = page.getByRole('region', { name: 'Пассивные характеристики' });
    await expect(stats.locator('.dnd-cs-stat span')).toHaveText(['КД', 'Скорость', 'Мастерство']);
    await expect(passives).toHaveCount(1);
    const statsBox = (await stats.boundingBox())!;
    const passivesBox = (await passives.boundingBox())!;
    const abilitiesBox = (await page.locator('.dnd-cs-abilities').boundingBox())!;
    expect(statsBox.y).toBeGreaterThan(tabsTop);
    expect(passivesBox.y).toBeGreaterThanOrEqual(statsBox.y + statsBox.height);
    expect(abilitiesBox.y).toBeGreaterThanOrEqual(passivesBox.y + passivesBox.height);
    expect(statsBox.x + statsBox.width).toBeLessThanOrEqual(width);
    for (const cell of await stats.locator('.dnd-cs-stat').all()) expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
    if (SHOTS) await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/batch3-stats-${width}.png`, fullPage: true });

    // They leave with the section; the conditions stay on top.
    await tab(page, 'combat').click();
    await expect(stats).toBeHidden();
    await expect(passives).toBeHidden();
    await expect(page.getByRole('button', { name: /состояние/ })).toBeVisible();
  });
}

test('the HP line holds three-digit hit points with temporary ones on a 320 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openSheet(page, { combat: { currentHp: 127, maxHp: 144, temporaryHp: 12 } });
  const line = page.locator('.dnd-cs-hp');
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(320);
  const parts = await line.locator(':scope > *').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { name: element.getAttribute('aria-label') ?? element.textContent, left: box.left, right: box.right, middle: Math.round(box.top + box.height / 2), clipped: element.scrollWidth > element.clientWidth + 1 };
  }));
  // Nothing clipped, nothing outside the line, and - with room found for it - still one row.
  for (const part of parts) {
    expect(part.clipped, String(part.name)).toBe(false);
    expect(part.left, String(part.name)).toBeGreaterThanOrEqual(lineBox.x - 1);
    expect(part.right, String(part.name)).toBeLessThanOrEqual(lineBox.x + lineBox.width + 1);
  }
  const middles = parts.map((part) => part.middle);
  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(2);
  await expect(page.getByLabel('Текущие HP', { exact: true })).toHaveValue('127');
  await expect(page.getByLabel('Временные HP', { exact: true })).toBeVisible();
  await expect(page.locator('.dnd-cs-init-button span')).toHaveText('Иниц.');
  expect(await noSideScroll(page)).toBe(true);
  if (SHOTS) await page.locator('.dnd-cs-topcard').screenshot({ path: `${SHOTS}/hp-line-320-worst.png` });
});

test('on a wide screen armor class, speed, proficiency and the passive scores stay at the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet(page);
  await expect(page.locator('.dnd-cs-topcard .dnd-cs-combat-stats .dnd-cs-stat span')).toHaveText(['КД', 'Скорость', 'Мастерство']);
  await expect(page.locator('.dnd-cs-status-row').getByRole('region', { name: 'Пассивные характеристики' })).toBeVisible();
  await expect(page.locator('.dnd-cs-left .dnd-cs-combat-stats')).toHaveCount(0);
  // HP on the left of its line, the initiative roll on the right; the rest and the roll mode among the states.
  await expect(page.locator('.dnd-cs-hp > :first-child')).toHaveText('HP');
  await expect(page.locator('.dnd-cs-hp > :last-child')).toHaveAttribute('aria-label', 'Бросить инициативу');
  await expect(page.locator('.dnd-cs-hp-actions')).toHaveCount(0);
  const states = page.getByRole('region', { name: 'Состояния' });
  await expect(states.locator('.dnd-roll-mode button')).toHaveText(['Преим.', 'Помеха']);
  await expect(states.getByRole('button', { name: 'Отдых', exact: true })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/batch3-wide.png` });
});
