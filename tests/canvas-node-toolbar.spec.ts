/**
 * The desktop node toolbar: a row of icons right above the selected node(s),
 * its menus one level deep under the row. Mocked API, no backend needed.
 * Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;

async function openCanvas(page: Page, options: { width?: number; height?: number; role?: 'owner' | 'edit' | 'read'; theme?: 'light' | 'dark' } = {}) {
  await page.addInitScript((theme) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'toolbar-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Test', email: 'test@example.com', role: 'user' }));
  }, options.theme ?? 'dark');
  await page.route('http://localhost:3001/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/canvas/toolbar') {
      return route.fulfill({ json: {
        canvas: { id: 'toolbar', title: 'Toolbar', data: JSON.stringify({ nodes: [
          { id: 'middle', type: 'text', text: 'Распечатать коробку', x: 480, y: 360, width: 288, height: 96, zIndex: 1 },
          { id: 'second', type: 'text', text: 'Снять деньги', x: 840, y: 360, width: 240, height: 96, zIndex: 2 },
          { id: 'top', type: 'text', text: 'У самого верха', x: 480, y: 24, width: 240, height: 72, zIndex: 3 },
        ], edges: [] }) },
        role: options.role ?? 'owner', revision: 1,
      } });
    }
    return route.fulfill({ json: path.startsWith('/api/plugins/') || path.endsWith('/permissions') || path.endsWith('/messages') ? [] : {} });
  });
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 860 });
  await page.goto('/canvas/toolbar');
  await expect(page.locator('[data-node-id="middle"]')).toBeVisible();
}

const toolbar = (page: Page) => page.locator('[data-node-toolbar]');
const tool = (page: Page, name: string) => toolbar(page).locator(`[data-node-tool="${name}"]`);

test('one row of icons right above the selected node, centred on it', async ({ page }) => {
  await openCanvas(page);
  await expect(toolbar(page)).toHaveCount(0);
  await page.locator('[data-node-id="middle"]').click();
  await expect(toolbar(page)).toBeVisible();
  const node = (await page.locator('[data-node-id="middle"]').boundingBox())!;
  const row = (await toolbar(page).locator('.node-toolbar-row').boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(node.y);
  expect(node.y - (row.y + row.height)).toBeLessThan(24);
  expect(Math.abs((row.x + row.width / 2) - (node.x + node.width / 2))).toBeLessThan(4);
  expect(row.height).toBeLessThanOrEqual(46);
  // The whole set, in its order: fill, text, border | edit, lock, duplicate, hide | more.
  expect(await toolbar(page).locator('[data-node-tool]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-tool'))))
    .toEqual(['fill', 'text', 'border', 'edit', 'lock', 'duplicate', 'hide', 'more']);
  // Every icon says what it is.
  for (const button of await toolbar(page).locator('button').all()) expect(await button.getAttribute('aria-label')).toBeTruthy();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/toolbar-dark.png` });
});

test('the fill menu holds its colours itself: one click colours the node, no palette over it', async ({ page }) => {
  await openCanvas(page, { theme: 'light' });
  await page.locator('[data-node-id="middle"]').click();
  await tool(page, 'fill').click();
  const menu = toolbar(page).locator('[data-node-menu="fill"]');
  await expect(menu).toBeVisible();
  await expect(page.locator('.canvas-color-menu')).toHaveCount(0);
  await expect(menu.locator('.tb-color')).toHaveCount(7);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/toolbar-fill-light.png` });
  await menu.locator('.ctx-color-3').click();
  await expect(tool(page, 'fill').locator('.node-tool-swatch')).toHaveClass(/ctx-color-3/);
  // The menu stays for the next choice, and unfolds away from the node instead of over it.
  await expect(menu).toBeVisible();
  const node = (await page.locator('[data-node-id="middle"]').boundingBox())!;
  const box = (await menu.boundingBox())!;
  expect(box.y + box.height <= node.y || box.y >= node.y + node.height).toBe(true);
});

test('Escape and a click elsewhere close a menu; another menu replaces it', async ({ page }) => {
  await openCanvas(page);
  await page.locator('[data-node-id="middle"]').click();
  await tool(page, 'border').click();
  await expect(toolbar(page).locator('[data-node-menu="border"]')).toBeVisible();
  await tool(page, 'text').click();
  await expect(toolbar(page).locator('[data-node-menu="border"]')).toHaveCount(0);
  await expect(toolbar(page).locator('[data-node-menu="text"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar(page).locator('[data-node-menu]')).toHaveCount(0);
  await expect(toolbar(page)).toBeVisible();
  // Escape with a menu open closes only the menu: the node stays selected.
  await tool(page, 'more').click();
  await expect(toolbar(page).locator('[data-node-menu="more"]')).toBeVisible();
  await page.mouse.click(1200, 820);
  await expect(toolbar(page).locator('[data-node-menu]')).toHaveCount(0);
});

test('Edit opens the text editor; Delete is in the more menu', async ({ page }) => {
  await openCanvas(page);
  await page.locator('[data-node-id="middle"]').click();
  await tool(page, 'edit').click();
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-node-id="second"]').click();
  await tool(page, 'more').click();
  const menu = toolbar(page).locator('[data-node-menu="more"]');
  await expect(menu.getByRole('button', { name: 'Bring to front' })).toBeVisible();
  await menu.locator('[data-node-tool="delete"]').click();
  await expect(page.locator('[data-node-id="second"]')).toHaveCount(0);
});

test('several nodes: only what they share, over the whole selection', async ({ page }) => {
  await openCanvas(page);
  await page.locator('[data-node-id="middle"]').click();
  await page.locator('[data-node-id="second"]').click({ modifiers: ['Shift'] });
  await expect(toolbar(page)).toBeVisible();
  expect(await toolbar(page).locator('[data-node-tool]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-tool'))))
    .toEqual(['lock', 'duplicate', 'hide', 'more']);
  const a = (await page.locator('[data-node-id="middle"]').boundingBox())!;
  const b = (await page.locator('[data-node-id="second"]').boundingBox())!;
  const row = (await toolbar(page).locator('.node-toolbar-row').boundingBox())!;
  const middle = (a.x + (b.x + b.width)) / 2;
  expect(Math.abs((row.x + row.width / 2) - middle)).toBeLessThan(4);
  await tool(page, 'lock').click();
  await expect(tool(page, 'lock')).toHaveAttribute('aria-pressed', 'true');
});

test('hidden while a node is dragged, back once it is dropped', async ({ page }) => {
  await openCanvas(page);
  const node = page.locator('[data-node-id="middle"]');
  await node.click();
  await expect(toolbar(page)).toBeVisible();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 6 });
  await expect(toolbar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();
});

test('no toolbar for a reader, nor on a phone (it has its own bottom bar)', async ({ page }) => {
  await openCanvas(page, { role: 'read' });
  await page.locator('[data-node-id="middle"]').click();
  await expect(toolbar(page)).toHaveCount(0);
});

test('on a phone the floating toolbar stays away', async ({ page }) => {
  await openCanvas(page, { width: 390, height: 844 });
  await page.locator('[data-node-id="middle"]').click({ force: true });
  await expect(page.locator('[data-node-toolbar]:visible')).toHaveCount(0);
});
