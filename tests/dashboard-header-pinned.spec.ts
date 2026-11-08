/**
 * The phone header never scrolls away. Only the dashboard's main pane
 * scrolls; the frame around it is overflow: hidden, but a phone browser still
 * scrolls it - the keyboard opening for an input (iOS Safari leaves the page
 * scrolled once it closes), focus(), scrollIntoView() - and the header was
 * left above the screen with nothing to drag it back by. Mocked API.
 */

import { expect, test } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

test.use({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });

const headerTop = (page: import('@playwright/test').Page) => page.locator('.dashboard-auth-header').evaluate((el) => el.getBoundingClientRect().top);

test('the frame scrolled by the browser goes back: the header stays on screen', async ({ page }) => {
  await serveDashboard(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await expect.poll(() => headerTop(page)).toBe(0);

  for (const selector of ['.dashboard-central-shell', '.dashboard-app-shell', '.app-layout.dashboard-view']) {
    // What the browser does on its own: the overflow: hidden box scrolled.
    await page.locator(selector).evaluate((el) => {
      const filler = document.createElement('div');
      filler.className = 'zz-filler';
      filler.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:3000px;pointer-events:none';
      el.appendChild(filler);
      el.scrollTop = 400;
    });
    await expect.poll(() => headerTop(page), { message: selector }).toBe(0);
    await page.locator(`${selector} > .zz-filler`).evaluate((el) => el.remove());
  }

  // The main pane still scrolls as before.
  await expect.poll(() => page.locator('.app-main').evaluate((el) => { el.scrollTop = 200; return el.scrollTop; })).toBeGreaterThan(0);
  expect(await headerTop(page)).toBe(0);
});

test('typing in the search is left alone; once done the header is back on top', async ({ page }) => {
  await serveDashboard(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  const search = page.locator('.dashboard-auth-header .dash-search-header-mobile');
  await search.tap();
  // The keyboard pushed the page while the field is focused: left as it is.
  await page.locator('.dashboard-central-shell').evaluate((el) => {
    const filler = document.createElement('div');
    filler.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:3000px;pointer-events:none';
    el.appendChild(filler);
    el.scrollTop = 120;
  });
  await page.waitForTimeout(150);
  expect(await page.locator('.dashboard-central-shell').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The keyboard closes.
  await search.evaluate((el) => (el as HTMLInputElement).blur());
  await expect.poll(() => headerTop(page)).toBe(0);
});
