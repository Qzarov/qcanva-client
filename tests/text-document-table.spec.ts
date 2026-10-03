/**
 * Live-browser coverage for Table blocks: horizontal-overflow containment
 * and column-width resizing.
 *
 * No text-document Playwright fixture existed before this file - every
 * existing spec here mocks a CANVAS (`tests/mobile.regression.spec.ts`'s
 * `setupMocks`). This mirrors that same `page.route` convention for
 * `/api/text-documents/:id` instead: the editor is constructed with
 * `editable: true` unconditionally and content-editability keys off the
 * mockable `role` in that GET response, not off a live socket - so no
 * running backend is needed for this spec.
 */

import { expect, test, type Page } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

export { setupTextDocMocks };

/**
 * Inserts a 3x3 table via the slash menu, then grows it to `columns` wide
 * via the table menu's "add column" button.
 *
 * Selects the "table" slash item by CLICKING `[data-slash-item="table"]`
 * rather than typing then pressing Enter: below the 760px breakpoint the
 * slash menu is a separate bottom sheet (`.text-doc-slash-sheet`), which is
 * click-driven, not keyboard-navigable (verified live - typing then
 * ArrowDown/Enter there selects nothing, the query text itself is all that
 * lands). Both the desktop popup and the mobile sheet render simultaneously
 * whenever `slashOpen` is true (CSS hides whichever the viewport doesn't
 * need) and both mark their "table" button with the same
 * `data-slash-item="table"` attribute, so `:visible` picks whichever one
 * the current viewport actually shows - one call path for both.
 */
export async function insertWideTable(page: Page, columns: number) {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('/table');
  await page.waitForTimeout(150);
  await page.locator('[data-slash-item="table"]:visible').click();
  await page.waitForTimeout(200);

  // Put the caret inside the table so the table bubble menu appears.
  await page.locator('.ProseMirror table td, .ProseMirror table th').first().click();
  await page.waitForTimeout(150);

  const addColumnBtn = page.locator('.text-doc-table-menu button[title*="olumn" i], .text-doc-table-menu button[aria-label*="olumn" i]').first();
  const startingColumns = await page.locator('.ProseMirror table tr').first().locator('td, th').count();
  for (let i = startingColumns; i < columns; i++) {
    await addColumnBtn.click();
    await page.waitForTimeout(80);
  }
}

/**
 * Where the first table sits relative to the text column and the page, plus
 * every real scroll container above it (overflow-x other than `visible`,
 * and the document root). A stretched table is ALLOWED to overhang the
 * centered column's own boxes (the paper, the reading-width shell - all
 * `overflow: visible`, nothing scrolls there); what must never happen is a
 * scroll container above the wrapper gaining horizontal overflow. That is
 * the regression this spec was first written for: `.text-doc-editor-shell`
 * (a flex item) missing `min-width: 0` let a wide table stretch the whole
 * shell, so `.text-doc-page` scrolled sideways / `#app` clipped it, instead
 * of the table scrolling inside its own wrapper.
 */
async function tableGeometry(page: Page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector('.tableWrapper') as HTMLElement;
    const column = document.querySelector('.ProseMirror') as HTMLElement;
    const body = document.querySelector('.text-doc-body') as HTMLElement;
    const w = wrapper.getBoundingClientRect();
    const c = column.getBoundingClientRect();
    const scrollContainersOverflow: { tag: string; over: number }[] = [];
    let el = wrapper.parentElement;
    while (el) {
      if (getComputedStyle(el).overflowX !== 'visible' || el === document.documentElement) {
        scrollContainersOverflow.push({
          tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          over: el.scrollWidth - el.clientWidth,
        });
      }
      el = el.parentElement;
    }
    return {
      wrapperLeft: w.left,
      wrapperRight: w.right,
      wrapperClient: wrapper.clientWidth,
      wrapperScroll: wrapper.scrollWidth,
      overflowX: getComputedStyle(wrapper).overflowX,
      columnLeft: c.left,
      columnRight: c.right,
      bodyRight: body.getBoundingClientRect().right,
      scrollContainersOverflow,
    };
  });
}

