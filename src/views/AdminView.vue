<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1>Admin — Users</h1>
      <div class="dash-actions">
        <router-link to="/" class="btn-ghost">Back to Dashboard</router-link>
      </div>
    </header>

    <div v-if="loading" class="dash-loading">Loading...</div>

    <div v-else>
      <div class="admin-stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.userCount }}</div>
          <div class="stat-label">Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.canvasCount }}</div>
          <div class="stat-label">Canvases</div>
        </div>
      </div>

      <h2 class="admin-section-title">Users</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Canvases</th>
            <th>Registered</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.name }}</td>
            <td>{{ u.email }}</td>
            <td>
              <select
                v-if="superAdmin && u.id !== currentUserId"
                class="role-select"
                :value="u.role"
                @change="changeRole(u.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <span v-else class="badge" :class="roleBadge(u.role)">{{ u.role }}</span>
            </td>
            <td>{{ u.canvasCount }}</td>
            <td>{{ formatDate(u.createdAt) }}</td>
          </tr>
        </tbody>
      </table>

      <h2 class="admin-section-title">Canvas History Access</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Owner</th>
            <th>Visibility</th>
            <th>History access</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in canvases" :key="c.id">
            <td>{{ c.title }}</td>
            <td>{{ c.ownerName || c.ownerEmail }}</td>
            <td><span class="badge" :class="visBadge(c.visibility)">{{ c.visibility }}</span></td>
            <td>
              <select
                class="role-select"
                :value="c.historyAccess"
                @change="changeHistoryAccess(c.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="owner">Owner only</option>
                <option value="editors">Editors</option>
                <option value="viewers">All viewers</option>
              </select>
            </td>
            <td>{{ formatDate(c.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import { isSuperAdmin } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
function getToken() { return localStorage.getItem('token'); }

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default defineComponent({
  setup() {
    const users = ref<any[]>([]);
    const canvases = ref<any[]>([]);
    const stats = ref({ userCount: 0, canvasCount: 0 });
    const loading = ref(true);
    const superAdmin = isSuperAdmin();

    // Decode JWT to get current user id
    const token = getToken();
    let currentUserId = '';
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1] || ''));
        currentUserId = payload.sub;
      } catch {}
    }

    const load = async () => {
      try {
        const [u, s, c] = await Promise.all([
          adminRequest<any[]>('/admin/users'),
          adminRequest<any>('/admin/stats'),
          adminRequest<any[]>('/admin/canvases'),
        ]);
        users.value = u;
        stats.value = s;
        canvases.value = c;
      } catch (e: any) {
        alert(e.message);
      }
      loading.value = false;
    };

    const changeRole = async (userId: string, role: string) => {
      try {
        await adminRequest(`/admin/users/${userId}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role }),
        });
        const user = users.value.find((u) => u.id === userId);
        if (user) user.role = role;
      } catch (e: any) {
        alert(e.message);
      }
    };

    const changeHistoryAccess = async (canvasId: string, access: string) => {
      try {
        await adminRequest(`/admin/canvases/${canvasId}/history-access`, {
          method: 'PUT',
          body: JSON.stringify({ historyAccess: access }),
        });
        const c = canvases.value.find((cv: any) => cv.id === canvasId);
        if (c) c.historyAccess = access;
      } catch (e: any) {
        alert(e.message);
      }
    };

    const visBadge = (vis: string) => {
      if (vis === 'public') return 'badge-owner';
      if (vis === 'authenticated') return 'badge-superadmin';
      return 'badge-shared';
    };

    const roleBadge = (role: string) => {
      if (role === 'superadmin') return 'badge-superadmin';
      if (role === 'admin') return 'badge-owner';
      return 'badge-shared';
    };

    const formatDate = (d: string) =>
      new Date(d).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', year: 'numeric',
      });

    onMounted(load);
    return { users, canvases, stats, loading, superAdmin, currentUserId, changeRole, changeHistoryAccess, roleBadge, visBadge, formatDate };
  },
});
</script>
