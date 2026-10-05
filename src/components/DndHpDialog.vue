<template>
  <Teleport to="body">
    <div class="dnd-hp-backdrop" @click.self="emit('close')">
      <section class="dnd-hp-dialog" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
        <form @submit.prevent="apply">
          <h2>{{ title }}</h2>
          <label>Количество HP<input ref="amountInput" v-model="amount" type="text" inputmode="numeric" autocomplete="off" aria-label="Количество HP" /></label>
          <p aria-live="polite">После: {{ result.currentHp }} / {{ combat.maxHp }} (+{{ result.temporaryHp }} врем.)</p>
          <div class="dnd-hp-dialog-actions">
            <button type="button" class="btn-ghost dnd-hp-cancel" @click="emit('close')">Отмена</button>
            <button type="submit" class="btn-primary dnd-hp-apply" :disabled="!valid">{{ title }}</button>
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
const props = defineProps<{ mode: 'heal' | 'damage'; combat: DndCharacterSheetData['combat'] }>();
const emit = defineEmits<{ close: []; apply: [amount: number] }>();
const title = computed(() => props.mode === 'heal' ? 'Лечение' : 'Урон');
const amount = ref('');
const amountInput = ref<HTMLInputElement | null>(null);
const quantity = computed(() => Number(amount.value));
const valid = computed(() => /^\d+$/.test(amount.value) && isHpAmount(quantity.value));
const result = computed(() => calculateHpChange(props.combat, props.mode, valid.value ? quantity.value : 0));
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => amountInput.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
const apply = () => { if (valid.value) emit('apply', quantity.value); };
const trapTab = (event: KeyboardEvent) => {
  const elements = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, button:not(:disabled)'));
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
</script>

<style scoped>
.dnd-hp-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
.dnd-hp-dialog { width: min(340px, 100%); max-height: 90dvh; overflow-y: auto; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-hp-dialog h2 { margin: 0 0 16px; font-size: 18px; }
.dnd-hp-dialog label { display: grid; gap: 8px; }
.dnd-hp-dialog input { width: 100%; box-sizing: border-box; padding: 10px; font: inherit; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text); }
.dnd-hp-dialog p { font-size: 13px; color: var(--ui-text-secondary); }
.dnd-hp-dialog-actions { display: flex; justify-content: center; gap: 8px; }
.dnd-hp-dialog-actions button { display:inline-flex; align-items:center; justify-content:center; text-align:center; flex:0 0 auto; }
</style>
