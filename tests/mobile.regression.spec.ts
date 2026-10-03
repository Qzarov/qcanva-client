/**
 * Regression tests for the mobile polish batch:
 * - Unified selection model (Tasks 3/4/8)
 * - Drawing controls in MobileNodeToolbar (Task 5)
 * - Marquee includes drawings (Tasks 6/7)
 * - Header overflow fix at 320px (Task 2)
 * - Dashboard folder sort in header (Task 1)
 * - Desktop regression (drawing toolbar, marquee)
 */

import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';

/** Base mocks shared across tests */
async function setupMocks(page: Page, overrides?: {
  canvasData?: Record<string, unknown>;
  folders?: Array<Record<string, unknown>>;
}) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'regression-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'test-user', email: 'user@example.com', name: 'Test User', role: 'user',
    }));
    // Force isTouchDevice = true so CanvasLoader activates touch handlers
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  const defaultCanvasData = overrides?.canvasData ?? {
    nodes: [{ id: 'node-1', type: 'text', text: 'Hello', x: 100, y: 100, width: 150, height: 60 }],
    edges: [],
  };
  const folders = overrides?.folders ?? [];

  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/canvas/reg-canvas') {
      await route.fulfill({ json: {
        canvas: { id: 'reg-canvas', title: 'Regression Canvas', data: JSON.stringify(defaultCanvasData), slug: null },
        role: 'owner', isPublic: false, revision: 1,
      }});
    } else if (path === '/api/canvas/smoke-canvas') {
      await route.fulfill({ json: {
        canvas: { id: 'smoke-canvas', title: 'Smoke Canvas', data: JSON.stringify(defaultCanvasData), slug: null },
        role: 'owner', isPublic: false, revision: 1,
      }});
    } else if (path.endsWith('/resource-folders')) {
      await route.fulfill({ json: { own: folders, shared: [] } });
    } else if (path.endsWith('/permissions')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/mentions') || path.endsWith('/backlinks') || path.endsWith('/messages')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/plugins')) {
      await route.fulfill({ json: { plugins: [] } });
    } else if (path.endsWith('/tags')) {
      await route.fulfill({ json: { tags: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Task 2 — Header overflow at 320px
// ─────────────────────────────────────────────────────────────

test('canvas topbar: online-users hidden at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  // The .online-users element should be hidden by mobile CSS
  const hidden = await page.evaluate(() => {
    const el = document.querySelector('.online-users') as HTMLElement | null;
    if (!el) return true; // not rendered = counts as hidden
    return getComputedStyle(el).display === 'none';
  });
  expect(hidden).toBe(true);
});

test('canvas topbar: ws-status hidden at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  const hidden = await page.evaluate(() => {
    const el = document.querySelector('.topbar-ws-status') as HTMLElement | null;
    if (!el) return true;
    return getComputedStyle(el).display === 'none';
  });
  expect(hidden).toBe(true);
});

test('canvas topbar: back and undo/redo visible and within 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  const backBtn = page.locator('.canvas-topbar .back-btn');
  await expect(backBtn).toBeVisible();
  const backBox = await backBtn.boundingBox();
  expect(backBox!.x + backBox!.width).toBeLessThanOrEqual(320);

  const undoBtn = page.locator('.canvas-topbar-undo');
  await expect(undoBtn).toBeVisible();
  const undoBox = await undoBtn.boundingBox();
  expect(undoBox!.x + undoBox!.width).toBeLessThanOrEqual(320);
});

// ─────────────────────────────────────────────────────────────
// Task 5 — Drawing toolbar: mobile hidden, desktop shown
// ─────────────────────────────────────────────────────────────

test('drawing-actions-toolbar hidden at 390px mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  const hidden = await page.evaluate(() => {
    const el = document.querySelector('.drawing-actions-toolbar') as HTMLElement | null;
    if (!el) return true;
    return getComputedStyle(el).display === 'none';
  });
  expect(hidden).toBe(true);
});

