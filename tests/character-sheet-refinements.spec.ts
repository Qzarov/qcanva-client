import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

async function openSheet(page: Page, options: { theme?: 'dark' | 'light'; tabs?: boolean; canvasId?: string } = {}) {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', race: 'Эльф', className: 'Жрец', level: 5 };
  data.abilities.wisdom.score = 16;
  data.spellcasting.casterClass = 'cleric';
  data.spellcasting.ability = 'wisdom';
  data.spellcasting.slots.l1 = { max: 4, spent: 1 };
  data.campaign.canvasId = options.canvasId ?? '';
  const server = await serveCharacterSheet(
    page,
    { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' },
    'owner',
    [{ id: 'c1', title: 'Проклятие Страда' }],
  );
  await page.addInitScript(({ theme, tabs }) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Ярослав', role: 'user' }));
    if (tabs) { localStorage.setItem('qcanva:tabs', '1'); localStorage.setItem('qcanva:tabs-web', '1'); }
  }, { theme: options.theme ?? 'dark', tabs: Boolean(options.tabs) });
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return server;
}

test('a free roll from the header lands in the toasts and in the history panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const server = await openSheet(page, { canvasId: 'c1' });
  // The sheet's own log button is gone: the log is in the history panel.
  await expect(page.locator('.dnd-roll-log-button')).toHaveCount(0);

  const dice = page.getByRole('button', { name: 'Бросок по формуле' });
  await dice.click();
  const menu = page.getByRole('dialog', { name: 'Бросок по формуле' });
  const input = menu.getByLabel('Формула броска');
  await expect(input).toBeFocused();
  await menu.getByRole('button', { name: 'Добавить к6' }).click();
  await menu.getByRole('button', { name: 'Добавить к6' }).click();
  await expect(input).toHaveValue('2d6');
  await input.fill('2d6+3');
  await input.press('Enter');
  // Rolled by the server for a connected sheet, like every other roll.
  await expect.poll(() => server.chat.length).toBe(1);
  expect(server.chat[0]!.spec).toMatchObject({ kind: 'formula', label: '2d6+3', modifier: 3 });
  await expect(page.locator('.dnd-cs-toast').first()).toContainText('Бросок · 2d6+3');
  await expect(menu).toBeVisible(); // stays open for the next roll
  await input.fill('ерунда');
  await input.press('Enter');
  await expect(menu.getByRole('alert')).toContainText('Не получилось разобрать');
  expect(server.chat).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await page.getByTitle('Проверка: Мудрость', { exact: true }).click();
  await page.locator('.dnd-history-button').click();
  const history = page.getByRole('dialog', { name: 'История изменений' });
  await history.getByRole('radio', { name: /^Броски/ }).click();
  await expect(history.getByRole('radio', { name: 'Броски · 2' })).toBeVisible();
  await expect(history.locator('.dnd-roll-list li')).toHaveCount(2);
  await expect(history.locator('.dnd-roll-list li').first()).toContainText('Проверка · Мудрость');
  await expect(history.locator('.dnd-roll-list li').nth(1)).toContainText('Бросок · 2d6+3');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/history-rolls.png`, clip: { x: 320, y: 60, width: 640, height: 520 } });
});

test('switching the mode says so, hides the dice button in setup and brings the sheet in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openSheet(page);
  await expect(page.getByRole('button', { name: 'Бросок по формуле' })).toBeVisible();
  await page.getByRole('button', { name: 'Режим: игра' }).click();
  await expect(page.locator('.template-save-status')).toHaveText('Выбран режим: «Настройка»');
  await expect(page.locator('.template-save-status')).not.toHaveClass(/is-warning/);
  await expect(page.getByRole('button', { name: 'Бросок по формуле' })).toHaveCount(0);
  // The sheet's blocks rise in for a moment, then the class is gone.
  await expect(page.locator('.dnd-cs')).toHaveClass(/dnd-cs-mode-switch/);
  await expect(page.locator('.dnd-cs')).not.toHaveClass(/dnd-cs-mode-switch/, { timeout: 3000 });
  await page.getByRole('button', { name: 'Режим: настройка' }).click();
  await expect(page.locator('.template-save-status')).toHaveText('Выбран режим: «Игра»');
  await expect(page.getByRole('button', { name: 'Бросок по формуле' })).toBeVisible();
});

test('experience for the next level comes from the level', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const server = await openSheet(page);
  const next = page.getByLabel('Опыт до следующего уровня', { exact: true });
  await expect(next).toHaveValue('14000'); // level 5
  await page.getByRole('button', { name: 'Режим: игра' }).click();
  await page.getByLabel('Уровень', { exact: true }).fill('6');
  await page.getByLabel('Уровень', { exact: true }).blur();
  await expect(next).toHaveValue('23000');
  expect((server().data as any).identity.nextLevelExperience).toBe(0); // nothing stored: it keeps following
  await next.fill('20000');
  await next.blur();
  await expect.poll(() => (server().data as any).identity.nextLevelExperience).toBe(20000);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('opening a list with a search does not raise the keyboard, and slot buttons are compact', async ({ page }) => {
    await openSheet(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    // The system's blue tap rectangle is off.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('button')!).getPropertyValue('-webkit-tap-highlight-color'))).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    await page.getByRole('tab', { name: 'Заклинания', exact: true }).tap();
    const minus = (await page.getByRole('button', { name: 'Потратить ячейку 1 уровня' }).boundingBox())!;
    expect(minus.width).toBeLessThanOrEqual(32);
    expect(minus.height).toBeLessThanOrEqual(32);

    await page.getByRole('button', { name: 'Режим: игра' }).tap();
    await page.getByRole('button', { name: '+ Из списка заклинаний' }).tap();
    const catalog = page.getByRole('dialog', { name: 'Заклинания из списка' });
    await expect(catalog.getByRole('button', { name: 'Добавить: Лечение ран' })).toBeVisible();
    await expect(catalog.getByLabel('Поиск заклинания')).not.toBeFocused();
    await expect(catalog.getByRole('button', { name: 'Закрыть список заклинаний' })).toBeFocused();
    await catalog.getByRole('button', { name: 'Закрыть список заклинаний' }).tap();

    await page.getByRole('tab', { name: 'Снаряжение', exact: true }).tap();
    await page.getByRole('button', { name: '+ Оружие из списка' }).tap();
    const weapons = page.getByRole('dialog', { name: 'Оружие из списка' });
    await expect(weapons.getByLabel('Поиск оружия')).not.toBeFocused();
    await weapons.getByRole('button', { name: 'Закрыть список оружия' }).tap();

    await page.locator('[data-account-menu-trigger]').tap();
    await page.locator('.dnd-link-row').tap();
    const link = page.getByRole('dialog', { name: 'Доска для бросков' });
    await expect(link.getByLabel('Поиск канваса')).toBeVisible();
    await expect(link.getByLabel('Поиск канваса')).not.toBeFocused();

    // The mode message is shown by itself where the status is only a dot.
    await link.getByRole('button', { name: 'Закрыть' }).tap();
    await page.getByRole('button', { name: 'Режим: настройка' }).tap();
    await expect(page.getByRole('tooltip')).toHaveText('Выбран режим: «Игра»');
  });

  test('the tabs panel slides in, and a swipe down closes it', async ({ page }) => {
    await openSheet(page, { tabs: true });
    const button = page.locator('.tabs-button').first();
    await button.tap();
    const backdrop = page.locator('.tabs-panel-backdrop');
    const panel = page.locator('.tabs-panel');
    await expect(backdrop).toHaveClass(/is-open/);
    // Slid all the way up.
    await expect.poll(async () => (await panel.boundingBox())!.y + (await panel.boundingBox())!.height).toBeLessThanOrEqual(800.5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tabs-panel.png` });

    const swipe = (distance: number) => panel.evaluate(async (element, dy) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const fire = (type: string, y: number) => {
        const point = new Touch({ identifier: 1, target: element, clientX: x, clientY: y });
        element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [point], changedTouches: [point] }));
      };
      const startY = box.top + 12;
      fire('touchstart', startY);
      for (let step = 1; step <= 6; step += 1) { fire('touchmove', startY + (dy * step) / 6); await new Promise((resolve) => requestAnimationFrame(resolve)); }
      fire('touchend', startY + dy);
    }, distance);

    // A short pull settles back.
    await swipe(30);
    await expect(backdrop).toHaveClass(/is-open/);
    await expect(panel).toBeVisible();
    // A long one lets go.
    await swipe(180);
    await expect(panel).toHaveCount(0, { timeout: 3000 });
    // And it still closes by a tap outside, with the same slide.
    await button.tap();
    await expect(backdrop).toHaveClass(/is-open/);
    await page.touchscreen.tap(195, 60);
    await expect(panel).toHaveCount(0, { timeout: 3000 });
  });

  if (SHOTS) {
    for (const theme of ['dark', 'light'] as const) {
      test(`phone screenshots ${theme}`, async ({ page }) => {
        await openSheet(page, { theme, tabs: true });
        await page.getByRole('button', { name: 'Бросок по формуле' }).tap();
        await page.getByRole('button', { name: 'Добавить к20' }).tap();
        await page.screenshot({ path: `${SHOTS}/quick-roll-${theme}.png`, clip: { x: 0, y: 0, width: 390, height: 300 } });
        await page.keyboard.press('Escape');
        await page.getByRole('tab', { name: 'Заклинания', exact: true }).tap();
        await page.locator('.dnd-cs-tab-panel').screenshot({ path: `${SHOTS}/spell-slots-${theme}.png` });
      });
    }
  }
});
