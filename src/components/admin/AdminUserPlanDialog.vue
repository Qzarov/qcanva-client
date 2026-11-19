<template>
  <!-- One user's plan: what is in force and how much of it is used, giving
       another, and everything that happened to their plans. -->
  <Transition name="yandex-picker" appear @after-leave="emit('close')">
    <div v-if="visible" class="dashboard-modal-backdrop" @click.self="visible = false">
      <section class="dashboard-modal admin-user-plan" role="dialog" aria-modal="true" :aria-label="user.name" data-user-plan-dialog tabindex="-1">
        <div class="dashboard-modal-head">
          <h3>{{ user.name || user.email }}</h3>
          <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="visible = false"><X :size="16" aria-hidden="true" /></button>
        </div>

        <template v-if="info">
          <div class="admin-user-plan-now">
            <strong data-user-plan-current>{{ info.plan?.name }}</strong>
            <span v-if="info.plan?.endsAt" class="admin-user-plan-muted">{{ t('planUntil').replace('{date}', formatDay(info.plan.endsAt)) }}</span>
            <span class="admin-user-plan-muted" data-user-plan-usage>{{ usageText }}</span>
          </div>

          <form class="admin-user-plan-grant" @submit.prevent="grant">
            <select v-model="planId" class="dashboard-modal-input" required data-user-plan-select :aria-label="t('planName')">
              <option value="" disabled>{{ t('planChoose') }}</option>
              <option v-for="plan in grantable" :key="plan.id" :value="plan.id">{{ plan.name }}</option>
            </select>
            <input v-model="endsAt" class="dashboard-modal-input" type="date" :min="tomorrow" :aria-label="t('planEndsAt')" :title="t('planEndsAt')" data-user-plan-ends />
            <input v-model.trim="note" class="dashboard-modal-input" maxlength="500" :placeholder="t('planNote')" data-user-plan-note />
            <button type="submit" class="btn-primary" :disabled="busy || !planId" data-user-plan-grant>{{ t('planGrant') }}</button>
          </form>

          <p v-if="!info.history.length" class="admin-user-plan-muted" data-user-plan-empty>{{ t('planHistoryEmpty') }}</p>
          <ul v-else class="admin-user-plan-history" data-user-plan-history>
            <li v-for="grantRow in info.history" :key="grantRow.id" :data-user-plan-grant-row="grantRow.status">
              <div class="admin-user-plan-grant-top">
                <span class="admin-user-plan-name">{{ grantRow.planName }}</span>
                <span class="badge" :class="statusBadge(grantRow.status)">{{ statusLabel(grantRow.status) }}</span>
                <span class="admin-user-plan-muted">{{ grantRow.priceCents ? formatPrice(grantRow.priceCents) : '' }}</span>
                <span class="admin-user-plan-actions">
                  <button v-if="grantRow.status === 'active'" type="button" class="btn-ghost btn-sm" :disabled="busy" data-user-plan-suspend @click="act(grantRow.id, 'suspend')">{{ t('planSuspend') }}</button>
                  <button v-if="grantRow.status === 'suspended'" type="button" class="btn-ghost btn-sm" :disabled="busy" data-user-plan-resume @click="act(grantRow.id, 'resume')">{{ t('planResume') }}</button>
                  <button v-if="grantRow.status === 'active' || grantRow.status === 'suspended'" type="button" class="btn-ghost btn-sm" :disabled="busy" data-user-plan-revoke @click="act(grantRow.id, 'revoke')">{{ t('planRevoke') }}</button>
                </span>
              </div>
              <ul class="admin-user-plan-events">
                <li v-for="(event, index) in grantRow.events" :key="index">
                  {{ formatDay(event.at) }} · {{ actionLabel(event.action) }}<template v-if="event.actorName"> · {{ event.actorName }}</template><template v-if="event.note"> · {{ event.note }}</template>
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import { formatFileSize } from '../../api/drive';
import { formatPrice, plansApi, type GrantAction, type GrantStatus, type Plan, type UserPlanInfo } from '../../api/plans';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const props = defineProps<{ user: { id: string; name: string; email: string } }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { t, locale } = useI18n();
const { show: showToast } = useToast();

const visible = ref(true);
const info = ref<UserPlanInfo | null>(null);
const plans = ref<Plan[]>([]);
const planId = ref('');
const endsAt = ref('');
const note = ref('');
const busy = ref(false);

const grantable = computed(() => plans.value.filter((plan) => !plan.archived));
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const formatDay = (iso: string) => new Date(iso).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

const usageText = computed(() => {
  if (!info.value) return '';
  const { usage, plan } = info.value;
  const resources = `${usage.resources}/${plan?.maxResources ?? '∞'}`;
  const storage = `${formatFileSize(usage.storageBytes)} / ${plan?.maxStorageBytes == null ? '∞' : formatFileSize(plan.maxStorageBytes)}`;
  return `${resources} · ${storage}`;
});

const STATUS_KEYS = { active: 'planStatusActive', suspended: 'planStatusSuspended', revoked: 'planStatusRevoked', replaced: 'planStatusReplaced', expired: 'planStatusExpired' } as const;
const ACTION_KEYS = { granted: 'planActionGranted', suspended: 'planActionSuspended', resumed: 'planActionResumed', revoked: 'planActionRevoked', replaced: 'planActionReplaced' } as const;
const statusLabel = (status: GrantStatus) => t(STATUS_KEYS[status]);
const actionLabel = (action: GrantAction) => t(ACTION_KEYS[action]);
const statusBadge = (status: GrantStatus) => (status === 'active' ? 'badge-shared' : status === 'suspended' ? 'badge-pinned' : status === 'revoked' ? 'badge-superadmin' : '');

const load = async () => {
  info.value = await plansApi.ofUser(props.user.id);
};
const run = async (action: () => Promise<unknown>) => {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
    await load();
    emit('changed');
  } catch (error) {
    showToast(error instanceof Error ? error.message : t('planActionFailed'), 'error');
  } finally {
    busy.value = false;
  }
};
const grant = () => run(async () => {
  // To the end of the chosen day, on the reader's clock.
  const ends = endsAt.value ? new Date(`${endsAt.value}T23:59:59`).toISOString() : null;
  await plansApi.grant(props.user.id, { planId: planId.value, endsAt: ends, note: note.value });
  planId.value = '';
  endsAt.value = '';
  note.value = '';
});
const act = (grantId: string, action: 'suspend' | 'resume' | 'revoke') => run(() => plansApi.act(grantId, action));

/** On the document: the button just pressed may be gone, and the focus with it. */
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') visible.value = false;
};
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  load().catch(() => undefined);
  plansApi.list().then((list) => { plans.value = list; }).catch(() => undefined);
});
</script>

<style scoped>
.admin-user-plan { display: grid; gap: 14px; width: min(620px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; }
.admin-user-plan .dashboard-modal-head { margin-bottom: 0; }
.admin-user-plan-now { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; font-size: 15px; }
.admin-user-plan-muted { color: var(--ui-text-secondary); font-size: 13px; }
.admin-user-plan-grant { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 8px; }
.admin-user-plan-grant .btn-primary { width: auto; justify-self: end; }
.admin-user-plan-history { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.admin-user-plan-history > li { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: 12px; }
.admin-user-plan-grant-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.admin-user-plan-name { font-weight: 600; font-size: 14px; }
.admin-user-plan-actions { display: inline-flex; gap: 6px; margin-left: auto; }
.admin-user-plan-actions .btn-ghost { width: auto; }
.admin-user-plan-events { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; color: var(--ui-text-secondary); font-size: 12px; }
</style>
