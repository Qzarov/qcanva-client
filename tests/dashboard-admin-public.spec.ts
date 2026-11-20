/**
 * An admin takes anyone's resource out of the Public section from its card's
 * "⋯"; a user does not get that. Mocked API.
 */

import { expect, test, type Page } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';
import { setupTextDocMocks } from './text-doc-fixtures';

const SHOTS = process.env.SHOT_DIR;

const THEIRS = {
  id: 'doc-theirs', title: 'Чужая заметка', ownerId: 'user-9', visibility: 'public', listedInPublic: true,
  revision: 1, folderId: null, tags: [], createdAt: '2026-11-07T10:00:00Z', updatedAt: '2026-11-07T10:00:00Z',
};

async function open(page: Page, admin: boolean) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await serveDashboard(page, { admin });
  const calls: string[] = [];
  await page.route('http://localhost:3001/api/text-documents/public', (route) => route.fulfill({ json: { documents: [THEIRS] } }));
  await page.route('http://localhost:3001/api/admin/public/**', async (route) => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  return calls;
}

const card = (page: Page) => page.locator('[data-section="public"] [data-menu-trigger="public:text-document:doc-theirs"]');

test('an admin hides someone\'s document from Public: it leaves the section', async ({ page }) => {
  const calls = await open(page, true);
  await card(page).click();
  const menu = page.locator('[data-card-menu="public:text-document:doc-theirs"]');
  await menu.locator('[data-action="hide-from-public"]').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hide', exact: true }).click();
  await expect.poll(() => calls).toEqual(['POST /api/admin/public/text-document/doc-theirs/hidden']);
  await expect(card(page)).toHaveCount(0);
});

test('a user has no "Hide from Public" on a Public card', async ({ page }) => {
  await open(page, false);
  await card(page).click();
  const menu = page.locator('[data-card-menu="public:text-document:doc-theirs"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-action="hide-from-public"]')).toHaveCount(0);
});

test('the admin page lists what was hidden from Public and puts it back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await serveDashboard(page, { admin: true });
  const calls: string[] = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('http://localhost:3001/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/admin/public/hidden') {
      return route.fulfill(json([
        { type: 'text-document', id: 'doc-theirs', slug: null, title: 'Чужая заметка', ownerName: 'Аня', ownerEmail: 'anya@example.com', hiddenAt: '2026-11-08T10:00:00Z' },
        { type: 'canvas', id: 'c-9', slug: 'map', title: 'Карта', ownerName: null, ownerEmail: 'bob@example.com', hiddenAt: '2026-11-07T10:00:00Z' },
      ]));
    }
    if (url.pathname.startsWith('/api/admin/public/')) {
      calls.push(`${method} ${url.pathname}`);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/api/admin/stats') return route.fulfill(json({ userCount: 2, canvasCount: 1 }));
    if (url.pathname === '/api/admin/settings') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill(json([]));
  });
  await page.goto('/admin');
  const section = page.locator('[data-admin-hidden-public]');
  await expect(section.locator('[data-admin-hidden-item]')).toHaveCount(2);
  await expect(section.locator('[data-admin-hidden-item="canvas:c-9"] a')).toHaveAttribute('href', '/canvas/map');
  if (SHOTS) await section.screenshot({ path: `${SHOTS}/admin-hidden.png` });
  await section.locator('[data-admin-show-public="text-document:doc-theirs"]').click();
  await expect.poll(() => calls).toEqual(['DELETE /api/admin/public/text-document/doc-theirs/hidden']);
  await expect(section.locator('[data-admin-hidden-item]')).toHaveCount(1);
});

test('the owner of a hidden document cannot list it; pressing the box says an admin hid it', async ({ page }) => {
  await setupTextDocMocks(page);
  const updates: unknown[] = [];
  const doc = { id: 'reg-doc', title: 'Regression Doc', revision: 1, visibility: 'public', listedInPublic: true, publicHidden: true, slug: null };
  await page.route('http://localhost:3001/api/text-documents/reg-doc', async (route) => {
    if (route.request().method() !== 'GET') updates.push(route.request().postDataJSON());
    await route.fulfill({ json: { document: doc, role: 'owner' } });
  });
  await page.goto('/docs/reg-doc?openShare=1');
  const box = page.locator('[data-share-listed] input');
  await expect(box).toBeDisabled({ timeout: 15000 });
  await expect(box).not.toBeChecked();
  // A real press on the words: Playwright waits for a label's box to be enabled, a browser does not.
  await page.locator('[data-share-listed] span').click({ force: true });
  await expect(page.locator('[data-share-hidden-by-admin]')).toHaveText('Hidden by an administrator');
  if (SHOTS) await page.locator('[data-share-listed]').locator('xpath=..').screenshot({ path: `${SHOTS}/share-hidden.png` });
  expect(updates).toEqual([]);
});
