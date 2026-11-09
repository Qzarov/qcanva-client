<template>
  <div class="admin-analytics" data-admin-analytics>
    <div class="admin-analytics-range" role="group" :aria-label="t('analyticsRange')">
      <button
        v-for="option in RANGES"
        :key="option"
        type="button"
        class="admin-analytics-range-item"
        :class="{ active: days === option }"
        :aria-pressed="days === option"
        :data-analytics-days="option"
        @click="days = option"
      >{{ t('analyticsDays').replace('{n}', String(option)) }}</button>
    </div>
    <p v-if="failed" class="admin-note" data-analytics-failed>{{ t('analyticsFailed') }}</p>

    <template v-if="report">
      <div class="admin-stats">
        <div class="admin-card stat-card"><div class="stat-value" data-analytics-users>{{ report.users.total }}</div><div class="stat-label">{{ t('adminStatUsers') }}</div></div>
        <div class="admin-card stat-card"><div class="stat-value">{{ report.users.active7 }}</div><div class="stat-label">{{ t('analyticsActive7') }}</div></div>
        <div class="admin-card stat-card"><div class="stat-value">{{ report.users.active30 }}</div><div class="stat-label">{{ t('analyticsActive30') }}</div></div>
        <div class="admin-card stat-card"><div class="stat-value" data-analytics-revenue>{{ formatPrice(report.revenue.monthlyCents) }}</div><div class="stat-label">{{ t('analyticsMonthly') }}</div></div>
        <div class="admin-card stat-card"><div class="stat-value">{{ formatFileSize(report.usage.storageBytes) }}</div><div class="stat-label">{{ t('planStorage') }}</div></div>
        <div class="admin-card stat-card"><div class="stat-value">{{ report.usage.resources }}</div><div class="stat-label">{{ t('planResources') }}</div></div>
      </div>

      <section class="admin-card">
        <h2>{{ t('analyticsDynamics') }}</h2>
        <div class="admin-analytics-charts">
          <AdminBarChart :title="t('analyticsSignups')" :points="signups" />
          <AdminBarChart :title="t('analyticsRevenue')" :points="revenue" :format="formatPrice" headline="last" />
        </div>
      </section>

      <section class="admin-card">
        <h2>{{ t('analyticsContent') }}</h2>
        <div class="admin-analytics-charts">
          <AdminBarChart v-for="chart in contentCharts" :key="chart.title" :title="chart.title" :points="chart.points" />
        </div>
      </section>

      <section class="admin-card">
        <h2>{{ t('analyticsByPlan') }}</h2>
        <div class="admin-table-wrap">
          <table class="admin-table" data-analytics-plans>
            <thead>
              <tr>
                <th>{{ t('planName') }}</th>
                <th>{{ t('adminStatUsers') }}</th>
                <th>{{ t('analyticsMonthly') }}</th>
                <th>{{ t('planResources') }}</th>
                <th>{{ t('planStorage') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plan in report.plans" :key="plan.planId">
                <td>{{ plan.name }}</td>
                <td>{{ plan.users }}</td>
                <td>{{ formatPrice(plan.monthlyCents) }}</td>
                <td>{{ plan.resources }}</td>
                <td>{{ formatFileSize(plan.storageBytes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-for="table in peopleTables" :key="table.title" class="admin-card" :data-analytics-people="table.key">
        <h2>{{ table.title }}<template v-if="table.count !== undefined"> ({{ table.count }})</template></h2>
        <p v-if="!table.people.length" class="admin-empty">{{ t('analyticsNobody') }}</p>
        <div v-else class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>{{ t('adminColName') }}</th>
                <th>{{ t('planName') }}</th>
                <th>{{ t('planResources') }}</th>
                <th>{{ t('planStorage') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="person in table.people" :key="person.userId">
                <td>{{ person.name || person.email }}</td>
                <td>{{ person.planName }}</td>
                <td>{{ person.resources }}/{{ person.maxResources ?? '∞' }}</td>
                <td>{{ formatFileSize(person.storageBytes) }} / {{ person.maxStorageBytes === null ? '∞' : formatFileSize(person.maxStorageBytes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatFileSize } from '../../api/drive';
import { formatPrice, plansApi, type PlanAnalytics } from '../../api/plans';
import { useI18n } from '../../composables/useI18n';
import AdminBarChart from './AdminBarChart.vue';

const RANGES = [7, 30, 90] as const;
const { t } = useI18n();
const days = ref<number>(30);
const report = ref<PlanAnalytics | null>(null);
const failed = ref(false);

watch(days, async (value) => {
  try {
    const next = await plansApi.analytics(value);
    if (days.value !== value) return;
    report.value = next;
    failed.value = false;
  } catch {
    failed.value = true;
  }
}, { immediate: true });

const signups = computed(() => report.value?.users.signups.map((row) => ({ day: row.day, value: row.count })) ?? []);
const revenue = computed(() => report.value?.revenue.series.map((row) => ({ day: row.day, value: row.monthlyCents })) ?? []);
const contentCharts = computed(() => {
  const series = report.value?.content.series ?? [];
  const of = (key: 'canvases' | 'documents' | 'html' | 'templates' | 'files' | 'spaces') => series.map((row) => ({ day: row.day, value: row[key] }));
  return [
    { title: t('analyticsCanvases'), points: of('canvases') },
    { title: t('analyticsDocuments'), points: of('documents') },
    { title: 'HTML', points: of('html') },
    { title: t('analyticsTemplates'), points: of('templates') },
    { title: t('analyticsFiles'), points: of('files') },
    { title: t('analyticsSpaces'), points: of('spaces') },
  ];
});
const peopleTables = computed(() => {
  const usage = report.value?.usage;
  if (!usage) return [];
  return [
    { key: 'at-limit', title: t('analyticsAtLimit'), people: usage.atLimit, count: usage.atLimitCount },
    { key: 'storage', title: t('analyticsTopStorage'), people: usage.topByStorage, count: undefined },
    { key: 'resources', title: t('analyticsTopResources'), people: usage.topByResources, count: undefined },
  ];
});
</script>

<style scoped>
.admin-analytics { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.admin-analytics-range { display: inline-flex; justify-self: start; gap: 4px; padding: 3px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-btn-bg); }
.admin-analytics-range-item { padding: 5px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
.admin-analytics-range-item.active { background: var(--ui-glass-accent-bg, var(--ui-surface-subtle)); color: var(--ui-text); font-weight: 600; }
.admin-analytics .admin-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 520px) {
  .admin-analytics .admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.admin-analytics-charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
</style>
