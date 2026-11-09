<template>
  <section class="admin-card" data-admin-plans>
    <div class="admin-plans-head">
      <h2>{{ t('plansTitle') }}</h2>
      <button type="button" class="btn-primary btn-sm" data-plan-new @click="startNew"><Plus :size="16" aria-hidden="true" />{{ t('add') }}</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>{{ t('planName') }}</th>
            <th>{{ t('planPrice') }}</th>
            <th>{{ t('planResources') }}</th>
            <th>{{ t('planStorage') }}</th>
            <th>{{ t('planSpaces') }}</th>
            <th>{{ t('adminStatUsers') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plan in plans" :key="plan.id" :class="{ 'admin-plan-archived': plan.archived }" :data-plan-row="plan.name">
            <td>
              {{ plan.name }}
              <span v-if="plan.isDefault" class="badge badge-owner" data-plan-default-badge>{{ t('planDefault') }}</span>
              <span v-if="plan.archived" class="badge">{{ t('planArchived') }}</span>
            </td>
            <td>{{ plan.priceCents ? `${formatPrice(plan.priceCents)} / ${periodLabel(plan.period)}` : '—' }}</td>
            <td>{{ plan.maxResources ?? '∞' }}</td>
            <td>{{ plan.maxStorageBytes === null ? '∞' : formatFileSize(plan.maxStorageBytes) }}</td>
            <td>{{ plan.canCreateSpaces ? t('planYes') : t('planNo') }}</td>
            <td>{{ plan.users }}</td>
            <td class="admin-plan-actions">
              <button type="button" class="btn-ghost btn-sm" :data-plan-edit="plan.name" @click="startEdit(plan)">{{ t('planEdit') }}</button>
              <button v-if="!plan.isDefault && !plan.archived" type="button" class="btn-ghost btn-sm" :data-plan-make-default="plan.name" @click="makeDefault(plan)">{{ t('planMakeDefault') }}</button>
              <button v-if="!plan.isDefault" type="button" class="btn-ghost btn-sm" :data-plan-archive="plan.name" @click="toggleArchive(plan)">{{ plan.archived ? t('planUnarchive') : t('planArchive') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="yandex-picker" appear>
      <div v-if="form" class="dashboard-modal-backdrop" @click.self="form = null">
        <form class="dashboard-modal admin-plan-form" data-plan-form @submit.prevent="save">
          <div class="dashboard-modal-head">
            <h3>{{ form.id ? t('planEdit') : t('planNew') }}</h3>
            <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="form = null"><X :size="16" aria-hidden="true" /></button>
          </div>
          <label class="admin-plan-field">
            <span>{{ t('planName') }}</span>
            <input v-model.trim="form.name" class="dashboard-modal-input" maxlength="120" required data-plan-field-name />
          </label>
          <div class="admin-plan-row">
            <label class="admin-plan-field">
              <span>{{ t('planPrice') }}, ₽</span>
              <input v-model.number="form.price" class="dashboard-modal-input" type="number" min="0" step="0.01" data-plan-field-price />
            </label>
            <label class="admin-plan-field">
              <span>{{ t('planPeriod') }}</span>
              <select v-model="form.period" class="dashboard-modal-input" data-plan-field-period>
                <option value="month">{{ t('planPeriodMonth') }}</option>
                <option value="year">{{ t('planPeriodYear') }}</option>
              </select>
            </label>
          </div>
          <div class="admin-plan-row">
            <label class="admin-plan-field">
              <span>{{ t('planResources') }}</span>
              <input v-model.number="form.maxResources" class="dashboard-modal-input" type="number" min="0" step="1" placeholder="∞" data-plan-field-resources />
            </label>
            <label class="admin-plan-field">
              <span>{{ t('planStorage') }}, {{ t('driveUnitGB') }}</span>
              <input v-model.number="form.storageGb" class="dashboard-modal-input" type="number" min="0" step="any" placeholder="∞" data-plan-field-storage />
            </label>
          </div>
          <label class="admin-plan-check">
            <input v-model="form.canCreateSpaces" type="checkbox" data-plan-field-spaces />
            <span>{{ t('planSpaces') }}</span>
          </label>
          <div class="admin-plan-submit">
            <button type="submit" class="btn-primary" :disabled="saving" data-plan-save>{{ t('save') }}</button>
          </div>
        </form>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Plus, X } from '@lucide/vue';
import { formatFileSize } from '../../api/drive';
import { formatPrice, plansApi, type Plan, type PlanPeriod } from '../../api/plans';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const { show: showToast } = useToast();
const GB = 1024 ** 3;

type Row = Plan & { users: number };
type Form = { id: string | null; description: string; name: string; price: number | ''; period: PlanPeriod; maxResources: number | ''; storageGb: number | ''; canCreateSpaces: boolean };

const plans = ref<Row[]>([]);
const form = ref<Form | null>(null);
const saving = ref(false);

const periodLabel = (period: PlanPeriod) => (period === 'year' ? t('planPeriodYear') : t('planPeriodMonth'));

const load = async () => {
  plans.value = await plansApi.list();
};
const run = async (action: () => Promise<unknown>) => {
  try {
    await action();
    await load();
    emit('changed');
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : t('planActionFailed'), 'error');
    return false;
  }
};

const startNew = () => {
  form.value = { id: null, name: '', description: '', price: 0, period: 'month', maxResources: '', storageGb: '', canCreateSpaces: true };
};
const startEdit = (plan: Row) => {
  form.value = {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.priceCents / 100,
    period: plan.period,
    maxResources: plan.maxResources ?? '',
    storageGb: plan.maxStorageBytes === null ? '' : Math.round((plan.maxStorageBytes / GB) * 1000) / 1000,
    canCreateSpaces: plan.canCreateSpaces,
  };
};
const save = async () => {
  const f = form.value;
  if (!f || saving.value) return;
  saving.value = true;
  const input = {
    name: f.name,
    description: f.description,
    priceCents: Math.round(Number(f.price || 0) * 100),
    period: f.period,
    maxResources: f.maxResources === '' ? null : Math.floor(f.maxResources),
    maxStorageBytes: f.storageGb === '' ? null : Math.round(f.storageGb * GB),
    canCreateSpaces: f.canCreateSpaces,
  };
  const done = await run(() => (f.id ? plansApi.update(f.id, input) : plansApi.create(input)));
  saving.value = false;
  if (done) form.value = null;
};
const makeDefault = (plan: Row) => run(() => plansApi.setDefault(plan.id));
const toggleArchive = (plan: Row) => run(() => plansApi.setArchived(plan.id, !plan.archived));

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') form.value = null;
};
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  load().catch(() => undefined);
});
</script>

<style scoped>
.admin-plans-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.admin-plans-head .btn-primary { width: auto; display: inline-flex; align-items: center; gap: 6px; }
.admin-plan-archived td { color: var(--ui-text-muted); }
.admin-plan-actions { display: flex; gap: 6px; }
.admin-plan-actions .btn-ghost { width: auto; }
.admin-plan-form { display: grid; gap: 12px; }
.admin-plan-form .dashboard-modal-head { margin-bottom: 0; }
.admin-plan-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.admin-plan-field { display: grid; gap: 6px; min-width: 0; font-size: 13px; color: var(--ui-text-secondary); }
.admin-plan-check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
.admin-plan-submit { display: flex; justify-content: flex-end; }
.admin-plan-submit .btn-primary { width: auto; }
</style>
