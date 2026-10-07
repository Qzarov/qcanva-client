import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { serveCharacterSheet, type FakeCanvas } from './support/fake-character-sheet-server';

const SHOTS = process.env.SHOT_DIR;
const CANVASES: FakeCanvas[] = [
  { id: 'c1', title: 'Проклятие Страда' },
  { id: 'c2', title: 'Канвас без кубиков', status: 'plugin_disabled' },
];

async function openSheet(page: Page, options: { canvasId?: string; role?: 'owner' | 'read'; theme?: 'dark' | 'light' } = {}) {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: 'Арвен', level: 5 };
  data.abilities.dexterity.score = 18;
  data.campaign.canvasId = options.canvasId ?? '';
  const server = await serveCharacterSheet(
    page,
    { id: 'hero', title: 'x', templateType: 'dnd-character', data: data as unknown as Record<string, unknown>, createdAt: '', updatedAt: '' },
    options.role ?? 'owner',
    CANVASES,
  );
  await page.addInitScript((value) => {
    localStorage.setItem('qcanva:theme:v1', value);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  }, options.theme ?? 'dark');
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Арвен');
  return server;
}

// The connection lives in the account menu: a row that says where rolls go and opens the dialog.
const openAccountMenu = async (page: Page) => {
  await page.locator('[data-account-menu-trigger]').click();
  return page.locator('.dnd-link-row');
};
/** The connection row's second line ("не подключён", the canvas title, "Броски только у вас"). */
const linkState = async (page: Page) => {
  const row = await openAccountMenu(page);
  const text = (await row.locator('.dnd-link-row-state').textContent())?.trim();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-account-menu]')).toHaveCount(0);
  return text;
};
const openLinkDialog = async (page: Page) => {
  await (await openAccountMenu(page)).click();
  await expect(page.locator('[data-account-menu]')).toHaveCount(0);
};

for (const width of [320, 1280]) {
  test(`connecting a canvas sends rolls to its chat at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const server = await openSheet(page);
    await expect.poll(() => linkState(page)).toBe('не подключён');
    // The header stays inside the screen.
    for (const control of await page.locator('.template-header > *, .template-header-actions > *').all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }

    // Not connected: the roll is made here and goes nowhere.
    await page.getByTitle('Проверка: Ловкость', { exact: true }).click();
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Проверка · Ловкость');
    expect(server.chat).toHaveLength(0);

    await openLinkDialog(page);
    const dialog = page.getByRole('dialog', { name: 'Доска для бросков' });
    await expect(dialog).toContainText('не подключён');
    const frame = (await dialog.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(width);
    await expect(dialog.getByLabel('Поиск канваса')).toBeFocused();
    await dialog.getByRole('button', { name: 'Подключить: Проклятие Страда' }).click();
    await expect(dialog).toHaveCount(0);
    // The dialog was opened from the account menu: the focus goes back to its button.
    await expect(page.locator('[data-account-menu-trigger]')).toBeFocused();
    await expect.poll(() => linkState(page)).toBe('Проклятие Страда');
    await expect.poll(() => server().data.campaign).toEqual({ canvasId: 'c1' });

    // Connected: the server rolls, the sheet shows that roll, the chat gets it.
    await page.getByTitle('Проверка: Ловкость', { exact: true }).click();
    await expect.poll(() => server.chat.length).toBe(1);
    const posted = server.chat[0]!;
    expect(posted.canvasId).toBe('c1');
    expect(posted.spec).toEqual({ kind: 'check', label: 'Ловкость', d20: 'normal', dice: [], modifier: 4 });
    await expect(page.locator('.dnd-cs-toast').first()).toContainText(`d20 (${posted.roll.d20!.kept}) + 4 = ${posted.roll.total}`);

    // The connection belongs to the sheet: it is there after a reload.
    await page.reload();
    await expect.poll(() => linkState(page)).toBe('Проклятие Страда');

    await openLinkDialog(page);
    await expect(dialog).toContainText('Броски уходят в чат канваса «Проклятие Страда».');
    await expect(dialog.getByRole('link', { name: 'Открыть канвас' })).toHaveAttribute('href', '/canvas/c1');
    await dialog.getByRole('button', { name: 'Отключить' }).click();
    await expect.poll(() => server().data.campaign).toEqual({ canvasId: '' });
    await expect.poll(() => linkState(page)).toBe('не подключён');
    await page.getByTitle('Проверка: Ловкость', { exact: true }).click();
    await expect(page.locator('.dnd-cs-toast').first()).toContainText('Проверка · Ловкость');
    expect(server.chat).toHaveLength(1);
  });
}

test('a canvas that cannot take rolls leaves them local and says why', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const server = await openSheet(page, { canvasId: 'c2' });
  await expect.poll(() => linkState(page)).toBe('Броски только у вас');
  await expect((await openAccountMenu(page))).toHaveClass(/is-warning/);
  await page.locator('.dnd-link-row').click();
  await expect(page.getByRole('dialog', { name: 'Доска для бросков' })).toContainText('выключены кубики');
  await page.keyboard.press('Escape');
  await page.getByTitle('Проверка: Ловкость', { exact: true }).click();
  await expect(page.locator('.dnd-cs-toast').first()).toContainText('Проверка · Ловкость');
  expect(server.chat).toHaveLength(0);
});

test('with no answer from the server a connected sheet makes no roll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const server = await openSheet(page, { canvasId: 'c1' });
  await expect.poll(() => linkState(page)).toBe('Проклятие Страда');
  server.silence();
  await page.getByTitle('Проверка: Ловкость', { exact: true }).click();
  await expect(page.locator('.template-save-status')).toHaveText('Нет связи — бросок не сделан', { timeout: 10000 });
  await expect(page.locator('.dnd-cs-toast')).toHaveCount(0);
  expect(server.chat).toHaveLength(0);
});

test('a read-only viewer sees the connection but cannot change it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet(page, { canvasId: 'c1', role: 'read' });
  await openLinkDialog(page);
  const dialog = page.getByRole('dialog', { name: 'Доска для бросков' });
  await expect(dialog).toContainText('Броски уходят в чат канваса');
  await expect(dialog.getByRole('button', { name: 'Отключить' })).toHaveCount(0);
  await expect(dialog.getByLabel('Поиск канваса')).toHaveCount(0);
});

if (SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1280]) {
      test(`shared rolls screenshots ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 760 });
        await openSheet(page, { canvasId: 'c1', theme });
        await expect.poll(() => linkState(page)).toBe('Проклятие Страда');
        await openLinkDialog(page);
        await page.getByRole('button', { name: 'Подключён: Проклятие Страда' }).waitFor();
        await page.screenshot({ path: `${SHOTS}/link-dialog-${theme}-${width}.png` });
      });
    }
  }
}
