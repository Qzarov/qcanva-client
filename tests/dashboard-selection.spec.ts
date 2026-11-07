/**
 * Several dashboard items at once: tick them (the box in place of the type
 * icon, Ctrl/Cmd-click, Shift-click, a long press on a phone), then move,
 * download (one zip) or delete them all from the bar over the dashboard.
 * Also: the filter menu opens rightwards, never under the sidebar.
 * Mocked API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openDashboardFolder, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

type Call = { method: string; path: string; body?: unknown };

async function openDashboard(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 860 });
  await serveDashboard(page);
  // Registered after the fake backend, so these answer first: record what the bar sends.
  const calls: Call[] = [];
  await page.route(/\/api\/(resource-folders\/[^/]+\/resources|canvas\/[^/]+|text-documents\/[^/]+|drive\/files\/[^/]+)$/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/drive/files/') && !['PATCH', 'DELETE'].includes(request.method())) return route.fallback();
    if (request.method() === 'GET') {
      // What a download fetches.
      if (path === '/api/canvas/c-1') return route.fulfill({ json: { canvas: { id: 'c-1', data: '{"nodes":[{"id":"n1"}],"edges":[]}' }, role: 'owner' } });
      if (path === '/api/text-documents/doc-1') return route.fulfill({ json: { document: { id: 'doc-1', title: 'План поездки', snapshot: { html: '<p>Лиссабон</p>' } }, role: 'owner' } });
      return route.fallback();
    }
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
  await expect(bar.locator('[data-selection-count]')).toHaveText('(1)');
  await expect(route).toHaveAttribute('data-selected', 'true');
  // Every card shows its box now.
  await expect(plan.locator('[data-select-box]')).toBeVisible();

  // While something is ticked, a click ticks.
  await plan.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(bar.locator('[data-selection-count]')).toHaveText('(2)');
  // The folder's Drive files are not ticked yet: "Select all" is there for them.
  await expect(bar.locator('[data-selection-select-all]')).toHaveCount(1);
  // No bulk pin.
  await expect(bar.locator('[data-selection-pin]')).toHaveCount(0);
  // Icons only, clear on the left: clear | (N) | move, download, delete.
  await expect(bar.locator('[data-selection-move]')).toHaveText('');
  await expect(bar.locator('[data-selection-move]')).toHaveAttribute('aria-label', 'Move');
  expect(await bar.locator('button').evaluateAll((els) => els.map((el) => Object.keys((el as HTMLElement).dataset)[0])))
    .toEqual(['selectionClear', 'selectionSelectAll', 'selectionMove', 'selectionDownload', 'selectionDelete']);
  for (const button of await bar.locator('button').all()) expect((await button.textContent())?.trim()).toBe('');
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

test('the box of a document ticks it, though the card is one big open link', async ({ page }) => {
  await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  const plan = card(page, 'text-document:doc-1');
  await plan.hover();
  // A real click at the box: it used to land on the card's open link.
  await plan.locator('[data-select-box]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(plan).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-selection-bar] [data-selection-count]')).toHaveText('(1)');
});

/** How many tickable cards a frame from `a` to `b` touches. */
const touchedBy = (page: Page, a: { x: number; y: number }, b: { x: number; y: number }) => page.evaluate(([from, to]) => {
  const left = Math.min(from.x, to.x); const right = Math.max(from.x, to.x);
  const top = Math.min(from.y, to.y); const bottom = Math.max(from.y, to.y);
  return Array.from(document.querySelectorAll('[data-select-key]')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom;
  }).length;
}, [a, b] as const);

