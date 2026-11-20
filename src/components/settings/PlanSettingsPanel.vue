<template>
  <section v-if="info?.plan" class="settings-card" data-settings-plan>
    <h2 data-settings-plan-name>{{ info.plan.name }}</h2>
    <p v-if="info.plan.endsAt" class="plan-panel-muted">{{ t('planUntil').replace('{date}', formatDay(info.plan.endsAt)) }}</p>
    <div class="plan-panel-meter">
      <div class="plan-panel-meter-top"><span>{{ t('planResources') }}</span><span data-settings-plan-resources>{{ info.usage.resources }} / {{ info.plan.maxResources ?? '∞' }}</span></div>
      <div v-if="info.plan.maxResources !== null" class="plan-panel-track"><span :style="{ width: percent(info.usage.resources, info.plan.maxResources) }"></span></div>
    </div>
    <div class="plan-panel-meter">
      <div class="plan-panel-meter-top"><span>{{ t('planStorage') }}</span><span data-settings-plan-storage>{{ formatFileSize(info.usage.storageBytes) }} / {{ info.plan.maxStorageBytes === null ? '∞' : formatFileSize(info.plan.maxStorageBytes) }}</span></div>
      <div v-if="info.plan.maxStorageBytes !== null" class="plan-panel-track"><span :style="{ width: percent(info.usage.storageBytes, info.plan.maxStorageBytes) }"></span></div>
    </div>
    <div class="plan-panel-meter-top"><span>{{ t('planSpaces') }}</span><span>{{ info.plan.canCreateSpaces ? t('planYes') : t('planNo') }}</span></div>
  </section>
  <section v-if="info?.history.length" class="settings-card" data-settings-plan-history>
    <h2>{{ t('planHistory') }}</h2>
    <ul class="plan-panel-history">
      <li v-for="grant in info.history" :key="grant.id">
        <span class="plan-panel-history-name">{{ grant.planName }}</span>
        <span class="plan-panel-muted">{{ formatDay(grant.startsAt) }}<template v-if="grant.endsAt"> — {{ formatDay(grant.endsAt) }}</template></span>
        <span class="badge">{{ t(STATUS_KEYS[grant.status]) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { formatFileSize } from '../../api/drive';
import { plansApi, type UserPlanInfo } from '../../api/plans';
import { useI18n } from '../../composables/useI18n';

const { t, locale } = useI18n();
const STATUS_KEYS = { active: 'planStatusActive', suspended: 'planStatusSuspended', revoked: 'planStatusRevoked', replaced: 'planStatusReplaced', expired: 'planStatusExpired' } as const;
const info = ref<UserPlanInfo | null>(null);
const formatDay = (iso: string) => new Date(iso).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const percent = (used: number, limit: number) => `${limit > 0 ? Math.min(100, (used / limit) * 100) : 100}%`;
onMounted(() => { plansApi.mine().then((data) => { info.value = data; }).catch(() => undefined); });
</script>

<style scoped>
.plan-panel-muted { margin: 0; color: var(--ui-text-secondary); font-size: 13px; }
.plan-panel-meter { display: grid; gap: 6px; }
.plan-panel-meter-top { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.plan-panel-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--ui-surface-subtle); }
.plan-panel-track span { display: block; height: 100%; border-radius: inherit; background: var(--color-brands); }
.plan-panel-history { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.plan-panel-history li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; }
.plan-panel-history-name { font-weight: 600; }
.plan-panel-history .badge { margin-left: auto; }
</style>
