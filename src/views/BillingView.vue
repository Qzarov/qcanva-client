<template>
  <div class="billing-page">
    <header class="billing-head">
      <router-link to="/" class="billing-back" title="На дашборд">
        <ChevronLeft :size="18" aria-hidden="true" />
        <span>Назад</span>
      </router-link>
      <h1 class="billing-title">Тариф</h1>
      <AccountMenu class="billing-account-menu" />
    </header>

    <p v-if="loading" class="billing-muted" role="status">Загружаем…</p>
    <p v-else-if="error" class="billing-error" role="alert">{{ error }}</p>

    <template v-else-if="status">
      <p v-if="!status.enabled" class="billing-muted">Тарифы пока не действуют: все возможности доступны без ограничений.</p>

      <template v-else>
        <p v-if="paymentNote" class="billing-banner" :class="{ 'is-fail': paymentNote.fail }" role="status">{{ paymentNote.text }}</p>

        <section class="billing-card" aria-labelledby="billing-plan-title">
          <h2 id="billing-plan-title">Ваш тариф: <span class="billing-plan-name">{{ planName }}</span></h2>
          <p v-if="subscriptionText" class="billing-muted">{{ subscriptionText }}</p>
          <div v-if="buyHere && sub" class="billing-actions">
            <button v-if="sub.renews" type="button" class="btn-ghost" :disabled="busy" @click="cancel">Отменить автопродление</button>
            <button v-else-if="sub.status === 'canceled' && sub.source === 'tbank'" type="button" class="btn-primary" :disabled="busy" @click="resume">Возобновить автопродление</button>
          </div>
        </section>

        <section v-if="status.usage" class="billing-card" aria-labelledby="billing-usage-title">
          <h2 id="billing-usage-title">Использовано</h2>
          <ul class="billing-meters">
            <li v-for="meter in meters" :key="meter.key" class="billing-meter">
              <div class="billing-meter-head">
                <span>{{ meter.label }}</span>
                <b>{{ meter.text }}</b>
              </div>
              <div v-if="meter.percent !== null" class="billing-meter-bar" role="progressbar" :aria-label="meter.label" :aria-valuenow="meter.percent" aria-valuemin="0" aria-valuemax="100">
                <span :class="{ 'is-full': meter.percent >= 100 }" :style="{ width: Math.min(meter.percent, 100) + '%' }"></span>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="buyHere && status.plan === 'free' && !sub?.renews" class="billing-card billing-offer" aria-labelledby="billing-offer-title">
          <h2 id="billing-offer-title">QCanva Pro</h2>
          <ul class="billing-features">
            <li v-for="line in proLines" :key="line">{{ line }}</li>
          </ul>
          <template v-if="status.canPay">
            <div class="billing-periods" role="radiogroup" aria-label="Срок подписки">
              <button v-for="option in periods" :key="option.key" type="button" role="radio" :aria-checked="period === option.key" :class="{ on: period === option.key }" @click="period = option.key">
                <span>{{ option.label }}</span><b>{{ formatRub(status.prices[option.key]) }}</b>
              </button>
            </div>
            <label class="billing-consent">
              <input v-model="consent" type="checkbox" />
              <span>Согласен на автоматическое продление: {{ formatRub(status.prices[period]) }} {{ period === 'year' ? 'раз в год' : 'раз в месяц' }} с карты, которой оплачу. Отменить можно в любой момент на этой странице.</span>
            </label>
            <button type="button" class="btn-primary billing-pay" :disabled="!consent || busy" @click="pay">Оплатить {{ formatRub(status.prices[period]) }}</button>
            <p class="billing-muted billing-small">Оплата картой через Т-Банк. Pro начнёт действовать сразу после оплаты.</p>
          </template>
          <p v-else class="billing-muted">Оплата скоро появится.</p>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AccountMenu from '../components/AccountMenu.vue';
