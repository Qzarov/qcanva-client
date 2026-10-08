<template>
  <section class="dnd-wallet" aria-label="Монеты">
    <header class="dnd-wallet-head">
      <h4>Монеты</h4>
      <span class="dnd-wallet-total" title="Сколько это в золотых">Всего {{ total }}</span>
    </header>
    <div class="dnd-wallet-coins">
      <label v-for="coin in COINS" :key="coin.key" class="dnd-wallet-coin" :title="coin.label">
        <span>{{ coin.short }}</span>
        <input type="number" inputmode="numeric" min="0" :max="MAX_COINS" :readonly="readonly" :value="coins[coin.key]" :aria-label="coin.label + ' монеты'" @change="setCoin(coin.key, $event)" />
      </label>
    </div>
    <div class="dnd-wallet-actions">
      <button type="button" :disabled="readonly" @click="mode = 'gain'">Получить</button>
      <button type="button" :disabled="readonly || !worth" @click="mode = 'spend'">Потратить</button>
    </div>
    <DndCoinsDialog v-if="mode && !readonly" :mode="mode" :coins="coins" @close="mode = null" @apply="apply" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { COINS, MAX_COINS, coinsValue, formatGold, normalizeCoins, type CoinKey, type DndCoins } from '../dnd/coins';
import DndCoinsDialog from './DndCoinsDialog.vue';

/**
 * The character's money in the equipment tab: the five kinds of coins, each
 * a number that can be typed over, and two actions for what happens at the
 * table - coins gained and coins spent (with change made automatically).
 */
const props = defineProps<{ coins: DndCoins; readonly?: boolean }>();
const emit = defineEmits<{ update: [next: DndCoins] }>();

const mode = ref<'gain' | 'spend' | null>(null);
const worth = computed(() => coinsValue(props.coins));
const total = computed(() => formatGold(worth.value));

const setCoin = (key: CoinKey, event: Event) => {
  const next = normalizeCoins({ ...props.coins, [key]: (event.target as HTMLInputElement).value });
  // A cleared or mistyped field shows what is stored again.
  (event.target as HTMLInputElement).value = String(next[key]);
  if (next[key] !== props.coins[key]) emit('update', next);
};
const apply = (next: DndCoins) => {
  mode.value = null;
  emit('update', next);
};
</script>

<style scoped>
.dnd-wallet { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--dnd-glass-border, var(--ui-glass-border)); border-radius: 14px; background: var(--dnd-card-bg, var(--ui-glass-card-bg)); }
.dnd-wallet-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.dnd-wallet-head h4 { margin: 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-wallet-total { font-size: 12px; color: var(--dnd-text-dim, var(--ui-text-secondary)); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dnd-wallet-coins { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.dnd-wallet-coin { display: grid; gap: 2px; min-width: 0; padding: 6px 2px 4px; border: 1px solid var(--dnd-glass-border, var(--ui-glass-border)); border-radius: 12px; background: rgba(var(--dnd-fill-rgb, 255, 255, 255), .04); text-align: center; }
.dnd-wallet-coin span { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-wallet-coin input { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 1px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ui-text); font: inherit; font-size: 16px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; appearance: textfield; -moz-appearance: textfield; outline: none; transition: border-color .15s, background-color .15s, box-shadow .15s; }
.dnd-wallet-coin input::-webkit-inner-spin-button, .dnd-wallet-coin input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.dnd-wallet-coin input:hover:not([readonly]) { background: rgba(var(--dnd-fill-rgb, 255, 255, 255), .045); border-color: var(--dnd-glass-border, var(--ui-glass-border)); }
.dnd-wallet-coin input:focus { background: var(--dnd-field-focus-bg, var(--ui-surface-subtle)); border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-glass-accent-text)) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft, var(--ui-glass-accent-bg)); }
.dnd-wallet-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.dnd-wallet-actions button { min-height: 36px; padding: 6px 10px; border: 1px solid var(--dnd-glass-border, var(--ui-glass-border)); border-radius: 8px; background: var(--dnd-glass-accent-soft, var(--ui-glass-accent-bg)); color: var(--ui-text); font: inherit; font-size: 12px; cursor: pointer; transition: border-color .15s, background-color .15s; }
.dnd-wallet-actions button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-glass-accent-text)) 55%, transparent); }
.dnd-wallet-actions button:disabled { opacity: .45; cursor: default; }
.dnd-wallet-actions button:focus-visible { outline: 2px solid var(--dnd-glass-accent, var(--ui-glass-accent-text)); outline-offset: 2px; }
@media (max-width: 760px) {
  /* Used at the table: full touch targets. */
  .dnd-wallet-actions button { min-height: 44px; }
  .dnd-wallet-coin input { min-height: 36px; }
}
</style>
