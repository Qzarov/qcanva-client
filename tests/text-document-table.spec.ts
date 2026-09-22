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
 * Walks from `.tableWrapper` up through every ancestor, reading each one's
 * clientWidth/scrollWidth/overflow-x. The wrapper is expected to be the
 * ONLY element in the chain where scrollWidth exceeds clientWidth - every
 * ancestor above it must stay exactly contained. A weaker check (e.g. just
 * `document.documentElement`'s own scrollWidth vs clientWidth) cannot tell
 * "the wrapper correctly scrolls" apart from "some ancestor blew out
 * sideways and #app's own `overflow-x: hidden` silently clipped the
 * difference" - both look identical at the document level. Caught exactly
 * that live: `.text-doc-editor-shell` (a flex item with `min-width: auto`
 * before this task's own fix) stretched to the table's min-content width
 * instead of staying put, and the excess was clipped rather than scrolled.
 */
async function tableWrapperOverflowChain(page: Page) {
  return page.evaluate(() => {
    const chain: { tag: string; clientWidth: number; scrollWidth: number; overflowX: string }[] = [];
    let el = document.querySelector('.tableWrapper') as HTMLElement | null;
    while (el) {
      chain.push({
        tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: getComputedStyle(el).overflowX,
      });
      el = el.parentElement;
    }
    return chain;
  });
}

test.describe('table horizontal overflow containment', () => {
  /**
   * A table with MANY narrow columns and no explicit per-column widths does
   * NOT actually overflow its wrapper today - verified live. Two compounding
   * causes, neither of them `td { min-width: 100px }` (style.css) being
   * ignored, as first assumed: `@tiptap/extension-table`'s `renderHTML`
   * always stamps an inline `min-width` on the `<table>` from its OWN
   * `cellMinWidth` option (default 25, not this app's 100px CSS floor), AND
   * - since `resizable: false` means no NodeView - that inline value is set
   * ONCE at insert and never kept in sync as columns are added afterward,
   * so a grown table's `<colgroup>`/inline `min-width` stays stale at the
   * ORIGINAL column count. Real, non-stale overflow needs explicit stored
   * widths - covered by the resize feature's own overflow-after-resize
   * test, not here. What IS worth pinning at this level, independent of
   * resizing: the wrapper's own overflow CSS is correctly wired, and if the
   * table it contains ever does need to overflow (a resize, or a future
   * `cellMinWidth` change), only the WRAPPER scrolls - the shell around it
   * never blows out sideways.
   */
  test('the wrapper is wired for horizontal scroll and nothing above it blows out sideways, on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupTextDocMocks(page);
    await page.goto('/docs/reg-doc');
    await page.waitForSelector('.ProseMirror', { timeout: 15000 });

    await insertWideTable(page, 10);

    const chain = await tableWrapperOverflowChain(page);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0]!.overflowX).toBe('auto');
    for (const ancestor of chain.slice(1)) {
      expect(ancestor.scrollWidth - ancestor.clientWidth).toBeLessThanOrEqual(1);
    }
  });

  test('the wrapper is wired for horizontal scroll and nothing above it blows out sideways, on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await setupTextDocMocks(page);
    await page.goto('/docs/reg-doc');
    await page.waitForSelector('.ProseMirror', { timeout: 15000 });

    await insertWideTable(page, 10);

    const chain = await tableWrapperOverflowChain(page);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0]!.overflowX).toBe('auto');
    for (const ancestor of chain.slice(1)) {
      expect(ancestor.scrollWidth - ancestor.clientWidth).toBeLessThanOrEqual(1);
    }
  });
});