import { billing, formatMb, formatRub, type BillingPeriod, type BillingStatus } from '../api/billing';
import { confirmDialog } from '../composables/appDialog';
import { canBuyHere } from '../composables/useBilling';
import { useToast } from '../composables/useToast';

const route = useRoute();
const toast = useToast();
const status = ref<BillingStatus | null>(null);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const period = ref<BillingPeriod>('month');
const consent = ref(false);
const buyHere = canBuyHere();
const periods: Array<{ key: BillingPeriod; label: string }> = [{ key: 'month', label: 'Месяц' }, { key: 'year', label: 'Год' }];

const sub = computed(() => status.value?.subscription ?? null);
const planName = computed(() => ({ free: 'Бесплатный', pro: 'Pro', unlimited: 'Без ограничений' })[status.value?.plan ?? 'free']);
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const subscriptionText = computed(() => {
  const value = sub.value;
  if (!value) return status.value?.plan === 'unlimited' ? 'У администраторов ограничений нет.' : '';
  if (value.source === 'manual') return `Pro подарен до ${date(value.currentPeriodEnd)}.`;
  if (value.status === 'past_due') return `Не удалось списать оплату за продление — попробуем ещё раз. Pro пока действует.`;
  if (value.renews) return `Продлится ${date(value.currentPeriodEnd)}${buyHere ? ` — спишем ${formatRub(status.value!.prices[value.period])}` : ''}.`;
  return `Действует до ${date(value.currentPeriodEnd)}, не продлевается.`;
});

const limitText = (used: number, max: number, format: (n: number) => string = String) =>
  max ? `${format(used)} из ${format(max)}` : `${format(used)} · без ограничений`;
const meters = computed(() => {
  const usage = status.value?.usage;
  const limits = status.value?.limits;
  if (!usage || !limits) return [];
  const percent = (used: number, max: number) => (max ? Math.round((used / max) * 100) : null);
  return [
    { key: 'resources', label: 'Канвасы, документы и листы', text: limitText(usage.resources, limits.resources), percent: percent(usage.resources, limits.resources) },
    { key: 'storage', label: 'Место под файлы', text: limitText(usage.storageBytes, limits.storageBytes, formatMb), percent: percent(usage.storageBytes, limits.storageBytes) },
    { key: 'collaborators', label: 'Соавторы', text: limitText(usage.collaborators, limits.collaborators), percent: percent(usage.collaborators, limits.collaborators) },
    { key: 'mcp', label: 'Вызовы MCP сегодня', text: limitText(usage.mcpToday, limits.mcpPerDay), percent: percent(usage.mcpToday, limits.mcpPerDay) },
  ];
});

const pro = ref<{ resources: number; storageBytes: number; collaborators: number; mcpPerDay: number } | null>(null);
const proLines = computed(() => {
  const limits = pro.value;
  if (!limits) return [];
  const line = (max: number, unlimited: string, limited: string) => (max ? limited.replace('{n}', String(max)) : unlimited);
  return [
    line(limits.resources, 'Канвасы, документы и листы — без ограничений', 'До {n} канвасов, документов и листов'),
    limits.storageBytes ? `${formatMb(limits.storageBytes)} под файлы` : 'Место под файлы без ограничений',
    line(limits.collaborators, 'Соавторы — без ограничений', 'До {n} соавторов'),
    line(limits.mcpPerDay, 'MCP без суточного лимита', 'До {n} вызовов MCP в сутки'),
  ];
});

const load = async () => {
  status.value = await billing.me();
  if (status.value.enabled && !pro.value) pro.value = (await billing.config()).pro ?? null;
};

// After the bank's form: the notification may come a moment later, so look again for a little while.
const paymentNote = ref<{ text: string; fail: boolean } | null>(null);
let poll: ReturnType<typeof setTimeout> | null = null;
const waitForPro = (tries: number) => {
  if (status.value?.plan === 'pro' || tries <= 0) {
    if (status.value?.plan === 'pro') paymentNote.value = { text: 'Оплата прошла — Pro включён. Спасибо!', fail: false };
    return;
  }
  poll = setTimeout(() => { void load().then(() => waitForPro(tries - 1), () => undefined); }, 3000);
};

