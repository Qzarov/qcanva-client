import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, options: { mobile?: boolean; enabled?: boolean; role?: string } = {}) {
  await page.setViewportSize(options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
  await page.addInitScript(({ enabled }) => {
    localStorage.setItem('token', 'minimap-test');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Test', email: 'test@example.com', role: 'user' }));
    localStorage.setItem('qcanva:locale', 'en');
    if (enabled !== undefined) localStorage.setItem('qcanva-minimap-enabled', String(enabled));
  }, { enabled: options.enabled });
  await page.route('http://localhost:3001/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/canvas/minimap') return route.fulfill({ json: {
      canvas: { id: 'minimap', title: 'Minimap', data: JSON.stringify({ nodes: [
        { id: 'text', type: 'text', text: 'Test', x: 0, y: 0, width: 240, height: 120 },
        { id: 'far', type: 'text', text: 'Far', x: 1500, y: 200, width: 240, height: 120 },
      ], edges: [] }) }, role: options.role ?? 'owner', revision: 1,
    } });
    return route.fulfill({ json: path.startsWith('/api/plugins/') || path.endsWith('/permissions') || path.endsWith('/messages') ? [] : {} });
  });
  await page.goto('/canvas/minimap');
  await expect(page.locator('[data-node-id="text"]')).toBeVisible();
}

async function openPreferences(page: Page, mobile = false, role = 'owner') {
  if (mobile) {
    await page.getByTestId('mobile-plugin-settings').click();
  } else {
    await page.getByRole('button', { name: role === 'owner' ? 'Plugins' : 'View settings', exact: true }).click();
  }
}

test('new desktop visits start with the minimap off', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.minimap')).toHaveCount(0);
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900, small: [120, 80], large: [180, 120] },
  { name: 'mobile', width: 600, height: 844, small: [88, 60], large: [132, 88] },
  { name: 'narrow mobile', width: 390, height: 844, small: [76, 52], large: [112, 76] },
  { name: 'smallest mobile', width: 320, height: 568, small: [76, 52], large: [112, 76] },
  { name: 'landscape', width: 844, height: 390, small: [120, 80], large: [180, 120] },
]) {
  test(`compact minimap and former-small large preset fit ${viewport.name}`, async ({ page }) => {
    const mobile = viewport.width <= 640 || viewport.height <= 500;
    await setup(page, { enabled: true, mobile });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const minimap = page.locator('.minimap');
    await expect(minimap).toHaveCSS('width', `${viewport.small[0]}px`);
    await expect(minimap).toHaveCSS('height', `${viewport.small[1]}px`);
    await openPreferences(page, mobile);
    await page.getByLabel('Minimap size', { exact: true }).selectOption('large');
    await expect(minimap).toHaveCSS('width', `${viewport.large[0]}px`);
    await expect(minimap).toHaveCSS('height', `${viewport.large[1]}px`);
    const box = (await minimap.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });
}

for (const mobile of [false, true]) {
  test(`size and visibility preferences persist (${mobile ? 'mobile' : 'web'})`, async ({ page }) => {
    await setup(page, { mobile });
    await openPreferences(page, mobile);
    await page.getByRole('switch', { name: /^Minimap:/ }).click();
    await expect(page.locator('.minimap')).toBeVisible();
    const before = (await page.locator('.minimap').boundingBox())!;
    await page.getByLabel('Minimap size', { exact: true }).selectOption('large');
    await expect.poll(async () => (await page.locator('.minimap').boundingBox())!.width).toBeGreaterThan(before.width);
    const large = (await page.locator('.minimap').boundingBox())!;
    expect(large.x).toBeGreaterThanOrEqual(0);
    expect(large.x + large.width).toBeLessThanOrEqual(mobile ? 390 : 1280);
    await page.reload();
    await expect(page.locator('.minimap')).toBeVisible();
    await expect.poll(async () => (await page.locator('.minimap').boundingBox())!.width).toBe(large.width);
    await openPreferences(page, mobile);
    await expect(page.getByLabel('Minimap size', { exact: true })).toHaveValue('large');
    await page.getByRole('switch', { name: /^Minimap:/ }).click();
    await page.reload();
    await expect(page.locator('.minimap')).toHaveCount(0);
  });
}

test('read-only visitors can change local view preferences, not plugins', async ({ page }) => {
  await setup(page, { role: 'read' });
  await openPreferences(page, false, 'read');
  await page.getByRole('switch', { name: /^Minimap:/ }).click();
  await page.getByLabel('Minimap size', { exact: true }).selectOption('large');
  await expect(page.locator('.minimap')).toBeVisible();
  await expect(page.locator('.canvas-plugin-panel .canvas-plugin-row:not(.canvas-plugin-row-minimap)')).toHaveCount(0);
});

test('viewport outline stays visible and constant-width at different scales', async ({ page }) => {
  await setup(page, { enabled: true });
  const outline = page.locator('.minimap-viewport');
  await expect(outline).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    const stroke = await outline.evaluate(el => getComputedStyle(el).stroke);
    expect(stroke).not.toBe('none');
    await expect(outline).toBeVisible();
    const svg = (await page.locator('.minimap svg').boundingBox())!;
    const box = (await outline.boundingBox())!;
    expect(box.x).toBeGreaterThan(svg.x);
    expect(box.y).toBeGreaterThan(svg.y);
    expect(box.x + box.width).toBeLessThan(svg.x + svg.width);
    expect(box.y + box.height).toBeLessThan(svg.y + svg.height);
  }
  await page.getByTitle('Zoom out', { exact: true }).click();
  await expect(outline).toHaveAttribute('vector-effect', 'non-scaling-stroke');
});