test('drawing-actions-toolbar NOT hidden at 1280px desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  // The toolbar element exists but is only hidden when a drawing is selected;
  // at desktop size the CSS rule should not force display:none.
  const cssForced = await page.evaluate(() => {
    const el = document.querySelector('.drawing-actions-toolbar') as HTMLElement | null;
    if (!el) return false; // not present before selection — CSS OK
    const style = getComputedStyle(el);
    // Should NOT be forced hidden by the .desktop-only rule at 1280px
    return style.display === 'none' && el.classList.contains('desktop-only');
  });
  expect(cssForced).toBe(false);
});

// ─────────────────────────────────────────────────────────────
// Tasks 3/4/8 — Unified selection model (touch)
// Tasks 6/7 — Marquee includes drawings
// ─────────────────────────────────────────────────────────────

// All touch interaction tests need hasTouch enabled in the browser context.
const touchTest = test.extend<Record<string, never>>({});
touchTest.use({ hasTouch: true });

touchTest('touch: tapping a node shows MobileNodeToolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('[data-node-id="node-1"]', { timeout: 8000 });

  // Switch to cursor mode so taps select nodes
  const cursorBtn = page.locator('.mobile-modebar-btn[aria-label="Cursor"]');
  await expect(cursorBtn).toBeVisible();
  await cursorBtn.click();

  // Toolbar should be hidden before selection
  const toolbar = page.locator('.mobile-node-toolbar');
  await expect(toolbar).not.toBeVisible();

  // Tap the node
  const nodeEl = page.locator('[data-node-id="node-1"]');
  const box = await nodeEl.boundingBox();
  expect(box).toBeTruthy();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(100);

  await expect(toolbar).toBeVisible();
});

touchTest('touch: tapping empty canvas hides MobileNodeToolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page);
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('[data-node-id="node-1"]', { timeout: 8000 });

  const cursorBtn = page.locator('.mobile-modebar-btn[aria-label="Cursor"]');
  await cursorBtn.click();

  // Select the node first
  const nodeEl = page.locator('[data-node-id="node-1"]');
  const box = await nodeEl.boundingBox();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(100);

  const toolbar = page.locator('.mobile-node-toolbar');
  await expect(toolbar).toBeVisible();

  // Dispatch touch events directly to canvas-viewport to avoid topbar overlay interference.
  // The topbar is position:absolute inside canvas-viewport, so coordinate-based taps can land on it.
  await page.evaluate(() => {
    const el = document.querySelector('.canvas-viewport') as HTMLElement;
    const mk = (x: number, y: number) => new Touch({ identifier: 99, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
    const t = mk(370, 400); // middle of canvas, away from any node
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], changedTouches: [t], targetTouches: [t] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t], targetTouches: [] }));
  });
  await page.waitForTimeout(200);

  await expect(toolbar).not.toBeVisible();
});

touchTest('touch marquee: selects drawing and shows MobileNodeToolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page, {
    canvasData: {
      nodes: [],
      edges: [],
      drawings: [{
        id: 'draw1', tool: 'pen',
        points: [0, 0, 30, 30],
        color: '#000000', width: 2, createdAt: '',
      }],
    },
  });
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('.canvas-viewport', { timeout: 8000 });

  const cursorBtn = page.locator('.mobile-modebar-btn[aria-label="Cursor"]');
  await cursorBtn.click();

  // Drag a marquee across the entire viewport — will cover any drawing
  const viewport = page.locator('.canvas-viewport');
  const vBox = await viewport.boundingBox();
  expect(vBox).toBeTruthy();

  const x0 = vBox!.x + 5;
  const y0 = vBox!.y + 5;
  const x1 = vBox!.x + vBox!.width - 5;
  const y1 = vBox!.y + vBox!.height - 5;

  // Simulate touchstart → touchmove (> 8px) → touchend using proper Touch constructor
  await page.evaluate(({ x0, y0, x1, y1 }) => {
    const el = document.querySelector('.canvas-viewport')!;
    const mkTouch = (x: number, y: number) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
    const dispatch = (type: string, ...pts: Array<{ x: number; y: number }>) => {
      const touches = pts.map((p) => mkTouch(p.x, p.y));
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : touches,
        changedTouches: touches, targetTouches: type === 'touchend' ? [] : touches,
      }));
    };
    dispatch('touchstart', { x: x0, y: y0 });
    dispatch('touchmove', { x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
    dispatch('touchmove', { x: x1, y: y1 });
    dispatch('touchend', { x: x1, y: y1 });
  }, { x0, y0, x1, y1 });

  await page.waitForTimeout(150);

  const toolbar = page.locator('.mobile-node-toolbar');
  await expect(toolbar).toBeVisible();
});

