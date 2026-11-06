/**
 * Spaces → Yandex Disk in the dashboard: connecting through Yandex ID, then
 * the Disk's folders and files shown and handled like a dashboard folder
 * (open, rename, tick and delete, upload). Mocked API, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';
import { PNG, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

type Call = { method: string; path: string; query: Record<string, string>; body?: string };
type Item = { path: string; name: string; type: 'dir' | 'file'; size?: number; mediaType?: string; preview?: boolean };

const TREE: Record<string, Item[]> = {
  '/': [
    { path: '/Фото', name: 'Фото', type: 'dir' },
    { path: '/Работа', name: 'Работа', type: 'dir' },
    { path: '/море.jpg', name: 'море.jpg', type: 'file', size: 2_400_000, mediaType: 'image', preview: true },
    { path: '/договор.pdf', name: 'договор.pdf', type: 'file', size: 350_000, mediaType: 'document' },
  ],
  '/Фото': [{ path: '/Фото/IMG_1.jpg', name: 'IMG_1.jpg', type: 'file', size: 1_000_000, mediaType: 'image' }],
  '/Работа': [],
};

const asItem = (item: Item) => ({
  path: item.path,
  name: item.name,
  type: item.type,
  size: item.size ?? null,
  mime: null,
  mediaType: item.mediaType ?? null,
  md5: null,
  createdAt: '2026-11-01T10:00:00Z',
  modifiedAt: '2026-11-02T10:00:00Z',
  publicUrl: null,
  previewUrl: item.preview ? `/api/yandex-disk/preview?path=${encodeURIComponent(item.path)}&size=L&t=tok` : null,
});

async function serveYandex(page: Page, state: { connected: boolean; reconnect?: boolean }) {
  const calls: Call[] = [];
  await page.route(/\/api\/(integrations\/yandex|yandex-disk)(\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const query = Object.fromEntries(url.searchParams.entries());
    calls.push({ method: request.method(), path, query, body: request.postData() ?? undefined });
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });

    if (path === '/integrations/yandex' && request.method() === 'GET') {
      return json({ enabled: true, connected: state.connected, reconnectRequired: Boolean(state.reconnect), login: 'ivan', displayName: 'Иван' });
    }
    if (path === '/integrations/yandex/connect') {
      state.connected = true;
      return json({ url: '/dashboard?space=yandex&yandex=connected' });
    }
    if (!state.connected) return json({ statusCode: 409, code: 'yandex_not_connected', message: 'not connected' }, 409);
    if (path === '/yandex-disk/preview') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (path === '/yandex-disk/items' && request.method() === 'GET') {
      const items = TREE[query.path ?? '/'];
      if (!items) return json({ statusCode: 404, code: 'yandex_DiskNotFoundError', message: 'not found' }, 404);
      return json({ item: asItem({ path: query.path ?? '/', name: 'disk', type: 'dir' }), items: items.map(asItem), total: items.length, offset: 0, limit: 200 });
    }
    if (path === '/yandex-disk/items' && request.method() === 'DELETE') return json({ status: 'done' });
    if (path === '/yandex-disk/download') {
      return json({ href: `https://downloader.disk.yandex.ru/disk/test?filename=${encodeURIComponent(query.path!.slice(1))}&disposition=attachment` });
    }
    if (path === '/yandex-disk/rename') {
      const body = JSON.parse(request.postData() || '{}');
      return json({ status: 'done', path: `/${body.name}` });
    }
    if (path === '/yandex-disk/files' && request.method() === 'PUT') {
      return json(asItem({ path: query.path!, name: query.path!.slice(1), type: 'file', size: 5 }));
    }
    return json({});
  });
  return calls;
}

async function openDashboard(page: Page, state: { connected: boolean; reconnect?: boolean }) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  const calls = await serveYandex(page, state);
  await page.goto('/dashboard');
  return calls;
}

const yandexRow = (page: Page) => page.locator('[data-space="yandex"]');

test('Spaces hold Q Space and Yandex Disk; connecting comes back to the Disk', async ({ page }) => {
  const calls = await openDashboard(page, { connected: false });
  await expect(page.locator('[data-sidebar-spaces]')).toContainText('Spaces');
  await expect(page.locator('[data-space="q"]')).toContainText('Q Space');
  // The old top-level "Drive" row moved into Spaces.
  await expect(page.locator('[data-dashboard-section="drive"]')).toHaveCount(0);

  await yandexRow(page).click();
  const connect = page.locator('[data-yandex-connect]');
  await expect(connect).toContainText('Yandex Disk is not connected');
  await connect.getByRole('button', { name: 'Connect' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  expect(calls.find((call) => call.path === '/integrations/yandex/connect')?.body).toContain('"returnTo":"/dashboard?space=yandex"');
  await expect(page.locator('[data-yandex-file="/море.jpg"]')).toBeVisible();
  await expect(page.getByText('Yandex Disk connected')).toBeVisible();
});

test('the Disk reads like a folder: subfolders, files with previews, the tree in the sidebar', async ({ page }) => {
  await openDashboard(page, { connected: true });
  await yandexRow(page).click();
  await expect(page.locator('[data-yandex-title]')).toHaveText('Yandex Disk');
  await expect(page.locator('[data-yandex-subfolder]')).toHaveCount(2);
  await expect(page.locator('[data-yandex-file]')).toHaveCount(2);
  await expect(page.locator('[data-yandex-file="/море.jpg"] [data-yandex-preview]')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yandex-root.png` });

  await page.locator('[data-yandex-subfolder="/Фото"]').click();
  await expect(page.locator('[data-yandex-title]')).toHaveText('Фото');
  await expect(page.locator('[data-yandex-file="/Фото/IMG_1.jpg"]')).toBeVisible();
  await page.locator('[data-yandex-back]').click();
  await expect(page.locator('[data-yandex-title]')).toHaveText('Yandex Disk');

  await page.locator('[data-yandex-toggle="/"]').click();
  await expect(page.locator('[data-yandex-folder="/Фото"]')).toBeVisible();
  await expect(page.locator('[data-yandex-file="/договор.pdf"]').first()).toBeVisible();
  await page.locator('[data-yandex-folder="/Работа"]').click();
  await expect(page.locator('[data-yandex-title]')).toHaveText('Работа');
  await expect(page.locator('[data-yandex-folder="/Работа"]')).toHaveAttribute('aria-current', 'page');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yandex-tree.png` });
});

test('on a phone the Disk is a folder too, and Spaces are in the drawer', async ({ page }) => {
  await serveDashboard(page);
  await serveYandex(page, { connected: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?space=yandex');
  await expect(page.locator('[data-yandex-file="/море.jpg"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yandex-phone.png` });
  await page.locator('[data-mobile-sidebar-open]').click();
  await expect(page.locator('[data-space="yandex"]')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yandex-phone-drawer.png` });
});

test('a file is renamed from its menu; ticked files go to the trash together', async ({ page }) => {
  const calls = await openDashboard(page, { connected: true });
  await yandexRow(page).click();
  const sea = page.locator('[data-yandex-file="/море.jpg"]');
  await sea.hover();
  await page.locator('[data-yandex-file-menu="/море.jpg"]').click();
  await sea.locator('[data-action="rename"]').click();
  const prompt = page.getByRole('dialog');
  await prompt.locator('input').fill('пляж.jpg');
  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.find((call) => call.path === '/yandex-disk/rename')?.body).toBe('{"path":"/море.jpg","name":"пляж.jpg"}');

  await page.locator('[data-yandex-file="/море.jpg"]').click({ modifiers: ['ControlOrMeta'] });
  await page.locator('[data-yandex-file="/договор.pdf"]').click({ modifiers: ['ControlOrMeta'] });
  const bar = page.locator('[data-selection-bar]');
  await expect(bar.locator('[data-selection-count]')).toHaveText('(2)');
  await bar.locator('[data-selection-delete]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(calls.filter((call) => call.method === 'DELETE').map((call) => call.query.path).sort()).toEqual(['/договор.pdf', '/море.jpg']);
});

test('files are uploaded into the open Disk folder with the dashboard upload panel', async ({ page }) => {
  const calls = await openDashboard(page, { connected: true });
  await yandexRow(page).click();
  await page.locator('[data-yandex-subfolder="/Работа"]').click();
  await page.locator('[data-yandex-file-input]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('[data-upload-panel]')).toContainText('notes.txt');
  await expect.poll(() => calls.find((call) => call.method === 'PUT')?.query.path).toBe('/Работа/notes.txt');
  expect(calls.find((call) => call.method === 'PUT')?.body).toBe('hello');
});

test('a photo opens full screen; the original and the download come from Yandex without our Referer', async ({ page }) => {
  await openDashboard(page, { connected: true });
  // Yandex's downloader answers 403 to a request with another site's Referer.
  const downloaderHits: Array<{ referer: string | undefined; kind: string }> = [];
  await page.route('https://downloader.disk.yandex.ru/**', async (route) => {
    const request = route.request();
    downloaderHits.push({ referer: (await request.headerValue('referer')) ?? undefined, kind: request.resourceType() });
    if (await request.headerValue('referer')) return route.fulfill({ status: 403, body: 'Forbidden' });
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'Content-Disposition': 'attachment; filename="sea.png"' } });
  });
  await yandexRow(page).click();
  await page.locator('[data-yandex-file="/море.jpg"]').click();

  const viewer = page.locator('[data-media-viewer]');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('[data-media-name]')).toHaveText('море.jpg');
  // The preview shows at once, the original takes its place once loaded.
  await expect(viewer.locator('[data-media-image]')).toHaveAttribute('data-media-full', 'true');
  await expect.poll(() => viewer.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await viewer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(5, 5, 6)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/yandex-viewer.png` });

  const download = page.waitForEvent('download');
  await viewer.locator('[data-media-download]').click();
  await download;
  expect(downloaderHits.length).toBeGreaterThanOrEqual(2);
  expect(downloaderHits.every((hit) => hit.referer === undefined)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
});

test('a document that is not a picture still downloads on click', async ({ page }) => {
  await openDashboard(page, { connected: true });
  await page.route('https://downloader.disk.yandex.ru/**', (route) => route.fulfill({
    status: 200, contentType: 'application/pdf', body: 'PDF', headers: { 'Content-Disposition': 'attachment; filename="doc.pdf"' },
  }));
  await yandexRow(page).click();
  const download = page.waitForEvent('download');
  await page.locator('[data-yandex-file="/договор.pdf"]').click();
  await download;
  await expect(page.locator('[data-media-viewer]')).toHaveCount(0);
});

test('access revoked at Yandex: the Disk asks to connect again', async ({ page }) => {
  await openDashboard(page, { connected: false, reconnect: true });
  await yandexRow(page).click();
  await expect(page.locator('[data-yandex-connect]')).toContainText('Access to Yandex Disk was revoked');
  await expect(page.locator('[data-yandex-connect]').getByRole('button', { name: 'Connect again' })).toBeVisible();
});
