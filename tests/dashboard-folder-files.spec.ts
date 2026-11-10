/**
 * Dashboard folders with files, and the filter and sort menus (the sidebar's
 * folder tree: dashboard-cleanup.spec.ts). Mocked API (tests/support/fake-dashboard-server.ts), no
 * backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { openDashboardFolder, PNG, serveDashboard } from './support/fake-dashboard-server';

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

/** The folder with the hub's card pictures ready for every file (a video's frame among them). */
async function openFolderWithPictures(page: Page) {
  const server = await openDashboard(page);
  await page.route('http://localhost:3001/api/drive/thumbs/links', async (route) => {
    const { fileIds } = JSON.parse(route.request().postData() || '{}') as { fileIds: string[] };
    await route.fulfill({ json: { links: Object.fromEntries(fileIds.map((id) => [id, { status: 'ready', url: `/api/test-thumb/${id}` }])) } });
  });
  await page.route('http://localhost:3001/api/test-thumb/**', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: PNG }));
  await openDashboardFolder(page, 'folder-a');
  await expect(page.locator('[data-folder-file="f-clip"] [data-folder-file-preview]')).toHaveAttribute('src', /test-thumb\/f-clip/);
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
    // A picture or video without its picture keeps the square: its extension in a loop, a line figure.
    for (const [id, ext] of [['f-huge', 'png'], ['f-clip', 'mp4']] as const) {
      await expect(page.locator(`[data-folder-file="${id}"] img`)).toHaveCount(0);
      const placeholder = page.locator(`[data-folder-file="${id}"] .folder-file-thumb.is-empty [data-file-placeholder]`);
      await expect(placeholder.locator('[data-file-placeholder-text]')).toHaveText(ext);
      await expect(placeholder.locator('[data-file-placeholder-figure]')).toBeVisible();
    }
    // A PDF gets a picture too (its first page, from the hub); until then the drawn one.
    await expect(page.locator('[data-folder-file="f-pdf"] .folder-file-thumb [data-file-placeholder-text]')).toHaveText('pdf');
    // Anything else: no square, the kind's icon, the type and when on one line - no size.
    await expect(page.locator('[data-folder-file="f-zip"] .folder-file-thumb')).toHaveCount(0);
    await expect(page.locator('[data-folder-file="f-zip"] .folder-file-kind svg')).toBeVisible();
    expect(new Set(linkRequests)).toEqual(new Set(['f-sea', 'f-cat']));
    const zipMeta = page.locator('[data-folder-file="f-zip"] .folder-file-meta');
    await expect(zipMeta.locator('.folder-file-ext')).toHaveText('ZIP');
    await expect(zipMeta).not.toContainText('KB');
    await expect(zipMeta).not.toContainText('MB');
    const [ext, date] = [await zipMeta.locator('.folder-file-ext').boundingBox(), await zipMeta.locator('[data-file-date]').boundingBox()];
    expect(Math.abs(ext!.y + ext!.height / 2 - (date!.y + date!.height / 2))).toBeLessThan(4);
    expect(date!.x).toBeGreaterThan(ext!.x + ext!.width);
    await expect(page.locator('.folder-manager-count')).toContainText('/ 6 files');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/folder-grid.png` });
  });

  test('a photo or video card shows when, not how big; hovering a file tells its name, size, type and dates', async ({ page }) => {
    await openFolder(page);
    const sea = page.locator('[data-folder-file="f-sea"]');
    // Media: the date with the time where the size was.
    await expect(sea.locator('.folder-file-meta')).not.toContainText('MB');
    await expect(sea.locator('[data-file-date]')).toHaveText(/\d{1,2}:\d{2}/);
    await expect(page.locator('[data-folder-file="f-clip"] .folder-file-meta')).not.toContainText('MB');
    // Nor anything else: the size is in the hover panel.
    await expect(page.locator('[data-folder-file="f-zip"] .folder-file-meta')).not.toContainText('KB');

    await page.locator('[data-folder-file="f-pdf"]').hover();
    const info = page.locator('[data-file-info]');
    await expect(info).toHaveClass(/visible/);
    await expect(info).toContainText('Договор аренды.pdf');
    await expect(info).toContainText('Size');
    await expect(info).toContainText('341.8 KB');
    await expect(info).toContainText('PDF · application/pdf');
    await expect(info).toContainText('Modified');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/file-info.png` });
    await page.mouse.move(5, 500);
    await expect(info).not.toHaveClass(/visible/);
  });

  test('videos and big or unusual pictures get the card picture the hub made; one still being made comes a moment later', async ({ page }) => {
    await openDashboard(page);
    const asked: string[][] = [];
    let catAsks = 0;
    await page.route('http://localhost:3001/api/drive/thumbs/links', async (route) => {
      const { fileIds } = JSON.parse(route.request().postData() || '{}') as { fileIds: string[] };
      asked.push(fileIds);
      const links: Record<string, unknown> = {};
      for (const id of fileIds) {
        if (id === 'f-cat') links[id] = ++catAsks > 1 ? { status: 'ready', url: `/api/test-thumb/${id}` } : { status: 'pending' };
        else links[id] = { status: 'ready', url: `/api/test-thumb/${id}` };
      }
      await route.fulfill({ json: { links } });
    });
    await page.route('http://localhost:3001/api/test-thumb/**', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: PNG }));
    await openDashboardFolder(page, 'folder-a');
    await expect(page.locator('[data-dashboard-view="folder"]')).toBeVisible();

    // A video: a frame, with a play mark.
    const clip = page.locator('[data-folder-file="f-clip"]');
    await expect(clip.locator('[data-folder-file-preview]')).toHaveAttribute('src', /test-thumb\/f-clip/);
    await expect(clip.locator('[data-folder-file-play]')).toBeVisible();
    // A 40 MB picture, too big to load as it is: the small one.
    await expect(page.locator('[data-folder-file="f-huge"] [data-folder-file-preview]')).toHaveAttribute('src', /test-thumb\/f-huge/);
    // Still being made: the original meanwhile, then the card picture.
    await expect(page.locator('[data-folder-file="f-cat"] [data-folder-file-preview]')).toHaveAttribute('src', /test-thumb\/f-cat/, { timeout: 10000 });
    // Asked in batches, for pictures, videos and documents the hub draws - not for a zip.
    expect(asked.flat()).toContain('f-pdf');
    expect(asked.flat()).not.toContain('f-zip');
    expect(asked[0]!.length).toBeGreaterThan(1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/drive-thumbs.png` });
  });

  test('a click downloads the file', async ({ page }) => {
    const { downloads } = await openFolder(page);
    await page.locator('[data-folder-file="f-pdf"]').click();
    await expect.poll(() => downloads.includes('f-pdf')).toBe(true);
  });

  test('a click on a picture opens it full screen; the arrows go through the folder\'s pictures and videos', async ({ page }) => {
    const { downloads } = await openFolder(page);
    await page.locator('[data-folder-file="f-cat"]').click();
    const viewer = page.locator('[data-media-viewer]');
    await expect(viewer.locator('[data-media-name]')).toHaveText('Кот на окне.png');
    await expect(viewer.locator('[data-media-image]')).toHaveAttribute('data-media-full', 'true');
    // Pictures and videos, in the folder's order: Море, Отпуск (a video), Кот, Панорама; a PDF or a zip is not among them.
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('[data-media-name]')).toHaveText('Панорама.png');
    await expect(viewer.locator('[data-media-next]')).toHaveCount(0);
    await viewer.locator('[data-media-prev]').click();
    await viewer.locator('[data-media-prev]').click();
    await expect(viewer.locator('[data-media-name]')).toHaveText('Отпуск.mp4');
    await expect(viewer.locator('[data-media-image]')).toHaveCount(0);
    await viewer.locator('[data-media-prev]').click();
    await expect(viewer.locator('[data-media-name]')).toHaveText('Море.jpg');
    await viewer.locator('[data-media-close]').click();
    await expect(viewer).toHaveCount(0);

    // Last: the fake hub serves the bytes inline, so the browser goes to them.
    await page.locator('[data-folder-file="f-sea"]').click();
    const before = downloads.filter((id) => id === 'f-sea').length;
    await viewer.locator('[data-media-download]').click();
    await expect.poll(() => downloads.filter((id) => id === 'f-sea').length).toBeGreaterThan(before);
  });

  test('a video plays in the viewer, its frame the poster, and stops when left', async ({ page }) => {
    const { downloads } = await openFolderWithPictures(page);
    // A real one-second WebM, made by the browser itself (no video tools here).
    const webm = await page.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 48 });
      const ctx = canvas.getContext('2d')!;
      const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const draw = () => {
          ctx.fillStyle = `hsl(${(performance.now() - started) / 4}, 80%, 50%)`;
          ctx.fillRect(0, 0, 64, 48);
          if (performance.now() - started < 1000) requestAnimationFrame(draw);
          else resolve();
        };
        draw();
      });
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    await page.route('http://localhost:3001/api/test-bytes/f-clip', (route) =>
      route.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.from(webm, 'base64') }));

    // Its card picture is there: the viewer takes it as the poster.
    await page.locator('[data-folder-file="f-clip"]').click();
    const viewer = page.locator('[data-media-viewer]');
    await expect(viewer.locator('[data-media-name]')).toHaveText('Отпуск.mp4');
    const video = viewer.locator('[data-media-video]');
    await expect(video).toHaveAttribute('src', /\/api\/test-bytes\/f-clip$/);
    await expect(video).toHaveAttribute('poster', /test-thumb\/f-clip/);
    // It plays: the browser read it and the clock moves.
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate((el: HTMLVideoElement) => { el.muted = true; return el.play(); });
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
    // Played, not downloaded: nothing went through the download path.
    expect(downloads).not.toContain('f-clip');
    // The whole stage is the player's, the picture fitted inside.
    const stage = (await viewer.locator('.media-viewer-stage').boundingBox())!;
    const box = (await video.boundingBox())!;
    expect(box.width).toBeGreaterThan(stage.width * 0.9);
    if (SHOTS) {
      await expect.poll(() => viewer.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await page.screenshot({ path: `${SHOTS}/media-viewer-video.png` });
    }

    // On to the next file: the player goes, and its sound with it.
    await viewer.locator('[data-media-next]').click();
    await expect(viewer.locator('[data-media-name]')).toHaveText('Кот на окне.png');
    await expect(viewer.locator('[data-media-video]')).toHaveCount(0);
  });

  test('a video the browser cannot play says so, and downloads from there', async ({ page }) => {
    const { downloads } = await openFolderWithPictures(page);
    // The fake hub hands back a PNG: no browser plays that as a video.
    await page.locator('[data-folder-file="f-clip"]').click();
    const viewer = page.locator('[data-media-viewer]');
    const note = viewer.locator('[data-media-video-note]');
    await expect(note).toContainText('cannot play');
    await expect(note.locator('img')).toHaveAttribute('src', /test-thumb\/f-clip/);
    const before = downloads.filter((id) => id === 'f-clip').length;
    await note.locator('[data-media-video-download]').click();
    await expect.poll(() => downloads.filter((id) => id === 'f-clip').length).toBeGreaterThan(before);
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
  test('count the files and subfolders too: on the home tiles and on a subfolder', async ({ page }) => {
    await openDashboard(page);
    // "Поездки": a canvas and a document, six files, and its subfolder "Фото" as one item.
    await expect(page.locator('[data-recent-folder-tile="folder-a"] .subfolder-card-count')).toHaveText('9');
    await expect(page.locator('[data-recent-folder-tile="folder-b"] .subfolder-card-count')).toHaveText('2');
    // The last change, on a second line on the right.
    const date = page.locator('[data-recent-folder-tile="folder-a"] [data-folder-tile-date]');
    await expect(date).toHaveText(/\d/);
    const nameBox = (await page.locator('[data-recent-folder-tile="folder-a"] .subfolder-card-name').boundingBox())!;
    const tileBox = (await page.locator('[data-recent-folder-tile="folder-a"]').boundingBox())!;
    const dateRight = await date.evaluate((el) => {
      // The text's own width, not the full-width line it sits on.
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().right;
    });
    const dateBox = (await date.boundingBox())!;
    expect(dateBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    expect(tileBox.x + tileBox.width - dateRight).toBeLessThan(20);
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
    // The layout at rest: the folder slides in, so wait for that to finish.
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
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
