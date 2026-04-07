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
  me: () => request<any>('/auth/me'),
};

// Canvas
export const canvas = {
  list: () => request<{ own: any[]; shared: any[]; welcome?: any }>('/canvas'),
  create: (title: string, data?: string) =>
    request<any>('/canvas', { method: 'POST', body: JSON.stringify({ title, data }) }),
  get: (id: string) => request<{ canvas: any; role: string }>(`/canvas/${id}`),
  update: (id: string, updates: { title?: string; data?: string; isPublic?: boolean; visibility?: string }) =>
    request<any>(`/canvas/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) =>
    request<any>(`/canvas/${id}`, { method: 'DELETE' }),
  share: (id: string, email: string, role: string) =>
    request<any>(`/canvas/${id}/share`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revoke: (id: string, userId: string) =>
    request<any>(`/canvas/${id}/share`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  permissions: (id: string) => request<any[]>(`/canvas/${id}/permissions`),
};
