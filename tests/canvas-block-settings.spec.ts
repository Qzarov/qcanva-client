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

for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`colour menu floats vertically above mobile controls at ${width}px`, async ({ page }) => {
    await setup(page, true);
    await page.setViewportSize({ width, height });
    await page.locator('.mobile-modebar-btn').nth(1).click();
    await page.locator('[data-node-id="text"]').click();
    await page.locator('.mobile-node-toolbar-row [aria-label="Background"]').click();
    const trigger = page.locator('.mobile-node-toolbar [aria-label="Background color"]');
    await trigger.click();
    const menu = page.getByRole('group', { name: 'Background color', exact: true });
    await expect(menu).toHaveCSS('position', 'fixed');
    await expect(menu).toHaveCSS('opacity', '1');
    const colors = menu.locator('.tb-color:not(.tb-color-none)');
    const boxes = await colors.evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y }; }));
    expect(new Set(boxes.map(b => Math.round(b.x))).size).toBe(1);
    expect(boxes.every((b, i) => i === 0 || b.y > boxes[i - 1]!.y)).toBe(true);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 8);
    await page.screenshot({ path: test.info().outputPath('color-palette.png') });
    await menu.getByRole('button', { name: 'Transparent', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('[data-node-id="text"]')).toHaveClass(/node-transparent/);
    await trigger.click();
    await trigger.click();
    await expect(menu).toBeHidden();
    await trigger.click();
    await page.locator('.mobile-node-toolbar-row [aria-label="Background"]').click();
    await expect(menu).toBeHidden();
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

test('desktop block actions omit history while general canvas undo remains available', async ({ page }) => {
  await setup(page);
  await page.locator('[data-node-id="text"]').click();
  await page.getByTitle('Node actions', { exact: true }).click();
  const actions = page.locator('.toolbar-popover');
  await expect(actions.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Redo', exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-controls [title="Undo"]')).toBeVisible();
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} drawing tools use a vertical colour menu without resetting the pen`, async ({ page }) => {
    await setup(page, mobile);
    if (mobile) {
      await page.locator('.mobile-modebar-btn').nth(2).click();
      await page.locator('.mobile-draw-tool-btn[aria-label="Pen"]').click();
      await page.locator('.mobile-draw-color-btn').click();
    } else {
      await page.locator('.draw-toolbar > .draw-toolbar-toggle').click();
      await page.locator('.draw-tool-btn[title="Pen"]').click();
      await page.locator('.draw-toolbar [aria-label="Color"]').click();
    }
    const menu = page.getByRole('group', { name: 'Color', exact: true });
    await expect(menu).toHaveCSS('flex-direction', 'column');
    await menu.locator('button').nth(2).click();
    await expect(menu).toBeHidden();
    await expect(page.locator(mobile ? '.mobile-draw-tool-btn[aria-label="Pen"]' : '.draw-tool-btn[title="Pen"]')).toHaveClass(/active/);
    await expect(page.locator(mobile ? '.mobile-draw-color-btn' : '.draw-toolbar [aria-label="Color"]')).toHaveCSS('background-color', 'rgb(47, 158, 68)');
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
      await page.locator('.mobile-node-toolbar [aria-label="Text color"]').click();
    }
    else {
      await page.getByTitle('Text settings', { exact: true }).click();
      await page.locator('.node-toolbar [aria-label="Text color"]').click();
    }
    const colors = page.getByRole('group', { name: 'Text color', exact: true }).locator('.tb-color:not(.tb-color-none)');
    await expect(colors).toHaveCount(6);
    const backgrounds = await colors.evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundColor));
    expect(new Set(backgrounds).size).toBe(6);
    expect(backgrounds).not.toContain('rgba(0, 0, 0, 0)');
    await expect(colors.nth(3)).toHaveClass(/active/);
    await colors.first().click();
    if (mobile) await page.locator('.mobile-node-toolbar [aria-label="Text color"]').click();
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

test('a text block can shrink to 24×24 and grow again', async ({ page }) => {
  await setup(page);
  const node = page.locator('[data-node-id="text"]');
  await node.click();
  const box = (await node.boundingBox())!;
  const handle = node.locator('.resize-handle-br');
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => node.evaluate(el => ({ width: (el as HTMLElement).style.width, height: (el as HTMLElement).style.height }))).toEqual({ width: '24px', height: '24px' });
  // The inline model size updates before CSS size transitions settle.
  // Wait for the rendered handle position before starting the next drag.
  await expect(node).toHaveCSS('width', '24px');
  await expect(node).toHaveCSS('height', '24px');
  const smallHandle = (await handle.boundingBox())!;
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(smallHandle.x + smallHandle.width / 2 + 48, smallHandle.y + smallHandle.height / 2 + 48, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => node.evaluate(el => ({ width: (el as HTMLElement).style.width, height: (el as HTMLElement).style.height }))).toEqual({ width: '72px', height: '72px' });
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
