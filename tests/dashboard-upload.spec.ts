/**
 * "+ Add" (it said "New") and Upload files in its menu: files from the
 * device go into the folder chosen in "Create in", or straight into an open
 * folder from its own "+"; a status bar follows them.
 * Mocked API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { openDashboardFolder, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

async function openDashboard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  // Registered after the fake backend, so it answers first: record the uploads.
  const uploads: string[] = [];
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  return uploads;
}

const files = [
  { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
  { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png') },
];

test('the button says Add, and Upload files sends them into the folder chosen in "Create in"', async ({ page }) => {
  const uploads = await openDashboard(page);
  const button = page.locator('.dashboard-new-menu > .btn-primary');
  await expect(button).toHaveText('Add');
  await button.click();
  const menu = page.locator('.dashboard-new-menu .mobile-action-popover');
  await menu.locator('[data-new-item-folder]').selectOption('folder-b');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-menu.png`, clip: { x: 248, y: 0, width: 600, height: 520 } });

  const chooser = page.waitForEvent('filechooser');
  await menu.locator('[data-new-upload]').click();
  await (await chooser).setFiles(files);

  const status = page.locator('[data-download-status]');
  await expect(status).toHaveAttribute('data-transfer-kind', 'upload');
  await expect(status).toContainText('Files uploaded: 2');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/upload-status.png` });
  expect(uploads).toEqual(['/api/drive/folders/folder-b/files', '/api/drive/folders/folder-b/files']);
});

test("an open folder's own + uploads straight into it", async ({ page }) => {
  const uploads = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await page.locator('[data-folder-create-menu]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-folder-create="upload"]').click();
  await (await chooser).setFiles(files.slice(0, 1));
  await expect(page.locator('[data-download-status]')).toContainText('Files uploaded: 1');
  expect(uploads).toEqual(['/api/drive/folders/folder-a/files']);
});

test('a file the server refuses is counted and said, the rest still go up', async ({ page }) => {
  await openDashboard(page);
  await page.route(/\/api\/drive\/folders\/[^/]+\/files$/, async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || '';
    if (body.includes('photo.png')) return route.fulfill({ status: 413, json: { message: 'Too large' } });
    return route.fulfill({ status: 201, json: { items: [] } });
  });
  await openDashboardFolder(page, 'folder-a');
  await page.locator('[data-folder-create-menu]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-folder-create="upload"]').click();
  await (await chooser).setFiles(files);
  await expect(page.locator('[data-download-status]')).toContainText('Uploaded: 1, failed: 1');
  await expect(page.locator('[data-dashboard-toast]')).toBeVisible();
});
