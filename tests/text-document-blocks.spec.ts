/**
 * Live-browser coverage for the doc editor's block chrome: callout kind
 * menu, code block language picker, the outline following the caret, and
 * document links opening in a new tab on the web. Node-view chrome depends
 * on ProseMirror's real MutationObserver handling, which jsdom does not
 * reproduce (the callout menu vanished in a browser while passing in jsdom).
 */

import { expect, test, type Page } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

async function openDocWith(page: Page, html: string, extraRoutes?: () => Promise<void>) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupTextDocMocks(page);
  // After the fixture's catch-all: in Playwright the LATER route wins.
  await extraRoutes?.();
  await page.goto('/docs/reg-doc');
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.evaluate((content) => {
    (document.querySelector('.text-doc-page') as any).__vueParentComponent.setupState.editor.commands.setContent(content);
  }, html);
  await page.waitForTimeout(200);
}

const html = (page: Page) =>
  page.evaluate(() => (document.querySelector('.text-doc-page') as any).__vueParentComponent.setupState.editor.getHTML() as string);

test('the callout icon opens a kind menu that changes icon and colour', async ({ page }) => {
  await openDocWith(page, '<p>Top</p><aside data-variant="info"><p>Note.</p></aside>');
  await page.locator('.ProseMirror aside .text-doc-callout-icon').click();
  const menu = page.locator('[data-callout-variant-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-callout-variant]')).toHaveCount(4);
  await menu.locator('[data-callout-variant="danger"]').click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.ProseMirror aside')).toHaveAttribute('data-variant', 'danger');
  expect(await html(page)).toContain('data-variant="danger"');
  await expect(page.locator('.ProseMirror aside')).toContainText('Note.');
});

test('the code block shows its language and switching it is saved', async ({ page }) => {
  await openDocWith(page, '<pre><code class="language-bash">npm install</code></pre>');
  const picker = page.locator('.ProseMirror .text-doc-code-language');
  await expect(picker).toHaveValue('bash');
  await picker.selectOption('python');
  expect(await html(page)).toContain('language-python');
  await expect(page.locator('.ProseMirror pre code')).toHaveText('npm install');
});

test('the outline highlights the section the caret is in', async ({ page }) => {
  await openDocWith(page, '<h1>Alpha</h1><p>one</p><h2>Beta</h2><p>two</p><h1>Gamma</h1><p>three</p>');
  const active = page.locator('.text-doc-outline-panel .text-doc-outline-item-active');
  await page.locator('.ProseMirror p', { hasText: 'two' }).click();
  await expect(active).toHaveText('Beta');
  await page.locator('.ProseMirror p', { hasText: 'three' }).click();
  await expect(active).toHaveText('Gamma');
});

test('a document link opens in a new tab on the web, leaving this document open', async ({ page, context }) => {
  await openDocWith(page, '<p>See <span data-mention-id="target-1">Roadmap</span></p>', () =>
    page.route('http://localhost:3001/api/text-documents/reg-doc/mentions**', (route) =>
      route.fulfill({ json: { items: [{ id: 'target-1', title: 'Roadmap', accessible: true, deleted: false }] } })));
  const mention = page.locator('.ProseMirror [data-mention-id="target-1"]');
  await expect(mention).toHaveAttribute('data-mention-state', 'accessible');
  const [tab] = await Promise.all([context.waitForEvent('page'), mention.click()]);
  await tab.waitForLoadState('domcontentloaded');
  expect(new URL(tab.url()).pathname).toBe('/docs/target-1');
  expect(new URL(page.url()).pathname).toBe('/docs/reg-doc');
});
