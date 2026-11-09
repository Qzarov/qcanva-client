/**
 * "+ Add" is a dialog: make something new, or bring files in. Importing, the
 * user says what the files are first (files for the Drive, a canvas, an HTML
 * page); each file is checked, and one that is not that kind says so - pick
 * another kind, or send it to the Drive as a plain file. A status bar
 * follows the uploads. Mocked API, no backend needed. Screenshots only when
 * SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { openDashboardFolder, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

async function openDashboard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  // Registered after the fake backend, so these answer first: record what goes up.
  const uploads: string[] = [];
  const created: Array<{ path: string; body: any }> = [];
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.route(/\/api\/text-documents(\/[^/]+\/content)?$/, async (route) => {
    if (!['POST', 'PUT'].includes(route.request().method())) return route.fallback();
    const path = new URL(route.request().url()).pathname;
    created.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { id: 'imported-doc' } });
  });
  await page.route(/\/api\/(canvas|html-documents)$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    created.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { id: path.endsWith('canvas') ? 'imported-canvas' : 'imported-page' } });
  });
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  return { uploads, created };
}

const dialog = (page: Page) => page.locator('[data-add-dialog]');
const pick = async (page: Page, files: Parameters<import('@playwright/test').FileChooser['setFiles']>[0]) => {
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).locator('[data-add-choose]').click();
  await (await chooser).setFiles(files);
};

const photo = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 0, 1]) };
const notes = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') };

test('the Add button opens a dialog: create on one side, upload on the other', async ({ page }) => {
  await openDashboard(page);
  const button = page.locator('[data-add-button]');
  await expect(button).toHaveText('Add');
  await button.click();
  await expect(dialog(page)).toBeVisible();
  expect(await dialog(page).locator('[data-add-create]').allTextContents()).toEqual(['Canvas', 'Document', 'HTML', 'Template', 'Folder']);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-dialog.png` });
  await dialog(page).locator('[data-add-tab="upload"]').click();
  // The tiles swap with a quick fade: wait for the Upload ones.
  await expect(dialog(page).locator('[data-add-import]')).toHaveCount(5);
  expect(await dialog(page).locator('[data-add-import]').evaluateAll((els) => els.map((el) => el.getAttribute('data-add-import'))))
    .toEqual(['file', 'canvas', 'markdown', 'html', 'folder']);
  await expect(dialog(page).locator('[data-add-import="folder"]')).toBeDisabled();
  await expect(dialog(page).locator('[data-add-import="folder"]')).toContainText('In development');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-dialog-upload.png` });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('files go up into the folder chosen in "Where"', async ({ page }) => {
  const { uploads } = await openDashboard(page);
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-b');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="file"]').click();
  await pick(page, [photo, notes]);
  await expect(dialog(page).locator('[data-add-file]')).toHaveCount(2);
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (2)');
  await dialog(page).locator('[data-add-submit]').click();
  await expect(dialog(page)).toHaveCount(0);
  // The uploads panel, as the Drive's: a row a file, each done.
  const panel = page.locator('[data-upload-panel]');
  await expect(panel.locator('.dashboard-upload-item.is-done')).toHaveCount(2);
  await expect(panel.locator('[data-upload-panel-count]')).toHaveText('2/2');
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/upload-panel.png` });
  }
  await panel.locator('[data-upload-hide]').click();
  await expect(panel).toHaveCount(0);
  // Hide clears the finished files: no badge left behind.
  await expect(page.locator('[data-upload-badge]')).toHaveCount(0);
  expect(uploads).toEqual(['/api/drive/folders/folder-b/files', '/api/drive/folders/folder-b/files']);
});

test('the panel folds into a badge, "n/m" files up, and opens again from it', async ({ page }) => {
  await openDashboard(page);
  // Held until the test lets them through: the badge is seen mid-way.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await held;
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-a');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="file"]').click();
  await pick(page, [photo, notes]);
  await dialog(page).locator('[data-add-submit]').click();

  const panel = page.locator('[data-upload-panel]');
  const badge = page.locator('[data-upload-badge]');
  await expect(panel.locator('[data-upload-panel-count]')).toHaveText('0/2');
  // Folded while the files still go up.
  await panel.locator('[data-upload-collapse]').click();
  await expect(panel).toHaveCount(0);
  await expect(badge).toBeVisible();
  await expect(badge.locator('[data-upload-badge-count]')).toHaveText('0/2');
  await expect(badge).toHaveAttribute('aria-label', 'Uploads: 0 of 2');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-badge.png` });

  release();
  await expect(badge.locator('[data-upload-badge-count]')).toHaveText('2/2');
  await expect(badge).toHaveClass(/is-done/);
  await badge.click();
  await expect(panel).toBeVisible();
  await expect(badge).toHaveCount(0);
  await expect(panel.locator('.dashboard-upload-item.is-done')).toHaveCount(2);
});

test('a canvas import catches a file that is not one: pick another kind, or send it as a file', async ({ page }) => {
  const { uploads, created } = await openDashboard(page);
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-a');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="canvas"]').click();
  await pick(page, [
    { name: 'hero.json', mimeType: 'application/json', buffer: Buffer.from('{"name":"Lyra","hp":12}') },
    { name: 'Roadmap.canvas', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[{"id":"a"}],"edges":[]}') },
  ]);
  const bad = dialog(page).locator('[data-add-file="hero.json"]');
  await expect(bad).toHaveClass(/bad/);
  await expect(bad.locator('[data-add-problem]')).toContainText('The file has no canvas nodes or edges.');
  // Only the good one would go: the wrong one is left out until said otherwise.
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (1)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-import-check.png` });
  await bad.locator('[data-add-as-file]').click();
  await expect(bad).not.toHaveClass(/bad/);
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (2)');
  await dialog(page).locator('[data-add-submit]').click();

  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ path: '/api/canvas', body: { title: 'Roadmap', folderId: 'folder-a' } });
  expect(JSON.parse(created[0]!.body.data)).toEqual({ nodes: [{ id: 'a' }], edges: [] });
  await expect.poll(() => uploads).toEqual(['/api/drive/folders/folder-a/files']);
});

test('another kind checks the files again', async ({ page }) => {
  await openDashboard(page);
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="html"]').click();
  await pick(page, [notes]);
  const entry = dialog(page).locator('[data-add-file="notes.txt"]');
  await expect(entry.locator('[data-add-problem]')).toContainText('Does not look like an HTML page.');
  await expect(dialog(page).locator('[data-add-submit]')).toBeDisabled();
  // Another upload tile is another kind: the files are checked again.
  await dialog(page).locator('[data-add-import="file"]').click();
  await expect(dialog(page).locator('[data-add-import="file"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(entry).not.toHaveClass(/bad/);
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (1)');
});

test("a folder's Import opens the dialog on uploading, that folder chosen; its + on creating", async ({ page }) => {
  const { uploads } = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await page.locator('.folder-manager-menu:not(.folder-create-menu) .folder-manager-trigger').click();
  await page.locator('[data-folder-import]').click();
  await expect(dialog(page).locator('[data-add-import="file"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog(page).locator('[data-add-folder]')).toHaveValue('folder-a');
  await pick(page, [photo]);
  await dialog(page).locator('[data-add-submit]').click();
  await expect(page.locator('[data-upload-panel] .dashboard-upload-item.is-done')).toHaveCount(1);
  expect(uploads).toEqual(['/api/drive/folders/folder-a/files']);

  await page.locator('[data-folder-create-menu]').click();
  await expect(dialog(page).locator('[data-add-create="canvas"]')).toBeVisible();
  await expect(dialog(page).locator('[data-add-folder]')).toHaveValue('folder-a');
});

test('a document from Markdown: created, its text as the content', async ({ page }) => {
  const { created } = await openDashboard(page);
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-b');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="markdown"]').click();
  await pick(page, [{ name: 'Plan.md', mimeType: 'text/markdown', buffer: Buffer.from('# Plan\n\n- one\n- two') }]);
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (1)');
  await dialog(page).locator('[data-add-submit]').click();
  await expect.poll(() => created.map((call) => call.path)).toEqual(['/api/text-documents', '/api/text-documents/imported-doc/content']);
  expect(created[0]!.body).toMatchObject({ title: 'Plan', folderId: 'folder-b' });
  expect(created[1]!.body.html).toContain('<h1>Plan</h1>');
  expect(created[1]!.body.html).toContain('<li>two</li>');
  await expect(page).toHaveURL(/\/docs\/imported-doc$/);
});

test('in the glass: the slider centred with a thumb, square tiles; Template and Folder unfold under the tiles', async ({ page }) => {
  await openDashboard(page);
  const folderCalls: Array<{ name: string; parentId: string | null }> = [];
  await page.route(/\/api\/resource-folders$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    folderCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { id: 'new-folder', name: 'Prints' } });
  });
  await page.locator('[data-add-button]').click();
  const box = (await dialog(page).boundingBox())!;
  const tabs = dialog(page).locator('[data-add-tab]').first().locator('..');
  await expect(tabs).toHaveClass(/has-thumb/);
  const tabsBox = (await tabs.boundingBox())!;
  expect(Math.abs((tabsBox.x + tabsBox.width / 2) - (box.x + box.width / 2))).toBeLessThan(3);
  for (const tile of await dialog(page).locator('[data-add-create]').all()) {
    const b = (await tile.boundingBox())!;
    expect(Math.abs(b.width - b.height)).toBeLessThan(2);
  }

  // Template: its kinds right under the tiles, the dialog growing.
  const before = (await dialog(page).boundingBox())!.height;
  await dialog(page).locator('[data-add-create="interactive-template"]').click();
  const templates = dialog(page).locator('[data-add-expand="template"]');
  await expect(templates).toBeVisible();
  await expect(templates.locator('[data-template-type]')).toHaveCount(2);
  await expect.poll(async () => (await dialog(page).boundingBox())!.height).toBeGreaterThan(before + 40);
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/add-dialog-template.png` });
  }

  // Folder: its name and Create, in place of the template step.
  await dialog(page).locator('[data-add-folder]').selectOption('folder-a');
  await dialog(page).locator('[data-add-create="folder"]').click();
  await expect(templates).toHaveCount(0);
  const name = dialog(page).locator('[data-add-name]');
  await expect(name).toBeFocused();
  await name.fill('Prints');
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/add-dialog-folder.png` });
  }
  await name.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => folderCalls).toEqual([{ name: 'Prints', parentId: 'folder-a' }]);
});

test('nothing jumps: the dialog keeps its top through tab changes and unfolding steps, a step set apart from the tiles', async ({ page }) => {
  await openDashboard(page);
  await page.locator('[data-add-button]').click();
  const top = async () => Math.round((await dialog(page).boundingBox())!.y);
  await page.waitForTimeout(300);
  const start = await top();
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await page.waitForTimeout(300);
  expect(await top()).toBe(start);
  await dialog(page).locator('[data-add-tab="create"]').click();
  await dialog(page).locator('[data-add-create="interactive-template"]').click();
  const step = dialog(page).locator('[data-add-expand="template"]');
  await expect(step).toBeVisible();
  await page.waitForTimeout(400);
  expect(await top()).toBe(start);
  // Switching tabs with a step open: it folds away, the top still stays.
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await expect(step).toHaveCount(0);
  expect(await top()).toBe(start);

  // The step is a panel of its own under the tiles: framed, below them.
  await dialog(page).locator('[data-add-tab="create"]').click();
  await dialog(page).locator('[data-add-create="folder"]').click();
  const panel = dialog(page).locator('[data-add-expand="folder"]');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveCSS('border-top-width', '0px');
  const tiles = (await dialog(page).locator('[role="tabpanel"]').boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(tiles.y + tiles.height);
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/add-dialog-step-panel.png` });
  }
});

test('Canvas, Document, HTML are named before they are made', async ({ page }) => {
  const { created } = await openDashboard(page);
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-b');
  await dialog(page).locator('[data-add-create="html-document"]').click();
  const name = dialog(page).locator('[data-add-name]');
  await expect(name).toBeFocused();
  await expect(dialog(page).locator('[data-add-name-create]')).toBeDisabled();
  await name.fill('Отчёт <Q4>');
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/add-dialog-name.png` });
  }
  await name.press('Enter');
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ path: '/api/html-documents', body: { title: 'Отчёт <Q4>', folderId: 'folder-b' } });
  // Its name heads the page, escaped.
  expect(created[0]!.body.html).toBe('<main><h1>Отчёт &lt;Q4&gt;</h1></main>');
});

test('uploads as the Drive shows them: a file a row, its own cancel, why one failed', async ({ page }) => {
  await openDashboard(page);
  // One file the server refuses, one that never finishes (to be cancelled), one that goes up.
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || '';
    if (body.includes('huge.bin')) return route.fulfill({ status: 413, json: { message: 'Too large' } });
    if (body.includes('slow.bin')) return; // never answered: still uploading
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-a');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="file"]').click();
  await pick(page, [
    { name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
    { name: 'slow.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('y') },
    photo,
  ]);
  await dialog(page).locator('[data-add-submit]').click();
  const panel = page.locator('[data-upload-panel]');
  await expect(panel.locator('[data-upload-item="photo.png"]')).toHaveClass(/is-done/);
  await expect(panel.locator('[data-upload-item="huge.bin"] [data-upload-error]')).not.toBeEmpty();
  // Still going: no Hide yet; the slow one is cancelled on its own.
  await expect(panel.locator('[data-upload-hide]')).toHaveCount(0);
  await panel.locator('[data-upload-cancel="slow.bin"]').click();
  await expect(panel.locator('[data-upload-item="slow.bin"]')).toHaveClass(/is-cancelled/);
  await expect(panel.locator('[data-upload-hide]')).toBeVisible();
});

test('a file whose connection dropped goes up again by itself; at most three at a time', async ({ page }) => {
  await openDashboard(page);
  let dropped = 0;
  let inFlight = 0;
  let mostAtOnce = 0;
  const answered: string[] = [];
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || '';
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? '?';
    // The first try of the video loses its connection, as a phone's dark screen does.
    if (name === 'video.mp4' && dropped === 0) {
      dropped += 1;
      return route.abort('connectionreset');
    }
    inFlight += 1;
    mostAtOnce = Math.max(mostAtOnce, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 150));
    inFlight -= 1;
    answered.push(name);
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.locator('[data-add-button]').click();
  await dialog(page).locator('[data-add-folder]').selectOption('folder-a');
  await dialog(page).locator('[data-add-tab="upload"]').click();
  await dialog(page).locator('[data-add-import="file"]').click();
  const files = ['a.bin', 'b.bin', 'c.bin', 'd.bin', 'e.bin'].map((name) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(name) }));
  await pick(page, [{ name: 'video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('v') }, ...files]);
  await dialog(page).locator('[data-add-submit]').click();
  const panel = page.locator('[data-upload-panel]');
  await expect(panel.locator('[data-upload-item="video.mp4"]')).toHaveClass(/is-done/, { timeout: 10000 });
  for (const file of files) await expect(panel.locator(`[data-upload-item="${file.name}"]`)).toHaveClass(/is-done/);
  expect(dropped).toBe(1);
  expect(answered.filter((name) => name === 'video.mp4')).toHaveLength(1);
  expect(mostAtOnce).toBeLessThanOrEqual(3);
});
