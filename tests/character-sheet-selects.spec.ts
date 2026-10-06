import { expect, test } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { createWeapon } from '../src/dnd/weapons';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

// A select's popup is drawn by the system in the active colour scheme. Its
// options once had a literal dark colour, which was invisible in the dark
// theme wherever the browser honours option styles (Chrome on Windows, Linux
// and Android). Options must be readable in both themes.
for (const theme of ['dark', 'light'] as const) {
  test(`select options are readable in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const data = createDndCharacterSheet() as any;
    data.identity.name = 'Мириэль';
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
    // The weapon and spell parameter selects exist in setup mode (character-sheet-edit-modes.md).
    await page.locator('.dnd-mode-button').click();
    const measure = async (label: string, selector: string) => {
      const result = await page.locator(selector).first().evaluate((select) => {
        const option = select.querySelector('option')!;
        const probe = document.createElement('canvas').getContext('2d')!;
        const rgb = (value: string) => { probe.fillStyle = '#000'; probe.fillStyle = value; probe.fillRect(0, 0, 1, 1); return Array.from(probe.getImageData(0, 0, 1, 1).data); };
        const lum = (c: number[]) => c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
        const style = getComputedStyle(option);
        // A transparent option shows the popup itself: the system Canvas colour of the active colour scheme.
        const canvas = document.createElement('div');
        canvas.style.background = 'Canvas';
        select.parentElement!.appendChild(canvas);
        const system = getComputedStyle(canvas).backgroundColor;
        canvas.remove();
        const bg = rgb(style.backgroundColor)[3] === 0 ? system : style.backgroundColor;
        const a = lum(rgb(style.color)), b = lum(rgb(bg));
        return { color: style.color, background: bg, contrast: ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(1) };
      });
      expect(Number(result.contrast), `${label}: ${result.color} on ${result.background}`).toBeGreaterThanOrEqual(4.5);
    };
    await page.getByRole('tab', { name: 'Умения', exact: true }).click();
    await measure('recharge', '.dnd-cs-recharge select');
    await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
    await measure('weapon', '.dnd-weapon-fields select');
    await page.getByRole('tab', { name: 'Заклинания', exact: true }).click();
    await measure('caster-class', '.dnd-cs-spell-summary select');
    await page.getByRole('button', { name: 'Бросок и урон заклинания' }).click();
    await measure('spell-fields', '.dnd-spell-fields select');
    await page.getByRole('button', { name: 'Короткий отдых', exact: true }).click();
    await measure('hit-die', '.dnd-rest-dice-head select');
  });
}
