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
      const items = url.searchParams.get('sourceId') ? FEED.filter((item) => item.sourceId === url.searchParams.get('sourceId')) : FEED;
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

async function openDashboard(page: Page, opts: Parameters<typeof serveSpaces>[1] = {}) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await serveDashboard(page);
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
  expect(calls.find((call) => call.method === 'POST' && call.path === '/spaces')?.body).toEqual({ name: 'Работа' });
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
  expect(calls.some((call) => call.path === '/spaces/space-1/feed' && call.query.sourceId === 'src-y')).toBe(true);
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

  // No Yandex Disk connected: "+" goes straight to the QCanva folders.
  await page.locator('[data-space-add]').click();
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
  await members.locator('[data-space-invite-email]').fill('olga@example.com');
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
  await expect(page.locator('[data-space-add]')).toHaveCount(0);
  // Nothing of others' to take out.
  await expect(page.locator('[data-space-source-remove]')).toHaveCount(0);
  await page.locator('[data-space-menu]').click();
  await expect(page.locator('[data-space-leave-menu]')).toBeVisible();
  await expect(page.locator('[data-space-delete]')).toHaveCount(0);
});
