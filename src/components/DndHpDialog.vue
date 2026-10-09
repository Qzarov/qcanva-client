<template>
  <Teleport to="body">
    <div class="dnd-hp-backdrop" @click.self="emit('close')">
      <section class="dnd-hp-dialog" role="dialog" aria-modal="true" aria-label="HP" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
        <!-- Three actions, no default one: Enter must not decide between damage and healing. -->
        <form @submit.prevent>
          <header>
            <h2>HP</h2>
            <button type="button" class="dnd-hp-close" aria-label="Закрыть" @click="emit('close')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          <p class="dnd-hp-now">Сейчас: {{ combat.currentHp }} / {{ combat.maxHp }} (+{{ combat.temporaryHp }} врем.)</p>
          <label>Количество HP<input ref="amountInput" v-model="amount" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="0" aria-label="Количество HP" /></label>
          <ul class="dnd-hp-results" aria-live="polite">
            <li>Урон: <b>{{ valid ? after(damaged) : '—' }}</b></li>
            <li>Лечение: <b>{{ valid ? after(healed) : '—' }}</b></li>
            <li>Временные: <b>{{ valid ? `${combat.currentHp} / ${combat.maxHp} (+${quantity} врем.)` : '—' }}</b></li>
          </ul>
          <div class="dnd-hp-dialog-actions">
            <button type="button" class="btn-ghost dnd-hp-damage" :disabled="!valid" @click="apply('damage')">Урон</button>
            <button type="button" class="btn-primary dnd-hp-heal" :disabled="!valid" @click="apply('heal')">Лечение</button>
            <button type="button" class="btn-ghost dnd-hp-temp" :disabled="!valid" title="Временные HP не складываются: новое значение заменяет прежнее" @click="apply('temp')">Временные</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { calculateHpChange, isHpAmount, type DndCharacterSheetData } from '../dnd/characterSheet';
import { useBackHandler } from '../composables/useBackHandler';

/**
 * The one way hit points change at the table: an amount, then what it is -
 * damage, healing, or temporary hit points. What each would leave is shown
 * before a button is pressed.
 */
export type HpAction = 'damage' | 'heal' | 'temp';
type Combat = DndCharacterSheetData['combat'];
const props = defineProps<{ combat: Combat }>();
const emit = defineEmits<{ close: []; apply: [action: HpAction, amount: number] }>();

const amount = ref('');
const amountInput = ref<HTMLInputElement | null>(null);
const quantity = computed(() => Number(amount.value));
const valid = computed(() => /^\d+$/.test(amount.value) && isHpAmount(quantity.value));
const damaged = computed(() => calculateHpChange(props.combat, 'damage', valid.value ? quantity.value : 0));
const healed = computed(() => calculateHpChange(props.combat, 'heal', valid.value ? quantity.value : 0));
const after = (result: Pick<Combat, 'currentHp' | 'temporaryHp'>) => `${result.currentHp} / ${props.combat.maxHp} (+${result.temporaryHp} врем.)`;
const apply = (action: HpAction) => { if (valid.value) emit('apply', action, quantity.value); };

const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => amountInput.value?.focus());
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
.dnd-hp-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
.dnd-hp-dialog { width: min(360px, 100%); max-height: 90dvh; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-hp-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.dnd-hp-dialog h2 { margin: 0; font-size: 18px; }
.dnd-hp-close { display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border-radius: 8px; border: 1px solid var(--ui-glass-border); background: var(--ui-glass-btn-bg); color: var(--ui-text-secondary); cursor: pointer; }
.dnd-hp-close:hover { background: var(--ui-glass-btn-hover); color: var(--ui-text); }
.dnd-hp-close:focus-visible { outline: 2px solid var(--ui-glass-accent-border); outline-offset: 2px; }
.dnd-hp-now { margin: 0 0 12px; font-size: 13px; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-hp-dialog label { display: grid; gap: 8px; font-size: 13px; color: var(--ui-text-secondary); }
.dnd-hp-dialog input { width: 100%; box-sizing: border-box; min-height: 44px; padding: 10px; font: inherit; font-size: 16px; font-weight: 700; color: var(--ui-text); font-variant-numeric: tabular-nums; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); outline: none; transition: border-color .15s, box-shadow .15s; }
.dnd-hp-dialog input:focus { border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-accent-bg); }
.dnd-hp-results { list-style: none; margin: 12px 0 14px; padding: 0; display: grid; gap: 4px; font-size: 13px; line-height: 1.4; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-hp-results b { color: var(--ui-text); font-weight: 600; }
.dnd-hp-dialog-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%, which pushed them out of the dialog. */
.dnd-hp-dialog-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; width: auto; min-width: 0; min-height: 44px; padding-inline: 6px; }
.dnd-hp-dialog-actions button:disabled { opacity: .45; cursor: default; }
</style>
