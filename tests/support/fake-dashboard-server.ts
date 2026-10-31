import type { Page, Route } from '@playwright/test';

/**
 * A dashboard and Drive backend for browser tests: folders "Поездки" (with a
 * subfolder "Фото" that holds only files) and "Работа", documents with tags,
 * a recent feed, and the Drive's folder items and file previews.
 */
const now = new Date().toISOString();
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
// A 2×2 PNG, served as every picture's content.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBkZGRkZAQAkCwQBXV2gvQAAAABJRU5ErkJggg==', 'base64');

const textDoc = (id: string, title: string, folderId: string | null, tags: string[] = [], updatedAt = now) => ({
  id, title, ownerId: 'user-1', visibility: 'private', createdAt: updatedAt, updatedAt, folderId,
  tags: tags.map((name) => ({ name, color: name === 'отпуск' ? '#44cf6e' : '#7c8aff' })),
});
const canvas = (id: string, title: string, folderId: string | null, tags: string[] = []) => ({
  id, title, ownerId: 'user-1', visibility: 'private', createdAt: now, updatedAt: day(1), folderId, revision: 3,
  tags: tags.map((name) => ({ name, color: '#e9973f' })),
});
export const file = (id: string, name: string, mime: string, sizeBytes: number, updatedAt: string, folderId: string, kind = 'file') => ({
  kind, id, name, mime, sizeBytes, sortDate: updatedAt, updatedAt, ownerId: 'user-1', folderId,
});

export const FOLDER_FILES: Record<string, { media: unknown[]; files: unknown[] }> = {
  'folder-a': {
    media: [
      file('f-sea', 'Море.jpg', 'image/jpeg', 2_400_000, day(1), 'folder-a', 'photo'),
      file('f-cat', 'Кот на окне.png', 'image/png', 900_000, day(3), 'folder-a', 'photo'),
      file('f-huge', 'Панорама.png', 'image/png', 40_000_000, day(5), 'folder-a', 'photo'),
      file('f-clip', 'Отпуск.mp4', 'video/mp4', 80_000_000, day(2), 'folder-a', 'video'),
    ],
    files: [
      file('f-pdf', 'Договор аренды.pdf', 'application/pdf', 350_000, day(4), 'folder-a'),
      file('f-zip', 'backup-2026-10.zip', 'application/zip', 12_000_000, day(6), 'folder-a'),
    ],
  },
  'folder-photos': {
    media: [file('f-p1', 'IMG_0001.jpg', 'image/jpeg', 1_200_000, day(7), 'folder-photos', 'photo'), file('f-p2', 'IMG_0002.jpg', 'image/jpeg', 1_300_000, day(8), 'folder-photos', 'photo')],
    files: [],
  },
};

