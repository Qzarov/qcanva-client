<template>
  <span ref="root" class="dnd-formula">
    <button v-if="formula.ok" type="button" class="dnd-formula-roll" :title="title || undefined" :aria-label="ariaLabel" @click="emit('roll')">
      <span v-if="prefix" class="dnd-formula-prefix">{{ prefix }}</span><b>{{ display }}</b>
    </button>
    <button v-else type="button" class="dnd-formula-invalid" :aria-label="(prefix ? prefix + ': ' : '') + 'формула не распознана, показать подсказку'" :aria-expanded="Boolean(open)" :aria-describedby="open ? tooltipId : undefined" @click="toggle('hint', $event)">
      <span v-if="prefix" class="dnd-formula-prefix">{{ prefix }}</span>{{ source || '—' }} <span aria-hidden="true">?</span>
    </button>
    <Teleport to="body">
      <p v-if="open && !formula.ok" :id="tooltipId" ref="popup" role="tooltip" class="dnd-formula-hint" :style="hintStyle">
        {{ formula.reason }} {{ FORMULA_HINT }}
      </p>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { useActiveListener } from '../composables/useViewActivity';
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
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

const position = ref<{ left: number; top: number } | null>(null);
const hintStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const place = () => {
  const anchor = root.value?.getBoundingClientRect();
  const bounds = popup.value?.getBoundingClientRect();
  if (!anchor || !bounds) return;
  const margin = 12;
  const below = anchor.bottom + 8;
  position.value = {
    left: Math.max(margin, Math.min(window.innerWidth - margin - bounds.width, anchor.left)),
    top: below + bounds.height + margin > window.innerHeight ? Math.max(margin, anchor.top - bounds.height - 8) : below,
  };
};
const HINT_MS = 6000;
let timer: ReturnType<typeof setTimeout> | null = null;
watch(open, async (key) => {
  if (timer) { clearTimeout(timer); timer = null; }
  position.value = null;
  if (!key) return;
  timer = setTimeout(() => close(), HINT_MS);
  await nextTick();
  place();
});
useActiveListener(window, 'resize', place);
useActiveListener(document, 'scroll', place, true);
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
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
.dnd-formula-hint { position:fixed; z-index:3100; /* above roll toasts */ margin:0; width:max-content; max-width:min(300px, calc(100vw - 24px)); box-sizing:border-box; padding:10px 12px; border-radius:12px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); font-size:13px; line-height:1.35; }
</style>
