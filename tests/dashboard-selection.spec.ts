/**
 * Several dashboard items at once: tick them (the box in place of the type
 * icon, Ctrl/Cmd-click, Shift-click, a long press on a phone), then move,
 * pin or delete them all from the bar over the dashboard. Also: the filter
 * menu opens rightwards, never under the sidebar.
 * Mocked API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { openDashboardFolder, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

type Call = { method: string; path: string; body?: unknown };

async function openDashboard(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 860 });
  await serveDashboard(page);
  // Registered after the fake backend, so these answer first: record what the bar sends.
  const calls: Call[] = [];
  await page.route(/\/api\/(resource-folders\/[^/]+\/resources|canvas\/[^/]+|text-documents\/[^/]+)$/, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fallback();
    calls.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON?.() ?? undefined });
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  return calls;
}

const card = (page: Page, key: string) => page.locator(`[data-dashboard-view="folder"] [data-select-key="${key}"]`);

test('tick by the box, then a click ticks instead of opening; Select all; move them all', async ({ page }) => {
  const calls = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  const route = card(page, 'canvas:c-1');
  const plan = card(page, 'text-document:doc-1');

  // The box appears on hover, in the type icon's place.
  await route.hover();
  const box = route.locator('[data-select-box]');
  await expect(box).toBeVisible();
  await expect(route.locator('.resource-title-icon')).toBeHidden();
  await box.click();

  const bar = page.locator('[data-selection-bar]');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-selection-count]')).toHaveText('Selected: 1');
  await expect(route).toHaveAttribute('data-selected', 'true');
  // Every card shows its box now.
  await expect(plan.locator('[data-select-box]')).toBeVisible();

  // While something is ticked, a click ticks.
  await plan.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(bar.locator('[data-selection-count]')).toHaveText('Selected: 2');
  // Both cards of the folder are ticked: nothing left for "Select all".
  await expect(bar.locator('[data-selection-select-all]')).toHaveCount(0);
  // After the bar's entrance, not halfway through it.
  if (SHOTS) await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/selection-bar.png` });

  await bar.locator('[data-selection-move]').click();
  const modal = page.locator('.dashboard-modal');
  await expect(modal.locator('h3')).toHaveText('Move the selection (2)');
  await modal.locator('.folder-destination', { hasText: 'Работа' }).click();
  await modal.locator('.btn-primary').click();
  await expect(bar).toHaveCount(0);
  const moves = calls.filter((call) => call.method === 'PUT');
  expect(moves.map((call) => call.path)).toEqual(['/api/resource-folders/folder-b/resources', '/api/resource-folders/folder-b/resources']);
  expect(moves.map((call) => call.body)).toEqual([
    { resourceType: 'canvas', resourceId: 'c-1' },
    { resourceType: 'text-document', resourceId: 'doc-1' },
  ]);
});

test('Ctrl/Cmd-click ticks; delete them all after one confirmation', async ({ page }) => {
  const calls = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await card(page, 'canvas:c-1').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'text-document:doc-1').click({ modifiers: ['ControlOrMeta'] });
  const bar = page.locator('[data-selection-bar]');
  await expect(bar.locator('[data-selection-count]')).toHaveText('Selected: 2');

  await bar.locator('[data-selection-delete]').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete the selection (2)?');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(calls.filter((call) => call.method === 'DELETE').map((call) => call.path).sort())
    .toEqual(['/api/canvas/c-1', '/api/text-documents/doc-1']);
});

test('Shift-click ticks a range in Recents; Escape clears', async ({ page }) => {
  await openDashboard(page);
  const recents = page.locator('[data-recent-layout] [data-select-key]');
  await expect(recents).toHaveCount(3);
  await recents.nth(0).click({ modifiers: ['ControlOrMeta'] });
  await recents.nth(2).click({ modifiers: ['Shift'] });
  const bar = page.locator('[data-selection-bar]');
  await expect(bar.locator('[data-selection-count]')).toHaveText('Selected: 3');
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('[data-selected]')).toHaveCount(0);
});

test('a long press ticks on a phone, and does not open the card', async ({ page }) => {
  await openDashboard(page, 390);
  const first = page.locator('[data-recent-layout] [data-select-key]').first();
  const box = (await first.boundingBox())!;
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: 'touch', bubbles: true, isPrimary: true };
  await first.dispatchEvent('pointerdown', point);
  await page.waitForTimeout(600);
  await first.dispatchEvent('pointerup', point);
  await first.dispatchEvent('click', point);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('[data-selection-bar] [data-selection-count]')).toHaveText('Selected: 1');
  // After the bar's entrance, not halfway through it.
  if (SHOTS) await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/selection-phone.png` });
});

test('the filter menu opens rightwards, clear of the sidebar', async ({ page }) => {
  await openDashboard(page);
  await page.locator('.dash-toolbar [data-filter-menu-trigger]').click();
  const menu = page.locator('.dash-toolbar [data-filter-menu]');
  await expect(menu).toBeVisible();
  const sidebar = (await page.locator('.dashboard-sidebar').boundingBox())!;
  const popover = (await menu.boundingBox())!;
  expect(popover.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/filter-menu.png`, clip: { x: 0, y: 0, width: 900, height: 520 } });
});
