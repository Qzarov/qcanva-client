/**
 * The HTML document's top bar follows the editors' common bar (text documents,
 * character sheets): round Back, icon buttons, a "⋮" menu on a phone, and
 * everything inside the screen. Mocked API, no backend needed. Screenshots
 * only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;

async function openDocument(page: Page, options: { width: number; theme?: 'dark' | 'light'; tabs?: boolean; role?: 'owner' | 'read' }) {
  await page.setViewportSize({ width: options.width, height: 700 });
  await page.addInitScript(({ theme, tabs }) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', email: 'u@example.com', name: 'Ярослав', role: 'user' }));
    if (tabs) {
      localStorage.setItem('qcanva:tabs', '1');
      localStorage.setItem('qcanva:tabs-web', '1');
    }
  }, { theme: options.theme ?? 'dark', tabs: Boolean(options.tabs) });
  await page.routeWebSocket('**/socket.io/**', () => {});
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/html-documents/h1') {
      return route.fulfill({ json: { role: options.role ?? 'owner', document: { id: 'h1', title: 'Лендинг весенней кампании', html: '<h1>Привет</h1>', revision: 3, visibility: 'private' } } });
    }
    if (path.endsWith('/permissions')) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/edit/html/h1');
  const bar = page.locator('.html-editor-bar');
  await bar.waitFor();
  await page.evaluate(() => document.fonts.ready);
  return bar;
}

async function expectInside(page: Page, width: number) {
  for (const control of await page.locator('.html-editor-bar :is(a, button, input)').all()) {
    if (!(await control.isVisible())) continue;
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`on a computer: icon buttons, Share and History, the sync pill and Save in one row (${theme})`, async ({ page }) => {
    const bar = await openDocument(page, { width: 1280, theme });
    await expect(bar.locator('.back-btn')).toHaveCSS('border-radius', /999px|50%/);
    const icons = [bar.getByRole('button', { name: 'Preview' }), bar.getByRole('button', { name: 'Source' }), bar.getByRole('button', { name: 'Download' })];
    for (const icon of icons) await expect(icon.locator('svg')).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.locator('.html-history-btn')).toBeVisible();
    await expect(bar.locator('.html-share-btn')).toBeVisible();
    await expect(bar.locator('.html-actions-trigger')).toBeHidden();
    // The title reads as a heading, not a boxed field.
    await expect(bar.locator('.html-title-input')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    // One row: every control on the same line as Back.
    const backBox = (await bar.locator('.back-btn').boundingBox())!;
    for (const control of [...icons, bar.locator('.html-save-btn'), bar.locator('.html-save-state')]) {
      const box = (await control.boundingBox())!;
      expect(Math.abs(box.y + box.height / 2 - (backBox.y + backBox.height / 2))).toBeLessThanOrEqual(2);
    }
    await expectInside(page, 1280);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/html-header-1280-${theme}.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } });

    // Download opens its menu; a click elsewhere closes it.
    await bar.getByRole('button', { name: 'Download' }).click();
    await expect(page.getByRole('menuitem', { name: 'Export PDF' })).toBeVisible();
    await page.locator('.html-title-input').click();
    await expect(page.getByRole('menuitem', { name: 'Export PDF' })).toHaveCount(0);
  });
}

for (const width of [320, 390]) {
  test(`on a phone: Back, the title, the sync dot, Save, account and "⋮" fit (${width}px)`, async ({ page }) => {
    const bar = await openDocument(page, { width });
    await expect(bar.locator('.html-desktop-action').first()).toBeHidden();
    await expect(bar.locator('.html-save-label')).toBeHidden();
    await expect(bar.locator('.html-save-icon')).toBeVisible();
    const dot = (await bar.locator('.html-save-state').boundingBox())!;
    expect(dot.width).toBeLessThanOrEqual(16);
    // The title keeps a readable share of the row.
    expect((await bar.locator('.html-title-input').boundingBox())!.width).toBeGreaterThanOrEqual(width === 320 ? 70 : 120);
    await expectInside(page, width);

    await bar.getByRole('button', { name: 'Document actions' }).click();
    const menu = page.locator('.html-actions-popover');
    const box = (await menu.boundingBox())!;
    // It drops down under the bar, inside the screen.
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(700);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/html-header-${width}-menu.png`, clip: { x: 0, y: 0, width, height: 420 } });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // The dot still opens the sync log, across the screen.
    await bar.locator('.html-save-state').click();
    const log = (await page.locator('.html-sync-popover').boundingBox())!;
    expect(log.x).toBeGreaterThanOrEqual(0);
    expect(log.x + log.width).toBeLessThanOrEqual(width);
  });
}

test('in the app\'s tab mode at 320px the tabs button fits too, and the account menu steps aside', async ({ page }) => {
  const bar = await openDocument(page, { width: 320, tabs: true });
  await expect(bar.locator('.back-group')).toBeVisible();
  await expect(bar.locator('.account-menu')).toBeHidden();
  expect((await bar.locator('.html-title-input').boundingBox())!.width).toBeGreaterThanOrEqual(60);
  await expectInside(page, 320);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/html-header-320-tabs.png`, clip: { x: 0, y: 0, width: 320, height: 120 } });
});

test('a reader sees the title as text and no Save or Source', async ({ page }) => {
  const bar = await openDocument(page, { width: 1280, role: 'read' });
  await expect(bar.locator('.html-title-readonly')).toHaveText('Лендинг весенней кампании');
  await expect(bar.locator('.html-save-btn')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Source' })).toHaveCount(0);
  await expect(bar.locator('.html-share-btn')).toHaveCount(0);
});
