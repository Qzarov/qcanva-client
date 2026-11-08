import { request } from './client';

/**
 * Shared spaces (`/api/spaces`): a user makes one, invites people as editors
 * (add their own folders, see everything) or viewers, and the space shows
 * what is in every added folder - QCanva or Yandex Disk - as one feed.
 */

export type SpaceRole = 'owner' | 'editor' | 'viewer';

export type SpaceSummary = {
  id: string;
  name: string;
  role: SpaceRole;
  ownerId: string;
  memberCount: number;
  sourceCount: number;
  updatedAt: string;
};

export type SpaceSource = {
  id: string;
  kind: 'qspace' | 'yandex';
  title: string;
  folderId: string | null;
  yandexPath: string | null;
  addedBy: { id: string; name: string | null };
  syncedAt: string | null;
  syncError: string | null;
  itemCount: number | null;
};

export type SpaceMember = { id: string; name: string | null; email: string; role: 'editor' | 'viewer' };

export type SpaceDetails = {
  id: string;
  name: string;
  role: SpaceRole;
  owner: { id: string; name: string | null; email: string };
  members: SpaceMember[];
  sources: SpaceSource[];
  createdAt: string;
  updatedAt: string;
};

export type SpaceFeedItem = {
  key: string;
  sourceId: string;
  origin: 'qspace' | 'yandex';
  /** canvas, text-document, html-document, board, sheet, file. */
  kind: string;
  id: string | null;
  path: string | null;
  name: string;
  mime: string | null;
  mediaType: string | null;
  size: number | null;
  updatedAt: string | null;
  addedBy: { id: string; name: string | null };
  previewUrl: string | null;
};

export type SpaceFeed = { items: SpaceFeedItem[]; offset: number; limit: number; nextOffset: number | null };

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/** 204 has no JSON body: request() fails to parse it, which is success here. */
const noContent = (call: Promise<unknown>) => call.then(() => undefined).catch((error) => {
  if (error instanceof SyntaxError) return;
  throw error;
});

export const spacesApi = {
  list: () => request<{ spaces: SpaceSummary[] }>('/spaces'),
  create: (name: string) => request<SpaceDetails>('/spaces', json('POST', { name })),
  get: (id: string) => request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}`),
  rename: (id: string, name: string) => request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}`, json('PATCH', { name })),
  remove: (id: string) => noContent(request(`/spaces/${encodeURIComponent(id)}`, { method: 'DELETE' })),
  addMember: (id: string, email: string, role: 'editor' | 'viewer') =>
    request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}/members`, json('POST', { email, role })),
  setRole: (id: string, userId: string, role: 'editor' | 'viewer') =>
    request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, json('PATCH', { role })),
  removeMember: (id: string, userId: string) =>
    noContent(request(`/spaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })),
  addQspaceFolder: (id: string, folderId: string) =>
    request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}/sources`, json('POST', { kind: 'qspace', folderId })),
  addYandexFolder: (id: string, path: string) =>
    request<SpaceDetails>(`/spaces/${encodeURIComponent(id)}/sources`, json('POST', { kind: 'yandex', path })),
  removeSource: (id: string, sourceId: string) =>
    noContent(request(`/spaces/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' })),
  feed: (id: string, opts: { offset?: number; limit?: number; sourceId?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.sourceId) params.set('sourceId', opts.sourceId);
    const query = params.toString();
    return request<SpaceFeed>(`/spaces/${encodeURIComponent(id)}/feed${query ? `?${query}` : ''}`);
  },
  yandexDownload: (id: string, sourceId: string, path: string) =>
    request<{ href: string }>(`/spaces/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}/download?path=${encodeURIComponent(path)}`),
};
