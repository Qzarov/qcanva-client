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
  /** Whose things are in the space (QCanva resources' owners, whose Yandex Disks); an older hub leaves it out. */
  owners?: Array<{ id: string; name: string | null }>;
  id: string;
  name: string;
  role: SpaceRole;
  owner: { id: string; name: string | null; email: string };
  members: SpaceMember[];
  sources: SpaceSource[];
  createdAt: string;
  updatedAt: string;
};

/** The kinds of file a space's feed is narrowed by (the hub's FEED_TYPES). */
export type SpaceFeedType = 'canva' | 'document' | 'book' | 'image' | 'video' | 'audio' | 'other';

export type SpaceFeedItem = {
  /** Whose it is; an older hub leaves it out. */
  owner?: { id: string; name: string | null };
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

export type SpaceFeed = {
  items: SpaceFeedItem[];
  offset: number;
  limit: number;
  nextOffset: number | null;
  /** The first page: how many of each kind the other filters leave (the kind tiles). */
  typeCounts?: Partial<Record<SpaceFeedType, number>>;
};

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
  /** Each kind of file the feed's filters offer, with the extensions it takes. */
  feedTypes: () => request<{ types: Array<{ type: SpaceFeedType; extensions: string[] }> }>('/spaces/feed-types'),
  /**
   * Any of these narrows the feed, several of each at once; kinds and
   * extensions widen each other (photos or PDFs).
   */
  feed: (id: string, opts: { offset?: number; limit?: number; sourceIds?: readonly string[]; types?: readonly SpaceFeedType[]; exts?: readonly string[]; owners?: readonly string[]; addedBy?: readonly string[] } = {}) => {
    const params = new URLSearchParams();
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.sourceIds?.length) params.set('sourceIds', opts.sourceIds.join(','));
    if (opts.types?.length) params.set('types', opts.types.join(','));
    if (opts.addedBy?.length) params.set('addedBy', opts.addedBy.join(','));
    if (opts.exts?.length) params.set('exts', opts.exts.join(','));
    if (opts.owners?.length) params.set('owners', opts.owners.join(','));
    const query = params.toString();
    return request<SpaceFeed>(`/spaces/${encodeURIComponent(id)}/feed${query ? `?${query}` : ''}`);
  },
  yandexDownload: (id: string, sourceId: string, path: string) =>
    request<{ href: string }>(`/spaces/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}/download?path=${encodeURIComponent(path)}`),
};
