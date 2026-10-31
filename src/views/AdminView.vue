<template>
  <!-- The settings page's look (settings-page: its glass background, bar and
       buttons), and its own scroll: on a phone html and body do not scroll. -->
  <div class="settings-page admin-page">
    <header class="settings-topbar admin-topbar">
      <router-link :to="{ name: 'dashboard' }" class="btn-ghost admin-back" :aria-label="t('back')" :title="t('back')" data-admin-back>
        <ArrowLeft :size="18" aria-hidden="true" />
      </router-link>
      <h1>{{ t('adminTitle') }}</h1>
      <AccountMenu glass :show-plugins="false" />
    </header>

    <main class="admin-content">
    <p v-if="loading" class="admin-note">{{ t('loadingDots') }}</p>

    <template v-else>
      <div class="admin-stats">
        <div class="admin-card stat-card">
          <div class="stat-value">{{ stats.userCount }}</div>
          <div class="stat-label">{{ t('adminStatUsers') }}</div>
        </div>
        <div class="admin-card stat-card">
          <div class="stat-value">{{ stats.canvasCount }}</div>
          <div class="stat-label">{{ t('adminStatCanvases') }}</div>
        </div>
      </div>

      <section v-if="storageSupported" id="storage" class="admin-card admin-storage-section">
        <h2>{{ t('adminStorageTitle') }}</h2>
        <div class="admin-storage-card">
          <div v-if="settings && settings.storage" class="admin-storage-usage" data-admin-storage-usage>
            <div class="admin-storage-used" data-admin-storage-used>{{ usedText }}</div>
            <template v-if="settings.storage.capacityBytes !== null">
              <div class="admin-storage-free" data-admin-storage-free>{{ freeText }}</div>
              <div
                class="admin-storage-bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="usagePercent"
                data-admin-storage-bar
              >
                <div
                  class="admin-storage-bar-fill"
                  :class="usageLevel"
                  :style="{ width: usagePercent + '%' }"
                  data-admin-storage-bar-fill
                ></div>
              </div>
            </template>
            <div v-else class="admin-storage-muted" data-admin-storage-capacity-unknown>
              {{ t('adminStorageCapacityUnknown') }}
            </div>
          </div>
          <div class="admin-storage-field">
            <label for="admin-storage-limit" class="admin-storage-label">{{ t('adminFileSizeLimit') }}</label>
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
                <option value="MB">{{ t('driveUnitMB') }}</option>
                <option value="GB">{{ t('driveUnitGB') }}</option>
              </select>
              <button
                type="button"
                class="btn-primary"
                data-admin-storage-save
                :disabled="storageSaving"
                @click="saveStorageLimit"
              >
                {{ t('save') }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                data-admin-storage-reset
                :disabled="storageSaving"
                @click="resetStorageLimit"
              >
                {{ t('adminReset') }}
              </button>
            </div>
          </div>
          <div v-if="settings" class="admin-storage-effective" data-admin-storage-effective>
            {{ t('adminCurrentValue') }} <strong>{{ effectiveText }}</strong> ({{ sourceText }})
          </div>
          <div v-if="settings && settings.storage" class="admin-storage-field admin-storage-capacity">
            <label for="admin-storage-capacity" class="admin-storage-label">{{ t('adminStorageCapacityLabel') }}</label>
            <div class="admin-storage-controls">
              <input
                id="admin-storage-capacity"
                v-model.number="capacityInput"
                type="number"
                min="1"
                step="any"
                class="admin-storage-input"
                data-admin-capacity-input
                placeholder="6"
              />
              <select
                v-model="capacityUnit"
                class="role-select admin-storage-unit"
                data-admin-capacity-unit
              >
                <option value="MB">{{ t('driveUnitMB') }}</option>
                <option value="GB">{{ t('driveUnitGB') }}</option>
                <option value="TB">{{ t('driveUnitTB') }}</option>
              </select>
              <button
                type="button"
                class="btn-primary"
                data-admin-capacity-save
                :disabled="storageSaving"
                @click="saveCapacity"
              >
                {{ t('adminStorageCapacitySave') }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                data-admin-capacity-reset
                :disabled="storageSaving"
                @click="resetCapacity"
              >
                {{ t('adminStorageCapacityReset') }}
              </button>
            </div>
            <div class="admin-storage-effective" data-admin-capacity-source>({{ capacitySourceText }})</div>
            <div class="admin-storage-muted" data-admin-capacity-hint>{{ t('adminStorageCapacityHint') }}</div>
          </div>
        </div>
      </section>

      <section class="admin-card">
        <h2>{{ t('adminUsersTitle') }}</h2>
        <!-- Wider than a phone: the table scrolls sideways inside its card. -->
        <div class="admin-table-wrap">
      <table class="admin-table" data-admin-users>
        <thead>
          <tr>
            <th>{{ t('adminColName') }}</th>
            <th>{{ t('adminColEmail') }}</th>
            <th>{{ t('adminColRole') }}</th>
            <th>{{ t('adminColCanvases') }}</th>
            <th>{{ t('adminColRegistered') }}</th>
            <th>{{ t('adminColLastActive') }}</th>
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
                <option value="user">{{ t('adminRoleUser') }}</option>
                <option value="admin">{{ t('adminRoleAdmin') }}</option>
                <option value="superadmin">{{ t('adminRoleSuperadmin') }}</option>
              </select>
              <span v-else class="badge" :class="roleBadge(u.role)">{{ u.role }}</span>
            </td>
            <td>{{ u.canvasCount }}</td>
            <td>{{ formatDate(u.createdAt) }}</td>
            <td>{{ formatDateTime(u.lastActiveAt) }}</td>
          </tr>
        </tbody>
      </table>
        </div>
      </section>

      <section class="admin-card">
        <h2>{{ t('adminHistoryTitle') }}</h2>
        <div class="admin-table-wrap">
      <table class="admin-table" data-admin-history>
        <thead>
          <tr>
            <th>{{ t('adminColTitle') }}</th>
            <th>{{ t('adminColOwner') }}</th>
            <th>{{ t('adminColVisibility') }}</th>
            <th>{{ t('adminColHistory') }}</th>
            <th>{{ t('adminColUpdated') }}</th>
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
                <option value="owner">{{ t('adminHistoryOwner') }}</option>
                <option value="editors">{{ t('adminHistoryEditors') }}</option>
                <option value="viewers">{{ t('adminHistoryViewers') }}</option>
              </select>
            </td>
            <td>{{ formatDate(c.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
        </div>
      </section>
    </template>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import { isSuperAdmin } from '../api/client';
import { useToast } from '../composables/useToast';
import AccountMenu from '../components/AccountMenu.vue';
import { ArrowLeft } from '@lucide/vue';
import { adminRequest, adminApi, type AdminSettings } from '../api/admin';
import { useI18n } from '../composables/useI18n';

function getToken() { return localStorage.getItem('token'); }

export default defineComponent({
  components: { AccountMenu, ArrowLeft },
  setup() {
    const { show: showToast } = useToast();
    const { t } = useI18n();
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
    const capacityInput = ref<number | null>(null);
    const capacityUnit = ref<'MB' | 'GB' | 'TB'>('GB');
    const CAPACITY_MULT = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const;

    function formatStorageBytes(bytes: number): string {
      const units = ['driveUnitB', 'driveUnitKB', 'driveUnitMB', 'driveUnitGB', 'driveUnitTB'] as const;
      let value = Math.max(0, bytes);
      let i = 0;
      while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
      }
      const text = i === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
      return `${text} ${t(units[i] as (typeof units)[number])}`;
    }

    function syncCapacityFromSettings(s: AdminSettings) {
      const cap = s.storage?.capacityBytes;
      if (typeof cap !== 'number' || cap <= 0) {
        capacityInput.value = null;
        return;
      }
      const unit = cap >= CAPACITY_MULT.TB ? 'TB' : cap >= CAPACITY_MULT.GB ? 'GB' : 'MB';
      capacityUnit.value = unit;
      capacityInput.value = Math.round((cap / CAPACITY_MULT[unit]) * 100) / 100;
    }

    const usedText = computed(() => {
      const st = settings.value?.storage;
      if (!st) return '';
      return t('adminStorageUsed')
        .replace('{used}', formatStorageBytes(st.usedBytes))
        .replace('{files}', String(st.files));
    });

    const freeText = computed(() => {
      const st = settings.value?.storage;
      if (!st || st.capacityBytes === null) return '';
      return t('adminStorageFree')
        .replace('{free}', formatStorageBytes(st.freeBytes ?? Math.max(0, st.capacityBytes - st.usedBytes)))
        .replace('{capacity}', formatStorageBytes(st.capacityBytes));
    });

    const usagePercent = computed(() => {
      const st = settings.value?.storage;
      if (!st || !st.capacityBytes) return 0;
      return Math.min(100, Math.max(0, Math.round((st.usedBytes / st.capacityBytes) * 1000) / 10));
    });

    const usageLevel = computed(() => {
      const ratio = usagePercent.value / 100;
      if (ratio > 0.95) return 'is-danger';
      if (ratio > 0.8) return 'is-warning';
      return 'is-ok';
    });

    const capacitySourceText = computed(() => {
      switch (settings.value?.storage?.capacitySource) {
        case 'db':
          return t('adminStorageCapacitySourceDb');
        case 'env':
          return t('adminStorageCapacitySourceEnv');
        default:
          return t('adminStorageCapacitySourceNone');
      }
    });

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
          syncCapacityFromSettings(set);
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
          syncCapacityFromSettings(updated);
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
          syncCapacityFromSettings(updated);
        }
        showToast('Лимит сброшен', 'success');
      } catch (e: any) {
        showToast(e.message || 'Не удалось сбросить лимит', 'error');
      } finally {
        storageSaving.value = false;
      }
    };

    const putCapacity = async (storageCapacityBytes: number | null, doneKey: 'adminStorageCapacitySaved' | 'adminStorageCapacityResetDone') => {
      storageSaving.value = true;
      try {
        await adminApi.updateSettings({ storageCapacityBytes });
        const updated = await adminApi.getSettings();
        if (updated && typeof updated.driveMaxFileBytes === 'number') {
          settings.value = updated;
          syncCapacityFromSettings(updated);
        }
        showToast(t(doneKey), 'success');
      } catch (e: any) {
        showToast(e.message || t('adminStorageCapacitySaveFailed'), 'error');
      } finally {
        storageSaving.value = false;
      }
    };

    const saveCapacity = async () => {
      if (!capacityInput.value || capacityInput.value <= 0 || !Number.isFinite(capacityInput.value)) {
        showToast(t('adminStorageCapacityInvalid'), 'error');
        return;
      }
      await putCapacity(Math.round(capacityInput.value * CAPACITY_MULT[capacityUnit.value]), 'adminStorageCapacitySaved');
    };

    const resetCapacity = () => putCapacity(null, 'adminStorageCapacityResetDone');

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
      t,
      capacityInput,
      capacityUnit,
      usedText,
      freeText,
      usagePercent,
      usageLevel,
      capacitySourceText,
      saveCapacity,
      resetCapacity,
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
/* Its own scroll container: the canvas's phone rule sets html, body
   { overflow: hidden }, which left this page stuck at its first screen. */
.admin-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--ui-text);
}
.admin-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-left)) 10px;
  border-bottom: 1px solid var(--ui-glass-border);
}
.admin-topbar h1 { flex: 1; min-width: 0; margin: 0; font-size: 18px; }
.admin-back { width: 38px; height: 38px; display: inline-grid; place-items: center; padding: 0; border-radius: 999px; }
.admin-content {
  display: grid;
  /* minmax(0, 1fr): a wide table scrolls inside its card instead of widening the page. */
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-content: start;
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 24px 16px calc(48px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.admin-note { margin: 0; color: var(--ui-text-secondary); }
.admin-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 20px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), 0 6px 20px rgba(0, 0, 0, 0.12);
}
.admin-card h2 { margin: 0; font-size: 16px; }
.admin-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin: 0; }
@media (max-width: 520px) {
  .admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
.stat-card { gap: 2px; }
.stat-value { font-size: 28px; font-weight: 750; line-height: 1.1; }
.stat-label { color: var(--ui-text-secondary); font-size: 13px; }
.admin-table-wrap { min-width: 0; overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
/* A table again on a phone too (the old phone rule made it a scrolling
   block): the card's wrap scrolls it sideways. */
.admin-table { display: table; width: 100%; border-collapse: collapse; font-size: 14px; white-space: normal; }
.admin-table th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.admin-table td {
  padding: 10px;
  border-bottom: 1px solid var(--ui-border);
  vertical-align: middle;
  white-space: nowrap;
}
.admin-table tbody tr:last-child td { border-bottom: 0; }
.admin-table tbody tr:hover td { background: var(--ui-glass-btn-hover); }
.role-select {
  min-height: 34px;
  padding: 4px 10px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 10px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}
.admin-storage-card {
  display: grid;
  gap: 4px;
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
/* Beside their field, not full-width (a phone's rule stretches buttons). */
.admin-storage-controls :is(.btn-primary, .btn-ghost) {
  width: auto;
}
.admin-storage-input {
  width: 140px;
  padding: 8px 12px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 12px;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font-size: 14px;
  outline: none;
}
.admin-storage-input:focus {
  border-color: var(--ui-glass-accent-border);
  box-shadow: 0 0 0 3px var(--ui-glass-focus-glow);
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
.admin-storage-usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 14px;
  color: var(--ui-text);
}
.admin-storage-muted {
  font-size: 13px;
  color: var(--ui-text-muted);
}
.admin-storage-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--ui-surface-subtle);
  overflow: hidden;
}
.admin-storage-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-brands);
}
.admin-storage-bar-fill.is-warning {
  background: var(--ui-warning);
}
.admin-storage-bar-fill.is-danger {
  background: var(--ui-danger);
}
.admin-storage-capacity {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
}
.admin-storage-capacity .admin-storage-effective {
  margin-top: 0;
}
</style>
