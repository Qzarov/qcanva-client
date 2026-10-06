import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

/** Set-once data (race, class, slot counts, recharge...) is edited in setup mode (character-sheet-edit-modes.md). */
async function toSetup(page: Page) {
  await page.locator('.dnd-mode-button').click();
  await expect(page.locator('.dnd-mode-button')).toHaveAttribute('aria-pressed', 'true');
}

async function openSheet(page: Page, identity: { race?: string; className?: string } = {}, theme: 'dark' | 'light' = 'dark') {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', level: 3, race: identity.race ?? '', className: identity.className ?? '' };
  const server = await serveCharacterSheet(page, { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' });
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, theme);
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return server;
}

for (const width of [320, 1280]) {
  test(`race and class are chosen from lists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const server = await openSheet(page);
    await toSetup(page);
    const race = page.getByRole('combobox', { name: 'Раса', exact: true });
    const cls = page.getByRole('combobox', { name: 'Класс', exact: true });

    // Both fit inside the top card next to each other, even on the narrowest phone.
    const card = (await page.locator('.dnd-cs-topcard').boundingBox())!;
    for (const field of [race, cls]) {
      const box = (await field.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(box.width).toBeGreaterThan(40);
    }

    await race.selectOption('Дварф');
    await expect.poll(() => server().data.identity).toMatchObject({ race: 'Дварф' });
    await expect(page.getByLabel('Скорость', { exact: true })).toHaveValue('25');

    await cls.selectOption('Жрец');
    await expect.poll(() => (server().data as any).spellcasting.casterClass).toBe('cleric');
    expect((server().data as any).combat.hitDie).toBe(8);
    await page.getByRole('tab', { name: 'Заклинания', exact: true }).click();
    await expect(page.getByLabel('Заклинательный класс')).toHaveValue('cleric');
    await expect(page.getByRole('group', { name: 'Ячейки 2 уровня' })).toContainText('2/');

    // Something the list does not have is typed in, and is there after a reload.
    await race.selectOption({ label: 'Другая…' });
    const custom = page.getByRole('textbox', { name: 'Раса: свой вариант' });
    await expect(custom).toBeFocused();
    await custom.fill('Табакси');
    await custom.press('Enter');
    await expect.poll(() => (server().data as any).identity.race).toBe('Табакси');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Раса', exact: true }).locator('option:checked')).toHaveText('Табакси');
    await expect(page.getByRole('combobox', { name: 'Класс', exact: true })).toHaveValue('Жрец');
  });
}

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`identity screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await openSheet(page, { race: 'Драконорождённый', className: 'Волшебник' }, theme);
        await page.mouse.move(1, 400);
        await page.locator('.dnd-cs-header').screenshot({ path: `${SHOTS}/identity-${theme}-${width}.png` });
        await page.getByRole('combobox', { name: 'Класс', exact: true }).hover();
        await page.locator('.dnd-cs-header').screenshot({ path: `${SHOTS}/identity-hover-${theme}-${width}.png` });
      });
    }
  }
}