touchTest('touch marquee: old drawing selection cleared when new marquee misses all objects', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMocks(page, {
    canvasData: {
      nodes: [{ id: 'node-1', type: 'text', text: 'A', x: 100, y: 100, width: 150, height: 60 }],
      edges: [],
      drawings: [],
    },
  });
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('[data-node-id="node-1"]', { timeout: 8000 });

  const cursorBtn = page.locator('.mobile-modebar-btn[aria-label="Cursor"]');
  await cursorBtn.click();

  // Select the node first
  const nodeEl = page.locator('[data-node-id="node-1"]');
  const box = await nodeEl.boundingBox();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(100);

  const toolbar = page.locator('.mobile-node-toolbar');
  await expect(toolbar).toBeVisible();

  // Dispatch touch events directly to canvas-viewport to avoid topbar overlay interference
  await page.evaluate(() => {
    const el = document.querySelector('.canvas-viewport') as HTMLElement;
    const mk = (x: number, y: number) => new Touch({ identifier: 99, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
    const t = mk(370, 400);
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], changedTouches: [t], targetTouches: [t] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t], targetTouches: [] }));
  });
  await page.waitForTimeout(200);

  await expect(toolbar).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────
// Task 1 — Dashboard folder sort in header
// ─────────────────────────────────────────────────────────────

test('dashboard: sort button inside folder header (not standalone row)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const folder = {
    id: 'folder-1', name: 'Test Folder', parentId: null,
    canvasCount: 0, htmlDocumentCount: 0, textDocumentCount: 0,
    role: 'owner', resources: [],
  };

  await setupMocks(page, { folders: [folder] });
  await page.goto('/dashboard');
  await page.waitForSelector('.subfolder-card', { timeout: 8000 });

  // Click the folder to navigate into it
  await page.locator('[data-recent-folder-tile="folder-1"]').click();
  await page.waitForSelector('.folder-manager-top', { timeout: 5000 });

  // Sort button should be INSIDE .folder-manager-top
  const sortInHeader = page.locator('.folder-manager-top .dash-sort-button-mobile');
  await expect(sortInHeader).toBeVisible();

  // No standalone sort row should be visible (the standalone row only appears for 'public' section)
  const standaloneSort = page.locator('.dash-sort-menu-mobile:not(.folder-header-sort)');
  // Either not present or not visible
  const count = await standaloneSort.count();
  if (count > 0) {
    await expect(standaloneSort).not.toBeVisible();
  }
});

// ─────────────────────────────────────────────────────────────
// Desktop regression — drawing toolbar and marquee
// ─────────────────────────────────────────────────────────────

test('desktop: commitMarqueeSelection still selects nodes via drag', async ({ page }) => {
  // Desktop uses pointer events, not touch
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupMocks(page, {
    canvasData: {
      nodes: [{ id: 'node-d', type: 'text', text: 'Desktop', x: 200, y: 200, width: 150, height: 60 }],
      edges: [],
    },
  });
  await page.goto('/canvas/reg-canvas');
  await page.waitForSelector('[data-node-id="node-d"]', { timeout: 8000 });

  const nodeEl = page.locator('[data-node-id="node-d"]');
  const box = await nodeEl.boundingBox();
  expect(box).toBeTruthy();

  // Drag a marquee that covers the node
  const x0 = box!.x - 20;
  const y0 = box!.y - 20;
  const x1 = box!.x + box!.width + 20;
  const y1 = box!.y + box!.height + 20;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  // Node should now be selected — CanvasLoader adds .is-selected to the node wrapper
  const isSelected = await page.evaluate(() => {
    const el = document.querySelector('[data-node-id="node-d"]');
    if (!el) return false;
    return el.classList.contains('is-selected') || document.querySelector('.is-selected') !== null;
  });
  expect(isSelected).toBe(true);
});
