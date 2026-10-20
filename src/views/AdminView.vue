<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1>Admin — Users</h1>
      <div class="dash-actions">
        <router-link :to="{ name: 'dashboard' }" class="btn-ghost">Back to Dashboard</router-link>
        <AccountMenu />
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

      <div v-if="storageSupported" class="admin-storage-section">
        <h2 id="storage" class="admin-section-title">Хранилище</h2>
        <div class="admin-storage-card">
          <div class="admin-storage-field">
            <label for="admin-storage-limit" class="admin-storage-label">Максимальный размер файла</label>
            <div class="admin-storage-controls">
              <input
                id="admin-storage-limit"
                v-model.number="limitInput"
                type="number"
                min="1"
                step="any"
                class="admin-storage-input"
                data-admin-storage-input
                placeholder="2048"
              />
              <select
                v-model="limitUnit"
                class="role-select admin-storage-unit"
                data-admin-storage-unit
              >
                <option value="MB">МБ</option>
                <option value="GB">ГБ</option>
              </select>
              <button
                type="button"
                class="btn-primary"
                data-admin-storage-save
                :disabled="storageSaving"
                @click="saveStorageLimit"
              >
                Сохранить
              </button>
              <button
                type="button"
                class="btn-ghost"
                data-admin-storage-reset
                :disabled="storageSaving"
                @click="resetStorageLimit"
              >
                Сбросить
              </button>
            </div>
          </div>
          <div v-if="settings" class="admin-storage-effective" data-admin-storage-effective>
            Текущее значение: <strong>{{ effectiveText }}</strong> ({{ sourceText }})
          </div>
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
            <th>Последняя активность</th>
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
            <td>{{ formatDateTime(u.lastActiveAt) }}</td>
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
import { defineComponent, ref, computed, onMounted } from 'vue';
import { isSuperAdmin } from '../api/client';
import { useToast } from '../composables/useToast';
import AccountMenu from '../components/AccountMenu.vue';
import { adminRequest, adminApi, type AdminSettings } from '../api/admin';

function getToken() { return localStorage.getItem('token'); }

