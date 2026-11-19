/**
 * A folder shared with the user shows in their sidebar as soon as it is
 * shared - also when it holds only files (photos, videos) or only
 * subfolders: the tree used to keep a shared folder only when it had QCanva
 * documents in it. Mocked API, no backend.
 */

import { expect, test, type Page } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

async function serveSharedFolders(page: Page) {
  await page.route('http://localhost:3001/api/resource-folders', (route) => route.fulfill({
    status: 200,
    json: {
      own: [{ id: 'folder-a', name: 'Поездки', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] }],
      shared: [
        // Photos only: no QCanva documents in it.
        { id: 'shared-photos', name: 'Фото Ани', role: 'viewer', parentId: 'their-root', canvases: [], htmlDocuments: [], textDocuments: [] },
        // Only a subfolder, and that one empty.
        { id: 'shared-work', name: 'Общая работа', role: 'editor', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [] },
        { id: 'shared-work-sub', name: 'Черновики', role: 'editor', parentId: 'shared-work', canvases: [], htmlDocuments: [], textDocuments: [], inherited: true },
      ],
    },
  }));
}

for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]] as const) {
  test(`${name}: a folder shared with the user shows in the sidebar even with no documents in it`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serveDashboard(page);
    await serveSharedFolders(page);
    await page.goto('/dashboard');
    await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
    // On the home feed too, as a top folder - its parent is the owner's, not theirs.
    await expect(page.locator('[data-recent-folder-tile="shared-photos"]')).toBeVisible();
    await expect(page.locator('[data-recent-folder-tile="shared-work"]')).toBeVisible();
    await expect(page.locator('[data-recent-folder-tile="shared-work-sub"]')).toHaveCount(0);
    if (name === 'phone') await page.locator('[data-mobile-sidebar-open]').click();
    await page.getByRole('button', { name: 'Show folders' }).click();
    await expect(page.locator('[data-dashboard-folder="shared-photos"]')).toBeVisible();
    await expect(page.locator('[data-dashboard-folder="shared-work"]')).toBeVisible();
    await page.locator('[data-dashboard-folder="shared-photos"]').click();
    await expect(page.locator('[data-dashboard-view="folder"]')).toBeVisible();
  });
}
