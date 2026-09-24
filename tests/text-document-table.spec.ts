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

const API = 'http://localhost:3001/api/**';

export async function setupTextDocMocks(page: Page, overrides?: { title?: string; role?: string }) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'reg-doc-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'test-user', email: 'user@example.com', name: 'Test User', role: 'user',
    }));
  });

  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/text-documents/reg-doc') {
      await route.fulfill({ json: {
        document: {
          id: 'reg-doc',
          title: overrides?.title ?? 'Regression Doc',
          revision: 1,
          visibility: 'private',
          listedInPublic: true,
          slug: null,
        },
        role: overrides?.role ?? 'owner',
      }});
    } else if (path.endsWith('/permissions')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/mentions') || path.endsWith('/backlinks')) {
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

