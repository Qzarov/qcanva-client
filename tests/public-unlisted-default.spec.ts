/**
 * Made public, a document is not in the Public directory until its owner
 * ticks "Show in Public". Mocked API.
 */

import { expect, test } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

test('making a document public leaves it out of the Public directory', async ({ page }) => {
  await setupTextDocMocks(page);
  const updates: Array<Record<string, unknown>> = [];
  let doc = { id: 'reg-doc', title: 'Regression Doc', revision: 1, visibility: 'private', listedInPublic: true, slug: null };
  await page.route('http://localhost:3001/api/text-documents/reg-doc', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: { document: doc, role: 'owner' } });
    const body = JSON.parse(route.request().postData() || '{}');
    updates.push(body);
    doc = { ...doc, ...body };
    return route.fulfill({ json: { document: doc, role: 'owner' } });
  });
  await page.goto('/docs/reg-doc?openShare=1');
  const select = page.locator('.share-visibility-select');
  await expect(select).toBeVisible({ timeout: 15000 });

  await select.selectOption('public');
  await expect.poll(() => updates.at(-1)).toMatchObject({ visibility: 'public', listedInPublic: false });
  const listed = page.getByRole('checkbox', { name: /Public/ });
  await expect(listed).not.toBeChecked();

  // Ticking it lists it; a later change keeps it listed.
  await listed.check();
  await expect.poll(() => updates.at(-1)).toMatchObject({ visibility: 'public', listedInPublic: true });
});