function expectNoScrollContainerOverflow(geometry: Awaited<ReturnType<typeof tableGeometry>>) {
  expect(geometry.scrollContainersOverflow.length).toBeGreaterThan(0);
  for (const container of geometry.scrollContainersOverflow) {
    expect(container.over, container.tag).toBeLessThanOrEqual(1);
  }
}

async function openDoc(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await setupTextDocMocks(page);
  await page.goto('/docs/reg-doc');
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
}

test.describe('desktop: a wide table stretches into the page before it scrolls', () => {
  test('a table that fits keeps exactly the text column\'s width', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertWideTable(page, 3);

    const g = await tableGeometry(page);
    expect(Math.abs(g.wrapperLeft - g.columnLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.wrapperRight - g.columnRight)).toBeLessThanOrEqual(1);
    expect(g.wrapperScroll).toBe(g.wrapperClient);
  });

  test('on a wide window a 10-column table uses the free page width and needs no scroll at all', async ({ page }) => {
    await openDoc(page, { width: 1920, height: 1000 });
    await insertWideTable(page, 10);

    const g = await tableGeometry(page);
    // Still left-aligned with the text...
    expect(Math.abs(g.wrapperLeft - g.columnLeft)).toBeLessThanOrEqual(1);
    // ...but reaching well past the text column's right edge...
    expect(g.wrapperRight).toBeGreaterThan(g.columnRight + 200);
    // ...and wide enough for the whole table, so nothing scrolls.
    expect(g.wrapperScroll).toBeLessThanOrEqual(g.wrapperClient + 1);
    expectNoScrollContainerOverflow(g);
  });

  test('a table wider than the whole free width stretches to the page edge, then scrolls inside itself', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertWideTable(page, 10);

    const g = await tableGeometry(page);
    expect(g.overflowX).toBe('auto');
    expect(Math.abs(g.wrapperLeft - g.columnLeft)).toBeLessThanOrEqual(1);
    expect(g.wrapperRight).toBeGreaterThan(g.columnRight);
    // Stops short of the window edge (TABLE_BLEED_RIGHT_GUTTER in the view).
    expect(g.wrapperRight).toBeLessThanOrEqual(g.bodyRight - 31);
    expect(g.wrapperScroll).toBeGreaterThan(g.wrapperClient);
    expectNoScrollContainerOverflow(g);
  });
});

test.describe('mobile: a wide table stays in the text column and scrolls', () => {
  test('at 375px the table keeps the column\'s width and scrolls inside itself', async ({ page }) => {
    await openDoc(page, { width: 375, height: 700 });
    await insertWideTable(page, 10);

    const g = await tableGeometry(page);
    expect(g.overflowX).toBe('auto');
    expect(Math.abs(g.wrapperLeft - g.columnLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.wrapperRight - g.columnRight)).toBeLessThanOrEqual(1);
    expect(g.wrapperScroll).toBeGreaterThan(g.wrapperClient);
    expectNoScrollContainerOverflow(g);
  });
});

test.describe('mobile touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a horizontal swipe over a wide table scrolls the table, not the page', async ({ page, context }) => {
    await setupTextDocMocks(page);
    await page.goto('/docs/reg-doc');
    await page.waitForSelector('.ProseMirror', { timeout: 15000 });
    await insertWideTable(page, 10);
    await page.locator('.ProseMirror').evaluate((el) => (el as HTMLElement).blur());

    const box = (await page.locator('.tableWrapper').boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 30;
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', startX);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', startX - i * 18);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', startX - 12 * 18);
    await page.waitForTimeout(400);

    const scrolled = await page.evaluate(() => ({
      table: (document.querySelector('.tableWrapper') as HTMLElement).scrollLeft,
      page: (document.querySelector('.text-doc-page') as HTMLElement).scrollLeft,
    }));
    expect(scrolled.table).toBeGreaterThan(50);
    expect(scrolled.page).toBe(0);
  });
});

