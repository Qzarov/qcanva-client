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
            <td><span class="badge" :class="u.isAdmin ? 'badge-owner' : 'badge-shared'">{{ u.isAdmin ? 'Admin' : 'User' }}</span></td>
            <td>{{ u.canvasCount }}</td>
            <td>{{ formatDate(u.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getToken() { return localStorage.getItem('token'); }

async function adminRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default defineComponent({
  setup() {
    const users = ref<any[]>([]);
    const stats = ref({ userCount: 0, canvasCount: 0 });
    const loading = ref(true);

    const load = async () => {
      try {
        const [u, s] = await Promise.all([
          adminRequest<any[]>('/admin/users'),
          adminRequest<any>('/admin/stats'),
        ]);
        users.value = u;
        stats.value = s;
      } catch (e: any) {
        alert(e.message);
      }
      loading.value = false;
    };

    const formatDate = (d: string) =>
      new Date(d).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', year: 'numeric',
      });

    onMounted(load);
    return { users, stats, loading, formatDate };
  },
});
</script>