export async function serveDashboard(page: Page, options: { driveMissing?: boolean; theme?: 'light' | 'dark'; list?: boolean; admin?: boolean } = {}) {
  await page.addInitScript(({ theme, list, admin }) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'dash-test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', email: 'me@example.com', name: 'Me', role: 'user' }));
    if (list) localStorage.setItem('qcanva:dashboard-recents-view:v1', 'list');
    localStorage.setItem('userRole', admin ? 'admin' : 'user');
  }, { theme: options.theme ?? 'light', list: Boolean(options.list), admin: Boolean(options.admin) });
  const linkRequests: string[] = [];
  const downloads: string[] = [];
  const folderRequests: string[] = [];
  // The tags as the Tags settings manage them.
  let tagList = [
    { name: 'отпуск', color: '#44cf6e', canvasCount: 1, htmlDocumentCount: 0, textDocumentCount: 1, totalCount: 2 },
    { name: 'работа', color: '#7c8aff', canvasCount: 1, htmlDocumentCount: 0, textDocumentCount: 1, totalCount: 2 },
  ];
  const tagCalls: Array<{ method: string; name: string; body?: unknown }> = [];
  const docs = [
    textDoc('doc-1', 'План поездки', 'folder-a', ['отпуск']),
    textDoc('doc-2', 'Отчёт за октябрь', 'folder-b', ['работа']),
    textDoc('doc-3', 'Заметки', null),
  ];
  const canvases = [canvas('c-1', 'Маршрут', 'folder-a', ['отпуск']), canvas('c-2', 'Архитектура', 'folder-b', ['работа'])];
  const handler = async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === '/canvas') return json({ own: canvases, shared: [], public: [], welcome: null });
    if (path === '/resource-folders') {
      return json({
        own: [
          { id: 'folder-a', name: 'Поездки', role: 'owner', parentId: null, canvases: canvases.filter((c) => c.folderId === 'folder-a'), htmlDocuments: [], textDocuments: docs.filter((d) => d.folderId === 'folder-a') },
          { id: 'folder-photos', name: 'Фото', role: 'owner', parentId: 'folder-a', canvases: [], htmlDocuments: [], textDocuments: [] },
          { id: 'folder-b', name: 'Работа', role: 'owner', parentId: null, canvases: canvases.filter((c) => c.folderId === 'folder-b'), htmlDocuments: [], textDocuments: docs.filter((d) => d.folderId === 'folder-b') },
        ],
        shared: [],
      });
    }
    if (path === '/text-documents') return json({ documents: docs });
    if (path === '/text-documents/public' || path === '/html-documents/public') return json({ documents: [] });
    if (path === '/html-documents') return json({ groups: [], documents: [] });
    if (path === '/interactive-templates') return json({ templates: [] });
    if (path === '/access-requests/incoming') return json([]);
    if (path === '/tags') return json({ tags: tagList });
    const tagPath = /^\/tags\/(.+)$/.exec(path);
    if (tagPath) {
      const name = decodeURIComponent(tagPath[1]!);
      const method = route.request().method();
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as { name: string; color: string };
        tagCalls.push({ method, name, body });
        tagList = tagList.map((tag) => (tag.name === name ? { ...tag, ...body } : tag));
      } else if (method === 'DELETE') {
        tagCalls.push({ method, name });
        tagList = tagList.filter((tag) => tag.name !== name);
      }
      return json({ tags: tagList });
    }
    if (path === '/settings/html' || path.startsWith('/mcp-tokens')) return json(path.startsWith('/mcp') ? [] : {});
    if (path.startsWith('/recent-resources')) {
      return json([
        { id: 'r1', resourceType: 'text-document', resourceId: 'doc-1', updatedAt: now },
        { id: 'r2', resourceType: 'canvas', resourceId: 'c-1', updatedAt: day(1) },
        { id: 'r3', resourceType: 'text-document', resourceId: 'doc-2', updatedAt: day(2) },
      ]);
    }
    const folderItems = /^\/drive\/folders\/([^/]+)\/items$/.exec(path);
    if (folderItems) {
      if (options.driveMissing) return json({ message: 'Not found' }, 404);
      const id = folderItems[1]!;
      const slice = url.searchParams.get('slice');
      if (id === 'root') {
        return json({ items: [
          { kind: 'folder', id: 'folder-a', name: 'Поездки', mime: null, sizeBytes: null, sortDate: now, updatedAt: now, ownerId: 'user-1', folderId: null },
          { kind: 'folder', id: 'folder-b', name: 'Работа', mime: null, sizeBytes: null, sortDate: now, updatedAt: now, ownerId: 'user-1', folderId: null },
        ], nextCursor: null });
      }
      const own = FOLDER_FILES[id] ?? { media: [], files: [] };
      if (slice === 'media') return json({ items: own.media, nextCursor: null });
      if (slice === 'files') return json({ items: own.files, nextCursor: null });
      const children = id === 'folder-a' ? [{ kind: 'folder', id: 'folder-photos', name: 'Фото', mime: null, sizeBytes: null, sortDate: now, updatedAt: now, ownerId: 'user-1', folderId: 'folder-a' }] : [];
      return json({ items: [...children, ...own.media, ...own.files], nextCursor: null });
    }
    const folder = /^\/drive\/folders\/([^/]+)$/.exec(path);
    if (folder) {
      if (options.driveMissing) return json({ message: 'Not found' }, 404);
      const id = folder[1]!;
      folderRequests.push(id);
      const own = FOLDER_FILES[id] ?? { media: [], files: [] };
      return json({
        folder: { id, name: id, parentId: null, ownerId: 'user-1', role: 'owner' },
        path: [],
        counts: { media: own.media.length, files: own.files.length, docs: 0, folders: 0 },
      });
    }
    const link = /^\/drive\/files\/([^/]+)\/download-link$/.exec(path);
    if (link) {
      linkRequests.push(link[1]!);
      return json({ url: `/api/test-bytes/${link[1]}`, expiresAt: now });
    }
    if (path.startsWith('/test-bytes/')) {
      downloads.push(path.slice('/test-bytes/'.length));
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (path === '/drive/safety' || path === '/drive/devices') return json({}, 404);
    return json({});
  };
  await page.route('http://localhost:3001/api/**', handler);
  return { linkRequests, downloads, folderRequests, tagCalls };
}

/** Opens a dashboard folder the way the sidebar does (the sidebar is a drawer on a phone). */
export async function openDashboardFolder(page: Page, folderId: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate((id) => (document.querySelector('.app-layout') as any).__vueParentComponent.setupState.selectFolder(id), folderId);
}