test('minimap navigation respects SVG letterboxing', async ({ page }) => {
  await setup(page, { enabled: true });
  const point = await page.locator('.minimap svg').evaluate(el => {
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    const projected = new DOMPoint(120, 60).matrixTransform(matrix);
    const x = Math.round(projected.x), y = Math.round(projected.y);
    const world = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x, y, worldX: world.x, worldY: world.y };
  });
  await page.mouse.click(point.x, point.y);
  const center = await page.locator('.canvas-world').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    const viewport = el.parentElement!;
    return { x: (viewport.clientWidth / 2 - matrix.e) / matrix.a, y: (viewport.clientHeight / 2 - matrix.f) / matrix.a };
  });
  expect(center.x).toBeCloseTo(point.worldX, 1);
  expect(center.y).toBeCloseTo(point.worldY, 1);
});

test('web fullscreen enters and exits without resetting camera', async ({ page }) => {
  await setup(page, { enabled: true });
  await page.getByTitle('Zoom in', { exact: true }).click();
  const world = page.locator('.canvas-world');
  const before = await world.getAttribute('style');
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('canvas-view'))).toBe(true);
  await expect(world).toHaveAttribute('style', before!);
  await expect.poll(() => page.locator('.canvas-world').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    const outline = el.parentElement!.querySelector('.minimap-viewport')!;
    return Math.abs(Number(outline.getAttribute('height')) * matrix.a - el.parentElement!.clientHeight);
  })).toBeLessThan(0.01);
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(world).toHaveAttribute('style', before!);
});

test('Escape exits fullscreen without resetting camera', async ({ page }) => {
  await setup(page);
  const before = await page.locator('.canvas-world').getAttribute('style');
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('.canvas-world')).toHaveAttribute('style', before!);
});

test('failed fullscreen requests show an error and leave the button usable', async ({ page }) => {
  await setup(page);
  await page.locator('.canvas-view').evaluate(el => { el.requestFullscreen = () => Promise.reject(new Error('blocked')); });
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(page.getByText('Could not switch full screen mode', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('share controls remain clickable in fullscreen', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Access', exact: true }).click();
  const close = page.locator('.text-doc-share-panel').getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeVisible();
  const box = (await close.boundingBox())!;
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.text-doc-share-panel'), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
  await close.click();
  await expect(page.locator('.text-doc-share-panel')).toHaveCount(0);
});
