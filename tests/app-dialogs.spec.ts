/**
 * The app's own confirm / alert / prompt in place of the browser's: no
 * system dialog may appear, and the app's one looks and behaves like the
 * character sheet's dialogs. Mocked API, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';
const SHOTS = process.env.SHOT_DIR;
const now = new Date().toISOString();

async function openDashboard(page: Page, viewport: { width: number; height: number }, theme: 'dark' | 'light' = 'dark') {
  const deleted: string[] = [];
  const systemDialogs: string[] = [];
  page.on('dialog', (dialog) => { systemDialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.setViewportSize(viewport);
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('qcanva:locale', 'ru');
    localStorage.setItem('token', 'dash-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', email: 'me@example.com', name: 'Me', role: 'user' }));
  }, theme);
  await page.route(API, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) => route.fulfill({ json: body });
    if (route.request().method() === 'DELETE') { deleted.push(path); return json({ deleted: true }); }
    if (path === '/canvas') return json({ own: [{ id: 'c-1', title: 'План кампании', ownerId: 'user-1', createdAt: now, updatedAt: now }], shared: [], public: [], welcome: null });
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
  return { deleted, systemDialogs };
}

const dashboard = (page: Page, call: string) => page.evaluate((code) => {
  const state = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
  // Not awaited: the action waits for the dialog to be answered.
  void new Function('state', `return ${code}`)(state);
}, call);

for (const theme of ['dark', 'light'] as const) {
  test(`deleting asks in the app's own dialog, in the middle of the screen (${theme})`, async ({ page }) => {
    for (const width of [320, 390, 1280]) {
      const { deleted, systemDialogs } = await openDashboard(page, { width, height: 800 }, theme);
      await dashboard(page, `state.deleteCanvas({ id: 'c-1', title: 'План кампании' })`);
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading')).toHaveText('Удалить канвас «План кампании»?');
      await expect(dialog.getByRole('button')).toHaveText(['Отмена', 'Удалить']);
      // A destructive question: Enter must not delete by itself.
      await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThanOrEqual(2);
      for (const button of await dialog.getByRole('button').all()) {
        const size = (await button.boundingBox())!;
        expect(size.height).toBeGreaterThanOrEqual(40);
        expect(size.x).toBeGreaterThanOrEqual(box.x);
        expect(size.x + size.width).toBeLessThanOrEqual(box.x + box.width);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/confirm-delete-${theme}-${width}.png` });

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(deleted).toEqual([]);
      expect(systemDialogs).toEqual([]);
    }
  });
}

test('the answer decides: nothing is deleted on Cancel or the backdrop, the canvas goes on "Удалить"', async ({ page }) => {
  const { deleted, systemDialogs } = await openDashboard(page, { width: 1280, height: 800 });
  const dialog = page.getByRole('alertdialog');

  await dashboard(page, `state.deleteCanvas({ id: 'c-1', title: 'План кампании' })`);
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);

  await dashboard(page, `state.deleteCanvas({ id: 'c-1', title: 'План кампании' })`);
  await page.mouse.click(20, 20);
  await expect(dialog).toHaveCount(0);
  expect(deleted).toEqual([]);

  await dashboard(page, `state.deleteCanvas({ id: 'c-1', title: 'План кампании' })`);
  // Tab stays inside the dialog.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Удалить' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => deleted).toEqual(['/canvas/c-1']);
  expect(systemDialogs).toEqual([]);
});

test('the question before leaving the app and a group delete with a note', async ({ page }) => {
  const { systemDialogs } = await openDashboard(page, { width: 390, height: 800 });
  const dialog = page.getByRole('alertdialog');

  await dashboard(page, `state.deleteFolder({ id: 'f-1', name: 'Работа' })`);
  await expect(dialog.getByRole('heading')).toHaveText('Удалить группу «Работа»?');
  await expect(dialog.locator('p')).toHaveText('Её материалы останутся и окажутся вне групп.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/confirm-group-dark-390.png` });
  await page.keyboard.press('Escape');

  // What the Android Back button asks on the dashboard's home (see main.ts).
  const answer = page.evaluate(async () => {
    const { confirmDialog } = await import('/src/composables/appDialog.ts');
    const { useI18n } = await import('/src/composables/useI18n.ts');
    const { t } = useI18n();
    return confirmDialog({ title: t('exitAppTitle'), confirmLabel: t('exitAppConfirm') });
  });
  await expect(dialog.getByRole('heading')).toHaveText('Выйти из QCanva?');
  await expect(dialog.getByRole('button')).toHaveText(['Отмена', 'Выйти']);
  await expect(dialog.getByRole('button', { name: 'Выйти' })).toBeFocused();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/exit-dark-390.png` });
  await page.keyboard.press('Enter');
  expect(await answer).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect(systemDialogs).toEqual([]);
});

test('a line of text is asked in the same dialog', async ({ page }) => {
  await openDashboard(page, { width: 390, height: 800 }, 'light');
  const answer = page.evaluate(async () => {
    const { promptText } = await import('/src/composables/appDialog.ts');
    return promptText('groupNameTitle', 'save', 'Работа');
  });
  const dialog = page.getByRole('dialog', { name: 'Название группы' });
  const field = dialog.getByRole('textbox');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Работа');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/prompt-light-390.png` });
  await field.fill('');
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  await field.fill('  Дом ');
  await page.keyboard.press('Enter');
  expect(await answer).toBe('Дом');
});
