<template>
  <span ref="root" class="dnd-quick-roll">
    <button type="button" class="dnd-quick-roll-button" :class="{ 'is-open': Boolean(open) }" aria-label="Бросок по формуле" title="Бросить кости по формуле" aria-haspopup="dialog" :aria-expanded="Boolean(open)" @click="toggle('menu', $event)">
      <!-- A d20 seen from above. -->
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z M8 1.5v4.2 M2 5l6 .7 6-.7 M8 5.7 4.6 11h6.8z M2 11l2.6 0 M14 11l-2.6 0 M8 14.5 4.6 11 M8 14.5l3.4-3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" /></svg>
    </button>
    <Teleport to="body">
      <form v-if="open" ref="popup" class="dnd-quick-roll-menu" role="dialog" aria-label="Бросок по формуле" :style="menuStyle" @submit.prevent="roll">
        <label class="dnd-quick-roll-label" :for="inputId">Формула</label>
        <div class="dnd-quick-roll-row">
          <input :id="inputId" ref="input" v-model="formula" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="2d6+3" aria-label="Формула броска" :class="{ invalid: Boolean(error) }" @input="error = ''" />
          <button type="submit" class="dnd-quick-roll-go">Бросить</button>
        </div>
        <div class="dnd-quick-roll-dice" role="group" aria-label="Добавить кость">
          <button v-for="sides in DICE" :key="sides" type="button" :aria-label="'Добавить к' + sides" @click="addDie(sides)">к{{ sides }}</button>
          <button type="button" class="dnd-quick-roll-clear" aria-label="Очистить формулу" :disabled="!formula" @click="formula = ''; error = ''">×</button>
        </div>
        <p v-if="error" class="dnd-quick-roll-error" role="alert">{{ error }}</p>
      </form>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { FORMULA_HINT, formatFormula, parseFormula, type ParsedFormula } from '../dnd/dice';
import { useSheetPopup } from '../composables/useSheetPopup';
import { isCoarsePointer } from '../composables/pointer';

/**
 * A free roll from the page header: type a formula (or tap dice together) and
 * roll it. The roll goes where every roll of the sheet goes - the toasts, the
 * log in the history panel and, for a connected sheet, the canvas chat.
 */
const emit = defineEmits<{ roll: [formula: ParsedFormula] }>();

const DICE = [4, 6, 8, 10, 12, 20, 100];
const { root, popup, open, toggle } = useSheetPopup();
const inputId = useId();
const input = ref<HTMLInputElement | null>(null);
const formula = ref('');
const error = ref('');

/** Tapping a die adds one more of it: к6, к6 -> 2d6; к6, к8 -> 1d6+1d8. */
const addDie = (sides: number) => {
  error.value = '';
  const parsed = formula.value.trim() ? parseFormula(formula.value) : null;
  if (parsed && !parsed.ok) {
    formula.value = `1d${sides}`;
    return;
  }
  const dice = parsed?.ok ? parsed.dice.map((term) => ({ ...term })) : [];
  const same = dice.find((term) => term.sides === sides && term.sign === 1);
  if (same) same.count += 1;
  else dice.push({ sign: 1, count: 1, sides });
  formula.value = formatFormula(dice, parsed?.ok ? parsed.modifier : 0);
};

const roll = () => {
  const parsed = parseFormula(formula.value);
  if (!parsed.ok) {
    error.value = `${parsed.reason} ${FORMULA_HINT}`;
    return;
  }
  // The menu stays open: the same roll is often made again.
  emit('roll', parsed);
};

const position = ref<{ left: number; top: number } | null>(null);
const menuStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const place = () => {
  const anchor = root.value?.getBoundingClientRect();
  const menu = popup.value?.getBoundingClientRect();
  if (!open.value || !anchor || !menu) return;
  const margin = 12;
  position.value = {
    left: Math.max(margin, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - margin)),
    top: Math.min(anchor.bottom + 8, Math.max(margin, window.innerHeight - menu.height - margin)),
  };
};
watch(open, async (value) => {
  position.value = null;
  if (!value) return;
  await nextTick();
  place();
  await nextTick();
  // On a touch screen focusing the field would raise the keyboard over the dice buttons.
  if (open.value && !isCoarsePointer()) input.value?.focus();
});
watch(error, () => { if (open.value) void nextTick(place); });
onMounted(() => {
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', place);
  document.removeEventListener('scroll', place, true);
});
</script>

<style scoped>
.dnd-quick-roll { display: inline-flex; flex: none; }
/* Header pill, like the history and mode buttons next to it. */
.dnd-quick-roll-button { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text-secondary); cursor: pointer; transition: border-color 150ms ease, color 150ms ease; }
.dnd-quick-roll-button:hover, .dnd-quick-roll-button:focus-visible, .dnd-quick-roll-button.is-open { color: var(--ui-text); border-color: var(--ui-glass-accent-border); }
.dnd-quick-roll-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.dnd-quick-roll-button svg { width: 17px; height: 17px; }

/* The menu: one glass surface (character-sheet-style.md, "Меню"). */
.dnd-quick-roll-menu { position: fixed; z-index: 1000; display: grid; gap: 8px; width: min(300px, calc(100vw - 24px)); box-sizing: border-box; margin: 0; padding: 12px; border: 1px solid var(--ui-glass-border); border-radius: 20px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text); }
.dnd-quick-roll-label { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--ui-text-secondary); }
.dnd-quick-roll-row { display: flex; gap: 8px; }
.dnd-quick-roll-row input { flex: 1; min-width: 0; height: 40px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--ui-glass-border); border-radius: 12px; background: var(--ui-glass-btn-bg); color: var(--ui-text); font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; }
.dnd-quick-roll-row input:focus { outline: none; border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-focus-glow); }
.dnd-quick-roll-row input.invalid { border-color: var(--ui-danger-foreground); }
.dnd-quick-roll-go { flex: none; height: 40px; padding: 0 14px; border: 1px solid var(--ui-glass-accent-border); border-radius: 12px; background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.dnd-quick-roll-go:hover, .dnd-quick-roll-go:focus-visible { box-shadow: var(--ui-glass-accent-glow); outline: none; }
.dnd-quick-roll-dice { display: flex; flex-wrap: wrap; gap: 6px; }
.dnd-quick-roll-dice button { min-width: 44px; height: 36px; padding: 0 8px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-btn-bg); color: var(--ui-text); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; }
.dnd-quick-roll-dice button:hover:not(:disabled), .dnd-quick-roll-dice button:focus-visible { background: var(--ui-glass-btn-hover); outline: none; }
.dnd-quick-roll-dice .dnd-quick-roll-clear { margin-left: auto; min-width: 36px; color: var(--ui-text-secondary); }
.dnd-quick-roll-dice button:disabled { opacity: .45; cursor: default; }
.dnd-quick-roll-error { margin: 0; font-size: 12px; line-height: 1.35; color: var(--ui-danger-foreground); }
@media (max-width: 760px) {
  .dnd-quick-roll-row input, .dnd-quick-roll-go { height: 44px; }
  .dnd-quick-roll-dice button { height: 44px; }
}
</style>
