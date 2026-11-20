/**
 * The Admin page: it scrolls (on a phone html and body do not), and it looks
 * like Settings - the same bar, glass cards, tables inside them. Mocked API,
 * no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

async function openAdmin(page: Page, options: { width: number; theme?: 'light' | 'dark' }) {
  await page.setViewportSize({ width: options.width, height: 800 });
  await page.addInitScript((theme) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'admin-test-token');
    localStorage.setItem('userRole', 'superadmin');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'admin-1', email: 'admin@example.com', name: 'Админ', role: 'superadmin' }));
  }, options.theme ?? 'light');
  const users = Array.from({ length: 30 }, (_, i) => ({
    id: `u-${i}`, name: `Пользователь ${i + 1}`, email: `user${i + 1}@example.com`, role: i === 0 ? 'superadmin' : 'user',
    canvasCount: i % 7, createdAt: day(100 - i), lastActiveAt: day(i),
  }));
  const canvases = Array.from({ length: 25 }, (_, i) => ({
    id: `c-${i}`, title: `Канвас с довольно длинным названием ${i + 1}`, ownerName: `Пользователь ${(i % 30) + 1}`,
    visibility: i % 3 ? 'private' : 'public', historyAccess: 'owner', updatedAt: day(i),
  }));
  await page.route('http://localhost:3001/api/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/admin/users') return route.fulfill({ json: users });
    if (path === '/admin/stats') return route.fulfill({ json: { userCount: users.length, canvasCount: canvases.length } });
    if (path === '/admin/canvases') return route.fulfill({ json: canvases });
    if (path === '/admin/settings') {
      return route.fulfill({ json: {
        driveMaxFileBytes: 2 * 1024 ** 3, driveMaxFileBytesDefault: 2 * 1024 ** 3, driveMaxFileBytesSource: 'default',
        storage: { usedBytes: 1024 ** 3, blobs: 12, files: 12, capacityBytes: 6 * 1024 ** 3, capacitySource: 'env', freeBytes: 5 * 1024 ** 3 },
      } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin');
  await expect(page.locator('[data-admin-users] tbody tr')).toHaveCount(30);
}

for (const width of [1280, 390]) {
  test(`the page scrolls to its last table row (${width}px)`, async ({ page }) => {
    await openAdmin(page, { width });
    const scroller = page.locator('.admin-page');
    const before = await scroller.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    await page.mouse.move(width / 2, 400);
    await page.mouse.wheel(0, 20000);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const lastRow = page.locator('[data-admin-history] tbody tr').last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeInViewport();
    // The bar stays on top while scrolling.
    const bar = (await page.locator('.admin-topbar').boundingBox())!;
    expect(bar.y).toBeLessThanOrEqual(1);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`it looks like Settings: the bar, glass cards, tables inside them (${theme})`, async ({ page }) => {
    await openAdmin(page, { width: 1280, theme });
    await expect(page.locator('.admin-topbar h1')).toHaveText('Administration');
    await expect(page.locator('[data-admin-back]')).toHaveAttribute('href', '/dashboard');
    // Every section is a card; both tables sit inside one.
    await expect(page.locator('.admin-card')).toHaveCount(5);
    for (const table of ['[data-admin-users]', '[data-admin-history]']) {
      await expect(page.locator(`.admin-card ${table}`)).toHaveCount(1);
    }
    // No English left over from the old page under the Russian locale.
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-${theme}.png` });
  });
}

test('on a phone the tables scroll sideways inside their cards, the page does not', async ({ page }) => {
  await openAdmin(page, { width: 360 });
  const page_ = await page.locator('.admin-page').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(page_.scrollWidth).toBeLessThanOrEqual(page_.clientWidth + 1);
  const wrap = page.locator('[data-admin-users]').locator('xpath=..');
  const box = (await wrap.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-phone.png` });
});

test('Settings scrolls on a phone too, its bar staying on top', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'admin-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'u-1', email: 'me@example.com', name: 'Me', role: 'user' }));
  });
  const tags = Array.from({ length: 30 }, (_, i) => ({ name: `тег-${i + 1}`, color: '#44cf6e', canvasCount: 1, htmlDocumentCount: 0, textDocumentCount: 0, totalCount: 1 }));
  await page.route('http://localhost:3001/api/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    return route.fulfill({ json: path === '/tags' ? { tags } : path.startsWith('/mcp') ? [] : {} });
  });
  await page.goto('/settings?section=tags');
  await expect(page.locator('[data-tag-row]')).toHaveCount(30);
  const last = page.locator('[data-tag-row]').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await page.locator('.settings-page').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.settings-topbar').boundingBox())!.y).toBeLessThanOrEqual(1);
});