/* ---------------- Column resizing affordance ---------------- */

/** Width of the cell `index` in the first row. */
async function firstRowCellWidth(page: Page, index: number) {
  return page.locator('.ProseMirror table tr').first().locator('th, td').nth(index).evaluate((el) => el.getBoundingClientRect().width);
}

/** Drags from x (at the first row's vertical middle) by dx, like a user grabbing a border. */
async function dragBorder(page: Page, x: number, dx: number) {
  const row = (await page.locator('.ProseMirror table tr').first().boundingBox())!;
  const y = row.y + row.height / 2;
  await page.mouse.move(x - 8, y);
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(x + dx, y + 200);
}

test.describe('desktop: column borders', () => {
  test('hovering a border only changes the cursor: no painted bar, no scrollbar', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertWideTable(page, 3);
    const first = (await page.locator('.ProseMirror table tr').first().locator('th, td').first().boundingBox())!;
    await page.mouse.move(first.x + first.width - 2, first.y + first.height / 2, { steps: 3 });

    await expect(page.locator('.ProseMirror')).toHaveClass(/resize-cursor/);
    const state = await page.evaluate(() => {
      const handle = document.querySelector('.column-resize-handle') as HTMLElement | null;
      const wrapper = document.querySelector('.tableWrapper') as HTMLElement;
      return {
        handle: !!handle,
        background: handle ? getComputedStyle(handle).backgroundColor : '',
        overY: wrapper.scrollHeight - wrapper.clientHeight,
        overX: wrapper.scrollWidth - wrapper.clientWidth,
      };
    });
    expect(state.handle).toBe(true);
    expect(state.background).toBe('rgba(0, 0, 0, 0)');
    expect(state.overY).toBeLessThanOrEqual(0);
    expect(state.overX).toBeLessThanOrEqual(0);
  });

  test('the last column can be narrowed (table gets narrower) and widened (table stretches)', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertWideTable(page, 3);
    const table = () => page.locator('.ProseMirror table').evaluate((el) => el.getBoundingClientRect().width);
    const startLast = await firstRowCellWidth(page, 2);
    const startTable = await table();
    const right = await page.locator('.ProseMirror table').evaluate((el) => el.getBoundingClientRect().right);

    await dragBorder(page, right - 2, -80);
    expect(await firstRowCellWidth(page, 2)).toBeLessThan(startLast - 60);
    expect(await table()).toBeLessThan(startTable - 60);

    const right2 = await page.locator('.ProseMirror table').evaluate((el) => el.getBoundingClientRect().right);
    await dragBorder(page, right2 - 2, 250);
    expect(await firstRowCellWidth(page, 2)).toBeGreaterThan(startLast + 100);
    const g = await tableGeometry(page);
    expect(g.wrapperRight).toBeGreaterThan(g.columnRight + 100);
    expectNoScrollContainerOverflow(g);
  });
});

/* ---------------- Reordering rows and columns (table-move.ts) ---------------- */

/** Inserts a 3x3 table and types a..i into it, row by row (Tab walks the cells). */
async function insertLetteredTable(page: Page) {
  await insertWideTable(page, 3);
  await page.locator('.ProseMirror table th, .ProseMirror table td').first().click();
  for (const [i, letter] of [...'abcdefghi'].entries()) {
    if (i > 0) await page.keyboard.press('Tab');
    await page.keyboard.type(letter);
  }
}

async function tableGrid(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.ProseMirror table tr')).map((tr) =>
      Array.from(tr.children).map((c) => (c.textContent ?? '').trim()),
    ),
  );
}

function cellByText(page: Page, text: string) {
  return page.locator('.ProseMirror table').locator('th, td').filter({ hasText: new RegExp(`^${text}$`) });
}

