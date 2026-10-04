import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, mobile = false, locale: 'en' | 'ru' = 'en') {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'block-settings-test');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Test', email: 'test@example.com', role: 'user' }));
  });
  await page.addInitScript(locale => localStorage.setItem('qcanva:locale', locale), locale);
  await page.route('http://localhost:3001/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/canvas/blocks') return route.fulfill({ json: {
      canvas: { id: 'blocks', title: 'Blocks', data: JSON.stringify({ nodes: [
        { id: 'text', type: 'text', text: 'Heading\n\n```\n' + 'long_code_'.repeat(40) + '\n```\n\n' + 'Long body paragraph.\n\n'.repeat(40), fontColor: '#44cf6e', x: 0, y: 0, width: 300, height: 180 },
        { id: 'wave', type: 'text', text: 'Wavy border', x: 380, y: 0, width: 300, height: 180, borderStyle: 'wavy', borderWidth: 12, borderColor: '#ff0000' },
      ], edges: [] }) }, role: 'owner', revision: 1,
    } });
    return route.fulfill({ json: path.startsWith('/api/plugins/') || path.endsWith('/permissions') || path.endsWith('/messages') ? [] : {} });
  });
  await page.goto('/canvas/blocks');
  await expect(page.locator('[data-node-id="text"]')).toBeVisible();
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`compact node popups stay above their triggers across section changes at ${viewport.width}px`, async ({ page }) => {
    await setup(page, true); await page.setViewportSize(viewport);
    await page.locator('.mobile-modebar-btn').nth(1).click(); await page.locator('[data-node-id="text"]').click();
    const toolbar = page.locator('.mobile-node-toolbar');
    for (const [section, controls] of [
      ['Border', ['Border color', 'Border width', 'Border style']],
      ['Text', ['Header alignment', 'Body text alignment', 'Text color']],
    ] as const) {
      await toolbar.locator('.mobile-node-toolbar-row').getByRole('button', { name: section, exact: true }).click();
      const panel = (await toolbar.locator('.canvas-panel-page').boundingBox())!;
      const row = toolbar.locator('.mobile-node-subpanel');
      await expect(row.locator('button')).toHaveCount(4);
      const tops = await row.locator('button').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
      for (const control of controls) {
        const trigger = row.getByRole('button', { name: control, exact: true });
        await trigger.click();
        const menu = page.locator('.mobile-node-popup:visible');
        await expect(menu).toHaveCSS('position', 'fixed');
        await expect(menu).toHaveCSS('transform', 'none');
        const box = (await menu.boundingBox())!;
        const anchor = (await trigger.boundingBox())!;
        expect(box.width).toBeLessThan(panel.width);
        const expectedLeft = Math.max(8, Math.min(anchor.x + anchor.width / 2 - box.width / 2, viewport.width - box.width - 8));
        expect(Math.abs(box.x - expectedLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y + box.height - (anchor.y - 8))).toBeLessThanOrEqual(1);
        expect(box.y).toBeGreaterThanOrEqual(8); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
        await expect(trigger).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`full-width-${control.replaceAll(' ', '-').toLowerCase()}.png`) });
        await trigger.click(); await expect(menu).toBeHidden();
      }
      await toolbar.locator('.mobile-panel-back').click();
      for (const name of ['Shape', 'Background']) {
        const trigger = toolbar.locator('.mobile-node-toolbar-row').getByRole('button', { name, exact: true });
        await trigger.click();
        const menu = page.locator('.mobile-node-popup:visible');
        await expect(menu).toHaveCSS('transform', 'none');
        const box = (await menu.boundingBox())!, anchor = (await trigger.boundingBox())!;
        const expectedLeft = Math.max(8, Math.min(anchor.x + anchor.width / 2 - box.width / 2, viewport.width - box.width - 8));
        expect(Math.abs(box.x - expectedLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y + box.height - (anchor.y - 8))).toBeLessThanOrEqual(1);
        await trigger.click(); await expect(menu).toBeHidden();
      }
    }
  });
}

