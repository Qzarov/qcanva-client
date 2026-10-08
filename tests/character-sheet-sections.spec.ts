/**
 * The sheet's four sections (abilities / equipment / spells / info) and the
 * wallet in the equipment section. Fake sheet server, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

async function openSheet(page: Page, options: { theme?: 'dark' | 'light'; role?: 'owner' | 'read'; coins?: Record<string, number> } = {}) {
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
    expect(await tabs.allInnerTexts()).toEqual([width < 380 ? 'Хар-ки' : 'Характеристики', 'Атаки', 'Снаряжение', 'Заклинания', 'Инфо']);
    const boxes = await Promise.all((await tabs.all()).map(async (item) => (await item.boundingBox())!));
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
    expect((await abilities.boundingBox())!.y - tabsBottom).toBeLessThan(24);
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
  expect(await page.getByRole('tab').allInnerTexts()).toEqual(['Атаки и умения', 'Снаряжение', 'Заклинания', 'Инфо']);
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
  test(`coins are gained and spent from the wallet, with change (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const saved = await openSheet(page, { theme });
    await tab(page, 'equipment').click();
    const wallet = page.getByRole('region', { name: 'Монеты' });
    await expect(wallet.locator('.dnd-wallet-total')).toHaveText('Всего 15,42 зм');
    // Five coins in one row, inside the screen.
    const cells = await Promise.all((await wallet.locator('.dnd-wallet-coin').all()).map(async (cell) => (await cell.boundingBox())!));
    expect(cells).toHaveLength(5);
    expect(new Set(cells.map((cell) => Math.round(cell.y))).size).toBe(1);
    expect(cells[4]!.x + cells[4]!.width).toBeLessThanOrEqual(390);
    for (const button of await wallet.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (SHOTS) await wallet.screenshot({ path: `${SHOTS}/wallet-${theme}.png` });

    await wallet.getByRole('button', { name: 'Получить' }).click();
    const gain = page.getByRole('dialog', { name: 'Получить монеты' });
    const box = (await gain.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(gain.getByRole('button', { name: 'Получить' })).toBeDisabled();
    await gain.getByLabel('Золотые').fill('10');
    await gain.getByLabel('Серебряные').fill('6');
    await expect(gain.locator('p')).toHaveText('После: 25 зм 10 см 2 мм');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/coins-gain-${theme}.png` });
    await gain.getByRole('button', { name: 'Получить' }).click();
    await expect(gain).toHaveCount(0);
    await expect(wallet.getByLabel('Золотые монеты')).toHaveValue('25');
    await expect.poll(() => saved().data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 10, cp: 2 });

    // 8 copper with 2 in the purse: a silver piece is broken, the change comes back.
    await wallet.getByRole('button', { name: 'Потратить' }).click();
    const spend = page.getByRole('dialog', { name: 'Потратить монеты' });
    await spend.getByLabel('Золотые').fill('99');
    await expect(spend.locator('p')).toContainText('Не хватает 72,98 зм');
    await expect(spend.getByRole('button', { name: 'Потратить' })).toBeDisabled();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/coins-short-${theme}.png` });
    await spend.getByLabel('Золотые').fill('');
    await spend.getByLabel('Медные').fill('8');
    await expect(spend.locator('p')).toHaveText('После: 25 зм 9 см 4 мм · с разменом');
    await page.keyboard.press('Enter');
    await expect(spend).toHaveCount(0);
    await expect(wallet.locator('.dnd-wallet-total')).toHaveText('Всего 25,94 зм');
    await expect.poll(() => saved().data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 9, cp: 4 });

    // A number typed over is saved too.
    await wallet.getByLabel('Платиновые монеты').fill('3');
    await wallet.getByLabel('Платиновые монеты').blur();
    await expect.poll(() => saved().data.coins.pp).toBe(3);
  });
}

test('a viewer sees the wallet and cannot change it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openSheet(page, { role: 'read' });
  await tab(page, 'equipment').click();
  const wallet = page.getByRole('region', { name: 'Монеты' });
  await expect(wallet.getByLabel('Золотые монеты')).toHaveValue('15');
  await expect(wallet.getByLabel('Золотые монеты')).toHaveAttribute('readonly', '');
  await expect(wallet.getByRole('button', { name: 'Получить' })).toBeDisabled();
  await expect(wallet.getByRole('button', { name: 'Потратить' })).toBeDisabled();
});
