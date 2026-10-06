import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';
import { applySheetOperation, type SheetOperation } from '../src/dnd/sheetOperations';
import { createWeapon } from '../src/dnd/weapons';

/**
 * Tab mode (docs/app-tabs-plan.md) with the flag on in a browser: two sheets,
 * switched in-app. A sheet left for another must come back as it was - not
 * reloaded, not reconnected - and leave nothing over the page on screen.
 */
const NAMESPACE = '/character-sheets-ws';

async function serveSheets(page: Page, ids: string[]) {
  const sheets = new Map(ids.map((id) => {
    const data = createDndCharacterSheet();
    data.identity.name = `Герой ${id}`;
    data.notes = '';
    data.equipment = [{ id: 'sword', name: 'Меч', equipped: true, weapon: { ...createWeapon(), damage: '1d8' } } as any];
    return [id, { data: data as unknown as Record<string, unknown>, revision: 0 }];
  }));
  const counts = { rest: 0, sockets: 0, joins: 0 };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue(); // Vite serves /src/api/*.ts too
    const match = /^\/api\/interactive-templates\/([^/]+)$/.exec(path);
    if (match && sheets.has(match[1]!)) {
      counts.rest += 1;
      const sheet = sheets.get(match[1]!)!;
      return route.fulfill({ json: { id: match[1], title: '', templateType: 'dnd-character', data: sheet.data, createdAt: '', updatedAt: '', role: 'owner' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.routeWebSocket('**/socket.io/**', (ws) => {
    counts.sockets += 1;
    const emit = (event: string, payload: unknown) => ws.send(`42${NAMESPACE},${JSON.stringify([event, payload])}`);
    ws.send(`0${JSON.stringify({ sid: `fake${counts.sockets}`, upgrades: [], pingInterval: 25000, pingTimeout: 60000, maxPayload: 1000000 })}`);
    ws.onMessage((message) => {
      const text = String(message);
      if (text.startsWith(`40${NAMESPACE}`)) { ws.send(`40${NAMESPACE},${JSON.stringify({ sid: 'socket' })}`); return; }
      // An event with an acknowledgement carries its id before the array: 42/ns,7["sheet-ping",...]
      const packet = new RegExp(`^42${NAMESPACE},(\\d*)(\\[.*)$`, 's').exec(text);
      if (!packet) return;
      const [event, payload] = JSON.parse(packet[2]!) as [string, any];
      const sheet = sheets.get(payload?.sheetId);
      if (!sheet) return;
      if (event === 'sheet-ping' && packet[1]) {
        ws.send(`43${NAMESPACE},${packet[1]}${JSON.stringify([{ joined: true, revision: sheet.revision }])}`);
        return;
      }
      if (event === 'join-sheet') {
        counts.joins += 1;
        emit('sheet-room-state', { sheetId: payload.sheetId, data: sheet.data, revision: sheet.revision, role: 'owner', appliedClientOpIds: [] });
      } else if (event === 'sheet-op') {
        sheet.data = applySheetOperation(sheet.data, payload.op as SheetOperation);
        sheet.revision += 1;
        emit('sheet-op-applied', { clientOpId: payload.clientOpId, op: payload.op, revision: sheet.revision, userId: 'u' });
      }
    });
  });
  return { counts, sheets };
}

/** In-app navigation, as a link or the tabs panel would do it (no page reload). */
const go = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 't');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'u', role: 'user' }));
    localStorage.setItem('qcanva:tabs', '1');
    localStorage.setItem('qcanva:tabs-web', '1');
  });
});

