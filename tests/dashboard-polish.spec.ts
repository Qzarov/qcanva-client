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
      return json({ documents: [
        textDoc('doc-1', 'Plan'),
        textDoc('doc-2', 'Notes'),
        textDoc('doc-pub', 'My public doc', { visibility: 'public', folderId: 'folder-a' }),
        ...Array.from({ length: 6 }, (_, i) => textDoc(`sh-${i}`, `Shared ${i}`, { ownerId: 'user-9' })),
      ] });
    }
    if (path === '/text-documents/public') {
      return json({ documents: [textDoc('doc-pub', 'My public doc', { visibility: 'public', folderId: 'folder-a' }), textDoc('doc-other', 'Their doc', { ownerId: 'user-9', visibility: 'public' })] });
    }
    if (path === '/html-documents') return json({ groups: [], documents: [] });
    if (path === '/html-documents/public') return json({ documents: [] });
    if (path === '/interactive-templates') return json({ templates: [] });
    if (path === '/access-requests/incoming') return json([]);
    if (path === '/tags') return json({ tags: [] });
    if (path.startsWith('/recent-resources')) {
      return json([
        { id: 'r1', resourceType: 'text-document', resourceId: 'doc-pub', updatedAt: now },
        { id: 'r2', resourceType: 'text-document', resourceId: 'doc-1', updatedAt: now },
      ]);
    }
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

/**
 * The section's top is just below the sticky bar - or, for a section near
 * the end, the feed is scrolled as far as it goes (nothing left below it).
 */
async function expectScrolledTo(page: Page, section: string) {
  const state = await page.evaluate((name) => {
    const main = document.querySelector('.app-main') as HTMLElement;
    const bar = document.querySelector('.dashboard-feed-nav') as HTMLElement;
    const el = document.querySelector(`[data-feed-section="${name}"]`) as HTMLElement;
    return {
      offset: el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom,
      atEnd: main.scrollTop >= main.scrollHeight - main.clientHeight - 2,
      scrolled: main.scrollTop,
    };
  }, section);
  expect(state.scrolled).toBeGreaterThan(0);
  expect(state.atEnd || (state.offset >= -4 && state.offset < 40)).toBe(true);
}

test.describe('desktop: home is one feed', () => {
  test('sections in order, the bar jumps to one and marks the section in view; Recent shows folder paths', async ({ page }) => {
    await openDashboard(page, { width: 1280, height: 800 });
    const order = await page.locator('[data-feed-section]').evaluateAll((els) => els.map((el) => el.getAttribute('data-feed-section')));
    expect(order).toEqual(['recent', 'shared', 'public']);
    await expect(page.locator('[data-feed-nav]')).toHaveText(['Recent', 'Folders', 'Shared with me', 'Public']);
    await expect(page.locator('[data-feed-section="shared"] .dash-grid > *')).toHaveCount(4);

    const recentPath = page.locator('.dashboard-recent-card', { hasText: 'My public doc' }).locator('[data-recent-folder-path]');
    await expect(recentPath).toHaveText('Work');

    await page.locator('[data-feed-nav="public"]').click();
    await expect(page.locator('[data-feed-nav="public"]')).toHaveAttribute('aria-current', 'true');
    await page.waitForTimeout(700); // smooth scroll
    await page.screenshot({ path: '/tmp/dash-feed-desktop.png' });
    await expectScrolledTo(page, 'public');
    // Still Public once the scroll settled (the spy must not hand it to a section above).
    await expect(page.locator('[data-feed-nav="public"]')).toHaveAttribute('aria-current', 'true');
    // The bar stays on screen (sticky) while the feed scrolls.
    const barTop = await page.locator('.dashboard-feed-nav').evaluate((el) => el.getBoundingClientRect().top);
    expect(barTop).toBeGreaterThanOrEqual(0);

    // Scroll-spy: scrolling back up by hand makes Recent current again.
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -3000);
    await expect(page.locator('[data-feed-nav="recent"]')).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('mobile: home feed', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the section bar works without opening the sidebar', async ({ page }) => {
    await setupDashboard(page);
    await page.goto('/dashboard');
    await page.waitForSelector('[data-feed-section="recent"]', { timeout: 15000 });
    await page.locator('[data-feed-nav="shared"]').tap();
    await expect(page.locator('[data-feed-nav="shared"]')).toHaveAttribute('aria-current', 'true');
    await page.waitForTimeout(700);
    await page.screenshot({ path: '/tmp/dash-feed-mobile.png' });
    await expectScrolledTo(page, 'shared');
    await expect(page.locator('[data-feed-nav="shared"]')).toHaveAttribute('aria-current', 'true');
  });
});