export default defineComponent({
  components: { AccountMenu },
  setup() {
    const { show: showToast } = useToast();
    const users = ref<any[]>([]);
    const canvases = ref<any[]>([]);
    const stats = ref({ userCount: 0, canvasCount: 0 });
    const loading = ref(true);
    const superAdmin = isSuperAdmin();

    // Storage section state
    const settings = ref<AdminSettings | null>(null);
    const storageSupported = ref(true);
    const storageSaving = ref(false);
    const limitInput = ref<number | null>(null);
    const limitUnit = ref<'MB' | 'GB'>('MB');

    function formatLimitRu(bytes: number): string {
      if (bytes >= 1024 * 1024 * 1024) {
        const gb = bytes / (1024 * 1024 * 1024);
        return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} ГБ`;
      }
      const mb = bytes / (1024 * 1024);
      return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} МБ`;
    }

    function syncInputFromSettings(s: AdminSettings) {
      if (typeof s.driveMaxFileBytes !== 'number' || s.driveMaxFileBytes <= 0) return;
      if (s.driveMaxFileBytes >= 1024 * 1024 * 1024 && s.driveMaxFileBytes % (1024 * 1024 * 1024) === 0) {
        limitUnit.value = 'GB';
        limitInput.value = s.driveMaxFileBytes / (1024 * 1024 * 1024);
      } else if (s.driveMaxFileBytes >= 1024 * 1024 * 1024 && (s.driveMaxFileBytes / (1024 * 1024 * 1024)) % 0.5 === 0) {
        limitUnit.value = 'GB';
        limitInput.value = s.driveMaxFileBytes / (1024 * 1024 * 1024);
      } else {
        limitUnit.value = 'MB';
        limitInput.value = Math.round(s.driveMaxFileBytes / (1024 * 1024));
      }
    }

    const effectiveText = computed(() => {
      if (!settings.value || typeof settings.value.driveMaxFileBytes !== 'number') return '';
      return formatLimitRu(settings.value.driveMaxFileBytes);
    });

    const sourceText = computed(() => {
      if (!settings.value) return '';
      switch (settings.value.driveMaxFileBytesSource) {
        case 'db':
          return 'задано здесь';
        case 'env':
          return 'из настроек сервера';
        case 'default':
        default:
          return 'по умолчанию';
      }
    });

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
        showToast(e.message || 'Failed to load admin data', 'error');
      }

      try {
        const set = await adminApi.getSettings();
        if (set && typeof (set as any).driveMaxFileBytes === 'number') {
          settings.value = set;
          syncInputFromSettings(set);
        }
      } catch (e: any) {
        if (e.status === 404 || e.message?.includes('404')) {
          storageSupported.value = false;
        } else {
          showToast(e.message || 'Не удалось загрузить настройки хранилища', 'error');
        }
      }

      loading.value = false;
    };

    const saveStorageLimit = async () => {
      if (!limitInput.value || limitInput.value <= 0 || !Number.isFinite(limitInput.value)) {
        showToast('Размер файла должен быть больше 0', 'error');
        return;
      }
      const mult = limitUnit.value === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024;
      const driveMaxFileBytes = Math.round(limitInput.value * mult);

      storageSaving.value = true;
      try {
        await adminApi.updateSettings({ driveMaxFileBytes });
        const updated = await adminApi.getSettings();
        if (updated && typeof updated.driveMaxFileBytes === 'number') {
          settings.value = updated;
          syncInputFromSettings(updated);
        }
        showToast('Лимит сохранён', 'success');
      } catch (e: any) {
        showToast(e.message || 'Не удалось сохранить настройки', 'error');
      } finally {
        storageSaving.value = false;
      }
    };

    const resetStorageLimit = async () => {
      storageSaving.value = true;
      try {
        await adminApi.updateSettings({ driveMaxFileBytes: null });
        const updated = await adminApi.getSettings();
        if (updated && typeof updated.driveMaxFileBytes === 'number') {
          settings.value = updated;
          syncInputFromSettings(updated);
        }
        showToast('Лимит сброшен', 'success');
      } catch (e: any) {
        showToast(e.message || 'Не удалось сбросить лимит', 'error');
      } finally {
        storageSaving.value = false;
      }
    };

    const changeRole = async (userId: string, role: string) => {
      try {
        await adminRequest(`/admin/users/${userId}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role }),
        });
        const user = users.value.find((u) => u.id === userId);
        if (user) user.role = role;
        showToast(`Role updated to ${role}`, 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to change role', 'error');
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
        showToast('History access updated', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to update history access', 'error');
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
    const formatDateTime = (d?: string | null) => d ? new Date(d).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : '—';

    onMounted(load);
    return {
      users,
      canvases,
      stats,
      loading,
      superAdmin,
      currentUserId,
      settings,
      storageSupported,
      storageSaving,
      limitInput,
      limitUnit,
      effectiveText,
      sourceText,
      saveStorageLimit,
      resetStorageLimit,
      changeRole,
      changeHistoryAccess,
      roleBadge,
      visBadge,
      formatDate,
      formatDateTime,
    };
  },
});
</script>

<style scoped>
.admin-storage-section {
  margin-top: 24px;
}
.admin-storage-card {
  background: var(--dark-card-bg);
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-lg);
  padding: 18px 24px;
  max-width: 680px;
}
.admin-storage-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.admin-storage-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text);
}
.admin-storage-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.admin-storage-input {
  width: 140px;
  padding: 8px 12px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font-size: 14px;
  outline: none;
}
.admin-storage-input:focus {
  border-color: var(--color-brands);
}
.admin-storage-unit {
  min-height: 36px;
  padding: 6px 12px;
}
.admin-storage-effective {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ui-text-secondary);
}
.admin-storage-effective strong {
  color: var(--ui-text);
}
</style>
