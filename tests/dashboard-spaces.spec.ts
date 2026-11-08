/**
 * Shared spaces in the dashboard: made from the sidebar's Spaces block, one
 * feed of the folders people added (QCanva documents and files, Yandex Disk
 * files), a folder of one's own added, people invited. Mocked API, no backend.
 * Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';
import { PNG, serveDashboard } from './support/fake-dashboard-server';

const SHOTS = process.env.SHOT_DIR;

type Call = { method: string; path: string; query: Record<string, string>; body?: unknown };

function spaceDetails(role: 'owner' | 'editor' | 'viewer', sources = defaultSources()) {
  return {
    id: 'space-1',
    name: 'Семья',
    role,
    owner: { id: role === 'owner' ? 'user-1' : 'user-9', name: 'Me', email: 'me@example.com' },
    members: [{ id: 'user-2', name: 'Аня', email: 'anya@example.com', role: 'editor' }],
    sources,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-07T10:00:00Z',
  };
}
function defaultSources() {
  return [
    { id: 'src-q', kind: 'qspace', title: 'Поездки', folderId: 'folder-a', yandexPath: null, addedBy: { id: 'user-1', name: 'Me' }, syncedAt: null, syncError: null, itemCount: null },
    { id: 'src-y', kind: 'yandex', title: 'Фото', folderId: null, yandexPath: '/Фото', addedBy: { id: 'user-2', name: 'Аня' }, syncedAt: '2026-11-07T10:00:00Z', syncError: null, itemCount: 1 },
  ];
}
const FEED = [
  { key: 'y:src-y:/Фото/sea.jpg', sourceId: 'src-y', origin: 'yandex', kind: 'file', id: null, path: '/Фото/sea.jpg', name: 'sea.jpg', mime: 'image/jpeg', mediaType: 'image', size: 2000, updatedAt: '2026-11-07T10:00:00Z', addedBy: { id: 'user-2', name: 'Аня' }, previewUrl: '/api/yandex-disk/preview?path=%2F%D0%A4%D0%BE%D1%82%D0%BE%2Fsea.jpg&size=L&t=tok' },
  { key: 'q:text-document:doc-1', sourceId: 'src-q', origin: 'qspace', kind: 'text-document', id: 'doc-1', path: null, name: 'План поездки', mime: 'text/html', mediaType: null, size: null, updatedAt: '2026-11-06T10:00:00Z', addedBy: { id: 'user-1', name: 'Me' }, previewUrl: null },
  { key: 'q:file:f-pdf', sourceId: 'src-q', origin: 'qspace', kind: 'file', id: 'f-pdf', path: null, name: 'Договор аренды.pdf', mime: 'application/pdf', mediaType: null, size: 350000, updatedAt: '2026-11-05T10:00:00Z', addedBy: { id: 'user-1', name: 'Me' }, previewUrl: null },
];

async function serveSpaces(page: Page, opts: { role?: 'owner' | 'editor' | 'viewer'; spaces?: boolean } = {}) {
  const calls: Call[] = [];
  const role = opts.role ?? 'owner';
  let list = opts.spaces === false ? [] : [{ id: 'space-1', name: 'Семья', role, ownerId: 'user-1', memberCount: 1, sourceCount: 2, updatedAt: '2026-11-07T10:00:00Z' }];
  await page.route(/\/api\/spaces(\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    calls.push({ method: request.method(), path, query: Object.fromEntries(url.searchParams.entries()), body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === '/spaces' && request.method() === 'GET') return json({ spaces: list });
    if (path === '/spaces' && request.method() === 'POST') {
      list = [...list, { id: 'space-2', name: body.name, role: 'owner', ownerId: 'user-1', memberCount: 0, sourceCount: 0, updatedAt: '2026-11-08T10:00:00Z' }];
      return json({ ...spaceDetails('owner', []), id: 'space-2', name: body.name, members: [] });
    }
    if (path === '/spaces/space-2' && request.method() === 'GET') return json({ ...spaceDetails('owner', []), id: 'space-2', name: list.at(-1)!.name, members: [] });
    if (path === '/spaces/space-2/feed') return json({ items: [], offset: 0, limit: 60, nextOffset: null });
    // A viewer adds no folders: every one in the space is someone else's.
    const sources = role === 'viewer' ? defaultSources().map((source) => ({ ...source, addedBy: { id: 'user-2', name: 'Аня' } })) : defaultSources();
    if (path === '/spaces/space-1' && request.method() === 'GET') return json(spaceDetails(role, sources));
    if (path === '/spaces/space-1/feed') {
      const list = (name: string) => (url.searchParams.get(name) || '').split(',').filter(Boolean);
      const [sources, types, adders] = [list('sourceIds'), list('types'), list('addedBy')];
      const typeOf = (item: (typeof FEED)[number]) => (item.kind !== 'file' ? 'canva' : item.name.endsWith('.pdf') ? 'document' : item.mime.startsWith('image/') ? 'image' : 'other');
      const items = FEED.filter((item) => (!sources.length || sources.includes(item.sourceId))
        && (!types.length || types.includes(typeOf(item)))
        && (!adders.length || adders.includes(item.addedBy.id)));
      return json({ items, offset: 0, limit: 60, nextOffset: null });
    }
    if (path === '/spaces/space-1/sources' && request.method() === 'POST') return json(spaceDetails(role));
    if (path === '/spaces/space-1/members' && request.method() === 'POST') {
      const details = spaceDetails(role);
      details.members.push({ id: 'user-3', name: null, email: body.email, role: body.role });
      return json(details);
    }
    if (path.startsWith('/spaces/space-1/sources/src-y/download')) return json({ href: 'https://downloader.disk.yandex.ru/disk/sea.jpg' });
    return json({});
  });
  await page.route('http://localhost:3001/api/yandex-disk/preview**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('https://downloader.disk.yandex.ru/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  return calls;
}

async function openDashboard(page: Page, opts: Parameters<typeof serveSpaces>[1] & { yandex?: boolean; phone?: boolean } = {}) {
  await page.setViewportSize(opts.phone ? { width: 390, height: 844 } : { width: 1280, height: 860 });
  await serveDashboard(page);
  if (opts.yandex) {
    await page.route('http://localhost:3001/api/integrations/yandex', (route) => route.fulfill({ json: {
      enabled: true, connected: true, reconnectRequired: false, login: 'me', displayName: 'Me', email: 'me@yandex.ru', avatarUrl: null,
    } }));
  }
  // The share menus' contacts: one saved, one potential, one already in the space.
  await page.route('http://localhost:3001/api/contacts', (route) => route.fulfill({ json: { contacts: [
    { id: 'c-1', email: 'boris@example.com', name: 'Борис', userName: 'Boris', createdAt: '2026-11-01T10:00:00Z' },
    { id: 'c-2', email: 'anya@example.com', name: null, userName: 'Аня', createdAt: '2026-11-01T10:00:00Z' },
  ] } }));
  await page.route('http://localhost:3001/api/contacts/suggestions', (route) => route.fulfill({ json: { suggestions: [
    { email: 'olga@example.com', userName: 'Ольга', reasons: ['shared-by-me'] },
  ] } }));
  const calls = await serveSpaces(page, opts);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  return calls;
}

test('a new space is made from the sidebar and opens at once', async ({ page }) => {
  const calls = await openDashboard(page, { spaces: false });
  await page.locator('[data-new-space]').click();
  const prompt = page.getByRole('dialog');
  await prompt.locator('input').fill('Работа');
  await prompt.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === '/spaces')?.body).toEqual({ name: 'Работа' });
  await expect(page.locator('[data-space-title]')).toHaveText('Работа');
  await expect(page.locator('[data-shared-space="space-2"]')).toHaveAttribute('aria-current', 'page');
  // An empty space: "+ Add" adds a folder.
  await expect(page.locator('[data-space-empty]')).toBeVisible();
});

test('a space is one feed of its folders, filtered by folder; pictures open full screen, documents open', async ({ page }) => {
  const calls = await openDashboard(page);
  await page.locator('[data-shared-space="space-1"]').click();
  await expect(page.locator('[data-space-title]')).toHaveText('Семья');
  await expect(page.locator('[data-space-count]')).toContainText('2');
  const feed = page.locator('[data-space-feed] [data-space-item]');
  await expect(feed).toHaveCount(3);
  expect(await feed.evaluateAll((els) => els.map((el) => el.getAttribute('data-space-item')))).toEqual(FEED.map((item) => item.key));
  await expect(page.locator('[data-space-item="y:src-y:/Фото/sea.jpg"] [data-space-preview]')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/space-feed.png` });

  // A folder at a time.
  await page.locator('[data-space-source="src-y"] .space-source-pick').click();
  await expect(feed).toHaveCount(1);
  expect(calls.some((call) => call.path === '/spaces/space-1/feed' && call.query.sourceIds === 'src-y')).toBe(true);
  await page.locator('[data-space-source="all"]').click();
  await expect(feed).toHaveCount(3);

  // Hover tells who added it and from where.
  await page.locator('[data-space-item="q:file:f-pdf"]').hover();
  await expect(page.locator('[data-file-info]')).toContainText('Q Space');

  // A Yandex picture full screen, its original through the space.
  await page.locator('[data-space-item="y:src-y:/Фото/sea.jpg"]').click();
  await expect(page.locator('[data-media-viewer] [data-media-name]')).toHaveText('sea.jpg');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-media-viewer]')).toHaveCount(0);

  // A QCanva document opens as any does.
  await page.locator('[data-space-item="q:text-document:doc-1"]').click();
  await expect(page).toHaveURL(/\/docs\/doc-1/);
});

test('an own QCanva folder is added; people are invited with a role', async ({ page }) => {
  const calls = await openDashboard(page);
  await page.locator('[data-shared-space="space-1"]').click();
  await expect(page.locator('[data-space-title]')).toHaveText('Семья');

  // No "+" of its own: adding a folder is in "⋯". No Yandex Disk connected,
  // so only the QCanva folder is offered there.
  await expect(page.locator('[data-space-add]')).toHaveCount(0);
  await page.locator('[data-space-menu]').click();
  await page.locator('[data-space-actions] [data-space-add-folder]').click();
  // Only QCanva's to choose from: no window of one tile.
  await expect(page.locator('[data-space-add-dialog]')).toHaveCount(0);
  const dialog = page.locator('[data-space-folder-dialog]');
  await expect(dialog).toBeVisible();
  // Already in the space: not offered again.
  await expect(dialog.locator('[data-space-folder-option="folder-a"]')).toBeDisabled();
  await dialog.locator('[data-space-folder-option="folder-b"]').click();
  await dialog.locator('[data-space-folder-confirm]').click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === '/spaces/space-1/sources')?.body).toEqual({ kind: 'qspace', folderId: 'folder-b' });
  await expect(dialog).toHaveCount(0);

  await page.locator('[data-space-menu]').click();
  await page.locator('[data-space-members-open]').click();
  const members = page.locator('[data-space-members]');
  // Contacts and potential contacts are offered; someone already in the space is not.
  await members.locator('[data-space-invite-email]').click();
  const offered = page.locator('[data-contact-email-option]');
  await expect(offered).toHaveCount(2);
  expect(await offered.evaluateAll((els) => els.map((el) => el.getAttribute('data-contact-email-option')))).toEqual(['boris@example.com', 'olga@example.com']);
  await page.locator('[data-contact-email-option="olga@example.com"]').click();
  await expect(members.locator('[data-space-invite-email]')).toHaveValue('olga@example.com');
  await members.locator('[data-space-invite-role]').selectOption('viewer');
  await members.locator('[data-space-invite-send]').click();
  await expect(members.locator('[data-space-member="olga@example.com"]')).toBeVisible();
  expect(calls.find((call) => call.method === 'POST' && call.path === '/spaces/space-1/members')?.body).toEqual({ email: 'olga@example.com', role: 'viewer' });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/space-members.png` });
});

test('a viewer sees the feed, adds nothing, and may leave', async ({ page }) => {
  await openDashboard(page, { role: 'viewer' });
  await page.locator('[data-shared-space="space-1"]').click();
  await expect(page.locator('[data-space-feed] [data-space-item]')).toHaveCount(3);
  // Nothing of others' to take out, and nothing to add.
  await page.locator('[data-space-menu]').click();
  await expect(page.locator('[data-space-actions] [data-space-add-folder]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(page.locator('[data-space-source-remove]')).toHaveCount(0);
  await page.locator('[data-space-menu]').click();
  await expect(page.locator('[data-space-leave-menu]')).toBeVisible();
  await expect(page.locator('[data-space-delete]')).toHaveCount(0);
});

test('computer: the empty space\'s "+ Add" and "⋯" open the Add-style window of where the folder comes from', async ({ page }) => {
  await openDashboard(page, { spaces: false, yandex: true });
  await page.locator('[data-new-space]').click();
  await page.getByRole('dialog').locator('input').fill('Работа');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.locator('[data-space-empty]').click();
  const window = page.locator('[data-space-add-dialog]');
  await expect(window.locator('[data-space-add-qspace]')).toBeVisible();
  await expect(window.locator('[data-space-add-yandex]')).toBeVisible();
  await expect(page.locator('[data-space-add-menu]')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/space-add-window.png` });
  await page.keyboard.press('Escape');
  await expect(window).toHaveCount(0);

  // "⋯" → "Add a folder": the same window.
  await page.locator('[data-space-menu]').click();
  await page.locator('[data-space-actions] [data-space-add-folder]').click();
  await window.locator('[data-space-add-qspace]').click();
  await expect(window).toHaveCount(0);
  await expect(page.locator('[data-space-folder-dialog]')).toBeVisible();
});

test('phone: the round "+" and the empty space\'s "+ Add" open the same bottom sheet', async ({ page }) => {
  await openDashboard(page, { yandex: true, phone: true, spaces: false });
  await page.locator('[data-mobile-sidebar-open]').click();
  await page.locator('[data-new-space]').click();
  await page.getByRole('dialog').locator('input').fill('Работа');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  const sheet = page.locator('[data-space-add-menu]');

  for (const open of [() => page.locator('[data-space-empty]').click(), () => page.locator('.dashboard-fab').click()]) {
    await open();
    await expect(sheet.locator('[data-space-add-qspace]')).toBeVisible();
    await expect(sheet.locator('[data-space-add-yandex]')).toBeVisible();
    await expect(page.locator('[data-space-add-dialog]')).toHaveCount(0);
    const box = await sheet.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(844 - 80);
    // Above the round "+": the sheet is on top where they overlap.
    const fab = await page.locator('.dashboard-fab').boundingBox();
    const onTop = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-space-add-menu], .dashboard-fab')?.className ?? '', [fab!.x + fab!.width / 2, fab!.y + fab!.height / 2]);
    expect(String(onTop)).not.toContain('dashboard-fab');
    await page.mouse.click(195, 200);
    await expect(sheet).toHaveCount(0);
  }
  if (SHOTS) {
    await page.locator('.dashboard-fab').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/space-add-phone.png` });
  }
});

test('the home feed has Spaces right after Folders: a tile each, opening the space', async ({ page }) => {
  await openDashboard(page);
  const heads = await page.locator('[data-feed-anchor]').evaluateAll((els) => els.map((el) => el.getAttribute('data-feed-anchor')));
  expect(heads.indexOf('spaces')).toBe(heads.indexOf('folders') + 1);
  const tile = page.locator('[data-recent-space-tile="space-1"]');
  await expect(tile).toContainText('Семья');
  // The number of folders in it, beside its last change.
  await expect(tile.locator('.subfolder-card-count')).toHaveText('2');
  await expect(tile.locator('[data-folder-tile-date]')).toBeVisible();
  await tile.click();
  await expect(page.locator('[data-space-title]')).toHaveText('Семья');
});

test('with no spaces the home feed offers "+ Add" under Spaces, which makes one', async ({ page }) => {
  const calls = await openDashboard(page, { spaces: false });
  await expect(page.locator('[data-recent-spaces]')).toHaveCount(0);
  await page.locator('[data-feed-add="spaces"]').click();
  await page.getByRole('dialog').locator('input').fill('Дача');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === '/spaces')?.body).toEqual({ name: 'Дача' });
  await expect(page.locator('[data-space-title]')).toHaveText('Дача');
});

test('a Yandex folder still being read turns on its chip; its files come in by themselves once read', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
  let asked = 0;
  const yandexSource = (read: boolean) => ({ id: 'src-y', kind: 'yandex', title: 'Фото', folderId: null, yandexPath: '/Фото', addedBy: { id: 'user-1', name: 'Me' }, syncedAt: read ? '2026-11-08T10:00:00Z' : null, syncError: null, itemCount: read ? 1 : 0 });
  await page.route(/\/api\/spaces(\/|\?|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/spaces') return route.fulfill({ json: { spaces: [{ id: 'space-1', name: 'Семья', role: 'owner', ownerId: 'user-1', memberCount: 0, sourceCount: 1, updatedAt: '2026-11-07T10:00:00Z' }] } });
    const read = asked >= 2;
    if (path === '/spaces/space-1') {
      asked += 1;
      return route.fulfill({ json: { ...spaceDetails('owner', [yandexSource(read)] as any), members: [] } });
    }
    if (path === '/spaces/space-1/feed') return route.fulfill({ json: { items: read ? [FEED[0]] : [], offset: 0, limit: 60, nextOffset: null } });
    return route.fulfill({ json: {} });
  });
  await page.route('http://localhost:3001/api/yandex-disk/preview**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });
  await page.locator('[data-shared-space="space-1"]').click();
  await expect(page.locator('[data-space-source="src-y"] [data-space-source-reading]')).toBeVisible();
  // Looked at again on its own, without the page reloading.
  await expect(page.locator('[data-space-feed] [data-space-item]')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('[data-space-source="src-y"] [data-space-source-reading]')).toHaveCount(0);
});

test('the sidebar\'s "Spaces" goes to the feed\'s Spaces, like Shared and Public; its chevron folds the list', async ({ page }) => {
  await openDashboard(page);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.locator('[data-recent-space-tile="space-1"]').waitFor();
  const row = page.locator('[data-sidebar-spaces]');
  await row.click();
  // The feed scrolled to its Spaces section, and the row is the current one.
  await expect.poll(() => page.locator('.dashboard-central-shell .app-main').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#feed-spaces')).toBeInViewport();
  await expect(row).toHaveAttribute('aria-current', 'page');
  // The list stays as it was; only the chevron folds it.
  await expect(page.locator('[data-sidebar-spaces-children]')).toBeVisible();
  await page.locator('[data-sidebar-spaces-disclosure]').click();
  await expect(page.locator('[data-sidebar-spaces-children]')).toHaveCount(0);
});

test('phone: "Spaces" in the sidebar closes it and goes to the feed\'s Spaces', async ({ page }) => {
  await openDashboard(page, { phone: true });
  await page.locator('[data-mobile-sidebar-open]').click();
  await page.locator('[data-sidebar-spaces]').click();
  await expect(page.locator('.dashboard-sidebar.mobile-open, .dashboard-sidebar[data-mobile-open="true"]')).toHaveCount(0);
  await expect(page.locator('#feed-spaces')).toBeInViewport();
});

test('the feed takes several folders, kinds of file and adders at once; nothing left says so', async ({ page }) => {
  const calls = await openDashboard(page);
  await page.locator('[data-shared-space="space-1"]').click();
  const feed = page.locator('[data-space-feed] [data-space-item]');
  await expect(feed).toHaveCount(3);

  // Two folders: both chips on, "All" off.
  await page.locator('[data-space-source="src-y"] .space-source-pick').click();
  await expect(feed).toHaveCount(1);
  await page.locator('[data-space-source="src-q"] .space-source-pick').click();
  await expect(feed).toHaveCount(3);
  expect(calls.at(-1)?.query.sourceIds?.split(',').sort()).toEqual(['src-q', 'src-y']);
  await expect(page.locator('[data-space-source="all"]')).toHaveAttribute('aria-pressed', 'false');
  // One off again: the other stays.
  await page.locator('[data-space-source="src-y"] .space-source-pick').click();
  await expect(feed).toHaveCount(2);
  await page.locator('[data-space-source="all"]').click();
  await expect(feed).toHaveCount(3);

  // Kinds of file and who added, from the filter icon; its badge counts them.
  await page.locator('[data-space-filter-trigger]').click();
  const menu = page.locator('[data-space-filter-menu]');
  await menu.locator('[data-space-filter-type="document"] input').check();
  await menu.locator('[data-space-filter-type="image"] input').check();
  await expect(feed).toHaveCount(2);
  expect(calls.at(-1)?.query.types?.split(',').sort()).toEqual(['document', 'image']);
  await menu.locator('[data-space-filter-person="user-1"] input').check();
  await expect(feed).toHaveCount(1);
  await expect(page.locator('[data-space-item="q:file:f-pdf"]')).toBeVisible();
  await expect(page.locator('[data-space-filter-count]')).toHaveText('3');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/space-filters.png` });

  // Nothing matches: it says so, and "Reset filters" brings everything back.
  await menu.locator('[data-space-filter-type="document"] input').uncheck();
  await expect(page.locator('[data-space-filtered-empty]')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(menu).toHaveCount(0);
  await page.locator('[data-space-filtered-empty] button').click();
  await expect(feed).toHaveCount(3);
  await expect(page.locator('[data-space-filter-count]')).toHaveCount(0);

  // The dashboard's own filter and order do not act on a space: not shown here.
  await expect(page.locator('[data-filter-menu-trigger]:visible')).toHaveCount(0);
});
