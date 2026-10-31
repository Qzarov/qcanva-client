/**
 * Dashboard folders with files, and the filter and sort menus (the sidebar's
 * folder tree: dashboard-cleanup.spec.ts). Mocked API (tests/support/fake-dashboard-server.ts), no
 * backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { openDashboardFolder, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

async function openDashboard(page: Page, options: Parameters<typeof serveDashboard>[1] & { width?: number } = {}) {
  await page.setViewportSize({ width: options.width ?? 1280, height: 860 });
  const server = await serveDashboard(page, options);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  return server;
}

async function openFolder(page: Page, options: Parameters<typeof openDashboard>[1] = {}) {
  const server = await openDashboard(page, options);
  await openDashboardFolder(page, 'folder-a');
  await expect(page.locator('[data-dashboard-view="folder"]')).toBeVisible();
  return server;
}

const files = (page: Page) => page.locator('[data-folder-file]');
const desktop = (page: Page, what: 'filter' | 'sort') =>
  page.locator(`.dashboard-toolbar-desktop[data-${what}-menu-trigger], .dashboard-toolbar-desktop [data-${what}-menu-trigger]`).first();
const phone = (page: Page, what: 'filter' | 'sort') =>
  page.locator(`.dashboard-toolbar-mobile[data-${what}-menu-trigger], .dashboard-toolbar-mobile [data-${what}-menu-trigger]`).first();

test.describe('a folder\'s files', () => {
  test('come after the documents as the same cards, newest first, pictures with a preview', async ({ page }) => {
    const { linkRequests } = await openFolder(page);
    await expect(files(page)).toHaveCount(6);
    expect(await page.locator('[data-folder-file] .folder-file-name').allInnerTexts())
      .toEqual(['Море.jpg', 'Отпуск.mp4', 'Кот на окне.png', 'Договор аренды.pdf', 'Панорама.png', 'backup-2026-10.zip']);
    // The same glass card as a document, in the same grid, after it.
    await expect(files(page).first()).toHaveClass(/canvas-card/);
    const grid = page.locator('.folder-manager-body .dash-grid').last();
    await expect(grid.locator('[data-folder-file]')).toHaveCount(6);
    const doc = (await grid.getByText('План поездки').boundingBox())!;
    const firstFile = (await files(page).first().boundingBox())!;
    expect(firstFile.y > doc.y || firstFile.x > doc.x).toBe(true);
    // Pictures under the limit get a preview inside the card; the rest an icon.
    for (const id of ['f-sea', 'f-cat']) {
      await expect(page.locator(`[data-folder-file="${id}"] .folder-file-thumb`)).toBeVisible();
      const card = (await page.locator(`[data-folder-file="${id}"]`).boundingBox())!;
      const thumb = (await page.locator(`[data-folder-file="${id}"] .folder-file-thumb`).boundingBox())!;
      expect(thumb.x).toBeGreaterThan(card.x);
      expect(thumb.x + thumb.width).toBeLessThanOrEqual(card.x + card.width);
    }
    await expect.poll(() => page.locator('[data-folder-file="f-sea"] img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
    for (const id of ['f-huge', 'f-clip', 'f-pdf', 'f-zip']) {
      await expect(page.locator(`[data-folder-file="${id}"] img`)).toHaveCount(0);
      await expect(page.locator(`[data-folder-file="${id}"] .folder-file-kind svg`)).toBeVisible();
    }
    expect(new Set(linkRequests)).toEqual(new Set(['f-sea', 'f-cat']));
    await expect(page.locator('[data-folder-file="f-pdf"] .folder-file-ext')).toHaveText('PDF');
    await expect(page.locator('[data-folder-file="f-pdf"] .folder-file-meta')).toContainText('341.8 KB');
    await expect(page.locator('.folder-manager-count')).toContainText('/ 6 files');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-grid.png` });
  });

  test('a click downloads the file', async ({ page }) => {
    const { downloads } = await openFolder(page);
    await page.locator('[data-folder-file="f-pdf"]').click();
    await expect.poll(() => downloads.includes('f-pdf')).toBe(true);
  });

  test('list view: one row per file, the preview on the left', async ({ page }) => {
    await openFolder(page, { list: true });
    await expect(files(page)).toHaveCount(6);
    await expect(page.locator('[data-folder-file="f-sea"] .folder-file-thumb')).toBeVisible();
    for (const height of await files(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(height).toBeLessThan(64);
    }
    const row = (await page.locator('[data-folder-file="f-sea"]').boundingBox())!;
    const thumb = (await page.locator('[data-folder-file="f-sea"] .folder-file-thumb').boundingBox())!;
    expect(thumb.width).toBeLessThanOrEqual(33);
    expect(thumb.x - row.x).toBeLessThan(24);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-list.png` });
  });

  test('a hub without the Drive shows the documents, no files and no error', async ({ page }) => {
    await openFolder(page, { driveMissing: true });
    await expect(page.locator('.folder-manager-body').getByText('План поездки')).toBeVisible();
    await expect(files(page)).toHaveCount(0);
    await expect(page.locator('[data-folder-files-error]')).toHaveCount(0);
  });
});

test.describe('folder counts', () => {
  test('count the files too: on the home tiles and on a subfolder', async ({ page }) => {
    await openDashboard(page);
    // "Поездки": a canvas and a document, plus six files.
    await expect(page.locator('[data-recent-folder-tile="folder-a"] .subfolder-card-count')).toHaveText('8');
    await expect(page.locator('[data-recent-folder-tile="folder-b"] .subfolder-card-count')).toHaveText('2');
    // A tag filter leaves the files out: they carry no tags.
    await desktop(page, 'filter').click();
    await page.locator('[data-filter-tag="отпуск"]').click();
    await expect(page.locator('[data-recent-folder-tile="folder-a"] .subfolder-card-count')).toHaveText('2');
    await page.locator('[data-filter-reset]').click();
    // A subfolder that holds only files is not "Empty".
    await openDashboardFolder(page, 'folder-a');
    await expect(page.locator('.subfolder-card', { hasText: 'Фото' }).locator('.subfolder-card-count')).toHaveText('2');
  });
});

test.describe('filters and sort', () => {
  test('several types at once, Files among them in a folder; a badge counts what is on', async ({ page }) => {
    await openFolder(page);
    await expect(files(page)).toHaveCount(6);
    await desktop(page, 'filter').click();
    const menu = page.locator('[data-filter-menu]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-filter-type]')).toHaveCount(5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/filter-menu.png` });

    const body = page.locator('.folder-manager-body');
    await menu.locator('[data-filter-type="canvas"] input').check();
    await menu.locator('[data-filter-type="file"] input').check();
    await expect(page.locator('.dashboard-toolbar-desktop [data-filter-count], .dashboard-toolbar-desktop[data-filter-count]').first()).toHaveText('2');
    await expect(body.getByText('Маршрут')).toBeVisible();
    await expect(body.getByText('План поездки')).toHaveCount(0);
    await expect(files(page)).toHaveCount(6);

    // Files alone.
    await menu.locator('[data-filter-type="canvas"] input').uncheck();
    await expect(body.getByText('Маршрут')).toHaveCount(0);
    await expect(files(page)).toHaveCount(6);
    // Without Files, the files go.
    await menu.locator('[data-filter-type="file"] input').uncheck();
    await menu.locator('[data-filter-type="text-document"] input').check();
    await expect(files(page)).toHaveCount(0);
    await expect(body.getByText('План поездки')).toBeVisible();

    // A click elsewhere closes the menu; the filter stays.
    await page.mouse.click(700, 820);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.dashboard-toolbar-desktop [data-filter-count], .dashboard-toolbar-desktop[data-filter-count]').first()).toHaveText('1');
  });

  test('the order from the sort icon: names A to Z puts the files in that order', async ({ page }) => {
    await openFolder(page);
    await expect(files(page)).toHaveCount(6);
    await desktop(page, 'sort').click();
    await expect(page.locator('[data-sort-menu]')).toBeVisible();
    await page.locator('[data-sort-option="title-asc"]').click();
    await expect(page.locator('[data-sort-menu]')).toHaveCount(0);
    await expect.poll(() => page.locator('[data-folder-file] .folder-file-name').allInnerTexts())
      .toEqual(['backup-2026-10.zip', 'Договор аренды.pdf', 'Кот на окне.png', 'Море.jpg', 'Отпуск.mp4', 'Панорама.png']);
  });

  for (const width of [320, 390]) {
    test(`on a phone both icons sit beside the search, and the menus open as sheets in the screen (${width}px)`, async ({ page }) => {
      await openDashboard(page, { width });
      for (const what of ['filter', 'sort'] as const) {
        const box = (await phone(page, what).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await phone(page, 'filter').click();
      const sheet = page.locator('[data-filter-menu]');
      await expect(sheet).toBeVisible();
      const box = (await sheet.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(860);
      expect(box.y + box.height).toBeGreaterThan(860 - 40);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-filter-${width}.png` });
      await sheet.locator('[data-filter-tag="работа"]').click();
      await expect(page.locator('.dashboard-toolbar-mobile [data-filter-count], .dashboard-toolbar-mobile[data-filter-count]').first()).toHaveText('1');
      await page.mouse.click(width / 2, 120);
      await expect(sheet).toHaveCount(0);

      await phone(page, 'sort').click();
      const sortMenu = page.locator('[data-sort-menu]');
      await expect(sortMenu).toBeVisible();
      const sortBox = (await sortMenu.boundingBox())!;
      expect(sortBox.y + sortBox.height).toBeLessThanOrEqual(860);
      expect(sortBox.x + sortBox.width).toBeLessThanOrEqual(width);
    });
  }

  test('on a phone the files fit two columns, names readable beside a preview', async ({ page }) => {
    await openFolder(page, { width: 390 });
    await expect(files(page)).toHaveCount(6);
    await expect(page.locator('[data-folder-file="f-sea"] .folder-file-thumb')).toBeVisible();
    const boxes = await files(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(390);
    }
    expect(new Set(boxes.map((box) => Math.round(box.left))).size).toBe(2);
    const name = page.locator('[data-folder-file="f-sea"] .folder-file-name');
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-folder.png`, fullPage: true });
  });
});
