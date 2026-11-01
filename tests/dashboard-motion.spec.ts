/**
 * The sidebar tree lists an opened folder's files too, without a "Folders"
 * heading of its own; filter and sort sit between New and the search; an
 * empty section offers "+ Add"; the grid/list switch has a sliding thumb;
 * into a folder slides one way, out of it the other.
 * Mocked API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

async function openDashboard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test('the sidebar tree: no "Folders" heading, an opened folder lists subfolders then files', async ({ page }) => {
  await openDashboard(page);
  await page.locator('[data-home-disclosure]').click();
  const tree = page.locator('[data-home-children]');
  await expect(tree).toBeVisible();
  await expect(tree.locator('h2')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-create-folder]')).toHaveCount(0);

  await page.locator('[data-folder-toggle="folder-a"]').click();
  await expect(page.locator('[data-dashboard-folder="folder-photos"]')).toBeVisible();
  const file = tree.locator('[data-sidebar-file^="folder-a/canvas:"]');
  await expect(file).toHaveText('Маршрут');
  await expect(tree.locator('[data-sidebar-file^="folder-a/text-document:"]')).toHaveText('План поездки');
  // The folder's Drive files too: 1 subfolder + 2 documents + 6 files fit under ten.
  await expect(tree.locator('[data-sidebar-file^="folder-a/drive-file:"]')).toHaveCount(6);
  await expect(tree.locator('[data-sidebar-more="folder-a"]')).toHaveCount(0);
  // Subfolder first, then the documents, then the Drive files.
  const rows = await tree.locator('.dashboard-sidebar-folder-row').evaluateAll((els) => els.map((el) => el.textContent?.trim()));
  expect(rows.indexOf('Фото')).toBeLessThan(rows.indexOf('Маршрут'));
  expect(rows.indexOf('Маршрут')).toBeLessThan(rows.indexOf('Море.jpg'));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-files.png`, clip: { x: 0, y: 0, width: 260, height: 640 } });

  // The fake backend has no canvas page, so it bounces back: catch the way there.
  await Promise.all([page.waitForURL(/\/canvas\/c-1$/), file.click()]);
});

test('filter and sort sit between New and the search', async ({ page }) => {
  await openDashboard(page);
  const x = async (selector: string) => (await page.locator(selector).first().boundingBox())!.x;
  const newX = await x('.dashboard-new-menu > .btn-primary');
  const filterX = await x('.dash-toolbar .dashboard-filter-menu');
  const sortX = await x('.dash-toolbar .dashboard-sort-menu');
  const searchX = await x('.dash-search-toolbar-desktop');
  expect(newX).toBeLessThan(filterX);
  expect(filterX).toBeLessThan(sortX);
  expect(sortX).toBeLessThan(searchX);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/toolbar.png`, clip: { x: 248, y: 0, width: 1032, height: 120 } });
});

test('an empty section offers "+ Add", which opens the Add dialog', async ({ page }) => {
  await openDashboard(page);
  const tile = page.locator('[data-feed-add="shared"]');
  // Just "+ Add": no caption saying the section is empty.
  await expect(tile).toHaveText('Add');
  if (SHOTS) {
    await tile.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/add-tile.png` });
  }
  await tile.click();
  await expect(page.locator('[data-add-dialog]')).toBeVisible();
});

test('the grid/list switch slides its thumb to the chosen segment', async ({ page }) => {
  await openDashboard(page);
  const toggle = page.locator('.dashboard-recents .dashboard-recent-view-toggle');
  await expect(toggle).toHaveClass(/has-thumb/);
  const thumbX = () => toggle.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--thumb-x'));
  const before = await thumbX();
  await toggle.locator('[data-view-mode="list"]').click();
  await expect.poll(thumbX).not.toBe(before);
});

test('into a folder slides forward, back out slides back', async ({ page }) => {
  await openDashboard(page);
  const shell = page.locator('.dashboard-shell');
  await page.locator('[data-recent-folder-tile="folder-a"]').click();
  await expect(shell).toHaveClass(/dashboard-nav-forward/);
  await expect(page.locator('[data-dashboard-view="folder"]')).toBeVisible();
  await page.locator('[data-folder-back-button]').click();
  await expect(shell).toHaveClass(/dashboard-nav-back/);
  await expect(page.locator('[data-dashboard-view="recent"]')).toBeVisible();
  // The class only lasts the animation.
  await expect(shell).toHaveClass(/dashboard-nav-none/);
});
