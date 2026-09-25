/**
 * Live-browser coverage for the text bubble menu, the link editor / link
 * menu, and the mobile "page jumps" on formatting and todo checkboxes.
 * Same mocked document as text-document-table.spec.ts (no backend needed).
 */

import { expect, test, type Page } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

async function openDoc(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await setupTextDocMocks(page);
  await page.goto('/docs/reg-doc');
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
}

/** Viewport rect of the first occurrence of `word` in the document text. */
async function wordRect(page: Page, word: string) {
  const rect = await page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.ProseMirror')!, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const i = node.textContent!.indexOf(w);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + w.length);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  }, word);
  if (!rect) throw new Error(`no "${word}" in the document`);
  return rect;
}

async function selectWord(page: Page, word: string) {
  const r = await wordRect(page, word);
  await page.mouse.dblclick(r.x + r.width / 2, r.y + r.height / 2);
}

/** The text bubble menu's box, or null while it is hidden. */
async function bubbleBox(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.text-doc-bubble-menu') as HTMLElement | null;
    const root = menu?.closest('[data-tippy-root]') as HTMLElement | null;
    if (!menu || !root || getComputedStyle(root).visibility === 'hidden') return null;
    const r = menu.getBoundingClientRect();
    return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height, hasForm: !!menu.querySelector('form') } : null;
  });
}

const docText = (page: Page) =>
  page.locator('.ProseMirror p').evaluateAll((ps) => ps.map((p) => p.textContent ?? '').filter(Boolean).join('\n'));

test.describe('desktop: link editor', () => {
  test.beforeEach(async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('Alpha beta gamma delta.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second line of text.');
  });

  test('the URL typed into the link box lands in the link, not in the document', async ({ page }) => {
    await selectWord(page, 'beta');
    await page.locator('[data-bubble-action="link"]').click();
    const input = page.locator('[data-bubble-link-input]');
    await expect(input).toBeFocused();
    // Also survive the user reaching for the box with the mouse.
    await input.hover();
    await input.click();
    await page.keyboard.type('https://example.com/some/path');
    await page.keyboard.press('Enter');

    const link = page.locator('.ProseMirror a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText('beta');
    await expect(link).toHaveAttribute('href', 'https://example.com/some/path');
    expect(await docText(page)).toBe('Alpha beta gamma delta.\nSecond line of text.');
    // The box is gone (the word stays selected, so the formatting bubble may stay).
    await expect(page.locator('[data-bubble-link-input]')).toHaveCount(0);
  });

  test('clicking back into the text abandons the link box instead of dragging it along', async ({ page }) => {
    await selectWord(page, 'beta');
    await page.locator('[data-bubble-action="link"]').click();
    await expect(page.locator('[data-bubble-link-input]')).toBeVisible();

    const second = await wordRect(page, 'Second');
    await page.mouse.click(second.x + 3, second.y + second.height / 2);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    expect(await bubbleBox(page)).toBeNull();
    await expect(page.locator('[data-bubble-link-input]')).toHaveCount(0);
    await expect(page.locator('.ProseMirror a')).toHaveCount(0);
  });

  test('the link menu can remove a link, keeping its text', async ({ page }) => {
    await selectWord(page, 'gamma');
    await page.locator('[data-bubble-action="link"]').click();
    await page.keyboard.type('https://example.com');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ProseMirror a')).toHaveCount(1);

    // Far enough from the double-click above not to count as a triple-click.
    await page.waitForTimeout(700);
    await page.locator('.ProseMirror a').click();
    const remove = page.locator('.text-doc-link-action-menu [data-link-action="remove"]');
    await expect(remove).toBeVisible();
    await remove.click();

    await expect(page.locator('.ProseMirror a')).toHaveCount(0);
    expect(await docText(page)).toBe('Alpha beta gamma delta.\nSecond line of text.');
    await expect(page.locator('.text-doc-link-action-menu')).toHaveCount(0);
  });
});

test.describe('desktop: link menu', () => {
  test('Edit puts the current address in a focused box and saves the new one', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('Read the docs today.');
    await selectWord(page, 'docs');
    await page.locator('[data-bubble-action="link"]').click();
    await page.keyboard.type('https://old.example.com');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(700);
    await page.locator('.ProseMirror a').click();
    await page.locator('.text-doc-link-action-menu').getByRole('button', { name: 'Edit' }).click();
    const input = page.locator('[data-bubble-link-input]');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('https://old.example.com');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('https://new.example.com');
    await page.keyboard.press('Enter');

    await expect(page.locator('.ProseMirror a')).toHaveAttribute('href', 'https://new.example.com');
    await expect(page.locator('.ProseMirror a')).toHaveText('docs');
    expect(await docText(page)).toBe('Read the docs today.');
  });
});

test.describe('desktop: formatting bubble position', () => {
  test('jumps straight to a new selection instead of lingering at the old one', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('First word at the start of a fairly long line of text here');
    await page.keyboard.press('Enter');
    await page.keyboard.type('and a second line that ends with farword');

    await selectWord(page, 'First');
    await expect.poll(() => bubbleBox(page)).not.toBeNull();

    await selectWord(page, 'farword');
    const target = await wordRect(page, 'farword');
    await page.waitForTimeout(60); // well under the old 250ms update delay
    const box = (await bubbleBox(page))!;
    const dx = box.x + box.width / 2 - (target.x + target.width / 2);
    expect(Math.abs(dx)).toBeLessThan(30);
    expect(box.y + box.height).toBeLessThan(target.y);
  });
});

test.describe('mobile: no page jumps', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Bold from the bubble keeps the caret on the selection (no jump to the document end)', async ({ page }) => {
    await openDoc(page);
    await page.locator('.ProseMirror').tap();
    await page.keyboard.type('Make this bold please.');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Filler paragraph ${i}.`);
    }
    // Select "this" in the first paragraph.
    const r = await wordRect(page, 'this');
    await page.mouse.click(r.x + 1, r.y + r.height / 2);
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    await page.locator('[data-bubble-mark="bold"]:visible').tap();
    await page.waitForTimeout(300);

    await expect(page.locator('.ProseMirror strong')).toHaveText('this');
    const caretText = await page.evaluate(() => {
      const sel = window.getSelection()!;
      return sel.anchorNode?.parentElement?.closest('p')?.textContent ?? '';
    });
    expect(caretText).toBe('Make this bold please.');
  });

  test('ticking a todo does not focus the editor or move the caret', async ({ page }) => {
    await openDoc(page);
    await page.locator('.ProseMirror').tap();
    await page.keyboard.type('Top paragraph.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[ ] Buy milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Walk dog');
    // Leave the editor (as when the keyboard is dismissed), caret at the top.
    const top = await wordRect(page, 'Top');
    await page.mouse.click(top.x + 2, top.y + top.height / 2);
    await page.locator('.ProseMirror').evaluate((el) => (el as HTMLElement).blur());

    const items = page.locator('ul[data-type="taskList"] > li');
    await expect(items).toHaveCount(2);
    await items.first().locator('input[type="checkbox"]').tap();

    await expect(items.first()).toHaveAttribute('data-checked', 'true');
    await page.waitForTimeout(300); // tiptap's focus() lands a frame later
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror') ?? false);
    expect(focused).toBe(false);
  });
});
