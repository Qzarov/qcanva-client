<template>
  <Teleport to="body">
    <div class="dnd-coins-backdrop" @click.self="emit('close')">
      <section class="dnd-coins-dialog" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
        <form @submit.prevent="apply">
          <h2>{{ title }}</h2>
          <div class="dnd-coins-fields">
            <label v-for="coin in COINS" :key="coin.key" :title="coin.label">
              <span>{{ coin.short }}</span>
              <input
                :ref="(el) => { if (coin.key === 'gp') goldInput = el as HTMLInputElement | null; }"
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
          <p aria-live="polite" :class="{ 'is-short': shortBy > 0 }">
            <template v-if="shortBy > 0">Не хватает {{ formatGold(shortBy) }}. В кошельке: {{ formatCoins(coins) }}</template>
            <template v-else>После: {{ formatCoins(result) }}<template v-if="exchanged"> · с разменом</template></template>
          </p>
          <div class="dnd-coins-actions">
            <button type="button" class="btn-ghost" @click="emit('close')">Отмена</button>
            <button type="submit" class="btn-primary dnd-coins-apply" :disabled="!valid">{{ mode === 'gain' ? 'Получить' : 'Потратить' }}</button>
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
import { isCoarsePointer } from '../composables/pointer';

/**
 * Coins gained or spent, several kinds at once. The wallet after it is shown
 * before it is applied; spending makes change when the exact coins are not
 * there, and is refused when the wallet is not worth the price.
 */
const props = defineProps<{ mode: 'gain' | 'spend'; coins: DndCoins }>();
const emit = defineEmits<{ close: []; apply: [next: DndCoins] }>();

const title = computed(() => (props.mode === 'gain' ? 'Получить монеты' : 'Потратить монеты'));
const amounts = reactive<Record<CoinKey, string>>({ pp: '', gp: '', ep: '', sp: '', cp: '' });
const isAmount = (value: string) => /^\d{0,7}$/.test(value.trim());
const entered = computed(() => {
  const coins = emptyCoins();
  for (const key of COIN_KEYS) coins[key] = isAmount(amounts[key]) ? Number(amounts[key].trim() || 0) : 0;
  return coins;
});
const wellFormed = computed(() => COIN_KEYS.every((key) => isAmount(amounts[key])) && coinsValue(entered.value) > 0);
const spent = computed(() => (props.mode === 'spend' ? spendCoins(props.coins, entered.value) : null));
const result = computed(() => (props.mode === 'gain' ? addCoins(props.coins, entered.value) : spent.value ?? props.coins));
const shortBy = computed(() => (props.mode === 'spend' && !spent.value ? coinsValue(entered.value) - coinsValue(props.coins) : 0));
const exchanged = computed(() => props.mode === 'spend' && Boolean(spent.value) && needsChange(props.coins, entered.value));
const valid = computed(() => wellFormed.value && shortBy.value <= 0);
const apply = () => { if (valid.value) emit('apply', result.value); };

const goldInput = ref<HTMLInputElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
// The keyboard would cover half of the dialog on a phone before a field is chosen.
onMounted(() => { if (!isCoarsePointer()) goldInput.value?.focus(); });
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
.dnd-coins-dialog h2 { margin: 0 0 16px; font-size: 18px; }
.dnd-coins-fields { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.dnd-coins-fields label { display: grid; gap: 6px; min-width: 0; text-align: center; }
.dnd-coins-fields span { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ui-text-secondary); }
.dnd-coins-fields input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; padding: 8px 2px; font: inherit; font-size: 16px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text); outline: none; transition: border-color .15s, box-shadow .15s; }
.dnd-coins-fields input:focus { border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-accent-bg); }
.dnd-coins-fields input[aria-invalid='true'] { border-color: var(--ui-danger-foreground); }
.dnd-coins-dialog p { min-height: 2.8em; margin: 12px 0; font-size: 13px; line-height: 1.4; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-coins-dialog p.is-short { color: var(--ui-danger-foreground); }
.dnd-coins-actions { display: flex; justify-content: center; gap: 8px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%. */
.dnd-coins-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; flex: 0 1 auto; width: auto; min-width: 96px; }
</style>
