<template>
  <span ref="root" class="dnd-formula">
    <button v-if="formula.ok" type="button" class="dnd-formula-roll" :title="title || undefined" :aria-label="ariaLabel" @click="emit('roll')">
      <span v-if="prefix" class="dnd-formula-prefix">{{ prefix }}</span><b>{{ display }}</b>
    </button>
    <button v-else type="button" class="dnd-formula-invalid" :aria-label="(prefix ? prefix + ': ' : '') + 'формула не распознана, показать подсказку'" :aria-expanded="Boolean(open)" :aria-describedby="open ? tooltipId : undefined" @click="toggle('hint', $event)">
      <span v-if="prefix" class="dnd-formula-prefix">{{ prefix }}</span>{{ source || '—' }} <span aria-hidden="true">?</span>
    </button>
    <Teleport to="body">
      <p v-if="open && !formula.ok" :id="tooltipId" ref="popup" role="tooltip" class="ui-explain-hint dnd-formula-hint" :style="hintStyle">
        {{ formula.reason }} {{ FORMULA_HINT }}
      </p>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useAnchoredHint } from '../composables/useAnchoredHint';
import { FORMULA_HINT, type FormulaParse } from '../dnd/dice';
import { useSheetPopup } from '../composables/useSheetPopup';

/**
 * A rollable formula: a roll button when it parses, otherwise the raw text
 * marked with "?" - tapping it explains what is wrong and how to write it.
 */
const props = defineProps<{
  formula: FormulaParse;
  /** What the user typed, shown when it does not parse. */
  source?: string;
  prefix?: string;
  /** Overrides the parsed text shown on the button (e.g. "+5"). */
  label?: string;
  title?: string;
}>();
const emit = defineEmits<{ roll: [] }>();

const { root, popup, open, toggle, close } = useSheetPopup();
const tooltipId = useId();
const display = computed(() => props.label ?? (props.formula.ok ? props.formula.text : ''));
const ariaLabel = computed(() => `${props.prefix ? props.prefix + ' ' : ''}${display.value}: бросить`);

const { hintStyle } = useAnchoredHint({ anchor: () => root.value, popup, open, close });
</script>

<style scoped>
.dnd-formula { display:inline-flex; min-width:0; }
.dnd-formula button { display:inline-flex; align-items:center; gap:5px; min-height:30px; max-width:100%; padding:4px 9px; border-radius:8px; font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dnd-formula-roll { border:1px solid var(--dnd-glass-border, var(--ui-border)); background:var(--dnd-glass-accent-soft, var(--ui-surface-subtle)); color:var(--ui-text); }
.dnd-formula-roll:hover { border-color:var(--dnd-glass-accent, var(--ui-accent)); }
.dnd-formula-roll b { font-variant-numeric:tabular-nums; }
.dnd-formula-invalid { border:1px dashed var(--ui-danger-foreground); background:transparent; color:var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-formula-invalid span[aria-hidden] { display:inline-grid; place-items:center; width:16px; height:16px; border-radius:999px; background:var(--ui-danger-foreground); color:#fff; font-size:11px; font-weight:700; }
.dnd-formula-prefix { color:var(--dnd-text-dim, var(--ui-text-secondary)); }
/* Rolled every turn: a full touch target on phones. */
@media (max-width:760px) {
  .dnd-formula button { min-height:44px; padding-inline:12px; }
}
</style>
