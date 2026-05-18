const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string, role = 'user') {
  localStorage.setItem('token', token);
  localStorage.setItem('userRole', role);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
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
  passwordAccessLogin: (login: string, password: string) =>
    request<{ token: string; user: any }>('/auth/password-access-login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    }),
  me: () => request<any>('/auth/me'),
};

type CanvasTag = {
  name: string;
  color: string;
};

// Canvas
export const canvas = {
  list: () => request<{ own: any[]; shared: any[]; public: any[]; welcome?: any }>('/canvas'),
  create: (title: string, data?: string, folder?: string, tags?: CanvasTag[]) =>
    request<any>('/canvas', { method: 'POST', body: JSON.stringify({ title, data, folder, tags }) }),
  get: (id: string) => request<{ canvas: any; role: string }>(`/canvas/${id}`),
  update: (
    id: string,
    updates: {
      title?: string;
      data?: string;
      isPublic?: boolean;
      visibility?: string;
      allowPublicEdit?: boolean;
      folder?: string;
      tags?: CanvasTag[];
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
  updateHistoryAccess: (id: string, historyAccess: string) =>
    request<{ historyAccess: string }>(`/canvas/${id}/history-access`, { method: 'PUT', body: JSON.stringify({ historyAccess }) }),
};

export const htmlDocuments = {
  list: () => request<{ groups: any[]; documents: any[] }>('/html-documents'),
  createGroup: (name: string) =>
    request<any>('/html-documents/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGroup: (id: string, name: string) =>
    request<any>(`/html-documents/groups/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  create: (payload: { title: string; html: string; groupId?: string; shared?: boolean }) =>
    request<any>('/html-documents', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: string) => request<{ document: any; role: string }>(`/html-documents/${id}`),
  update: (id: string, payload: { title?: string; html?: string; groupId?: string; shared?: boolean }) =>
    request<any>(`/html-documents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  move: (id: string, groupId: string) =>
    request<any>(`/html-documents/${id}/move`, { method: 'PUT', body: JSON.stringify({ groupId }) }),
  checklist: (id: string, checkId: string, checked: boolean) =>
    request<any>(`/html-documents/${id}/checklist`, { method: 'PUT', body: JSON.stringify({ checkId, checked }) }),
  settings: () => request<{ model: string; hasOpenRouterKey: boolean }>('/html-documents/settings/current'),
  updateSettings: (payload: { model?: string; openRouterKey?: string }) =>
    request<any>('/html-documents/settings/current', { method: 'PUT', body: JSON.stringify(payload) }),
  generate: (payload: { documentIds: string[]; prompt: string; title?: string; groupId?: string }) =>
    request<any>('/html-documents/generate', { method: 'POST', body: JSON.stringify(payload) }),
};
