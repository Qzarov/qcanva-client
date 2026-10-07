/**
 * "New -> Interactive template": the picker's blocks and the import of a
 * D&D character from a Long Story Short file. Mocked API, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';
import { lssExport } from '../src/dnd/importLongStoryShort.fixture';

const API = 'http://localhost:3001/api/**';
const SHOTS = process.env.SHOT_DIR;

async function openPicker(page: Page, viewport: { width: number; height: number }, theme: 'dark' | 'light' = 'dark') {
  const created: Array<Record<string, any>> = [];
  await page.setViewportSize(viewport);
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('qcanva:lang', 'ru');
    localStorage.setItem('token', 'dash-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', email: 'me@example.com', name: 'Me', role: 'user' }));
  }, theme);
  await page.route(API, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === '/interactive-templates' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      created.push(body);
      return json({ id: 'imported-hero', title: body.title, templateType: body.templateType, data: body.data ?? {}, createdAt: '', updatedAt: '' });
    }
    if (path === '/canvas') return json({ own: [], shared: [], public: [], welcome: null });
    if (path === '/resource-folders') return json({ own: [], shared: [] });
    if (path === '/text-documents' || path === '/text-documents/public') return json({ documents: [] });
    if (path === '/html-documents') return json({ groups: [], documents: [] });
    if (path === '/html-documents/public') return json({ documents: [] });
    if (path === '/interactive-templates') return json({ templates: [] });
    if (path === '/access-requests/incoming') return json([]);
    if (path === '/tags') return json({ tags: [] });
    if (path.startsWith('/recent-resources')) return json([]);
    return json({});
  });
  await page.goto('/dashboard');
  await page.waitForSelector('.app-layout', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  // The "New" menu sits in different places on a phone and on a desktop; the picker is the same.
  await page.evaluate(() => (document.querySelector('.app-layout') as any).__vueParentComponent.setupState.openInteractiveTemplatePicker());
  await expect(page.getByRole('dialog', { name: 'Новый интерактивный шаблон' })).toBeVisible();
  return created;
}

const pickFile = (page: Page, content: string, name = 'Мирра — Long Story Short.json') =>
  page.locator('.template-picker input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content, 'utf-8') });

for (const theme of ['dark', 'light'] as const) {
  test(`the picker offers three blocks and stays inside the screen (${theme})`, async ({ page }) => {
    for (const width of [320, 390, 760, 1280]) {
      await openPicker(page, { width, height: 800 }, theme);
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('.template-picker-tile strong')).toHaveText(['Карточка персонажа D&D', 'Канбан-доска', 'Импорт персонажа D&D']);
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      // A window in the middle of the screen, on a phone too.
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThanOrEqual(2);
      for (const tile of await dialog.locator('.template-picker-tile').all()) {
        const tileBox = (await tile.boundingBox())!;
        expect(tileBox.height).toBeGreaterThanOrEqual(44);
        expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/picker-${theme}-${width}.png` });
    }
  });

  test(`an import is shown before it is created (${theme})`, async ({ page }) => {
    await openPicker(page, { width: 390, height: 800 }, theme);
    await pickFile(page, lssExport());
    const dialog = page.getByRole('dialog', { name: 'Импорт персонажа' });
    await expect(dialog.locator('.template-import-who')).toContainText('Мирра');
    await expect(dialog.locator('.template-import-who')).toContainText('Полуорк · Друид 3 ур.');
    await expect(dialog.locator('[data-import-list="imported"] li')).toHaveCount(7);
    await expect(dialog.locator('[data-import-list="skipped"]')).toContainText('Заклинания (3)');
    const box = (await dialog.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/import-review-${theme}-390.png` });
    await page.setViewportSize({ width: 1280, height: 800 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/import-review-${theme}-1280.png` });
  });
}

test('a confirmed import creates the sheet already filled in and opens it', async ({ page }) => {
  const created = await openPicker(page, { width: 1280, height: 800 });
  await pickFile(page, lssExport());
  await expect(page.getByRole('button', { name: 'Создать персонажа' })).toBeFocused();
  expect(created).toHaveLength(0);

  await page.keyboard.press('Enter');
  await page.waitForURL(/imported-hero/);
  expect(created).toHaveLength(1);
  expect(created[0]!.templateType).toBe('dnd-character');
  expect(created[0]!.title).toBe('Мирра');
  expect(created[0]!.data.identity).toMatchObject({ name: 'Мирра', race: 'Полуорк', className: 'Друид', level: 3 });
  expect(created[0]!.data.combat).toMatchObject({ maxHp: 24, currentHp: 17, armorClass: 12 });
  expect(created[0]!.data.features).toHaveLength(4);
  expect(created[0]!.data.spellcasting.slots.l1).toEqual({ max: 4, spent: 0 });
});

test('a wrong file is refused in words, and the picker stays usable', async ({ page }) => {
  const created = await openPicker(page, { width: 390, height: 800 });
  await pickFile(page, '{"nodes":[],"edges":[]}', 'board.canvas.json');
  await expect(page.getByRole('alert')).toHaveText('Это не персонаж из Long Story Short: в файле нет характеристик.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/import-error-390.png` });

  await pickFile(page, 'oops');
  await expect(page.getByRole('alert')).toHaveText('Файл не читается: это не JSON.');
  expect(created).toHaveLength(0);

  // Escape closes the dialog; nothing was created.
  await page.locator('.template-picker-tile').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the review steps back to the blocks, and another file can be chosen', async ({ page }) => {
  await openPicker(page, { width: 1280, height: 800 });
  await pickFile(page, lssExport());
  await expect(page.getByRole('dialog', { name: 'Импорт персонажа' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Другой файл' }).click();
  await chooser;
  await expect(page.getByRole('dialog', { name: 'Новый интерактивный шаблон' })).toBeVisible();
});
