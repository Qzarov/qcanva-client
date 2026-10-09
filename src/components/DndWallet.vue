<template>
  <section class="dnd-wallet" aria-label="Монеты">
    <h4>Монеты</h4>
    <div class="dnd-wallet-coins">
      <button
        v-for="coin in COINS"
        :key="coin.key"
        type="button"
        class="dnd-wallet-coin"
        :disabled="readonly"
        :aria-label="`${coin.label} монеты: ${coins[coin.key]}`"
        :title="readonly ? coin.label : `${coin.label}: получить или потратить`"
        @click="opened = coin.key"
      >
        <span>{{ coin.short }}</span>
        <strong>{{ coins[coin.key] }}</strong>
      </button>
    </div>
    <DndCoinsDialog v-if="opened && !readonly" :coins="coins" :focus="opened" @close="opened = null" @apply="apply" />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { COINS, type CoinKey, type DndCoins } from '../dnd/coins';
import DndCoinsDialog from './DndCoinsDialog.vue';

/**
 * The character's money in the equipment tab: the five kinds of coins, each
 * a button. Money is never typed over: a coin opens the dialog where coins
 * are gained or spent (with change made automatically).
 */
defineProps<{ coins: DndCoins; readonly?: boolean }>();
const emit = defineEmits<{ update: [next: DndCoins] }>();

const opened = ref<CoinKey | null>(null);
const apply = (next: DndCoins) => {
  opened.value = null;
  emit('update', next);
};
</script>

<style scoped>
.dnd-wallet { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--dnd-glass-border, var(--ui-glass-border)); border-radius: 14px; background: var(--dnd-card-bg, var(--ui-glass-card-bg)); }
.dnd-wallet h4 { margin: 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-wallet-coins { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.dnd-wallet-coin {
  display: grid; gap: 2px; min-width: 0; min-height: 52px; padding: 6px 2px; text-align: center; font: inherit; color: var(--ui-text); cursor: pointer;
  border: 1px solid var(--dnd-glass-border, var(--ui-glass-border)); border-radius: 12px; background: rgba(var(--dnd-fill-rgb, 255, 255, 255), .04);
  transition: border-color .15s, background-color .15s;
}
.dnd-wallet-coin span { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-wallet-coin strong { min-width: 0; font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
.dnd-wallet-coin:hover:not(:disabled) { background: var(--dnd-glass-accent-soft, var(--ui-glass-accent-bg)); border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-glass-accent-text)) 55%, transparent); }
.dnd-wallet-coin:focus-visible { outline: 2px solid var(--dnd-glass-accent, var(--ui-glass-accent-text)); outline-offset: 2px; }
/* A viewer reads the numbers: they stay at full strength, only the hand goes. */
.dnd-wallet-coin:disabled { cursor: default; }
</style>