for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`text editor header fits and undo only changes text at ${width}px`, async ({ page }) => {
    await setup(page, true);
    await page.setViewportSize({ width, height });
    await page.locator('.mobile-modebar-btn').nth(1).click();
    const node = page.locator('[data-node-id="text"]');
    await node.click();
    const originalPosition = await node.evaluate(el => ({ left: (el as HTMLElement).style.left, top: (el as HTMLElement).style.top }));
    await page.locator('.mobile-node-toolbar-row').getByRole('button', { name: 'Edit text', exact: true }).click();
    const editor = page.locator('.node-fullscreen-editor');
    const textarea = editor.locator('textarea');
    const original = await textarea.inputValue();
    const undo = editor.getByRole('button', { name: 'Undo', exact: true });
    const redo = editor.getByRole('button', { name: 'Redo', exact: true });
    await expect(undo).toBeDisabled();
    await expect(editor.getByRole('status')).toHaveText('Offline');
    await textarea.fill('Local edit');
    await undo.click();
    await expect(textarea).toHaveValue(original);
    await redo.click();
    await expect(textarea).toHaveValue('Local edit');
    await textarea.press('Control+z');
    await expect(textarea).toHaveValue(original);
    for (const button of [undo, redo]) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: test.info().outputPath('text-editor.png') });
    await editor.getByRole('button', { name: 'Back to canvas', exact: true }).click();
    expect(await node.evaluate(el => ({ left: (el as HTMLElement).style.left, top: (el as HTMLElement).style.top }))).toEqual(originalPosition);
  });

  test(`vertical unlabelled Background palette fits at ${width}px`, async ({ page }) => {
    await setup(page, true); await page.setViewportSize({ width, height });
    await page.locator('.mobile-modebar-btn').nth(1).click(); await page.locator('[data-node-id="text"]').click();
    const trigger = page.locator('.mobile-node-toolbar-row [aria-label="Background"]');
    await trigger.click();
    const menu = page.getByRole('group', { name: 'Background color', exact: true });
    await expect(page.locator('.mobile-node-toolbar-row')).toBeVisible();
    await expect(menu).toHaveCSS('position', 'fixed'); await expect(menu).toHaveCSS('opacity', '1');
    const colors = menu.locator('button[aria-label^="Background color "]');
    await expect(colors).toHaveText(['', '', '', '', '', '']);
    const boxes = await colors.evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y }; }));
    expect(new Set(boxes.map(b => Math.round(b.x))).size).toBe(1);
    expect(boxes.every((b, i) => i === 0 || b.y > boxes[i - 1]!.y)).toBe(true);
    const bounds = (await menu.boundingBox())!;
    const captions = await menu.locator('.mobile-background-toggle span').evaluateAll(els => els.map(el => {
      const b = el.getBoundingClientRect(); return { left: b.left, right: b.right };
    }));
    expect(captions).toHaveLength(2);
    expect(captions.every(b => b.left >= bounds.x + 8 && b.right <= bounds.x + bounds.width - 8)).toBe(true);
    expect(bounds.x).toBeGreaterThanOrEqual(8); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(bounds.y).toBeGreaterThanOrEqual(8); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 8);
    await page.screenshot({ path: test.info().outputPath('floating-background.png') });
    await menu.getByRole('button', { name: 'Transparent', exact: true }).click();
    await expect(menu).toBeVisible(); await expect(page.locator('[data-node-id="text"]')).toHaveClass(/node-transparent/);
    await expect(menu.getByRole('button', { name: 'Transparent', exact: true })).toHaveText('Transparent');
    await menu.getByRole('button', { name: 'Gradient', exact: true }).click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Solid', exact: true })).toHaveText('Solid');
    await trigger.click(); await expect(menu).toBeHidden();
  });

  test(`mobile Add fits all five choices without scrolling at ${width}px`, async ({ page }) => {
    await setup(page, true, 'ru');
    await page.setViewportSize({ width, height });
    await page.locator('.mobile-modebar-add').click();
    const sheet = page.locator('.mobile-add-sheet');
    await expect(sheet.locator('.mobile-add-sheet-item')).toHaveCount(5);
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await sheet.locator('.mobile-add-sheet-grid').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const buttons = await sheet.locator('button').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; }));
    expect(buttons.every(b => b.left >= 0 && b.right <= width)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('compact-add.png') });
  });
}

