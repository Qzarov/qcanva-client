/**
 * Nesting list items on a phone: no Tab on an on-screen keyboard, so the
 * left gutter beside the caret's item holds "→" (one level in) and, from the
 * second level on, "←" (one level out) - in the column of the block "+",
 * never over the text (it used to be a bubble over the caret).
 * Mocked API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

const SHOTS = process.env.SHOT_DIR;

async function openDocWith(page: Page, content: string, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await setupTextDocMocks(page);
  await page.goto('/docs/reg-doc');
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.evaluate((value) => {
    (document.querySelector('.text-doc-page') as any).__vueParentComponent.setupState.editor.commands.setContent(value);
  }, content);
  await page.waitForTimeout(200);
}

/** The document's HTML without the per-block ids the editor stamps on. */
const html = async (page: Page) =>
  (await page.evaluate(() => (document.querySelector('.text-doc-page') as any).__vueParentComponent.setupState.editor.getHTML() as string))
    .replace(/ data-block-id="[^"]*"/g, '');
const arrows = (page: Page) => page.locator('[data-list-arrows]');
const indent = (page: Page) => arrows(page).locator('[data-list-move="indent"]');
const outdent = (page: Page) => arrows(page).locator('[data-list-move="outdent"]');
const item = (page: Page, text: string) => page.locator('.ProseMirror li', { hasText: text }).last();

test('a bullet goes one level in with "→" beside it, and back out with "←"', async ({ page }) => {
  await openDocWith(page, '<ul><li><p>One</p></li><li><p>Two</p></li></ul><p>After</p>');
  await page.locator('.ProseMirror li p', { hasText: 'Two' }).click();

  await expect(indent(page)).toBeVisible();
  // First level: only "→", and no bubble over the caret any more.
  await expect(outdent(page)).toHaveCount(0);
  await expect(page.locator('.text-doc-list-menu')).toHaveCount(0);
  // In the gutter, left of the bullet, on the item's line.
  const arrowBox = (await arrows(page).boundingBox())!;
  const textBox = (await page.locator('.ProseMirror li p', { hasText: 'Two' }).boundingBox())!;
  expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(textBox.x - 12);
  expect(arrowBox.x).toBeGreaterThanOrEqual(0);
  expect(Math.abs((arrowBox.y + arrowBox.height / 2) - (textBox.y + textBox.height / 2))).toBeLessThan(12);
  await expect(indent(page)).toBeEnabled();
  await expect.poll(() => arrows(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-arrows-level1.png` });

  await indent(page).click();
  await expect.poll(() => html(page)).toBe('<ul><li><p>One</p><ul><li><p>Two</p></li></ul></li></ul><p>After</p>');
  // The caret stays in the moved item, the keyboard up.
  expect(await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))).toBe(true);
  // Second level: "←" beside "→", both still left of the text.
  await expect(outdent(page)).toBeVisible();
  const nestedArrows = (await arrows(page).boundingBox())!;
  const nestedText = (await page.locator('.ProseMirror li li p', { hasText: 'Two' }).boundingBox())!;
  expect(nestedArrows.x + nestedArrows.width).toBeLessThanOrEqual(nestedText.x - 12);
  expect(nestedArrows.x).toBeGreaterThanOrEqual(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-arrows-level2.png` });

  await outdent(page).click();
  await expect.poll(() => html(page)).toBe('<ul><li><p>One</p></li><li><p>Two</p></li></ul><p>After</p>');
  await expect(outdent(page)).toHaveCount(0);

  // Out of the list: no arrows.
  await page.locator('.ProseMirror > p', { hasText: 'After' }).click();
  await expect(arrows(page)).toHaveCount(0);
});

test('the first item has nothing above to go under: its "→" is off', async ({ page }) => {
  await openDocWith(page, '<ul><li><p>One</p></li><li><p>Two</p></li></ul>');
  await page.locator('.ProseMirror li p', { hasText: 'One' }).click();
  await expect(indent(page)).toBeDisabled();
  // The block "+" of the list sits on this same line: it steps aside for the arrow.
  await expect(page.locator('.text-doc-block-controls .text-doc-add-block')).toBeHidden();
});

test('todos nest the same way', async ({ page }) => {
  await openDocWith(
    page,
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Buy</p></li>' +
      '<li data-type="taskItem" data-checked="false"><p>Milk</p></li></ul>',
  );
  await page.locator('.ProseMirror li p', { hasText: 'Milk' }).click();
  const checkbox = (await item(page, 'Milk').locator('input[type="checkbox"]').boundingBox())!;
  const arrowBox = (await arrows(page).boundingBox())!;
  expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(checkbox.x);
  await indent(page).click();
  await expect(outdent(page)).toBeVisible();
  expect(await html(page)).toContain('<p>Buy</p><ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Milk</p>');
});

test('a computer has Tab: no arrows there', async ({ page }) => {
  await openDocWith(page, '<ul><li><p>One</p></li><li><p>Two</p></li></ul>', 1280);
  await page.locator('.ProseMirror li p', { hasText: 'Two' }).click();
  await page.waitForTimeout(200);
  await expect(arrows(page)).toHaveCount(0);
});
