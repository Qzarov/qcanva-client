const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, message: string, body: any = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type CurrentUser = {
  id?: string;
  email?: string;
  name?: string;
  role: string;
  accessMode: string;
};

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function getAccessToken(): string | null {
  return getToken();
}

export function setToken(token: string, role = 'user', accessMode = 'user', user?: { id?: string; email?: string; name?: string }) {
  localStorage.setItem('token', token);
  localStorage.setItem('userRole', role);
  localStorage.setItem('accessMode', accessMode);
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      accessMode,
    }));
  }
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
  localStorage.removeItem('accessMode');
  localStorage.removeItem('currentUser');
}

export function getCurrentUser(): CurrentUser | null {
  const stored = localStorage.getItem('currentUser');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        id: parsed.id,
        email: parsed.email,
        name: parsed.name,
        role: parsed.role || getUserRole(),
        accessMode: parsed.accessMode || getAccessMode(),
      };
    } catch {
      localStorage.removeItem('currentUser');
    }
  }

  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return {
      id: payload.sub || payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role || getUserRole(),
      accessMode: payload.accessMode || getAccessMode(),
    };
  } catch {
    return {
      role: getUserRole(),
      accessMode: getAccessMode(),
    };
  }
}

export function getUserRole(): string {
  return localStorage.getItem('userRole') || 'user';
}

export function isAdmin(): boolean {
  const r = getUserRole();
  return r === 'admin' || r === 'superadmin';
}

export function isSuperAdmin(): boolean {
  return getUserRole() === 'superadmin';
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getAccessMode(): string {
  const stored = localStorage.getItem('accessMode');
  if (stored) return stored;

  const token = getToken();
  if (!token) return 'user';
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return payload.accessMode || 'user';
  } catch {
    return 'user';
  }
}

export function isPasswordAccess(): boolean {
  return getAccessMode() === 'resource-password';
}

type ApiRequestInit = RequestInit & { skipAuthRedirect?: boolean };

async function request<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !options.skipAuthRedirect) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || `HTTP ${res.status}`, body);
  }

  return res.json();
}

function isMissingRouteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('Cannot POST') || error.message.includes('HTTP 404');
}

async function resyncCanvas(id: string, knownRevision?: number): Promise<{ canvas: { id: string; data: string; revision: number } }> {
  try {
    return await request<{ canvas: { id: string; data: string; revision: number } }>(`/canvas/${id}/resync`, {
      method: 'POST',
      body: JSON.stringify({ knownRevision: knownRevision?.toString() }),
    });
  } catch (error) {
    if (!isMissingRouteError(error)) {
      throw error;
    }

    const snapshot = await request<{ canvas: { id: string; data: string; revision?: number } }>(`/canvas/${id}`);
    return {
      canvas: {
        id: snapshot.canvas.id,
        data: snapshot.canvas.data,
        revision: snapshot.canvas.revision ?? 0,
      },
    };
  }
}

// Auth
export const auth = {
  register: (email: string, name: string, password: string) =>
    request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  resourcePasswordLogin: (payload: { resourceType: 'canvas' | 'html-document' | 'text-document'; resourceId: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/resource-password-login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRedirect: true,
    }),
  refreshToken: () =>
    request<{ token: string; user: any }>('/auth/refresh-token', {
      method: 'POST',
    }),
  me: () => request<any>('/auth/me'),
};

export type ResourceTag = {
  name: string;
  color: string;
};

export type ResourceTagSummary = ResourceTag & {
  canvasCount: number;
  htmlDocumentCount: number;
  textDocumentCount?: number;
  totalCount: number;
};

export type ResourceType = 'canvas' | 'html-document' | 'text-document';
export type ResourceFolderRole = 'owner' | 'read' | 'edit';

export type ResourceFolderSummary = {
  id: string;
  name: string;
  ownerId?: string;
  role: ResourceFolderRole;
  canvasCount: number;
  htmlDocumentCount: number;
  textDocumentCount?: number;
  updatedAt?: string;
  createdAt?: string;
  canvases?: any[];
  htmlDocuments?: any[];
  textDocuments?: any[];
  items?: {
    canvases: any[];
    htmlDocuments: any[];
    textDocuments?: any[];
  };
};