onMounted(async () => {
  try {
    await load();
    if (route.query.payment === 'success') {
      paymentNote.value = { text: 'Спасибо! Платёж обрабатывается, тариф обновится через несколько секунд.', fail: false };
      waitForPro(10);
    } else if (route.query.payment === 'fail') {
      paymentNote.value = { text: 'Оплата не прошла. Деньги не списаны — можно попробовать ещё раз.', fail: true };
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить тариф';
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => { if (poll) clearTimeout(poll); });

const pay = async () => {
  if (!consent.value) return;
  busy.value = true;
  try {
    const { paymentUrl } = await billing.checkout(period.value, true);
    window.location.href = paymentUrl;
  } catch (e) {
    toast.show(e instanceof Error ? e.message : 'Не удалось начать оплату', 'error');
    busy.value = false;
  }
};

const cancel = async () => {
  const value = sub.value;
  if (!value) return;
  const ok = await confirmDialog({
    title: 'Отменить автопродление?',
    message: `Pro будет действовать до ${date(value.currentPeriodEnd)}, дальше — бесплатный тариф. Ничего из созданного не пропадёт.`,
    confirmLabel: 'Отменить продление',
    cancelLabel: 'Оставить',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    status.value = await billing.cancel();
  } catch (e) {
    toast.show(e instanceof Error ? e.message : 'Не удалось отменить', 'error');
  } finally {
    busy.value = false;
  }
};

const resume = async () => {
  busy.value = true;
  try {
    status.value = await billing.resume();
  } catch (e) {
    toast.show(e instanceof Error ? e.message : 'Не удалось возобновить', 'error');
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.billing-page { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; box-sizing: border-box; height: 100%; overflow-y: auto; }
.billing-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.billing-back { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-text-secondary); text-decoration: none; font-size: 13px; }
.billing-back:hover { color: var(--ui-text); }
.billing-title { font-size: 22px; margin: 0; }
.billing-account-menu { margin-left: auto; }
.billing-muted { color: var(--ui-text-secondary); font-size: 14px; margin: 6px 0 0; }
.billing-small { font-size: 12px; margin-top: 10px; }
.billing-error { color: var(--ui-danger-foreground); }
.billing-banner { margin: 0 0 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); color: var(--ui-text); font-size: 14px; }
.billing-banner.is-fail { border-color: var(--ui-danger-foreground); background: transparent; }
.billing-card { padding: 16px; margin-bottom: 16px; border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface-subtle); }
.billing-card h2 { margin: 0; font-size: 17px; }
.billing-plan-name { color: var(--ui-glass-accent-text); }
.billing-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.billing-meters { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.billing-meter-head { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.billing-meter-head b { font-variant-numeric: tabular-nums; white-space: nowrap; }
.billing-meter-bar { height: 6px; margin-top: 6px; border-radius: 999px; background: var(--ui-border); overflow: hidden; }
.billing-meter-bar span { display: block; height: 100%; border-radius: inherit; background: var(--ui-brand); }
.billing-meter-bar span.is-full { background: var(--ui-danger-foreground); }
.billing-features { margin: 10px 0 14px; padding-left: 20px; font-size: 14px; line-height: 1.6; }
.billing-periods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.billing-periods button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 56px; padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: 12px; background: transparent; color: var(--ui-text); font: inherit; cursor: pointer; text-align: left; }
.billing-periods button.on { border-color: var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); }
.billing-periods b { font-size: 18px; font-variant-numeric: tabular-nums; }
.billing-consent { display: flex; align-items: flex-start; gap: 10px; margin: 14px 0; font-size: 13px; line-height: 1.4; color: var(--ui-text-secondary); cursor: pointer; }
.billing-consent input { margin-top: 2px; accent-color: var(--ui-brand); }
.billing-pay { width: 100%; min-height: 44px; }
</style>
