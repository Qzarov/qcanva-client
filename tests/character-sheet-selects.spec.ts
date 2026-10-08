import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { createWeapon } from '../src/dnd/weapons';
import { serveCharacterSheet } from './support/fake-character-sheet-server';
import { chooseOption, selectControl } from './support/dnd-select';

const SHOTS = process.env.SHOT_DIR;

// The sheet's dropdowns are drawn by the app (DndSelect), not by the system:
// a native <select> popup cannot be styled, and its options once shipped
// invisible in the dark theme. These check the list we draw.
async function openSheet(page: Page, theme: 'dark' | 'light') {
  const data = createDndCharacterSheet() as any;
  data.identity = { ...data.identity, name: 'Мириэль', race: 'Эльф', className: 'Жрец', level: 5 };
  data.features = [{ id: 'f', name: 'Канал', currentUses: 1, maxUses: 2 }];
  data.spells = [{ id: 's', name: 'Щит', level: 1 }];
  data.equipment = [{ id: 'e', name: 'Меч', quantity: 1, equipped: true, weapon: createWeapon() }];
  await serveCharacterSheet(page, { id: 'hero', title: 'x', templateType: 'dnd-character', data, createdAt: '', updatedAt: '' });
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, theme);
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Мириэль');
  // Set-once data is edited in setup mode.
  await page.getByRole('button', { name: 'Режим: игра' }).click();
}

/** WCAG contrast of a text colour on a (possibly translucent) fill over the page colour. */
const contrastOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => {
  const probe = document.createElement('canvas').getContext('2d')!;
  const rgba = (value: string) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = value; probe.fillRect(0, 0, 1, 1); return Array.from(probe.getImageData(0, 0, 1, 1).data); };
  const over = (top: number[], bottom: number[]) => { const a = top[3]! / 255; return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)); };
  const lum = (c: number[]) => c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const pageColour = rgba(getComputedStyle(document.querySelector('.template-page')!).backgroundColor);
  const list = element.closest('[role="listbox"]') as HTMLElement;
  // The list's glass is a tint over a translucent fill; the last background layer is the fill.
  const fill = getComputedStyle(list).backgroundColor;
  let surface = over(rgba(fill), pageColour);
  const own = rgba(getComputedStyle(element).backgroundColor);
  if (own[3]) surface = over(own, surface);
  const a = lum(rgba(getComputedStyle(element).color)), b = lum(surface);
  return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(1));
});

for (const theme of ['dark', 'light'] as const) {
  test(`the sheet's lists are drawn in glass and readable in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSheet(page, theme);
    // No system dropdown is left on the sheet.
    await expect(page.locator('.dnd-cs select')).toHaveCount(0);

    const race = selectControl(page, 'Раса');
    await race.click();
    const list = page.getByRole('listbox', { name: 'Раса', exact: true });
    await expect(list).toBeVisible();
    const style = await list.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { radius: computed.borderRadius, blur: computed.backdropFilter || (computed as any).webkitBackdropFilter };
    });
    expect(style.radius).toBe('14px');
    expect(style.blur).toContain('blur');
    // Under its control, inside the screen, and the chosen option is marked and focused.
    const anchor = (await race.boundingBox())!;
    const box = (await list.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    const chosen = list.getByRole('option', { name: 'Эльф', exact: true });
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await expect(chosen).toBeFocused();
    expect(await contrastOf(page, '[role="listbox"] [role="option"]:not(.is-selected)')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, '[role="listbox"] [role="option"].is-selected')).toBeGreaterThanOrEqual(4.5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/select-race-${theme}.png`, clip: { x: 60, y: 60, width: 760, height: 520 } });

    // Keyboard: Home and the arrows move, Enter chooses, the focus returns to the control.
    // (Jumping by typed letters is covered by the unit test: Playwright types Cyrillic without key events.)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: 'Дварф', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: 'Драконорождённый', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
    await expect(race).toHaveText('Драконорождённый');
    await expect(race).toBeFocused();

    // Escape and a tap outside close it without choosing.
    await race.press('ArrowDown');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(race).toBeFocused();
    await race.click();
    await page.mouse.click(640, 860);
    await expect(list).toHaveCount(0);
    await expect(race).toHaveText('Драконорождённый');
  });
}

test('every list on the sheet opens, fits a phone and takes a choice', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await openSheet(page, 'dark');
  const fits = async (label: string) => {
    const box = (await page.getByRole('listbox', { name: label, exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320.5);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(760.5);
    // Tapped with a thumb.
    expect((await page.getByRole('listbox', { name: label, exact: true }).getByRole('option').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  };
  const pick = async (label: string, option: string) => {
    await selectControl(page, label).click();
    await fits(label);
    await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
    await expect(selectControl(page, label)).toHaveText(option);
  };

  await pick('Класс', 'Волшебник'); // twelve options: the longest list, scrolls inside itself
  await page.locator('.dnd-cs-tabs [data-tab="combat"]').click();
  await pick('Когда восстанавливаются заряды', 'Длинный отдых');
  await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
  await pick('Категория оружия', 'Воинское');
  await page.getByRole('tab', { name: 'Заклинания', exact: true }).click();
  await pick('Заклинательная характеристика', 'Харизма');
  await page.getByRole('button', { name: 'Бросок и урон заклинания' }).click();
  await pick('Бросок заклинания', 'Спасбросок цели');
  await pick('Характеристика спасброска', 'Ловкость');
  // In a dialog too: the list sits above it.
  await page.getByRole('button', { name: 'Короткий отдых', exact: true }).click();
  await chooseOption(page, 'Кость хитов', 'к12');
  await expect(page.getByRole('dialog', { name: 'Короткий отдых' })).toContainText('1d12');
});