export const resourceFolders = {
  list: () => request<{ own: ResourceFolderSummary[]; shared: ResourceFolderSummary[] }>('/resource-folders'),
  create: (name: string) =>
    request<ResourceFolderSummary>('/resource-folders', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id: string, name: string) =>
    request<ResourceFolderSummary>(`/resource-folders/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/resource-folders/${id}`, { method: 'DELETE' }),
  move: (id: string, resourceType: ResourceType, resourceId: string) =>
    request<any>(`/resource-folders/${id}/resources`, { method: 'PUT', body: JSON.stringify({ resourceType, resourceId }) }),
  share: (id: string, email: string, role: Exclude<ResourceFolderRole, 'owner'>) =>
    request<any>(`/resource-folders/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revoke: (id: string, userId: string) =>
    request<any>(`/resource-folders/${id}/share`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  permissions: (id: string) => request<any[]>(`/resource-folders/${id}/permissions`),
};

// Canvas
export const canvas = {
  list: () => request<{ own: any[]; shared: any[]; public: any[]; welcome?: any }>('/canvas'),
  create: (title: string, data?: string, folderId?: string | null, tags?: ResourceTag[]) =>
    request<any>('/canvas', { method: 'POST', body: JSON.stringify({ title, data, folderId, tags }) }),
  get: (id: string) => request<{ canvas: any; role: string }>(`/canvas/${id}`, { skipAuthRedirect: true }),
  update: (
    id: string,
    updates: {
      title?: string;
      slug?: string | null;
      data?: string;
      isPublic?: boolean;
      visibility?: string;
      allowPublicEdit?: boolean;
      listedInPublic?: boolean;
      passwordAccessEnabled?: boolean;
      passwordAccessPassword?: string;
      passwordAccessRole?: string;
      folder?: string;
      folderId?: string | null;
      pinned?: boolean;
      tags?: ResourceTag[];
    },
  ) =>
    request<any>(`/canvas/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  resync: resyncCanvas,
  duplicate: (id: string) =>
    request<any>(`/canvas/${id}/duplicate`, { method: 'POST' }),
  delete: (id: string) =>
    request<any>(`/canvas/${id}`, { method: 'DELETE' }),
  share: (id: string, email: string, role: string) =>
    request<any>(`/canvas/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revoke: (id: string, userId: string) =>
    request<any>(`/canvas/${id}/share`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  permissions: (id: string) => request<any[]>(`/canvas/${id}/permissions`),
  transferOwnership: (id: string, email: string) =>
    request<any>(`/canvas/${id}/transfer-ownership`, { method: 'POST', body: JSON.stringify({ email }) }),
  history: (id: string, limit = 50, offset = 0) =>
    request<{ historyAccess: string; items: any[] }>(`/canvas/${id}/history?limit=${limit}&offset=${offset}`),
  historySnapshot: (id: string, revision: number) =>
    request<{ revision: number; canvas: any }>(`/canvas/${id}/history/${revision}/snapshot`),
  restoreHistorySnapshot: (id: string, revision: number) =>
    request<{ revision: number; canvas: any }>(`/canvas/${id}/history/${revision}/restore`, { method: 'POST' }),
  updateHistoryAccess: (id: string, historyAccess: string) =>
    request<{ historyAccess: string }>(`/canvas/${id}/history-access`, { method: 'PUT', body: JSON.stringify({ historyAccess }) }),
  getMessages: (id: string, limit = 100) =>
    request<any[]>(`/canvas/${id}/messages?limit=${limit}`),
};

export const htmlDocuments = {
  list: () => request<{ groups: any[]; documents: any[] }>('/html-documents'),
  publicList: () => request<{ documents: any[] }>('/html-documents/public', { skipAuthRedirect: true }),
  createGroup: (name: string) =>
    resourceFolders.create(name),
  renameGroup: (id: string, name: string) =>
    resourceFolders.rename(id, name),
  create: (payload: { title: string; html: string; groupId?: string; folderId?: string | null; tags?: ResourceTag[]; shared?: boolean; visibility?: string; allowPublicEdit?: boolean; listedInPublic?: boolean }) =>
    request<any>('/html-documents', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: string) => request<{ document: any; role: string }>(`/html-documents/${id}`, { skipAuthRedirect: true }),
  update: (id: string, payload: { title?: string; slug?: string | null; html?: string; groupId?: string; folderId?: string | null; tags?: ResourceTag[]; pinned?: boolean; shared?: boolean; visibility?: string; allowPublicEdit?: boolean; listedInPublic?: boolean; passwordAccessEnabled?: boolean; passwordAccessPassword?: string; passwordAccessRole?: string }) =>
    request<any>(`/html-documents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  duplicate: (id: string) =>
    request<any>(`/html-documents/${id}/duplicate`, { method: 'POST' }),
  transferOwnership: (id: string, email: string) =>
    request<any>(`/html-documents/${id}/transfer-ownership`, { method: 'POST', body: JSON.stringify({ email }) }),
  move: (id: string, folderId: string) =>
    resourceFolders.move(folderId, 'html-document', id),
  delete: (id: string) =>
    request<any>(`/html-documents/${id}`, { method: 'DELETE' }),
  checklist: (id: string, checkId: string, checked: boolean) =>
    request<any>(`/html-documents/${id}/checklist`, { method: 'PUT', body: JSON.stringify({ checkId, checked }) }),
  history: (id: string, params: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const query = search.toString();
    return request<{ items: any[] }>(`/html-documents/${id}/history${query ? `?${query}` : ''}`);
  },
  historyEntry: (id: string, entryId: string) =>
    request<any>(`/html-documents/${id}/history/${entryId}`),
  restoreHistoryEntry: (id: string, entryId: string) =>
    request<any>(`/html-documents/${id}/history/${entryId}/restore`, { method: 'POST' }),
  settings: () => request<{ model: string; hasOpenRouterKey: boolean }>('/html-documents/settings/current'),
  updateSettings: (payload: { model?: string; openRouterKey?: string }) =>
    request<any>('/html-documents/settings/current', { method: 'PUT', body: JSON.stringify(payload) }),
  generate: (payload: { documentIds: string[]; prompt: string; title?: string; groupId?: string; folderId?: string | null }) =>
    request<any>('/html-documents/generate', { method: 'POST', body: JSON.stringify(payload) }),
  share: (id: string, email: string, role: string) =>
    request<any>(`/html-documents/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revoke: (id: string, userId: string) =>
    request<any>(`/html-documents/${id}/share`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  permissions: (id: string) => request<any[]>(`/html-documents/${id}/permissions`),
};

export const plugins = {
  list: (resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string) =>
    request<Array<{ id: string; name: string; description: string; surface: string; enabled: boolean }>>(
      `/plugins/${resourceType}/${resourceId}`,
      { skipAuthRedirect: true },
    ),
  setEnabled: (resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string, id: string, enabled: boolean) =>
    request<any>(`/plugins/${resourceType}/${resourceId}/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
};

export const textDocuments = {
  list: () => request<{ documents: any[] }>('/text-documents'),
  publicList: () => request<{ documents: any[] }>('/text-documents/public', { skipAuthRedirect: true }),
  create: (payload: { title: string; folderId?: string | null; tags?: ResourceTag[]; visibility?: string }) =>
    request<any>('/text-documents', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: string) => request<{ document: any; role: string }>(`/text-documents/${id}`, { skipAuthRedirect: true }),
  snapshot: (id: string) => request<any>(`/text-documents/${id}/snapshot`, { skipAuthRedirect: true }),
  update: (id: string, payload: Record<string, unknown>) =>
    request<any>(`/text-documents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  replaceContent: (id: string, payload: { html?: string; text?: string }) =>
    request<any>(`/text-documents/${id}/content`, { method: 'PUT', body: JSON.stringify(payload) }),
  applyUpdate: (id: string, clientUpdateId: string, update: string) =>
    request<any>(`/text-documents/${id}/updates`, { method: 'POST', body: JSON.stringify({ clientUpdateId, update }) }),
  delete: (id: string) => request<any>(`/text-documents/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => request<any>(`/text-documents/${id}/duplicate`, { method: 'POST' }),
  transferOwnership: (id: string, email: string) =>
    request<any>(`/text-documents/${id}/transfer-ownership`, { method: 'POST', body: JSON.stringify({ email }) }),
  moveToFolder: (id: string, folderId: string) => resourceFolders.move(folderId, 'text-document', id),
  history: (id: string, limit = 50, offset = 0) =>
    request<{ items: any[] }>(`/text-documents/${id}/history?limit=${limit}&offset=${offset}`),
  historySnapshot: (id: string, revision: number) =>
    request<any>(`/text-documents/${id}/history/${revision}`),
  restoreHistorySnapshot: (id: string, revision: number) =>
    request<any>(`/text-documents/${id}/history/${revision}/restore`, { method: 'POST' }),
  share: (id: string, email: string, role: string) =>
    request<any>(`/text-documents/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revoke: (id: string, userId: string) =>
    request<any>(`/text-documents/${id}/share`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  permissions: (id: string) => request<any[]>(`/text-documents/${id}/permissions`),
};

export const accessRequests = {
  create: (payload: { resourceType: ResourceType; resourceId: string; requestedRole: 'read' | 'edit' }) =>
    request<any>('/access-requests', { method: 'POST', body: JSON.stringify(payload) }),
  incoming: () => request<any[]>('/access-requests/incoming'),
  resolve: (id: string, status: 'approved' | 'declined') =>
    request<any>(`/access-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
};

export const tags = {
  list: () => request<{ tags: ResourceTagSummary[] }>('/tags'),
  update: (name: string, payload: ResourceTag) =>
    request<{ tags: ResourceTagSummary[] }>(`/tags/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  delete: (name: string) =>
    request<{ tags: ResourceTagSummary[] }>(`/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};

export const recentResources = {
  list: (limit = 12) =>
    request<Array<{ id: string; resourceType: 'canvas' | 'html-document' | 'text-document'; resourceId: string; updatedAt: string }>>(`/recent-resources?limit=${limit}`),
  markOpened: (resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string) =>
    request<any>('/recent-resources', { method: 'POST', body: JSON.stringify({ resourceType, resourceId }) }),
};

export async function uploadImage(file: File): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/canvas/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, body?.message || `Upload failed (${res.status})`, body);
  }
  return res.json();
}
