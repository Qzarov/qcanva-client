import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

async function openSheet(page: Page, theme: 'dark' | 'light' = 'dark') {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', level: 3 };
  const server = await serveCharacterSheet(page, { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' });
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, theme);
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return server as () => { data: any };
}

for (const width of [320, 1280]) {
  test(`one "+ Добавить" opens the item catalog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);

    // The attacks say how a weapon gets there only when asked.
    await page.getByRole('tab', { name: 'Атаки и умения', exact: true }).click();
    await expect(page.getByText('Нет экипированного оружия')).toBeVisible();
    await page.getByRole('button', { name: /Экипированное оружие/ }).click();
    const hint = page.getByRole('tooltip');
    await expect(hint).toContainText('как экипированное');
    const box = (await hint.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/items-hint-${width}.png` });

    await page.locator('.dnd-mode-button').click();
    await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
    await page.getByRole('button', { name: '+ Добавить', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Добавить в снаряжение' });
    const frame = (await dialog.boundingBox())!;
    expect(frame.x + frame.width).toBeLessThanOrEqual(width);
    // The filter chips wrap inside the dialog instead of pushing it wider.
    for (const chip of await dialog.getByRole('group', { name: 'Что показывать' }).getByRole('button').all()) {
      const chipBox = (await chip.boundingBox())!;
      expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }

    await dialog.getByRole('button', { name: 'Зелья', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Добавить: Рапира' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Добавить: Зелье лечения' }).click();
    await dialog.getByRole('button', { name: 'Добавить: Зелье лечения' }).click();
    await expect(dialog.getByRole('button', { name: 'Добавить: Зелье лечения' })).toContainText('в листе ×2');
    await expect.poll(() => saved().data.equipment.map((item: any) => [item.name, item.quantity])).toEqual([['Зелье лечения', 2]]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/items-catalog-${width}.png` });

    await dialog.getByRole('button', { name: '+ Своё оружие' }).click();
    await expect(dialog).toHaveCount(0);
    const name = page.getByRole('textbox', { name: 'Название предмета' }).last();
    await expect(name).toBeFocused();
    await name.fill('Клинок предков');
    await name.press('Tab');
    await page.getByRole('checkbox', { name: 'Экипировано' }).last().check();
    await expect.poll(() => saved().data.equipment[1]).toMatchObject({ name: 'Клинок предков', equipped: true, weapon: expect.anything() });

    await page.locator('.dnd-mode-button').click();
    await page.getByRole('tab', { name: 'Атаки и умения', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Атака: Клинок предков' })).toBeVisible();
  });
}

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`item catalog screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await openSheet(page, theme);
        await page.locator('.dnd-mode-button').click();
        await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
        await page.getByRole('button', { name: '+ Добавить', exact: true }).click();
        await page.mouse.move(1, 1);
        await page.screenshot({ path: `${SHOTS}/catalog-${theme}-${width}.png` });
        await page.getByRole('dialog').getByRole('button', { name: 'Наборы', exact: true }).click();
        await page.screenshot({ path: `${SHOTS}/catalog-packs-${theme}-${width}.png` });
        await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
        await page.locator('.dnd-mode-button').click();
        await page.getByRole('tab', { name: 'Атаки и умения', exact: true }).click();
        await page.getByRole('button', { name: /Экипированное оружие/ }).click();
        await page.screenshot({ path: `${SHOTS}/hint-${theme}-${width}.png` });
      });
    }
  }
}
