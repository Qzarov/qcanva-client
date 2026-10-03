import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';

async function setupMocks(page: Page, options: { dice?: boolean; ruler?: boolean; readonly?: boolean; image?: boolean } = {}) {
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
                { id: 'node-1', type: options.image ? 'image' : 'text', text: 'Hello Node', x: 50, y: 50, width: 120, height: 60,
                  ...(options.image ? { file: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="60"%3E%3Crect width="120" height="60" fill="%238a4e00"/%3E%3C/svg%3E' } : {}),
                },
              ],
              edges: [],
            }),
            slug: null,
            ...(options.ruler ? { rulerSettings: { enabled: true, unit: 'm', metersPerCanvasUnit: 0.01 } } : {}),
          },
          role: options.readonly ? 'read' : 'owner',
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
    } else if (path.startsWith('/api/plugins/')) {
      await route.fulfill({ json: [
        ...(options.dice ? [{ id: 'dice', name: 'Dice', enabled: true, surface: 'canvas' }] : []),
        ...(options.ruler ? [{ id: 'ruler', name: 'Ruler', enabled: true, surface: 'canvas' }] : []),
      ] });
    } else if (path.endsWith('/resource-folders')) {
      await route.fulfill({ json: { own: [], shared: [] } });
    } else if (path.endsWith('/tags')) {
      await route.fulfill({ json: { tags: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`Mobile panels are exclusive and bounded with dice enabled at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupMocks(page, { dice: true });
    await page.goto('/canvas/smoke-canvas');
    const modebar = page.locator('.mobile-modebar');
    await expect(modebar).toBeVisible();
    await modebar.locator('button').nth(2).click();
    await expect(page.locator('.mobile-draw-panel')).toBeVisible();
    await modebar.locator('.mobile-modebar-add').click();
    await expect(page.locator('.mobile-add-sheet')).toBeVisible();
    await expect(page.locator('.mobile-draw-panel')).not.toBeVisible();
    const sheetBox = await page.locator('.mobile-add-sheet').boundingBox();
    expect(sheetBox!.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.locator('.mobile-add-backdrop').click({ position: { x: 5, y: 100 } });
    const dice = page.getByTestId('mobile-plugin-dice');
    await expect(dice).toBeVisible();
    const diceBox = await dice.boundingBox();
    expect(diceBox!.x).toBeGreaterThanOrEqual(0);
    expect(diceBox!.x + diceBox!.width).toBeLessThanOrEqual(viewport.width);
    await dice.click();
    await expect(page.locator('.dice-panel')).toBeVisible();
    const panelBox = await page.locator('.dice-panel').boundingBox();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport.height);
    await modebar.locator('.mobile-modebar-add').click();
    await expect(page.locator('.dice-panel')).not.toBeVisible();
    await expect(page.locator('.mobile-add-sheet')).toBeVisible();
    await page.locator('.mobile-add-backdrop').click({ position: { x: 5, y: 100 } });
    await page.locator('.topbar-menu-btn').click();
    await expect(page.locator('.canvas-shortcuts-button')).toBeHidden();
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`Add resources stay in one row and the trigger closes the panel at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupMocks(page);
    await page.goto('/canvas/smoke-canvas');
    const modebar = page.locator('.mobile-modebar');
    await modebar.locator('button').nth(2).click();
    const add = modebar.locator('.mobile-modebar-add');
    await add.click();
    await expect(page.locator('.mobile-add-sheet')).toBeVisible();
    await expect(modebar.locator('button').nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expect(modebar.locator('.active')).toHaveCount(1);
    await expect(add).toHaveClass(/active/);
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    const items = page.locator('.mobile-add-sheet-item');
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    const itemTops = await items.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
    expect(new Set(itemTops).size).toBe(1);
    const buttonAnimation = await add.evaluate(element => getComputedStyle(element).transitionProperty);
    const itemAnimation = await items.first().evaluate(element => getComputedStyle(element).transitionProperty);
    expect(buttonAnimation).toContain('transform');
    expect(itemAnimation).toContain('transform');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await add.click({ timeout: 1000 });
    await expect(page.locator('.mobile-add-sheet')).not.toBeVisible();
    await expect(add).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.mobile-draw-panel')).toBeVisible();
  });
}

test('each lower menu tap briefly labels the selected action above its button', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMocks(page);
  await page.goto('/canvas/smoke-canvas');
  const buttons = page.locator('.mobile-modebar-btn');
  for (const [index, label] of ['Hand', 'Cursor', 'Draw', 'Add'].entries()) {
    const button = buttons.nth(index);
    await button.click();
    const hint = page.locator('.mobile-modebar-tap-hint');
    await expect(hint).toHaveText(label);
    const [buttonBox, hintBox] = await Promise.all([button.boundingBox(), hint.boundingBox()]);
    expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(buttonBox!.y + 1);
    expect(Math.abs(hintBox!.x + hintBox!.width / 2 - buttonBox!.x - buttonBox!.width / 2)).toBeLessThanOrEqual(6);
    expect(await hint.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  }
  await expect(page.locator('.mobile-modebar-tap-hint')).not.toBeVisible({ timeout: 2500 });
  await buttons.nth(3).click();
  await expect(page.locator('.mobile-add-sheet')).not.toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`enabled plugin tools sit in a compact bar below the header at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupMocks(page, { dice: true, ruler: true });
    await page.goto('/canvas/smoke-canvas');
    const bar = page.locator('.mobile-plugin-bar');
    await expect(bar).toBeVisible();
    const [headerBox, barBox] = await Promise.all([page.locator('.canvas-topbar').boundingBox(), bar.boundingBox()]);
    expect(barBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    expect(barBox!.x).toBeGreaterThanOrEqual(0);
    expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(barBox!.height).toBeLessThanOrEqual(52);
    await expect(page.locator('.canvas-topbar-dice')).not.toBeVisible();
    await expect(page.locator('[data-testid="ruler-tool"]')).not.toBeVisible();
    const dice = page.getByTestId('mobile-plugin-dice');
    const ruler = page.getByTestId('mobile-plugin-ruler');
    const settings = page.getByTestId('mobile-plugin-settings');
    await expect(dice).toBeVisible();
    await expect(ruler).toBeVisible();
    await expect(settings).toBeVisible();
    await dice.click();
    await expect(page.locator('.dice-panel')).toBeVisible();
    await dice.click();
    await expect(page.locator('.dice-panel')).not.toBeVisible();
    await settings.click();
    await expect(page.locator('.canvas-plugin-panel')).toBeVisible();
    await settings.click();
    await expect(page.locator('.canvas-plugin-panel')).not.toBeVisible();
    await ruler.click();
    await expect(ruler).toHaveAttribute('aria-pressed', 'true');
  });
}

test('reader sees the Ruler and view settings but no Dice control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page, { readonly: true, ruler: true, dice: true });
  await page.goto('/canvas/smoke-canvas');
  await expect(page.getByTestId('mobile-plugin-ruler')).toBeVisible();
  await expect(page.getByTestId('mobile-plugin-settings')).toBeVisible();
  await expect(page.getByTestId('mobile-plugin-dice')).toHaveCount(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`canvas action menu toggles and stays usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupMocks(page, { dice: true, ruler: true });
    await page.goto('/canvas/smoke-canvas');
    const trigger = page.locator('.topbar-menu-btn');
    const menu = page.locator('.topbar-actions');
    await page.locator('.mobile-modebar-add').click();
    await expect(page.locator('.mobile-add-sheet')).toBeVisible();
    await trigger.click();
    await expect(page.locator('.mobile-add-sheet')).not.toBeVisible();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.mobile-plugin-bar')).not.toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);
    const row = menu.getByRole('button', { name: /Export|Экспорт/i });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    await expect(menu).not.toBeVisible();
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.locator('.topbar-menu-backdrop').click({ position: { x: 5, y: 150 } });
    await expect(menu).not.toBeVisible();
  });
}

test('selected-node More menu closes on a second tap of its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);
  await page.goto('/canvas/smoke-canvas');
  await page.locator('.mobile-modebar-btn[aria-label="Cursor"]').click();
  const node = page.locator('[data-node-id="node-1"]');
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const more = page.locator('.mobile-node-toolbar').getByRole('button', { name: /More|Ещё|Еще/i });
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator('.mobile-overflow-sheet')).toBeVisible();
  await more.click();
  await expect(page.locator('.mobile-overflow-sheet')).not.toBeVisible();
  await more.click();
  await page.locator('.topbar-menu-btn').click();
  await expect(page.locator('.topbar-actions')).toBeVisible();
  await expect(page.locator('.mobile-overflow-sheet')).not.toBeVisible();
  await page.locator('.topbar-menu-btn').click();
  await expect(page.locator('.mobile-node-toolbar')).toBeVisible();
});