test('shape selection and floating text/border colours preserve controls and keyboard navigation', async ({ page }) => {
  await setup(page, true); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.mobile-modebar-btn').nth(1).click(); await page.locator('[data-node-id="text"]').click();
  const toolbar = page.locator('.mobile-node-toolbar-row');
  await toolbar.getByRole('button', { name: 'Shape', exact: true }).click();
  await page.locator('.mobile-shape-menu').getByRole('button', { name: 'Round', exact: true }).click();
  await expect(page.locator('[data-node-id="text"]')).toHaveClass(/node-round/);
  await toolbar.getByRole('button', { name: 'Shape', exact: true }).click();
  await page.locator('.mobile-shape-menu').getByRole('button', { name: 'Rectangular', exact: true }).click();
  await expect(page.locator('[data-node-id="text"]')).not.toHaveClass(/node-round/);
  await expect(toolbar.getByRole('button', { name: 'Shape', exact: true })).toBeFocused();
  for (const [section, color] of [['Text', 'Text color'], ['Border', 'Border color']]) {
    await toolbar.getByRole('button', { name: section!, exact: true }).click();
    const panel = page.locator('.mobile-node-subpanel'), original = await panel.elementHandle();
    const trigger = panel.getByRole('button', { name: color!, exact: true });
    await trigger.click();
    await expect(page.locator('.mobile-settings-heading')).toHaveText(section!);
    const menu = page.getByRole('group', { name: color!, exact: true });
    await expect(menu).toHaveCSS('position', 'fixed');
    expect(await original!.evaluate(el => el === document.querySelector('.mobile-node-subpanel'))).toBe(true);
    const colors = menu.getByRole('button');
    await colors.first().focus(); await page.keyboard.press('ArrowDown'); await expect(colors.nth(1)).toBeFocused();
    await page.keyboard.press('End'); await expect(colors.last()).toBeFocused();
    await page.keyboard.press('Home'); await expect(colors.first()).toBeFocused();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await trigger.click(); await trigger.click(); await expect(menu).toBeHidden();
    await page.locator('.mobile-panel-back').click();
  }
});

