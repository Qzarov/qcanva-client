<template>
  <section class="admin-billing" aria-labelledby="admin-billing-title">
    <h2 id="admin-billing-title" class="admin-section-title">Тарифы и подписки</h2>
    <p class="admin-billing-state" :class="{ 'is-on': enabled }">
      {{ enabled ? 'Биллинг включён: лимиты действуют.' : 'Биллинг выключен на сервере (BILLING_ENABLED): у всех без ограничений. Настройки ниже начнут действовать, когда его включат.' }}
    </p>
    <p v-if="error" class="admin-billing-error" role="alert">{{ error }}</p>

    <form v-if="form" class="admin-billing-plans" @submit.prevent="save">
      <fieldset>
        <legend>Цены Pro</legend>
        <label>Месяц, ₽ <input v-model.number="form.priceMonth" type="number" min="0" step="1" aria-label="Цена Pro за месяц, рубли" /></label>
        <label>Год, ₽ <input v-model.number="form.priceYear" type="number" min="0" step="1" aria-label="Цена Pro за год, рубли" /></label>
        <label>Льготные дни <input v-model.number="form.graceDays" type="number" min="0" max="30" step="1" aria-label="Льготные дни после неудачного продления" /></label>
      </fieldset>
      <div class="admin-billing-scroll">
      <table class="admin-table admin-billing-limits">
        <thead>
          <tr><th>Лимит (0 — без ограничений)</th><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in LIMIT_ROWS" :key="row.key">
            <td>{{ row.label }}</td>
            <td><input v-model.number="form.free[row.key]" type="number" min="0" step="1" :aria-label="`${row.label}, Free`" /></td>
            <td><input v-model.number="form.pro[row.key]" type="number" min="0" step="1" :aria-label="`${row.label}, Pro`" /></td>
          </tr>
        </tbody>
      </table>
      </div>
      <div class="admin-billing-buttons">
        <button type="submit" class="btn-primary" :disabled="busy || !dirty">Сохранить тарифы</button>
        <button type="button" class="btn-ghost" :disabled="busy" @click="reset">Вернуть значения по умолчанию</button>
      </div>
      <p class="admin-billing-note">Новая цена применяется к новым оплатам и к следующему продлению действующих подписок — о росте цены подписчиков нужно предупредить заранее.</p>
    </form>

    <h3>Выдать Pro</h3>
    <form class="admin-billing-grant" @submit.prevent="grant">
      <input v-model.trim="grantEmail" type="email" required placeholder="email пользователя" aria-label="Email пользователя" />
      <input v-model.number="grantDays" type="number" min="1" max="3660" required aria-label="Дней" />
      <span>дней</span>
      <button type="submit" class="btn-ghost" :disabled="busy || !grantEmail">Выдать</button>
    </form>

    <h3>Подписки</h3>
    <p v-if="!subscriptions.length" class="admin-billing-note">Подписок пока нет.</p>
    <table v-else class="admin-table">
      <thead>
        <tr><th>Пользователь</th><th>Состояние</th><th>Источник</th><th>До</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="row in subscriptions" :key="row.userId">
          <td>{{ row.name || row.email || row.userId }}<div class="admin-billing-sub">{{ row.email }}</div></td>
          <td><span class="badge" :class="row.active ? 'badge-success' : ''">{{ statusText(row) }}</span></td>
          <td>{{ row.source === 'manual' ? 'выдан' : `оплата, ${row.period === 'year' ? 'год' : 'месяц'}` }}</td>
          <td>{{ formatDate(row.currentPeriodEnd) }}</td>
          <td><button v-if="row.active" type="button" class="btn-ghost btn-sm" :disabled="busy" @click="revoke(row)">Снять Pro</button></td>
        </tr>
      </tbody>
    </table>

    <h3>Последние платежи</h3>
    <p v-if="!payments.length" class="admin-billing-note">Платежей пока нет.</p>
    <table v-else class="admin-table">
      <thead>
        <tr><th>Когда</th><th>Пользователь</th><th>Сумма</th><th>Вид</th><th>Статус</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in payments" :key="row.id">
          <td>{{ formatDate(row.createdAt) }}</td>
          <td>{{ emailOf(row.userId) }}</td>
          <td>{{ formatRub(row.amount) }}</td>
          <td>{{ row.kind === 'renewal' ? 'продление' : 'первая оплата' }}</td>
          <td>{{ row.status }}<span v-if="row.providerStatus"> · {{ row.providerStatus }}</span><span v-if="row.errorCode"> · код {{ row.errorCode }}</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminBilling, billing, formatRub, type AdminPayment, type AdminSubscription, type BillingPlans } from '../../api/billing';
