/**
 * The dashboard without its top panel: Import in "New", tags in Settings,
 * Admin at the end of the sidebar; folders, not groups; the sidebar's folder
 * tree in the sidebar's own colours. Mocked API, no backend needed.
 * Screenshots only when SHOT_DIR is set.
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

test('no panel above the toolbar; Import is in the New menu', async ({ page }) => {
  await openDashboard(page, { admin: true });
  await expect(page.locator('.resource-control-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage tags' })).toHaveCount(0);
  await page.locator('.dashboard-new-menu > .btn-primary').click();
  const menu = page.locator('.dashboard-new-menu .mobile-action-popover');
  await expect(menu.locator('[data-new-import]')).toHaveText('Import');
  // "Group" is a folder now.
  await expect(menu).toContainText('Folder');
  await expect(menu).not.toContainText('Group');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-menu.png`, clip: { x: 248, y: 0, width: 600, height: 420 } });
  const chooser = page.waitForEvent('filechooser');
  await menu.locator('[data-new-import]').click();
  await chooser;
  await expect(menu).toHaveCount(0);
});

test('Admin is the sidebar\'s last item, for admins only', async ({ page }) => {
  await openDashboard(page, { admin: true });
  const nav = page.locator('.dashboard-sidebar-navigation');
  const last = nav.locator(':scope > :is(button, a)').last();
  await expect(last).toHaveAttribute('data-sidebar-admin', '');
  await expect(last).toHaveAttribute('href', '/admin');
  await expect(last).toContainText('Admin');
});

test('a user who is not an admin has no Admin item', async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator('[data-sidebar-admin]')).toHaveCount(0);
});

test('folders, not groups, in the folder menus and dialogs', async ({ page }) => {
  await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await page.locator('.folder-manager-menu:not(.folder-create-menu) .folder-manager-trigger').click();
  const menu = page.locator('.folder-manager-menu:not(.folder-create-menu) .mobile-action-popover');
  await expect(menu).toBeVisible();
  await expect(menu).not.toContainText(/group/i);
});

test.describe('the sidebar\'s folder tree', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`grey like the other items, the open folder in the same accent as a selected item (${theme})`, async ({ page }) => {
      await openDashboard(page, { theme, admin: true });
      // On the home feed the tree is folded under Home's chevron.
      if (!(await page.locator('[data-home-children]').count())) await page.locator('[data-home-disclosure]').click();
      const home = page.locator('[data-home-link]');
      const folderB = page.locator('[data-dashboard-folder="folder-b"]');
      const drive = page.locator('[data-dashboard-section="drive"]');
      const look = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => {
        const s = getComputedStyle(el);
        const icon = el.querySelector('.dashboard-sidebar-icon');
        return { color: s.color, background: s.backgroundImage + ' ' + s.backgroundColor, border: s.borderTopColor, iconColor: icon ? getComputedStyle(icon).color : '', height: el.getBoundingClientRect().height };
      });
      // A folder at rest looks like any item at rest: same text and icon colour.
      const restingFolder = await look(folderB);
      const restingItem = await look(drive);
      expect(restingFolder.color).toBe(restingItem.color);
      expect(restingFolder.iconColor).toBe(restingItem.iconColor);
      expect(restingFolder.height).toBeLessThanOrEqual(38);
      // The tree hangs off a line under Home.
      expect(await page.locator('.dashboard-sidebar-home-children').evaluate((el) => getComputedStyle(el).borderLeftStyle)).toBe('solid');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-home-${theme}.png`, clip: { x: 0, y: 0, width: 260, height: 520 } });

      // Selected: the folder takes exactly the selected item's look.
      await page.mouse.move(700, 700);
      await page.waitForTimeout(300);
      const selectedHome = await look(home);
      await openDashboardFolder(page, 'folder-b');
      await expect(folderB).toHaveClass(/active/);
      // Colours ease in (the items' transition): compare once it has settled.
      await expect.poll(async () => {
        const selectedFolder = await look(folderB);
        return [selectedFolder.background, selectedFolder.border, selectedFolder.color];
      }).toEqual([selectedHome.background, selectedHome.border, selectedHome.color]);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-folder-${theme}.png`, clip: { x: 0, y: 0, width: 260, height: 520 } });
    });
  }
});

test.describe('tags live in Settings', () => {
  test('a Tags section lists them; rename and recolour one, delete another', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    const { tagCalls } = await serveDashboard(page);
    await page.goto('/settings?section=tags');
    const panel = page.locator('[data-settings-tags]');
    await expect(page.locator('[data-settings-section="tags"]')).toHaveAttribute('aria-current', 'page');
    await expect(panel.locator('[data-tag-row]')).toHaveCount(2);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-tags.png` });

    const row = panel.locator('[data-tag-row="отпуск"]');
    await expect(row.locator('[data-tag-save]')).toBeDisabled();
    await row.locator('input').fill('путешествия');
    await row.locator('.tags-settings-color').nth(5).click();
    await row.locator('[data-tag-save]').click();
    await expect.poll(() => tagCalls.find((call) => call.method === 'PUT')).toMatchObject({ name: 'отпуск', body: { name: 'путешествия', color: '#fb464c' } });
    await expect(panel.locator('[data-tag-row="путешествия"]')).toBeVisible();

    await panel.locator('[data-tag-row="работа"] [data-tag-delete]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(panel.locator('[data-tag-row]')).toHaveCount(1);
    expect(tagCalls.some((call) => call.method === 'DELETE' && call.name === 'работа')).toBe(true);
  });

  test('the section is reached from the settings menu, and fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await serveDashboard(page);
    await page.goto('/settings');
    await page.locator('[data-settings-section="tags"]').click();
    await expect(page).toHaveURL(/section=tags/);
    const panel = page.locator('[data-settings-tags]');
    await expect(panel.locator('[data-tag-row]')).toHaveCount(2);
    for (const control of await panel.locator('input, button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-tags-phone.png`, fullPage: true });
  });
});
