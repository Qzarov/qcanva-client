/**
 * An admin takes anyone's resource out of the Public section from its card's
 * "⋯"; a user does not get that. Mocked API.
 */

import { expect, test, type Page } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

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
