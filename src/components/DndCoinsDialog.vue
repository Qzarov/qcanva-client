<template>
  <Teleport to="body">
    <div class="dnd-coins-backdrop" @click.self="emit('close')">
      <section class="dnd-coins-dialog" role="dialog" aria-modal="true" aria-label="Монеты" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
        <!-- Two actions, no default one: Enter must not decide between gaining and spending. -->
        <form @submit.prevent>
          <header>
            <h2>Монеты</h2>
            <button type="button" class="dnd-coins-close" aria-label="Закрыть" @click="emit('close')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          <p class="dnd-coins-now">В кошельке: {{ formatCoins(coins) }}</p>
          <div class="dnd-coins-fields">
            <label v-for="coin in COINS" :key="coin.key" :title="coin.label">
              <span>{{ coin.short }}</span>
              <input
                :ref="(el) => { if (coin.key === focus) firstInput = el as HTMLInputElement | null; }"
                v-model="amounts[coin.key]"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="7"
                placeholder="0"
                :aria-label="coin.label"
                :aria-invalid="!isAmount(amounts[coin.key])"
              />
            </label>
          </div>
          <ul class="dnd-coins-results" aria-live="polite">
            <li>Получить: <b>{{ wellFormed ? formatCoins(gained) : '—' }}</b></li>
            <li :class="{ 'is-short': shortBy > 0 }">
              Потратить:
              <b v-if="!wellFormed">—</b>
              <template v-else-if="shortBy > 0">не хватает {{ formatGold(shortBy) }}</template>
              <template v-else><b>{{ formatCoins(spent!) }}</b><template v-if="exchanged"> · с разменом</template></template>
            </li>
          </ul>
          <div class="dnd-coins-actions">
            <button type="button" class="btn-ghost dnd-coins-spend" :disabled="!wellFormed || shortBy > 0" @click="apply(spent)">Потратить</button>
            <button type="button" class="btn-primary dnd-coins-gain" :disabled="!wellFormed" @click="apply(gained)">Получить</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { COINS, COIN_KEYS, addCoins, coinsValue, emptyCoins, formatCoins, formatGold, needsChange, spendCoins, type CoinKey, type DndCoins } from '../dnd/coins';
import { useBackHandler } from '../composables/useBackHandler';

/**
 * The wallet's one dialog: amounts by kind of coin, then "gain" or "spend".
 * What the wallet becomes either way is shown before a button is pressed;
 * spending makes change when the exact coins are not there, and is refused
 * when the wallet is not worth the price.
 */
const props = defineProps<{ coins: DndCoins; focus?: CoinKey }>();
const emit = defineEmits<{ close: []; apply: [next: DndCoins] }>();

const amounts = reactive<Record<CoinKey, string>>({ pp: '', gp: '', ep: '', sp: '', cp: '' });
const isAmount = (value: string) => /^\d{0,7}$/.test(value.trim());
const entered = computed(() => {
  const coins = emptyCoins();
  for (const key of COIN_KEYS) coins[key] = isAmount(amounts[key]) ? Number(amounts[key].trim() || 0) : 0;
  return coins;
});
const wellFormed = computed(() => COIN_KEYS.every((key) => isAmount(amounts[key])) && coinsValue(entered.value) > 0);
const gained = computed(() => addCoins(props.coins, entered.value));
const spent = computed(() => spendCoins(props.coins, entered.value));
const shortBy = computed(() => (spent.value ? 0 : coinsValue(entered.value) - coinsValue(props.coins)));
const exchanged = computed(() => Boolean(spent.value) && needsChange(props.coins, entered.value));
const apply = (next: DndCoins | null) => { if (wellFormed.value && next) emit('apply', next); };

const firstInput = ref<HTMLInputElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
// The coin that was pressed is the one about to be typed.
onMounted(() => firstInput.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
const trapTab = (event: KeyboardEvent) => {
  const elements = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, button:not(:disabled)'));
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
</script>

<style scoped>
.dnd-coins-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
.dnd-coins-dialog { width: min(380px, 100%); max-height: 90dvh; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-coins-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.dnd-coins-dialog h2 { margin: 0; font-size: 18px; }
.dnd-coins-close { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border-radius: 8px; border: 1px solid var(--ui-glass-border); background: var(--ui-glass-btn-bg); color: var(--ui-text-secondary); cursor: pointer; }
.dnd-coins-close:hover { background: var(--ui-glass-btn-hover); color: var(--ui-text); }
.dnd-coins-close:focus-visible { outline: 2px solid var(--ui-glass-accent-border); outline-offset: 2px; }
.dnd-coins-now { margin: 0 0 12px; font-size: 13px; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-coins-fields { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.dnd-coins-fields label { display: grid; gap: 6px; min-width: 0; text-align: center; }
.dnd-coins-fields span { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ui-text-secondary); }
.dnd-coins-fields input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; padding: 8px 2px; font: inherit; font-size: 16px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text); outline: none; transition: border-color .15s, box-shadow .15s; }
.dnd-coins-fields input:focus { border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-accent-bg); }
.dnd-coins-fields input[aria-invalid='true'] { border-color: var(--ui-danger-foreground); }
.dnd-coins-results { list-style: none; margin: 12px 0 14px; padding: 0; display: grid; gap: 4px; font-size: 13px; line-height: 1.4; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-coins-results b { color: var(--ui-text); font-weight: 600; }
.dnd-coins-results .is-short { color: var(--ui-danger-foreground); }
.dnd-coins-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%. */
.dnd-coins-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; width: auto; min-height: 44px; }
.dnd-coins-actions button:disabled { opacity: .45; cursor: default; }
</style>
