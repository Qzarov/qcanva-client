/**
 * A dashboard folder shows its files too (uploaded to the Drive), pictures
 * with a preview. Mocked API, no backend needed. Screenshots only when
 * SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;
const API = 'http://localhost:3001/api/**';
const now = new Date().toISOString();
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
// A 2×2 PNG, served as every picture's content.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBkZGRkZAQAkCwQBXV2gvQAAAABJRU5ErkJggg==', 'base64');

const file = (id: string, name: string, mime: string, sizeBytes: number, updatedAt: string, kind = 'file') => ({
  kind, id, name, mime, sizeBytes, sortDate: updatedAt, updatedAt, ownerId: 'user-1', folderId: 'folder-a',
});
const MEDIA = [
  file('f-sea', 'Море.jpg', 'image/jpeg', 2_400_000, day(1), 'photo'),
  file('f-cat', 'Кот на окне.png', 'image/png', 900_000, day(3), 'photo'),
  file('f-huge', 'Панорама.png', 'image/png', 40_000_000, day(5), 'photo'),
  file('f-clip', 'Отпуск.mp4', 'video/mp4', 80_000_000, day(2), 'video'),
];
const FILES = [
  file('f-pdf', 'Договор аренды.pdf', 'application/pdf', 350_000, day(4)),
  file('f-zip', 'backup-2026-10.zip', 'application/zip', 12_000_000, day(6)),
];

async function openFolder(page: Page, options: { width?: number; list?: boolean; driveMissing?: boolean } = {}) {
  await page.setViewportSize({ width: options.width ?? 1280, height: 860 });
  await page.addInitScript((list) => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'dash-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', email: 'me@example.com', name: 'Me', role: 'user' }));
    if (list) localStorage.setItem('qcanva:dashboard-recents-view:v1', 'list');
  }, Boolean(options.list));
  const linkRequests: string[] = [];
  const downloads: string[] = [];
  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === '/canvas') return json({ own: [], shared: [], public: [], welcome: null });
    if (path === '/resource-folders') {
      return json({
        own: [{ id: 'folder-a', name: 'Поездки', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [{ id: 'doc-1', title: 'План поездки', ownerId: 'user-1', visibility: 'private', createdAt: now, updatedAt: now, folderId: 'folder-a' }] }],
        shared: [],
      });
    }
    if (path === '/text-documents') return json({ documents: [] });
    if (path === '/text-documents/public' || path === '/html-documents/public') return json({ documents: [] });
    if (path === '/html-documents') return json({ groups: [], documents: [] });
    if (path === '/interactive-templates') return json({ templates: [] });
    if (path === '/access-requests/incoming') return json([]);
    if (path === '/tags') return json({ tags: [] });
    if (path === '/drive/folders/folder-a/items') {
      if (options.driveMissing) return json({ message: 'Not found' }, 404);
      const slice = url.searchParams.get('slice');
      return json({ items: slice === 'media' ? MEDIA : slice === 'files' ? FILES : [], nextCursor: null });
    }
    const link = /^\/drive\/files\/([^/]+)\/download-link$/.exec(path);
    if (link) {
      linkRequests.push(link[1]!);
      return json({ url: `/api/test-bytes/${link[1]}`, expiresAt: now });
    }
    if (path.startsWith('/test-bytes/')) {
      downloads.push(path.slice('/test-bytes/'.length));
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    return json({});
  });
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  // The sidebar is a drawer on a phone: open the folder the way the sidebar does.
  await page.evaluate(() => (document.querySelector('.app-layout') as any).__vueParentComponent.setupState.selectFolder('folder-a'));
  await expect(page.locator('[data-dashboard-view="folder"]')).toBeVisible();
  return { linkRequests, downloads };
}

const files = (page: Page) => page.locator('[data-folder-files] [data-folder-file]');

test('a folder lists its files after its documents, newest first, with previews for pictures', async ({ page }) => {
  const { linkRequests } = await openFolder(page);
  await expect(files(page)).toHaveCount(6);
  expect(await page.locator('[data-folder-files] .folder-file-name').allInnerTexts())
    .toEqual(['Море.jpg', 'Отпуск.mp4', 'Кот на окне.png', 'Договор аренды.pdf', 'Панорама.png', 'backup-2026-10.zip']);
  await expect(page.locator('[data-folder-files] .folder-files-count')).toHaveText('6');
  // The documents come first, the files after them.
  const doc = (await page.locator('.dash-grid').getByText('План поездки').boundingBox())!;
  const firstFile = (await files(page).first().boundingBox())!;
  expect(firstFile.y).toBeGreaterThan(doc.y);
  // Pictures under the size limit get a preview; the large one, the video and the rest get an icon.
  await expect(page.locator('[data-folder-file="f-sea"] img[data-folder-file-preview]')).toBeVisible();
  await expect(page.locator('[data-folder-file="f-cat"] img[data-folder-file-preview]')).toBeVisible();
  await expect.poll(() => page.locator('[data-folder-file="f-sea"] img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  for (const id of ['f-huge', 'f-clip', 'f-pdf', 'f-zip']) {
    await expect(page.locator(`[data-folder-file="${id}"] img`)).toHaveCount(0);
    await expect(page.locator(`[data-folder-file="${id}"] svg`)).toBeVisible();
  }
  expect(new Set(linkRequests)).toEqual(new Set(['f-sea', 'f-cat']));
  await expect(page.locator('[data-folder-file="f-pdf"] .folder-file-ext')).toHaveText('PDF');
  await expect(page.locator('[data-folder-file="f-pdf"] .folder-file-meta')).toContainText('341.8 KB');
  await expect(page.locator('.folder-manager-count')).toContainText('/ 6 files');
  if (SHOTS) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SHOTS}/folder-files-grid.png`, fullPage: false });
  }
});

test('a click downloads the file', async ({ page }) => {
  const { downloads } = await openFolder(page);
  await page.locator('[data-folder-file="f-pdf"]').click();
  await expect.poll(() => downloads.includes('f-pdf')).toBe(true);
});

test('search matches file names, and a type filter hides the files', async ({ page }) => {
  await openFolder(page);
  await expect(files(page)).toHaveCount(6);
  await page.evaluate(() => { (document.querySelector('.app-layout') as any).__vueParentComponent.setupState.searchQuery = 'дог'; });
  await expect(files(page)).toHaveCount(1);
  await expect(files(page).first()).toContainText('Договор аренды.pdf');
  await page.evaluate(() => {
    const setup = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
    setup.searchQuery = '';
    setup.contentFilter = 'canvas';
  });
  await expect(page.locator('[data-folder-files]')).toHaveCount(0);
});

test('list view: one row per file with a small preview', async ({ page }) => {
  await openFolder(page, { list: true });
  await expect(page.locator('[data-folder-files]')).toHaveClass(/folder-files--list/);
  const rows = await files(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const height of rows) expect(height).toBeLessThan(64);
  const preview = (await page.locator('[data-folder-file="f-sea"] .folder-file-preview').boundingBox())!;
  expect(preview.width).toBeLessThanOrEqual(41);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-files-list.png` });
});

for (const width of [320, 390]) {
  test(`on a phone the files fit in two columns (${width}px)`, async ({ page }) => {
    await openFolder(page, { width });
    await expect(files(page)).toHaveCount(6);
    const boxes = await files(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
    expect(new Set(boxes.map((box) => Math.round(box.left))).size).toBe(2);
    if (SHOTS) {
      await files(page).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/folder-files-${width}.png` });
    }
  });
}

test('a hub without the Drive shows no files section and no error', async ({ page }) => {
  await openFolder(page, { driveMissing: true });
  await expect(page.locator('.dash-grid').getByText('План поездки')).toBeVisible();
  await expect(page.locator('[data-folder-files]')).toHaveCount(0);
});