test('desktop block actions omit history while general canvas undo remains available', async ({ page }) => {
  await setup(page);
  await page.locator('[data-node-id="text"]').click();
  await expect(page.getByTitle('Node actions', { exact: true })).toHaveCount(0);
  const actions = page.locator('.node-toolbar-tabs');
  await expect(actions.getByRole('button', { name: 'Duplicate', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Redo', exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-controls [title="Undo"]')).toBeVisible();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
  test(`labelled drawing menus and live vertical width fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const mobile = viewport.width < 900;
    await setup(page, mobile);
    await page.setViewportSize(viewport);
    if (mobile) await page.locator('.mobile-modebar-btn').nth(2).click();
    else await page.locator('.draw-toolbar > .draw-toolbar-toggle').click();
    const panel = page.locator(mobile ? '.mobile-draw-panel' : '.draw-toolbar-panel');
    const trigger = panel.locator('.drawing-tool-trigger');
    await trigger.click();
    const tools = page.locator('.drawing-tool-menu');
    await expect(tools).toBeVisible();
    await expect(tools.locator('button')).toHaveCount(mobile ? 7 : 8);
    await expect.poll(async () => { const b = (await tools.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(viewport.height);
    const bounds = (await tools.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await trigger.click();
    await expect(tools).toBeHidden();
    await trigger.click();
    await tools.getByRole('button', { name: 'Highlighter', exact: true }).click();
    await expect(trigger).toHaveText('Highlighter');
    await expect(tools).toBeHidden();
    const widthTrigger = panel.getByRole('button', { name: 'Width', exact: true });
    await widthTrigger.click();
    const slider = page.locator('.drawing-width-menu input');
    await expect(slider).toHaveAttribute('aria-orientation', 'vertical');
    const preview = page.locator('.drawing-width-menu .canvas-stroke-preview');
    await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const previewBox = (await preview.boundingBox())!;
    const sliderBox = (await slider.boundingBox())!;
    expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(sliderBox.y);
    await slider.fill('12');
    await expect(page.locator('.drawing-width-menu line')).toHaveAttribute('stroke-width', '12');
    await expect(page.locator('.drawing-width-menu')).toBeVisible();
    await expect(page.locator('.drawing-width-menu')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/drawing-width-${viewport.width}.png` });
    await expect(panel.locator('.mobile-panel-header')).toHaveCount(0);
    await expect(page.locator('.drawing-width-menu')).toHaveCSS('position', 'fixed');
    await widthTrigger.click();
    await expect(slider).toBeHidden();
    await panel.getByRole('button', { name: 'Color', exact: true }).click();
    await page.getByRole('group', { name: 'Color', exact: true }).getByRole('button', { name: '#1971c2', exact: true }).click();
    await widthTrigger.click();
    await expect(page.locator('.drawing-width-menu line')).toHaveAttribute('stroke', '#1971c2');
    await widthTrigger.click();
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`direct menus are vertical and settings titles remain centred at ${viewport.width}px`, async ({ page }) => {
    await setup(page, true); await page.setViewportSize(viewport);
    await page.locator('.mobile-modebar-btn').nth(1).click(); await page.locator('[data-node-id="text"]').click();
    const toolbar = page.locator('.mobile-node-toolbar');
    for (const [section, count] of [['Background', 9], ['Shape', 2], ['Layers', 4]] as const) {
      const trigger = toolbar.locator('.mobile-node-toolbar-row').getByRole('button', { name: section, exact: true });
      await trigger.click();
      const menu = page.locator('.mobile-node-popup:visible');
      await expect(menu.locator('button')).toHaveCount(count); await expect(menu).toHaveCSS('flex-direction', 'column');
      await expect(toolbar.locator('.mobile-node-subpanel')).toHaveCount(0);
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: test.info().outputPath(`vertical-${section.toLowerCase()}.png`) });
      await trigger.click(); await expect(menu).toBeHidden();
    }
    for (const section of ['Text', 'Border']) {
      await toolbar.locator('.mobile-node-toolbar-row').getByRole('button', { name: section, exact: true }).click();
      const header = (await toolbar.locator('.mobile-panel-header').boundingBox())!;
      const title = (await toolbar.locator('.mobile-settings-heading').boundingBox())!;
      expect(header.height).toBeLessThanOrEqual(28);
      expect(Math.abs(title.x + title.width / 2 - header.x - header.width / 2)).toBeLessThanOrEqual(1);
      await toolbar.locator('.mobile-panel-back').click();
    }
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`Russian node captions fit two rows at ${viewport.width}px`, async ({ page }) => {
    await setup(page, true, 'ru');
    await page.setViewportSize(viewport);
    await page.locator('.mobile-modebar-btn').nth(1).click();
    await page.locator('[data-node-id="text"]').click();
    const row = page.locator('.mobile-node-toolbar-row');
    await expect(row.locator('button')).toHaveCount(10);
    await expect(row.locator('.mobile-toolbar-caption')).toHaveText(['Слои', 'Фон', 'Форма', 'Рамка', 'Текст', 'Править', 'Дублировать', 'Закрепить', 'Скрыть', 'Удалить']);
    const rects = await row.locator('button').evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect(); return { x: r.x, right: r.right, top: r.top, bottom: r.bottom };
    }));
    expect(new Set(rects.map(r => Math.round(r.top))).size).toBe(2);
    expect(rects.every(r => r.x >= 0 && r.right <= viewport.width && r.bottom <= viewport.height)).toBe(true);
    await row.getByRole('button', { name: 'Рамка', exact: true }).click();
    await expect(page.locator('.mobile-node-subpanel button > span:last-child')).toHaveText(['Назад', 'Цвет', 'Толщина', 'Стиль']);
    await page.screenshot({ path: `test-results/node-russian-${viewport.width}.png` });
  });
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} drawing tools use a vertical colour menu without resetting the pen`, async ({ page }) => {
    await setup(page, mobile);
    if (mobile) {
      await page.locator('.mobile-modebar-btn').nth(2).click();
      await page.locator('.mobile-draw-panel .drawing-tool-trigger').click();
      await page.locator('.drawing-tool-option[aria-label="Pen"]').click();
      await page.locator('.mobile-draw-panel .mobile-draw-color-btn').click();
    } else {
      await page.locator('.draw-toolbar > .draw-toolbar-toggle').click();
      await page.locator('.draw-toolbar .drawing-tool-trigger').click();
      await page.locator('.drawing-tool-option[aria-label="Pen"]').click();
      await page.locator('.draw-toolbar [aria-label="Color"]').click();
    }
    const menu = page.getByRole('group', { name: 'Color', exact: true });
    await expect(menu).toHaveCSS('flex-direction', 'column');
    await menu.locator('button').nth(2).click();
    await expect(menu).toBeHidden();
    await expect(page.locator(mobile ? '.mobile-draw-panel .drawing-tool-trigger' : '.draw-toolbar .drawing-tool-trigger')).toHaveText('Pen');
    await expect(page.locator(mobile ? '.mobile-draw-panel .drawing-color-sample' : '.draw-toolbar .drawing-color-sample')).toHaveCSS('background-color', 'rgb(47, 158, 68)');
  });
}

test('context-menu colour picker uses the same floating menu and updates the node', async ({ page }) => {
  await setup(page);
  await page.locator('[data-node-id="text"]').click({ button: 'right' });
  await page.locator('.context-menu').getByRole('button', { name: 'Background color', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Background color', exact: true });
  await expect(menu).toHaveCSS('position', 'fixed');
  await menu.getByRole('button', { name: 'Background color 2', exact: true }).click();
  await expect(page.locator('[data-node-id="text"]')).toHaveClass(/node-color-2/);
  await expect(menu).toBeHidden();
});

for (const [mobile, theme] of [[false, 'light'], [true, 'light'], [false, 'dark'], [true, 'dark']] as const) {
  test(`text colour swatches are visible and recognise legacy colour (${mobile ? 'mobile' : 'web'}, ${theme})`, async ({ page }) => {
    await setup(page, mobile);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    if (mobile) await page.locator('.mobile-modebar-btn').nth(1).click();
    await page.locator('[data-node-id="text"]').click();
    if (mobile) {
      await page.locator('.mobile-node-toolbar-row [aria-label="Text"]').click();
      await page.locator('.mobile-node-toolbar button[aria-label="Text color"]').click();
    }
    else {
      await page.getByTitle('Text settings', { exact: true }).click();
      await page.locator('.node-toolbar [aria-label="Text color"]').click();
    }
    const menu = page.getByRole('group', { name: 'Text color', exact: true });
    const colors = menu.locator(mobile ? 'button[aria-label^="Text color "]' : '.tb-color:not(.tb-color-none)');
    await expect(colors).toHaveCount(6);
    const backgrounds = await colors.evaluateAll(buttons => buttons.map(button => getComputedStyle(button.querySelector('.canvas-palette-swatch') ?? button).backgroundColor));
    expect(new Set(backgrounds).size).toBe(6);
    expect(backgrounds).not.toContain('rgba(0, 0, 0, 0)');
    await expect(colors.nth(3)).toHaveClass(/active/);
    await colors.first().click();
    if (mobile) await page.locator('.mobile-node-toolbar button[aria-label="Text color"]').click();
    else await page.locator('.node-toolbar [aria-label="Text color"]').click();
    await expect(colors.first()).toHaveClass(/active/);
    const textColor = await page.locator('[data-node-id="text"] .node-content').evaluate(el => getComputedStyle(el).color);
    expect(textColor).toBe(backgrounds[0]);
  });
}

test('wheel scrolls long node text before panning canvas', async ({ page }) => {
  await setup(page);
  // Font metric changes can trigger scroll anchoring after native wheel scroll.
  // Freeze that layout dependency before asserting an exact pixel delta.
  await page.evaluate(() => document.fonts.ready);
  const content = page.locator('[data-node-id="text"] .node-content');
  const world = page.locator('.canvas-world');
  const before = await world.getAttribute('style');
  await content.hover();
  await page.mouse.wheel(0, 100);
  // Wheel dispatch returns before the browser finishes native scrolling.
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(100);
  await expect(world).toHaveAttribute('style', before!);
  await content.evaluate(el => { el.scrollTop = 100; });
  await page.mouse.wheel(0, -50);
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(50);
  await expect(world).toHaveAttribute('style', before!);
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => content.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBe(0);
  await page.mouse.wheel(0, 100);
  await expect(world).not.toHaveAttribute('style', before!);
});

test('a text block stops at 144×48 and can grow again', async ({ page }) => {
  await setup(page);
  const node = page.locator('[data-node-id="text"]');
  await node.click();
  const box = (await node.boundingBox())!;
  const handle = node.locator('.resize-handle-br');
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => node.evaluate(el => ({ width: (el as HTMLElement).style.width, height: (el as HTMLElement).style.height }))).toEqual({ width: '144px', height: '48px' });
  // The inline model size updates before CSS size transitions settle.
  // Wait for the rendered handle position before starting the next drag.
  await expect(node).toHaveCSS('width', '144px');
  await expect(node).toHaveCSS('height', '48px');
  const smallHandle = (await handle.boundingBox())!;
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(smallHandle.x + smallHandle.width / 2 + 48, smallHandle.y + smallHandle.height / 2 + 48, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => node.evaluate(el => ({ width: (el as HTMLElement).style.width, height: (el as HTMLElement).style.height }))).toEqual({ width: '192px', height: '96px' });
});

test('wheel scrolls a node text editor without moving the canvas', async ({ page }) => {
  await setup(page);
  await page.locator('[data-node-id="text"] .node-content').dblclick();
  const editor = page.locator('[data-node-id="text"] .node-editor');
  await expect(editor).toBeVisible();
  // Opening the editor puts the caret at the end, which scrolls it down.
  await editor.evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBe(0);
  const before = await page.locator('.canvas-world').getAttribute('style');
  await editor.hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.canvas-world')).toHaveAttribute('style', before!);
});

for (const modifier of ['Control', 'Meta']) {
test(`${modifier} wheel still zooms over a scrollable text node`, async ({ page }) => {
  await setup(page);
  const world = page.locator('.canvas-world');
  const getScale = () => world.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  const before = await getScale();
  await page.locator('[data-node-id="text"] .node-content').hover();
  await page.keyboard.down(modifier);
  await page.mouse.wheel(0, 100);
  await page.keyboard.up(modifier);
  await expect.poll(getScale).toBeLessThan(before);
});
}

test('horizontal wheel scrolls nested code before panning canvas', async ({ page }) => {
  await setup(page);
  const code = page.locator('[data-node-id="text"] pre');
  const before = await page.locator('.canvas-world').getAttribute('style');
  await code.hover();
  await page.mouse.wheel(100, 0);
  await expect.poll(() => code.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('.canvas-world')).toHaveAttribute('style', before!);
});

test('Shift wheel pans when text cannot scroll horizontally', async ({ page }) => {
  await setup(page);
  const world = page.locator('.canvas-world');
  const before = await world.getAttribute('style');
  await page.locator('[data-node-id="text"] .node-first-line').hover();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect(world).not.toHaveAttribute('style', before!);
});

test('Shift wheel scrolls nested code horizontally', async ({ page }) => {
  await setup(page);
  const code = page.locator('[data-node-id="text"] pre');
  const before = await page.locator('.canvas-world').getAttribute('style');
  await code.hover();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect.poll(() => code.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('.canvas-world')).toHaveAttribute('style', before!);
});

test('thick wavy border is visible on all four sides', async ({ page }) => {
  await setup(page);
  const screenshot = await page.locator('[data-node-id="wave"]').screenshot();
  const sides = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = { left: 0, right: 0, top: 0, bottom: 0 };
    for (let y = 12; y < height - 12; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        if (data[offset]! > 200 && data[offset + 1]! < 80 && data[offset + 2]! < 80) {
          if (x < 12) counts.left++;
          if (x >= width - 12) counts.right++;
        }
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 12; x < width - 12; x++) {
        const offset = (y * width + x) * 4;
        if (data[offset]! > 200 && data[offset + 1]! < 80 && data[offset + 2]! < 80) {
          if (y < 12) counts.top++;
          if (y >= height - 12) counts.bottom++;
        }
      }
    }
    bitmap.close();
    return counts;
  }, Array.from(screenshot));
  for (const count of Object.values(sides)) expect(count).toBeGreaterThan(20);
});