test('a sheet left for another comes back as it was: text, scroll, no reload, no reconnect', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const { counts } = await serveSheets(page, ['a', 'b']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');

  // Half-typed notes (not committed) and a scrolled page.
  await page.getByRole('tab', { name: 'Заметки' }).click();
  const notes = page.getByLabel('Заметки персонажа');
  await notes.click();
  await notes.pressSequentially('Должен гильдии');
  await page.locator('.template-page').evaluate((el) => { el.scrollTop = 400; el.dispatchEvent(new Event('scroll')); });
  const perOpen = counts.rest; // what one opening of a sheet costs
  const restBefore = counts.rest;
  const socketsBefore = counts.sockets;
  const joinsBefore = counts.joins;

  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');
  await go(page, '/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');

  await expect(page.getByLabel('Заметки персонажа')).toHaveValue('Должен гильдии');
  expect(await page.locator('.template-page').evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
  expect(counts.rest - restBefore).toBe(perOpen); // only b's first load
  expect(counts.sockets - socketsBefore).toBe(1); // only b's socket; a kept its own
  expect(counts.joins - joinsBefore).toBe(1);
});

test('a sleeping sheet leaves no toast, dialog or keyboard handler behind', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { sheets } = await serveSheets(page, ['a', 'b']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  await page.getByRole('button', { name: 'Атака: Меч' }).click();
  await expect(page.locator('.dnd-cs-toast')).toHaveCount(1);

  // Setup edit on a, to have something Ctrl+Z could undo.
  await page.locator('.dnd-mode-button').click();
  const str = page.getByLabel('Сила', { exact: true });
  await str.fill('16'); await str.blur();
  await expect.poll(() => (sheets.get('a')!.data.abilities as any).strength.score).toBe(16);

  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');
  await expect(page.locator('.dnd-cs-toast')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect((sheets.get('a')!.data.abilities as any).strength.score).toBe(16); // the sleeping sheet did not undo

  await go(page, '/templates/a');
  await expect(page.locator('.dnd-cs-toast')).toHaveCount(1); // the pending attack is back with its sheet
});

test('without the flag nothing is kept alive', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('qcanva:tabs'));
  const { counts } = await serveSheets(page, ['a', 'b']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  const perOpen = counts.rest;
  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');
  await go(page, '/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  expect(counts.rest).toBe(perOpen * 3); // every visit loads again, as before tabs
});

test('the tabs panel switches tabs, and closing a tab drops its live page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const { counts } = await serveSheets(page, ['a', 'b']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  const perOpen = counts.rest;
  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');

  await page.getByRole('button', { name: 'Открытые вкладки: 2' }).click();
  const panel = page.getByRole('dialog', { name: 'Открытые вкладки' });
  await expect(panel.locator('.tabs-panel-title')).toHaveText(['Дашборд', 'Герой b', 'Герой a']);
  await page.screenshot({ path: `${process.env.SHOTS || 'test-results'}/tabs-panel-390.png` });
  await panel.locator('.tabs-panel-item', { hasText: 'Герой a' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  expect(counts.rest).toBe(perOpen * 2); // a was woken, not reloaded

  await page.getByRole('button', { name: 'Открытые вкладки: 2' }).click();
  await panel.getByRole('button', { name: 'Закрыть вкладку: Герой b' }).click();
  await expect(panel.locator('.tabs-panel-title')).toHaveText(['Дашборд', 'Герой a']);
  await page.keyboard.press('Escape');
  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');
  expect(counts.rest).toBe(perOpen * 3); // b was closed: it loads again
});

test('closing the tab on screen leaves it without reloading it first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const { counts } = await serveSheets(page, ['a', 'b']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  await go(page, '/templates/b');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой b');
  const rest = counts.rest;
  const sockets = counts.sockets;
  await page.getByRole('button', { name: 'Открытые вкладки: 2' }).click();
  await page.getByRole('dialog', { name: 'Открытые вкладки' }).getByRole('button', { name: 'Закрыть вкладку: Герой b' }).click();
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  await page.waitForTimeout(300);
  expect(counts.rest).toBe(rest); // a woke up; b was not loaded again on its way out
  expect(counts.sockets).toBe(sockets);
  await expect(page.getByRole('button', { name: 'Открытые вкладки: 1' })).toBeVisible();
});

test('the dashboard has the tabs button too (Back lands there)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await serveSheets(page, ['a']);
  await page.goto('/templates/a');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
  await go(page, '/dashboard');
  const button = page.getByRole('button', { name: 'Открытые вкладки: 1' });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: `${process.env.SHOTS || 'test-results'}/tabs-dashboard-320.png`, clip: { x: 0, y: 0, width: 320, height: 70 } });
  await button.click();
  await page.getByRole('dialog', { name: 'Открытые вкладки' }).locator('.tabs-panel-item', { hasText: 'Герой a' }).click();
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue('Герой a');
});

