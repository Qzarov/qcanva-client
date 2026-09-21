import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';

async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'mobile-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'test-user',
      email: 'user@example.com',
      name: 'Mobile User',
      role: 'user',
    }));
  });

  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/canvas/smoke-canvas') {
      await route.fulfill({
        json: {
          canvas: {
            id: 'smoke-canvas',
            title: 'Smoke Test Canvas',
            data: JSON.stringify({
              nodes: [
                { id: 'node-1', type: 'text', text: 'Hello Node', x: 50, y: 50, width: 120, height: 60 },
              ],
              edges: [],
            }),
            slug: null,
          },
          role: 'owner',
          isPublic: false,
          revision: 1,
        },
      });
    } else if (path === '/api/text-documents/smoke-doc') {
      await route.fulfill({
        json: {
          document: {
            id: 'smoke-doc',
            title: 'Smoke Test Document',
            slug: null,
          },
          role: 'owner',
          revision: 1,
        },
      });
    } else if (path.endsWith('/permissions')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/mentions')) {
      await route.fulfill({ json: { items: [] } });
    } else if (path.endsWith('/backlinks')) {
      await route.fulfill({ json: { items: [] } });
    } else if (path.endsWith('/messages')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/plugins')) {
      await route.fulfill({ json: { plugins: [] } });
    } else if (path.endsWith('/resource-folders')) {
      await route.fulfill({ json: { own: [], shared: [] } });
    } else if (path.endsWith('/tags')) {
      await route.fulfill({ json: { tags: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}

const VIEWPORTS = [
  { width: 320, height: 568, name: '320px portrait' },
  { width: 360, height: 640, name: '360px portrait' },
  { width: 390, height: 844, name: '390px portrait' },
  { width: 430, height: 932, name: '430px portrait' },
  { width: 844, height: 390, name: '390px landscape' },
];

for (const vp of VIEWPORTS) {
  test(`Canvas mobile layout and controls at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupMocks(page);

    await page.goto('/canvas/smoke-canvas');

    // 1. Back button is visible and unified
    const backBtn = page.locator('.canvas-topbar .back-btn');
    await expect(backBtn).toBeVisible();
    const backBox = await backBtn.boundingBox();
    expect(backBox?.width).toBeGreaterThanOrEqual(36);
    expect(backBox?.height).toBeGreaterThanOrEqual(36);

    // 2. Undo/Redo are present in header
    const undoBtn = page.locator('.canvas-topbar-undo');
    const redoBtn = page.locator('.canvas-topbar-redo');
    await expect(undoBtn).toBeVisible();
    await expect(redoBtn).toBeVisible();

    // 3. Bottom modebar has 4 buttons and fits without horizontal overflow
    const modebar = page.locator('.mobile-modebar');
    await expect(modebar).toBeVisible();
    const buttons = modebar.locator('.mobile-modebar-btn');
    await expect(buttons).toHaveCount(4);

    const modebarBox = await modebar.boundingBox();
    expect(modebarBox).toBeTruthy();
    if (modebarBox) {
      expect(modebarBox.width).toBeLessThanOrEqual(vp.width + 1);
    }

    // 4. Tap '+' Add button to open the bottom sheet
    const addBtn = modebar.locator('.mobile-modebar-add');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const addSheet = page.locator('.mobile-add-sheet');
    await expect(addSheet).toBeVisible();
    const sheetItems = addSheet.locator('.mobile-add-sheet-item');
    expect(await sheetItems.count()).toBeGreaterThanOrEqual(3);

    // Close by clicking backdrop
    await page.locator('.mobile-add-backdrop').click();
    await expect(addSheet).not.toBeVisible();
  });
}

test('Docs mobile header layout (Back, Outline, Actions)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);

  await page.goto('/docs/smoke-doc');

  // Back button
  const backBtn = page.locator('.text-doc-topbar .back-btn');
  await expect(backBtn).toBeVisible();

  // Outline button is immediately after Back
  const outlineBtn = page.locator('.text-doc-outline-btn');
  await expect(outlineBtn).toBeVisible();

  // Clicking outline opens mobile drawer
  await outlineBtn.click();
  const drawer = page.locator('.text-doc-outline-drawer');
  await expect(drawer).toBeVisible();

  // Close drawer
  await page.locator('.text-doc-outline-drawer-backdrop').click();
  await expect(drawer).not.toBeVisible();
});
