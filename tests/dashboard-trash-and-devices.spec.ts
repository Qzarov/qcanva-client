/**
 * Q Space's trash and Q Control moved out of /drive: the trash is a section
 * of the dashboard (the sidebar's "Trash"), Q Control a section of Settings.
 * The old addresses lead there. Mocked API.
 */

import { expect, test, type Page } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

const TRASH = [
  { id: 'f-1', name: 'Отчёт.pdf', mime: 'application/pdf', sizeBytes: 350000, sortDate: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', deletedAt: '2026-11-07T10:00:00Z', ownerId: 'user-1', folderId: 'folder-a' },
  { id: 'f-2', name: 'Море.jpg', mime: 'image/jpeg', sizeBytes: 2000000, sortDate: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z', deletedAt: '2026-11-06T10:00:00Z', ownerId: 'user-1', folderId: 'folder-a' },
];

async function serveTrash(page: Page) {
  const calls: string[] = [];
  await page.route(/http:\/\/localhost:3001\/api\/drive\/(trash|files\/[^/?]+(\/restore)?)(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}${url.search}`);
    if (url.pathname === '/api/drive/trash') return route.fulfill({ json: { items: TRASH, nextCursor: null } });
    if (url.pathname.endsWith('/restore')) return route.fulfill({ json: TRASH[0] });
    return route.fulfill({ json: { success: true } });
  });
  return calls;
}

test('the trash is a section of the dashboard: restore, delete for good', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  const calls = await serveTrash(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });

  await page.locator('.dashboard-sidebar').getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.locator('[data-dashboard-view="trash"]')).toBeVisible();
  await expect(page.locator('[data-trash-item]')).toHaveCount(2);

  await page.locator('[data-trash-restore="f-1"]').click();
  await expect(page.locator('[data-trash-item]')).toHaveCount(1);
  expect(calls).toContain('POST /api/drive/files/f-1/restore');

  await page.locator('[data-trash-delete="f-2"]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-trash-empty]')).toBeVisible();
  expect(calls).toContain('DELETE /api/drive/files/f-2?permanent=true');
});

test('the old trash address opens the dashboard trash', async ({ page }) => {
  await serveDashboard(page);
  await serveTrash(page);
  await page.goto('/drive/trash');
  await expect(page.locator('[data-dashboard-view="trash"]')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('Q Control is a section of Settings; the old address leads there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  await page.goto('/drive/devices');
  await expect(page).toHaveURL(/\/settings\?section=devices/);
  await expect(page.locator('[data-settings-section="devices"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.settings-content [data-devices-view]')).toBeVisible();
  // Its own page header is gone: Settings has the heading.
  await expect(page.locator('.drive-devices-header')).toHaveCount(0);
  await expect(page.locator('.settings-content h2').first()).toHaveText('Q Control');
});