test('a frame drawn from an empty spot ticks every card it touches; with Shift it adds', async ({ page }) => {
  await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  const plan = (await card(page, 'text-document:doc-1').boundingBox())!;
  const route = (await card(page, 'canvas:c-1').boundingBox())!;
  const bottom = Math.max(plan.y + plan.height, route.y + route.height);
  // From the empty space under the cards, up over both of them.
  const start = { x: Math.min(plan.x, route.x) + 10, y: bottom + 260 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y - 80, { steps: 4 });
  await expect(page.locator('[data-marquee]')).toBeVisible();
  const end = { x: Math.max(plan.x + plan.width, route.x + route.width) - 10, y: Math.min(plan.y, route.y) + 20 };
  await page.mouse.move(end.x, end.y, { steps: 8 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/marquee.png` });
  // Documents and the Drive files on the way, all of them.
  const touched = await touchedBy(page, start, end);
  expect(touched).toBeGreaterThan(2);
  await page.mouse.up();
  await expect(page.locator('[data-marquee]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('[data-selection-bar] [data-selection-count]')).toHaveText(`(${touched})`);

  // A new frame over one column starts over...
  const routeFrom = { x: route.x + route.width / 2, y: bottom + 200 };
  const routeTo = { x: route.x + route.width / 2 + 5, y: route.y + route.height - 10 };
  const routeColumn = await touchedBy(page, routeFrom, routeTo);
  await page.mouse.move(routeFrom.x, routeFrom.y);
  await page.mouse.down();
  await page.mouse.move(routeTo.x, routeTo.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-selection-bar] [data-selection-count]')).toHaveText(`(${routeColumn})`);
  await expect(card(page, 'canvas:c-1')).toHaveAttribute('data-selected', 'true');
  await expect(card(page, 'text-document:doc-1')).not.toHaveAttribute('data-selected', 'true');
  // ...with Shift it adds.
  const planFrom = { x: plan.x + plan.width / 2, y: bottom + 200 };
  const planTo = { x: plan.x + plan.width / 2 + 5, y: plan.y + plan.height - 10 };
  const planColumn = await touchedBy(page, planFrom, planTo);
  await page.keyboard.down('Shift');
  await page.mouse.move(planFrom.x, planFrom.y);
  await page.mouse.down();
  await page.mouse.move(planTo.x, planTo.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('[data-selection-bar] [data-selection-count]')).toHaveText(`(${routeColumn + planColumn})`);
  await expect(card(page, 'text-document:doc-1')).toHaveAttribute('data-selected', 'true');
});

test('no "Pinned" plate on cards: the star says it', async ({ page }) => {
  await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await expect(page.locator('.badge-pinned')).toHaveCount(0);
});

test('Ctrl/Cmd-click ticks; delete them all after one confirmation', async ({ page }) => {
  const calls = await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await card(page, 'canvas:c-1').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'text-document:doc-1').click({ modifiers: ['ControlOrMeta'] });
  const bar = page.locator('[data-selection-bar]');
  await expect(bar.locator('[data-selection-count]')).toHaveText('(2)');

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
  // Opened and created items alike: at least the three ticked below.
  await expect.poll(() => recents.count()).toBeGreaterThanOrEqual(3);
  await recents.nth(0).click({ modifiers: ['ControlOrMeta'] });
  await recents.nth(2).click({ modifiers: ['Shift'] });
  const bar = page.locator('[data-selection-bar]');
  await expect(bar.locator('[data-selection-count]')).toHaveText('(3)');
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('[data-selected]')).toHaveCount(0);
});

test('download them all as one zip, with a status bar', async ({ page }) => {
  await openDashboard(page);
  await openDashboardFolder(page, 'folder-a');
  await card(page, 'canvas:c-1').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'text-document:doc-1').click({ modifiers: ['ControlOrMeta'] });

  const downloading = page.waitForEvent('download');
  await page.locator('[data-selection-download]').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^qcanva-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(files).sort()).toEqual(['Маршрут.canvas', 'План поездки.html']);
  expect(JSON.parse(strFromU8(files['Маршрут.canvas']!))).toEqual({ nodes: [{ id: 'n1' }], edges: [] });
  expect(strFromU8(files['План поездки.html']!)).toContain('<p>Лиссабон</p>');

  const status = page.locator('[data-download-status]');
  await expect(status).toContainText('Archive downloaded');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/download-status.png` });
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a real long press ticks a card, opens nothing, and the next tap still works', async ({ page }) => {
    await openDashboard(page, 390);
    const cards = page.locator('[data-recent-layout] [data-select-key]');
    const box = (await cards.first().boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // Real touches through the browser, not synthetic events.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page).toHaveURL(/\/dashboard$/);
    const count = page.locator('[data-selection-bar] [data-selection-count]');
    await expect(count).toHaveText('(1)');
    // A plain tap on another card now ticks it too.
    await cards.nth(1).tap();
    await expect(count).toHaveText('(2)');
    await expect(page).toHaveURL(/\/dashboard$/);
    if (SHOTS) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/selection-phone.png` });
    }
  });
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

test('Drive files in a folder tick like the rest: box, frame, and move / delete / download them all', async ({ page }) => {
  // Four columns: the frame below spans two of them across two rows.
  const calls = await openDashboard(page, 1200);
  await openDashboardFolder(page, 'folder-a');
  const pdf = page.locator('[data-select-key="drive-file:f-pdf"]');
  await pdf.hover();
  await expect(pdf.locator('.folder-file-kind')).toBeHidden();
  await pdf.locator('[data-select-box]').click();
  await expect(pdf).toHaveAttribute('data-selected', 'true');
  const count = page.locator('[data-selection-bar] [data-selection-count]');
  await expect(count).toHaveText('(1)');
  // A file's click ticks too, while something is ticked: nothing downloads.
  await page.locator('[data-select-key="drive-file:f-cat"]').click();
  await expect(count).toHaveText('(2)');
  await page.keyboard.press('Escape');

  // The frame takes documents and files alike.
  const plan = (await card(page, 'text-document:doc-1').boundingBox())!;
  const doc = (await page.locator('[data-select-key="drive-file:f-pdf"]').boundingBox())!;
  await page.mouse.move(plan.x + 10, doc.y + doc.height + 200);
  await page.mouse.down();
  await page.mouse.move(doc.x + doc.width - 10, plan.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(count).toHaveText('(4)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/selection-drive.png` });

  // Download: the files go into the zip as they are.
  const downloading = page.waitForEvent('download');
  await page.locator('[data-selection-download]').click();
  const zip = unzipSync(new Uint8Array(await readFile(await (await downloading).path())));
  expect(Object.keys(zip).sort()).toEqual(['Договор аренды.pdf', 'Кот на окне.png', 'Маршрут.canvas', 'План поездки.html']);
  expect(zip['Кот на окне.png']![0]).toBe(0x89);

  // Move and delete, a document and a file together.
  await card(page, 'text-document:doc-1').click({ modifiers: ['ControlOrMeta'] });
  await page.locator('[data-select-key="drive-file:f-pdf"]').click({ modifiers: ['ControlOrMeta'] });
  await expect(count).toHaveText('(2)');
  await page.locator('[data-selection-move]').click();
  const modal = page.locator('.dashboard-modal');
  await modal.locator('.folder-destination', { hasText: 'Работа' }).click();
  await modal.locator('.btn-primary').click();
  await expect.poll(() => calls.filter((call) => call.method !== 'DELETE').map((call) => `${call.method} ${call.path}`)).toEqual([
    'PUT /api/resource-folders/folder-b/resources',
    'PATCH /api/drive/files/f-pdf',
  ]);
  expect(calls.find((call) => call.method === 'PATCH')!.body).toMatchObject({ folderId: 'folder-b' });

  await page.locator('[data-select-key="drive-file:f-zip"]').click({ modifiers: ['ControlOrMeta'] });
  await page.locator('[data-selection-delete]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => calls.filter((call) => call.method === 'DELETE').map((call) => call.path)).toEqual(['/api/drive/files/f-zip']);
});