/** Hovers `fromText`'s cell, grabs its `axis` grip and releases it at (x, y). */
async function dragGrip(page: Page, axis: 'row' | 'column', fromText: string, to: { x: number; y: number }) {
  await cellByText(page, fromText).hover();
  const grip = page.locator(`[data-table-grip="${axis}"]`);
  await expect(grip).toBeVisible();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Several steps so it behaves like a real drag, not a teleport.
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.locator('.text-doc-table-drop-indicator')).toBeVisible();
  await page.mouse.up();
}

test.describe('desktop: drag a grip to reorder', () => {
  test('dragging the first column past the last one moves it there, and Ctrl+Z puts it back', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertLetteredTable(page);
    const lastCell = (await cellByText(page, 'c').boundingBox())!;

    await dragGrip(page, 'column', 'a', { x: lastCell.x + lastCell.width - 4, y: lastCell.y + 10 });

    expect(await tableGrid(page)).toEqual([['b', 'c', 'a'], ['e', 'f', 'd'], ['h', 'i', 'g']]);
    await expect(page.locator('.text-doc-table-drop-indicator')).toBeHidden();
    await page.keyboard.press('Control+z');
    expect(await tableGrid(page)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]);
  });

  test('dragging the last row above the second moves it there', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertLetteredTable(page);
    const secondRow = (await cellByText(page, 'd').boundingBox())!;

    await dragGrip(page, 'row', 'g', { x: secondRow.x + 10, y: secondRow.y + 3 });

    expect((await tableGrid(page)).map((r) => r[0])).toEqual(['a', 'g', 'd']);
  });

  test('releasing a grip where the line already is changes nothing', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertLetteredTable(page);
    const own = (await cellByText(page, 'e').boundingBox())!;
    await cellByText(page, 'e').hover();
    const grip = (await page.locator('[data-table-grip="column"]').boundingBox())!;
    await page.mouse.move(grip.x + 9, grip.y + 9);
    await page.mouse.down();
    await page.mouse.move(own.x + own.width / 2 + 5, own.y + 10, { steps: 4 });
    await expect(page.locator('.text-doc-table-drop-indicator')).toBeHidden();
    await page.mouse.up();
    expect(await tableGrid(page)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]);
  });

  test('menu arrows move the caret\'s row and column on desktop too', async ({ page }) => {
    await openDoc(page, { width: 1280, height: 800 });
    await insertLetteredTable(page);
    await cellByText(page, 'e').click();
    await page.locator('[data-table-move="column-right"]').click();
    await page.locator('[data-table-move="row-up"]').click();
    // "e" went right (b <-> c columns swap), then its row went up.
    expect(await tableGrid(page)).toEqual([['d', 'f', 'e'], ['a', 'c', 'b'], ['g', 'i', 'h']]);
  });
});

test.describe('mobile: reorder with the table menu arrows', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('no drag grips; the arrows move the caret\'s column and row and stop at the edges', async ({ page }) => {
    await setupTextDocMocks(page);
    await page.goto('/docs/reg-doc');
    await page.waitForSelector('.ProseMirror', { timeout: 15000 });
    await insertLetteredTable(page);

    await cellByText(page, 'a').tap();
    await expect(page.locator('[data-table-grip]:visible')).toHaveCount(0);
    await expect(page.locator('[data-table-move="column-left"]')).toBeDisabled();
    await expect(page.locator('[data-table-move="row-up"]')).toBeDisabled();

    await page.locator('[data-table-move="column-right"]').tap();
    await page.locator('[data-table-move="column-right"]').tap();
    expect((await tableGrid(page))[0]).toEqual(['b', 'c', 'a']);
    // The caret followed "a" to the last column: no further right.
    await expect(page.locator('[data-table-move="column-right"]')).toBeDisabled();

    // Last column is now a/d/g; "a"'s row goes down one.
    await page.locator('[data-table-move="row-down"]').tap();
    expect((await tableGrid(page)).map((r) => r[2])).toEqual(['d', 'a', 'g']);

    // Every button of the (wrapped) menu stays on screen.
    const boxes = await page.locator('.text-doc-table-menu button').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })),
    );
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(390);
    }
  });
});

