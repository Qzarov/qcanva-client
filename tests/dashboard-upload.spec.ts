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
  expect(await dialog(page).locator('[data-add-create]').allTextContents()).toEqual(['Canvas', 'HTML', 'Document', 'Template', 'Folder']);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-dialog.png` });
  await dialog(page).locator('[data-add-tab="upload"]').click();
  expect(await dialog(page).locator('[data-add-import]').evaluateAll((els) => els.map((el) => el.getAttribute('data-add-import'))))
    .toEqual(['file', 'canvas', 'html', 'markdown', 'folder']);
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
  await expect(page.locator('[data-download-status]')).toContainText('Files uploaded: 2');
  expect(uploads).toEqual(['/api/drive/folders/folder-b/files', '/api/drive/folders/folder-b/files']);
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
  await dialog(page).locator('[data-import-kind="file"]').click();
  await expect(entry).not.toHaveClass(/bad/);
  await expect(dialog(page).locator('[data-add-submit]')).toHaveText('Upload (1)');
});

test("a folder's Import opens the dialog on uploading, that folder chosen; its + on creating", async ({ page }) => {
  const { uploads } = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await page.locator('.folder-manager-menu:not(.folder-create-menu) .folder-manager-trigger').click();
  await page.locator('[data-folder-import]').click();
  await expect(dialog(page).locator('[data-import-kind="file"]')).toHaveAttribute('aria-checked', 'true');
  await expect(dialog(page).locator('[data-add-folder]')).toHaveValue('folder-a');
  await pick(page, [photo]);
  await dialog(page).locator('[data-add-submit]').click();
  await expect(page.locator('[data-download-status]')).toContainText('Files uploaded: 1');
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