import { fromPlansForm as fromForm, LIMIT_ROWS, toPlansForm as toForm, whole, type PlansForm as Form } from './billingForm';
import { confirmDialog } from '../../composables/appDialog';
import { useToast } from '../../composables/useToast';

/** Prices, limits and subscriptions, for admins. */
const toast = useToast();
const enabled = ref(false);
const error = ref('');
const busy = ref(false);
const form = ref<Form | null>(null);
const saved = ref('');
const dirty = computed(() => Boolean(form.value) && JSON.stringify(fromForm(form.value!)) !== saved.value);
const subscriptions = ref<AdminSubscription[]>([]);
const payments = ref<AdminPayment[]>([]);
const grantEmail = ref('');
const grantDays = ref(30);

const setPlans = (plans: BillingPlans) => {
  form.value = toForm(plans);
  saved.value = JSON.stringify(fromForm(form.value));
};

const loadLists = async () => {
  [subscriptions.value, payments.value] = await Promise.all([adminBilling.subscriptions(), adminBilling.payments()]);
};

onMounted(async () => {
  try {
    const [config, plans] = await Promise.all([billing.config(), adminBilling.plans()]);
    enabled.value = Boolean(config.enabled);
    setPlans(plans.plans);
    await loadLists();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить тарифы';
  }
});

const run = async (action: () => Promise<void>, done: string) => {
  busy.value = true;
  try {
    await action();
    toast.show(done, 'success');
  } catch (e) {
    toast.show(e instanceof Error ? e.message : 'Ошибка', 'error');
  } finally {
    busy.value = false;
  }
};

const save = () => run(async () => setPlans((await adminBilling.savePlans(fromForm(form.value!))).plans), 'Тарифы сохранены');
const reset = async () => {
  const ok = await confirmDialog({ title: 'Вернуть значения по умолчанию?', message: 'Цены и лимиты станут такими, как в настройках сервера.', confirmLabel: 'Вернуть' });
  if (ok) await run(async () => setPlans((await adminBilling.resetPlans()).plans), 'Значения по умолчанию возвращены');
};
const grant = () => run(async () => {
  await adminBilling.grant(grantEmail.value, whole(grantDays.value));
  grantEmail.value = '';
  await loadLists();
}, 'Pro выдан');
const revoke = async (row: AdminSubscription) => {
  const ok = await confirmDialog({
    title: `Снять Pro у ${row.email ?? 'пользователя'}?`,
    message: 'Pro закончится сейчас, автопродление отключится. Деньги за оставшийся период этим не возвращаются.',
    confirmLabel: 'Снять Pro',
    danger: true,
  });
  if (ok) await run(async () => { await adminBilling.revoke(row.userId); await loadLists(); }, 'Pro снят');
};

const statusText = (row: AdminSubscription) => {
  if (!row.active) return 'закончилась';
  if (row.status === 'past_due') return `не списалось (${row.failedAttempts})`;
  if (row.status === 'canceled') return 'не продлевается';
  return row.renews ? 'активна, продлевается' : 'активна';
};
const emailOf = (userId: string) => subscriptions.value.find((row) => row.userId === userId)?.email ?? userId.slice(0, 8);
const formatDate = (value: string) => new Date(value).toLocaleDateString('ru-RU');
</script>

<style scoped>
.admin-billing h3 { margin: 24px 0 8px; font-size: 15px; }
.admin-billing-state { margin: 0 0 12px; font-size: 13px; color: var(--ui-text-secondary); }
.admin-billing-state.is-on { color: var(--ui-text); }
.admin-billing-error { color: var(--ui-danger-foreground); }
.admin-billing-plans fieldset { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 12px; padding: 12px; border: 1px solid var(--ui-border); border-radius: 12px; }
.admin-billing-plans legend { padding: 0 6px; font-size: 13px; color: var(--ui-text-secondary); }
.admin-billing-plans label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.admin-billing input { width: 120px; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text); font: inherit; }
.admin-billing-scroll { max-width: 100%; overflow-x: auto; }
.admin-billing-limits input { width: 100px; }
@media (max-width: 600px) {
  .admin-billing-limits input { width: 64px; }
  .admin-billing-limits th, .admin-billing-limits td { padding-left: 6px; padding-right: 6px; }
}
.admin-billing-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.admin-billing-note { font-size: 12px; color: var(--ui-text-secondary); }
.admin-billing-grant { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.admin-billing-grant input[type='email'] { width: 240px; }
.admin-billing-grant input[type='number'] { width: 80px; }
.admin-billing-sub { font-size: 12px; color: var(--ui-text-secondary); }
</style>
