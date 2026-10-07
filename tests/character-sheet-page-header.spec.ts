import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;

async function openSheet(page: Page, options: { theme?: 'dark' | 'light'; tabs?: boolean } = {}) {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', level: 5 };
  data.campaign.canvasId = 'c1';
  const server = await serveCharacterSheet(
    page,
    { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' },
    'owner',
    [{ id: 'c1', title: 'Проклятие Страда' }],
  );
  await page.addInitScript(({ theme, tabs }) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Ярослав', email: 'yar@example.com', role: 'user' }));
    if (tabs) { localStorage.setItem('qcanva:tabs', '1'); localStorage.setItem('qcanva:tabs-web', '1'); }
  }, { theme: options.theme ?? 'dark', tabs: Boolean(options.tabs) });
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return server;
}

/** Left edges of every control in the header, by its accessible name or class. */
const headerLayout = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll<HTMLElement>('.template-header button, .template-header a'))
    .filter((element) => element.getBoundingClientRect().width > 0 && !element.closest('[role="dialog"]'))
    .map((element) => `${element.className.split(' ')[0]}@${Math.round(element.getBoundingClientRect().left)}`));

for (const tabs of [false, true]) {
  test(`on a phone the status is a dot and the header never moves${tabs ? ' (with tabs)' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const server = await openSheet(page, { tabs });
    const dot = page.locator('.sheet-status-dot');
    await expect(dot).toBeVisible();
    await expect(page.locator('.sheet-status-text')).toBeHidden();

    // Every control fits the screen.
    for (const control of await page.locator('.template-header button:visible, .template-header a:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    }
    const before = await headerLayout(page);

    // All saved: the dot says so when tapped.
    await dot.click();
    const hint = page.getByRole('tooltip');
    await expect(hint).toHaveText('Все изменения сохранены');
    const hintBox = (await hint.boundingBox())!;
    expect(hintBox.x).toBeGreaterThanOrEqual(0);
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(390.5);
    await page.keyboard.press('Escape');
    await expect(hint).toHaveCount(0);

    // A message that used to push the buttons aside: the roll the server never answered.
    server.silence();
    await page.getByTitle('Проверка: Сила', { exact: true }).click();
    await expect(hint).toHaveText('Нет связи — бросок не сделан', { timeout: 10000 });
    expect(await headerLayout(page)).toEqual(before);
    await expect(hint).toHaveCount(0, { timeout: 10000 });
    expect(await headerLayout(page)).toEqual(before);
  });
}

test('on a wide screen the status stays as words', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const server = await openSheet(page);
  await expect(page.locator('.sheet-status-dot')).toBeHidden();
  server.silence();
  await page.getByTitle('Проверка: Сила', { exact: true }).click();
  await expect(page.locator('.template-save-status')).toHaveText('Нет связи — бросок не сделан', { timeout: 10000 });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`the account menu is glass and fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openSheet(page);
    await page.locator('[data-account-menu-trigger]').click();
    const menu = page.locator('[data-account-menu]');
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    const style = await menu.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { radius: computed.borderRadius, blur: computed.backdropFilter || (computed as any).webkitBackdropFilter };
    });
    expect(style.radius).toBe('20px');
    expect(style.blur).toContain('blur');
    await expect(menu).toContainText('Ярослав');
    // The canvas connection is a row here now, not a pill in the header.
    await expect(menu.locator('.dnd-link-row')).toContainText('Канвас для бросков');
    await expect(menu.locator('.dnd-link-row-state')).toHaveText('Проклятие Страда');
    await expect(page.locator('.template-header .dnd-link-button')).toHaveCount(0);
    // The theme still switches from here, and the menu follows it.
    await menu.locator('[data-theme-choice="light"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
}

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    test(`header screenshots ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 760 });
      await openSheet(page, { theme, tabs: true });
      await page.locator('.sheet-status-dot').click();
      await page.getByRole('tooltip').waitFor();
      await page.screenshot({ path: `${SHOTS}/header-hint-${theme}.png`, clip: { x: 0, y: 0, width: 390, height: 130 } });
      await page.keyboard.press('Escape');
      await page.locator('[data-account-menu-trigger]').click();
      await page.locator('[data-account-menu]').waitFor();
      await page.screenshot({ path: `${SHOTS}/menu-phone-${theme}.png`, clip: { x: 0, y: 0, width: 390, height: 420 } });
    });
    test(`menu desktop screenshot ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 760 });
      await openSheet(page, { theme });
      await page.locator('[data-account-menu-trigger]').click();
      await page.locator('[data-account-menu]').waitFor();
      await page.mouse.move(600, 600);
      await page.screenshot({ path: `${SHOTS}/menu-desktop-${theme}.png`, clip: { x: 860, y: 0, width: 420, height: 380 } });
    });
  }
}
