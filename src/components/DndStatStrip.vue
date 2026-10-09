<template>
  <section ref="root" class="dnd-stat-strip" aria-label="Показатели">
    <div v-for="item in items" :key="item.key" class="dnd-stat-cell" :class="{ 'is-open': open === item.key }">
      <!-- The whole cell explains itself on a tap; a value that can be set (setup mode) is a field under its icon. -->
      <button
        type="button"
        class="dnd-stat-button"
        :class="{ 'has-field': editable(item) }"
        :aria-label="item.ariaLabel"
        :aria-expanded="open === item.key"
        :aria-describedby="open === item.key ? tooltipId : undefined"
        @click="toggle(item.key, $event)"
      >
        <component :is="item.icon" class="dnd-stat-icon" :size="16" :stroke-width="1.8" aria-hidden="true" />
        <strong v-if="!editable(item)">{{ item.value }}</strong>
      </button>
      <input
        v-if="editable(item)"
        type="number"
        min="0"
        inputmode="numeric"
        :value="item.value"
        :aria-label="item.name"
        @change="emit('set', item.key, ($event.target as HTMLInputElement).value)"
      />
    </div>
    <Teleport to="body">
      <p v-if="selected" :id="tooltipId" ref="hint" role="tooltip" class="mobile-modebar-tap-hint dnd-stat-help" :style="hintStyle">{{ selected.name }}: {{ selected.help }}</p>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch, type Component } from 'vue';
import { useActiveListener } from '../composables/useViewActivity';
import { useSheetPopup } from '../composables/useSheetPopup';

/**
 * The numbers a player looks up, in one row of one block: an icon and its
 * value. A tap says what the icon is - "Name: what it is for" - and the hint
 * goes away by itself. Used on a phone, where six labelled cells do not fit.
 */
export type StatStripItem = {
  key: string;
  /** The full name: the hint starts with it, and an editable value is labelled by it. */
  name: string;
  value: string | number;
  help: string;
  ariaLabel: string;
  icon: Component;
  /** Set-once data: a field while the sheet is being set up. */
  editable?: boolean;
};
const props = defineProps<{ items: StatStripItem[]; locked?: boolean }>();
const emit = defineEmits<{ set: [key: string, value: string] }>();
const editable = (item: StatStripItem) => Boolean(item.editable) && !props.locked;

const { root, open, toggle, close } = useSheetPopup();
const tooltipId = useId();
const selected = computed(() => props.items.find((item) => item.key === open.value));
const hint = ref<HTMLElement | null>(null);
const position = ref<{ left: number; top: number } | null>(null);
const hintStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const HINT_DURATION_MS = 3000;
let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
const positionHint = () => {
  const button = root.value?.querySelector<HTMLElement>('[aria-expanded="true"]');
  if (!button || !hint.value) return;
  const anchor = button.getBoundingClientRect();
  const bounds = hint.value.getBoundingClientRect();
  const margin = 12;
  position.value = {
    left: Math.max(margin + bounds.width / 2, Math.min(window.innerWidth - margin - bounds.width / 2, anchor.left + anchor.width / 2)),
    top: Math.max(margin, anchor.top - bounds.height - 8),
  };
};
watch(open, async (key) => {
  clearTimer(); position.value = null;
  if (!key) return;
  timer = setTimeout(() => { timer = null; close(); }, HINT_DURATION_MS);
  await nextTick();
  if (open.value === key) positionHint();
});
useActiveListener(window, 'resize', positionHint);
// Capture also sees scrolling in the character page's own scroll container.
useActiveListener(document, 'scroll', positionHint, true);
onBeforeUnmount(clearTimer);
</script>

<style scoped>
/* Reference numbers, not controls: a quiet strip - a thin frame and a faint fill, no glass panel, no shadow. */
.dnd-stat-strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); min-width: 0; padding: 2px 6px; border: 1px solid var(--dnd-glass-border); border-radius: 14px; background: rgba(var(--dnd-fill-rgb, 255, 255, 255), .025); }
/* One height in both modes: switching between play and setup must not move what stands below. */
.dnd-stat-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; height: 52px; }
.dnd-stat-cell + .dnd-stat-cell { border-left: 1px solid var(--dnd-glass-border); }
.dnd-stat-button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 100%; min-width: 0; height: 52px; box-sizing: border-box; padding: 4px 2px; border: 0; border-radius: 10px; background: none; color: var(--dnd-text-dim); font: inherit; cursor: pointer; transition: background-color 150ms, color 150ms; }
.dnd-stat-button.has-field { height: 24px; padding-block: 2px 0; }
.dnd-stat-button strong { font-size: 14px; line-height: 1.2; font-weight: 600; color: var(--dnd-text-dim); font-variant-numeric: tabular-nums; }
.dnd-stat-icon { opacity: .7; }
.dnd-stat-cell.is-open .dnd-stat-icon, .dnd-stat-button:hover .dnd-stat-icon { opacity: 1; }
.dnd-stat-icon { flex: none; }
.dnd-stat-cell.is-open .dnd-stat-button, .dnd-stat-button:hover { color: var(--dnd-glass-accent); }
.dnd-stat-button:focus-visible { outline: 2px solid var(--dnd-glass-accent); outline-offset: -2px; }
/* The sheet's own field styles are scoped to it: a field here is dressed the same way by hand. */
.dnd-stat-cell input { width: calc(100% - 6px); min-width: 0; height: 24px; box-sizing: border-box; margin-bottom: 2px; padding: 0; border: 1px solid var(--dnd-glass-border); border-radius: 8px; background: rgba(var(--dnd-fill-rgb, 255, 255, 255), .045); color: var(--ui-text); font: inherit; text-align: center; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; outline: none; appearance: textfield; -moz-appearance: textfield; transition: border-color 150ms, box-shadow 150ms, background-color 150ms; }
.dnd-stat-cell input:focus { background: var(--dnd-field-focus-bg, var(--ui-surface-subtle)); border-color: color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft); }
.dnd-stat-cell input::-webkit-inner-spin-button, .dnd-stat-cell input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.dnd-stat-help { position: fixed; bottom: auto; z-index: 1000; width: max-content; max-width: min(320px, calc(100vw - 24px)); box-sizing: border-box; margin: 0; white-space: normal; text-align: center; border-radius: 14px; }
</style>
