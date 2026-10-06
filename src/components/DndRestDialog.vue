<template>
  <Teleport to="body">
    <div class="dnd-rest-backdrop" @click.self="emit('close')">
      <section class="dnd-rest-dialog" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.prevent.stop="emit('close')" @keydown.tab="trapTab">
        <form @submit.prevent="emit('apply')">
          <h2>{{ title }}</h2>

          <div v-if="kind === 'short'" class="dnd-rest-dice">
            <div class="dnd-rest-dice-head">
              <span>Кости хитов: <b>{{ remaining }}</b> из {{ level }}</span>
              <label>Кость
                <select :value="data.combat.hitDie" aria-label="Кость хитов" @change="emit('set-hit-die', Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="sides in HIT_DICE" :key="sides" :value="sides">к{{ sides }}</option>
                </select>
              </label>
            </div>
            <button type="button" class="btn-ghost dnd-rest-spend" :disabled="!remaining || atFullHp" @click="emit('spend-hit-die')">Потратить кость: {{ hitDieFormula }}</button>
            <p aria-live="polite">HP: {{ data.combat.currentHp }} / {{ data.combat.maxHp }}<template v-if="!remaining"> · костей не осталось</template><template v-else-if="atFullHp"> · лечить нечего</template></p>
          </div>

          <ul class="dnd-rest-effects" aria-label="Что изменится">
            <li v-for="line in effects" :key="line">{{ line }}</li>
            <li v-if="!effects.length" class="dnd-rest-nothing">Восстанавливать нечего.</li>
          </ul>

          <div class="dnd-rest-actions">
            <button ref="cancelButton" type="button" class="btn-ghost" @click="emit('close')">Отмена</button>
            <button type="submit" class="btn-primary dnd-rest-apply">{{ title }}</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  HIT_DICE, abilityModifier, hitDiceRegainedOnLongRest, hitDiceRemaining,
  type DndCharacterSheetData, type RestKind,
} from '../dnd/characterSheet';
import { formatFormula } from '../dnd/dice';
import { useBackHandler } from '../composables/useBackHandler';

/**
 * A rest, confirmed before it happens: the dialog lists what will change. On
 * a short rest hit dice are spent here too, one roll at a time.
 */
const props = defineProps<{ kind: RestKind; data: DndCharacterSheetData }>();
const emit = defineEmits<{ close: []; apply: []; 'spend-hit-die': []; 'set-hit-die': [sides: number] }>();

const title = computed(() => (props.kind === 'short' ? 'Короткий отдых' : 'Длинный отдых'));
const level = computed(() => Math.min(20, Math.max(1, Math.trunc(Number(props.data.identity.level) || 1))));
const remaining = computed(() => hitDiceRemaining(props.data));
const atFullHp = computed(() => props.data.combat.currentHp >= props.data.combat.maxHp);
const hitDieFormula = computed(() => formatFormula(
  [{ sign: 1, count: 1, sides: props.data.combat.hitDie }],
  abilityModifier(props.data.abilities.constitution.score),
));

const effects = computed(() => {
  const combat = props.data.combat;
  const lines: string[] = [];
  if (props.kind === 'long') {
    if (combat.currentHp < combat.maxHp) lines.push(`HP: ${combat.currentHp} → ${combat.maxHp}`);
    if (combat.temporaryHp > 0) lines.push(`Временные HP: ${combat.temporaryHp} → 0`);
    const regained = Math.min(combat.hitDiceSpent, hitDiceRegainedOnLongRest(level.value));
    if (regained > 0) lines.push(`Кости хитов: ${remaining.value} → ${remaining.value + regained} из ${level.value}`);
    if (combat.exhaustion > 1) lines.push(`Истощение: ${combat.exhaustion} → ${combat.exhaustion - 1}`);
    else if (combat.exhaustion === 1 || combat.conditions.includes('exhaustion')) lines.push('Истощение снимается');
    if (combat.currentHp <= 0 && (combat.deathSaves.successes || combat.deathSaves.failures)) lines.push('Спасброски от смерти сбрасываются');
    const spentSlots = Object.values(props.data.spellcasting.slots).reduce((sum, slot) => sum + Math.min(slot.spent, slot.max), 0);
    if (spentSlots > 0) lines.push(`Ячейки заклинаний: возвращается ${spentSlots}`);
  }
  const features = props.data.features
    .filter((item) => (item.recharge === 'short' || (props.kind === 'long' && item.recharge === 'long')) && (item.maxUses || 0) > 0 && (item.currentUses || 0) < (item.maxUses || 0))
    .map((item) => item.name.trim() || 'без названия');
  if (features.length) lines.push(`Умения: ${features.join(', ')}`);
  return lines;
});

const cancelButton = ref<HTMLButtonElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => cancelButton.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
const trapTab = (event: KeyboardEvent) => {
  const elements = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('select, button:not(:disabled)'));
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
</script>

<style scoped>
.dnd-rest-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
.dnd-rest-dialog { width: min(360px, 100%); max-height: 90dvh; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-rest-dialog h2 { margin: 0 0 16px; font-size: 18px; }
.dnd-rest-dice { display: grid; gap: 8px; margin-bottom: 14px; padding: 12px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface-subtle); }
.dnd-rest-dice-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; }
.dnd-rest-dice-head b { font-variant-numeric: tabular-nums; }
.dnd-rest-dice-head label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ui-text-secondary); }
.dnd-rest-dice-head select { padding: 6px 8px; font: inherit; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-solid); color: var(--ui-text); }
.dnd-rest-spend { width: 100%; display: inline-flex; align-items: center; justify-content: center; min-height: 40px; font-variant-numeric: tabular-nums; }
.dnd-rest-dice p { margin: 0; font-size: 13px; color: var(--ui-text-secondary); font-variant-numeric: tabular-nums; }
.dnd-rest-effects { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 4px; font-size: 14px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dnd-rest-nothing { font-size: 13px; color: var(--ui-text-secondary); }
.dnd-rest-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%. */
.dnd-rest-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; flex: 0 1 auto; width: auto; min-width: 96px; }
</style>