test('tapping Draw again closes and reopens its tools without changing the selected mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);
  await page.goto('/canvas/smoke-canvas');
  const draw = page.locator('.mobile-modebar-btn[aria-label="Draw"]');
  await draw.click();
  await expect(page.locator('.mobile-draw-panel')).toBeVisible();
  await draw.click();
  await expect(page.locator('.mobile-draw-panel')).not.toBeVisible();
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await draw.click();
  await expect(page.locator('.mobile-draw-panel')).toBeVisible();
  await page.locator('.topbar-menu-btn').click();
  await expect(page.locator('.mobile-draw-panel')).not.toBeVisible();
  await page.locator('.topbar-menu-btn').click();
  await expect(page.locator('.mobile-draw-panel')).toBeVisible();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`grouped node settings fit and edit the selected object at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupMocks(page);
    await page.goto('/canvas/smoke-canvas');
    await page.locator('.mobile-modebar-btn[aria-label="Cursor"]').click();
    const node = page.locator('[data-node-id="node-1"]');
    await node.click();
    const row = page.locator('.mobile-node-toolbar-row');
    for (const label of ['Background', 'Border', 'Text', 'Layers', 'Lock', 'More']) {
      const button = row.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    await row.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(node).toHaveClass(/is-locked/);
    await row.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(node).not.toHaveClass(/is-locked/);
    await row.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(page.locator('.mobile-node-subpanel button')).toHaveCount(4);
    await row.getByRole('button', { name: 'More', exact: true }).click();
    for (const label of ['Bring forward', 'Send backward', 'Bring to front', 'Send to back', 'Lock']) {
      await expect(page.locator('.mobile-overflow-sheet').getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
    await row.getByRole('button', { name: 'More', exact: true }).click();
    await row.getByRole('button', { name: 'Background', exact: true }).click();
    const settingButtons = page.locator('.mobile-node-subpanel .mobile-settings-row button');
    const tops = await settingButtons.evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(5);
    await expect(page.locator('.mobile-node-color-palette')).not.toBeVisible();
    await page.getByRole('button', { name: 'Background color', exact: true }).click();
    await page.getByRole('button', { name: 'Background color 2', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Background color', exact: true })).toHaveClass(/ctx-color-2/);
    await row.getByRole('button', { name: 'Border', exact: true }).click();
    await page.getByRole('button', { name: 'Border color', exact: true }).click();
    const palette = await page.locator('.mobile-node-subpanel').boundingBox();
    expect(palette!.y).toBeGreaterThanOrEqual(0);
    expect(palette!.y + palette!.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole('button', { name: 'Border color #fb464c', exact: true }).click();
    await row.getByRole('button', { name: 'Text', exact: true }).click();
    const textPanel = (await page.locator('.mobile-node-subpanel').boundingBox())!;
    for (const button of await page.locator('.mobile-node-subpanel button[aria-label^="First line:"]').all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(textPanel.x);
      expect(box.x + box.width).toBeLessThanOrEqual(textPanel.x + textPanel.width);
    }
    await page.getByRole('button', { name: 'Body text: Center', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Body text: Center', exact: true })).toHaveClass(/active/);
    await page.screenshot({ path: test.info().outputPath('grouped-node-settings.png') });
  });
}

test('image controls edit title and border without showing text settings', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMocks(page, { image: true });
  await page.goto('/canvas/smoke-canvas');
  await page.locator('.mobile-modebar-btn[aria-label="Cursor"]').click();
  const node = page.locator('[data-node-id="node-1"]');
  await node.click();
  const row = page.locator('.mobile-node-toolbar-row');
  await expect(row.getByRole('button', { name: 'Text', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Title', exact: true }).click();
  await page.locator('.mobile-subpanel-title-input').fill('Map');
  await expect(node.locator('.node-image-title')).toHaveText('Map');
  await row.getByRole('button', { name: 'Border', exact: true }).click();
  await page.getByRole('button', { name: 'Width 3px', exact: true }).click();
  await expect(node).toHaveCSS('border-top-width', '3px');
  await row.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(node).toHaveClass(/is-locked/);
});

test('Readonly mobile canvases cannot open create or draw controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page, { readonly: true, dice: true });
  await page.goto('/canvas/smoke-canvas');
  await expect(page.locator('.mobile-modebar-add')).toBeDisabled();
  await expect(page.locator('.mobile-modebar button').nth(2)).toBeDisabled();
  await expect(page.locator('.canvas-topbar-dice')).toHaveCount(0);
});

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
    await page.locator('.mobile-add-backdrop').click({ position: { x: 5, y: 100 } });
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
