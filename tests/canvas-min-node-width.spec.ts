/**
 * A text block or a picture on a canvas shrinks down to a 48×48 square (two
 * grid cells each way); it used to stop at 144×48. Mocked API, no backend needed.
 * Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;
// A 2×2 PNG: enough for the picture block to have something to show.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBkZGRkZAQAkCwQBXV2gvQAAAABJRU5ErkJggg==';

async function openCanvas(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'min-width-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Test', email: 'test@example.com', role: 'user' }));
  });
  await page.route('http://localhost:3001/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/canvas/narrow') {
      return route.fulfill({ json: {
        canvas: { id: 'narrow', title: 'Narrow', data: JSON.stringify({ nodes: [
          { id: 'text', type: 'text', text: 'Подпись', x: 240, y: 240, width: 240, height: 96, zIndex: 1 },
          { id: 'image', type: 'image', file: PIXEL, x: 600, y: 240, width: 240, height: 168, zIndex: 2 },
        ], edges: [] }) },
        role: 'owner', revision: 1,
      } });
    }
    return route.fulfill({ json: path.startsWith('/api/plugins/') || path.endsWith('/permissions') || path.endsWith('/messages') ? [] : {} });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/canvas/narrow');
  await expect(page.locator('[data-node-id="image"]')).toBeVisible();
}

/** The block's size on the canvas, in canvas units (the view may be zoomed). */
const canvasSize = (page: Page, id: string) =>
  page.evaluate((nodeId) => {
    const style = (document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement).style;
    return { width: style.width, height: style.height };
  }, id);

for (const id of ['text', 'image']) {
  test(`a ${id} block shrinks to a 48×48 square, not below`, async ({ page }) => {
    await openCanvas(page);
    const node = page.locator(`[data-node-id="${id}"]`);
    await node.click();
    const box = (await node.locator('.resize-handle-br').boundingBox())!;
    // The part of the corner handle inside the block: a text block's rounded,
    // clipped corner cuts off the handle's very centre.
    const grab = { x: box.x + 3, y: box.y + 3 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 600, grab.y - 600, { steps: 8 });
    await page.mouse.up();
    expect(await canvasSize(page, id)).toEqual({ width: '48px', height: '48px' });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/canvas-min-${id}.png`, clip: { x: 0, y: 0, width: 1280, height: 600 } });
  });
}
