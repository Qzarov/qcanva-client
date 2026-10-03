import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, groupOptions: Record<string, unknown> = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'selection-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Test', email: 'test@example.com', role: 'user' }));
  });
  await page.route('http://localhost:3001/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/canvas/selection') return route.fulfill({ json: {
      canvas: { id: 'selection', title: 'Selection', data: JSON.stringify({ nodes: [
        { id: 'group', type: 'group', x: 500, y: 300, width: 500, height: 350, zIndex: 1, ...groupOptions },
        { id: 'text', type: 'text', text: 'Child', x: 750, y: 550, width: 120, height: 60, zIndex: 10 },
      ], edges: [], drawings: [{ id: 'drawing', tool: 'rect', x: 580, y: 380, w: 80, h: 60, color: '#e03131', width: 4, createdBy: 'test-user', createdAt: '' }] }) },
      role: 'owner', revision: 1,
    } });
    return route.fulfill({ json: path.startsWith('/api/plugins/') || path.endsWith('/permissions') || path.endsWith('/messages') ? [] : {} });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/canvas/selection');
  await expect(page.locator('[data-node-id="group"]')).toBeVisible();
}

test('desktop group interior is empty canvas but boundary selects the group', async ({ page }) => {
  await setup(page);
  const group = page.locator('[data-node-id="group"]');
  const box = (await group.boundingBox())!;
  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  await expect(group).toHaveClass(/is-selected/);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(group).not.toHaveClass(/is-selected/);
});

test('group boundary remains selectable after zooming out', async ({ page }) => {
  await setup(page);
  for (let i = 0; i < 6; i++) await page.getByTitle('Zoom out', { exact: true }).click();
  const group = page.locator('[data-node-id="group"]');
  const box = (await group.boundingBox())!;
  await page.mouse.click(box.x - 4, box.y + box.height / 2);
  await expect(group).toHaveClass(/is-selected/);
});

test('round group curved boundary selects but invisible corner does not', async ({ page }) => {
  await setup(page, { shape: 'round' });
  const group = page.locator('[data-node-id="group"]');
  const box = (await group.boundingBox())!;
  await page.mouse.click(box.x + 24.4, box.y + 87.5);
  await expect(group).toHaveClass(/is-selected/);
  // Deselect before checking the corner: a selected group legitimately has
  // a resize handle at its bounding-box corner, even when the body is round.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(group).not.toHaveClass(/is-selected/);
  await page.mouse.click(box.x + 1, box.y + 1);
  await expect(group).not.toHaveClass(/is-selected/);
});

test('thick group border remains selectable', async ({ page }) => {
  await setup(page, { borderWidth: 24 });
  const group = page.locator('[data-node-id="group"]');
  const box = (await group.boundingBox())!;
  await page.mouse.click(box.x + 1, box.y + 1);
  await expect(group).not.toHaveClass(/is-selected/);
  await page.mouse.click(box.x + 12, box.y + box.height / 2);
  await expect(group).toHaveClass(/is-selected/);
});

test('cloned drawing selection outline stays aligned with the clone after undo and redo', async ({ page }) => {
  await setup(page);
  const drawings = page.locator('.canvas-drawings > g > g:has(> rect[stroke="#e03131"])');
  const drawn = drawings.first().locator('rect').last();
  const box = (await drawn.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 1);
  await expect(page.locator('.drawing-selection-outline')).toBeVisible();
  await page.locator('.drawing-actions-toolbar').getByTitle('Duplicate').click();
  await expect(drawings).toHaveCount(2);
  async function expectAligned() {
    const cloneBox = (await drawings.last().locator('rect').last().boundingBox())!;
    const outlineBox = (await page.locator('.drawing-selection-outline').boundingBox())!;
    expect(Math.abs(outlineBox.x + outlineBox.width / 2 - cloneBox.x - cloneBox.width / 2)).toBeLessThan(1);
    expect(Math.abs(outlineBox.y + outlineBox.height / 2 - cloneBox.y - cloneBox.height / 2)).toBeLessThan(1);
  }
  await expectAligned();
  await page.keyboard.press('Control+z');
  await expect(drawings).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(drawings).toHaveCount(2);
  const cloneBox = (await drawings.last().locator('rect').last().boundingBox())!;
  await page.mouse.click(cloneBox.x + cloneBox.width / 2, cloneBox.y + 1);
  await expectAligned();
});
