/**
 * Dashboard polish: floating notices (no layout jump), the Public heading
 * row, and the phone move-to-folder dialog. Mocked API, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';
const now = new Date().toISOString();
const textDoc = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, ownerId: 'user-1', visibility: 'private', createdAt: now, updatedAt: now, ...extra,
});

async function setupDashboard(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'dash-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', email: 'me@example.com', name: 'Me', role: 'user' }));
  });
  await page.route(API, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === '/canvas') return json({ own: [], shared: [], public: [], welcome: null });
    if (path === '/resource-folders') {
      return json({
        own: [{ id: 'folder-a', name: 'Work', role: 'owner', parentId: null, canvases: [], htmlDocuments: [], textDocuments: [textDoc('doc-pub', 'My public doc', { visibility: 'public', folderId: 'folder-a' })] }],
        shared: [],
      });
    }
    if (path === '/text-documents') {
      return json({ documents: [textDoc('doc-1', 'Plan'), textDoc('doc-2', 'Notes'), textDoc('doc-pub', 'My public doc', { visibility: 'public', folderId: 'folder-a' })] });
    }
    if (path === '/text-documents/public') {
      return json({ documents: [textDoc('doc-pub', 'My public doc', { visibility: 'public', folderId: 'folder-a' }), textDoc('doc-other', 'Their doc', { ownerId: 'user-9', visibility: 'public' })] });
    }
    if (path === '/html-documents') return json({ groups: [], documents: [] });
    if (path === '/html-documents/public') return json({ documents: [] });
    if (path === '/interactive-templates') return json({ templates: [] });
    if (path === '/access-requests/incoming') return json([]);
    if (path === '/tags') return json({ tags: [] });
    if (path.startsWith('/recent-resources')) return json([]);
    return json({});
  });
}

async function openDashboard(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await setupDashboard(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  // Let the initial load (and its own refresh flag) settle before a test
  // flips isRefreshing itself.
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !(document.querySelector('.app-layout') as any).__vueParentComponent.setupState.isRefreshing);
}

const dash = (page: Page) => page.evaluate(() => (document.querySelector('.app-layout') as any).__vueParentComponent.setupState);
void dash;

async function contentTop(page: Page) {
  return page.locator('[data-dashboard-view="recent"]').evaluate((el) => Math.round(el.getBoundingClientRect().top));
}

test.describe('desktop: notices float instead of pushing the list', () => {
  test('an action result shows as a floating toast; the list does not move', async ({ page }) => {
    await openDashboard(page, { width: 1280, height: 800 });
    const before = await contentTop(page);
    await page.evaluate(() => {
      const s = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
      s.feedback = { type: 'success', message: 'Moved to Work' };
    });
    const toast = page.locator('[data-dashboard-toast]');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'status');
    expect(await contentTop(page)).toBe(before);
    const box = (await toast.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(800 - 60);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
  });

  test('"Updating list…" floats at the top; the list does not move', async ({ page }) => {
    await openDashboard(page, { width: 1280, height: 800 });
    const before = await contentTop(page);
    await page.evaluate(() => {
      const s = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
      s.isRefreshing = true;
    });
    const status = page.locator('.dashboard-refresh-status');
    await expect(status).toBeVisible();
    expect(await contentTop(page)).toBe(before);
    const box = (await status.boundingBox())!;
    expect(box.y).toBeLessThan(40);
    await page.screenshot({ path: '/tmp/dash-notices.png' });
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Public: the sort button sits on the heading row; my foldered public doc is listed; Mine/Others filters', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard');
    await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
    await page.evaluate(() => {
      const s = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
      s.selectDashboardSection({ kind: 'public' });
    });
    const section = page.locator('[data-section="public"]');
    await expect(section).toBeVisible();
    const title = (await section.locator('.dash-section-head h2').boundingBox())!;
    const sort = (await section.locator('.dash-sort-button-mobile').boundingBox())!;
    expect(Math.abs((title.y + title.height / 2) - (sort.y + sort.height / 2))).toBeLessThan(8);
    await expect(section).toContainText('My public doc');
    await expect(section).toContainText('Their doc');
    await section.locator('[data-public-owner-filter="others"]').tap();
    await expect(section).not.toContainText('My public doc');
    await expect(section).toContainText('Their doc');
    await page.screenshot({ path: '/tmp/dash-public-mobile.png' });
  });

  test('move to folder: Cancel and Move share one row', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard');
    await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
    await page.evaluate(() => {
      const s = (document.querySelector('.app-layout') as any).__vueParentComponent.setupState;
      s.openMoveFolderModal({ id: 'doc-1', type: 'text-document', title: 'Plan' });
    });
    const actions = page.locator('[data-folder-modal-actions]');
    await expect(actions).toBeVisible();
    const buttons = actions.locator('button');
    const a = (await buttons.nth(0).boundingBox())!;
    const b = (await buttons.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
    await page.screenshot({ path: '/tmp/dash-move-mobile.png' });
  });
});
