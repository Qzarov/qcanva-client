<template>
  <span ref="root" class="dnd-select" :class="['dnd-select--' + variant, { 'is-open': Boolean(open), 'is-empty': !current }]">
    <button
      ref="trigger"
      type="button"
      class="dnd-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="Boolean(open)"
      :aria-controls="open ? listId : undefined"
      :aria-label="label"
      :title="current?.label || undefined"
      :disabled="disabled"
      @click="toggleList($event)"
      @keydown.down.prevent="openList($event)"
      @keydown.up.prevent="openList($event)"
    >
      <span class="dnd-select-value">{{ current?.label ?? placeholder ?? label }}</span>
      <svg v-if="variant === 'field'" class="dnd-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <Teleport to="body">
      <div v-if="open" :id="listId" ref="popup" class="dnd-select-list" role="listbox" :aria-label="label" :style="listStyle" @keydown="onListKeydown">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="option"
          class="dnd-select-option"
          :class="{ 'is-selected': option.value === value }"
          :aria-selected="option.value === value"
          :data-value="option.value"
          @click="choose(option.value)"
        >
          <span>{{ option.label }}</span>
          <svg v-if="option.value === value" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useSheetPopup } from '../composables/useSheetPopup';

/**
 * A choice from a short list, drawn by us rather than by the system: the
 * native <select> popup cannot be styled, and looked like another app next to
 * the sheet's glass. Behaves like the sheet's other popup menus (see
 * docs/character-sheet-style.md, "Всплывающие меню") and like a listbox for
 * the keyboard and for assistive technology.
 */
export type SelectOption = { value: string; label: string };
const props = withDefaults(defineProps<{
  value: string;
  options: SelectOption[];
  /** What is being chosen: the accessible name of the control and of its list. */
  label: string;
  /** Shown when nothing is chosen (defaults to the label). */
  placeholder?: string;
  disabled?: boolean;
  /** `field` looks like an input with a chevron; `plain` reads as a value until hovered or focused. */
  variant?: 'field' | 'plain';
}>(), { variant: 'field', disabled: false, placeholder: undefined });
const emit = defineEmits<{ change: [value: string] }>();

const { root, popup, open, toggle, close } = useSheetPopup();
const trigger = ref<HTMLButtonElement | null>(null);
const listId = useId();
const current = computed(() => props.options.find((option) => option.value === props.value));

const position = ref<{ left: number; top: number; minWidth: number } | null>(null);
const listStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px`, minWidth: `${position.value.minWidth}px` }
  : { visibility: 'hidden' as const });
const place = () => {
  if (!open.value || !trigger.value || !popup.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const list = popup.value.getBoundingClientRect();
  const margin = 12;
  const below = anchor.bottom + 6;
  const width = Math.max(list.width, anchor.width);
  const preferredTop = below + list.height <= window.innerHeight - margin ? below : anchor.top - list.height - 6;
  position.value = {
    left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(preferredTop, window.innerHeight - list.height - margin)),
    minWidth: anchor.width,
  };
};

const optionButtons = () => Array.from(popup.value?.querySelectorAll<HTMLButtonElement>('.dnd-select-option') ?? []);
const focusOption = (index: number) => {
  const buttons = optionButtons();
  buttons[(index + buttons.length) % buttons.length]?.focus({ preventScroll: false });
};

const toggleList = (event: Event) => { toggle('list', event); };
const openList = (event: Event) => { if (!open.value) toggle('list', event); };
const choose = (value: string) => {
  close(true);
  if (value !== props.value) emit('change', value);
};

watch(open, async (value) => {
  position.value = null;
  if (!value) return;
  await nextTick();
  place();
  // Measured while hidden; wait for it to show before moving the focus in.
  await nextTick();
  // Closed again in the meantime (a quick Escape): the focus is already back on the control.
  if (!open.value) return;
  const buttons = optionButtons();
  const selected = buttons.findIndex((button) => button.dataset.value === props.value);
  focusOption(selected >= 0 ? selected : 0);
});
watch(() => props.disabled, (value) => { if (value) close(); });

let typed = '';
let typedAt = 0;
const onListKeydown = (event: KeyboardEvent) => {
  const buttons = optionButtons();
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(index - 1); }
  else if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
  else if (event.key === 'End') { event.preventDefault(); focusOption(buttons.length - 1); }
  else if (event.key === 'Tab') { close(true); }
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
    // Typing jumps to the option that starts with what was typed.
    const now = Date.now();
    typed = now - typedAt > 700 ? event.key : typed + event.key;
    typedAt = now;
    const needle = typed.toLocaleLowerCase('ru');
    const match = buttons.findIndex((button) => (button.textContent ?? '').trim().toLocaleLowerCase('ru').startsWith(needle));
    if (match >= 0) focusOption(match);
  }
};

onMounted(() => {
  window.addEventListener('resize', place);
  // Capture also sees scrolling in the character page's own scroll container.
  document.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', place);
  document.removeEventListener('scroll', place, true);
});

defineExpose({ focus: () => trigger.value?.focus() });
</script>

<style scoped>
.dnd-select { display: inline-flex; min-width: 0; max-width: 100%; }
.dnd-select-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; padding: 5px 7px; border: 1px solid var(--dnd-glass-border, var(--ui-border)); border-radius: 8px; background: rgba(var(--dnd-fill-rgb, 255, 255, 255), 0.045); color: var(--ui-text); font: inherit; text-align: left; text-transform: none; letter-spacing: 0; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.dnd-select-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dnd-select-chevron { flex: none; width: 12px; height: 12px; color: var(--dnd-text-dim, var(--ui-text-secondary)); transition: transform 150ms ease; }
.is-open .dnd-select-chevron { transform: rotate(180deg); }
.dnd-select-trigger:focus-visible,
.is-open .dnd-select-trigger { outline: none; border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-brand)) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft, var(--ui-brand-soft)); }
.dnd-select-trigger:disabled { cursor: default; background: transparent; border-color: transparent; }
.dnd-select-trigger:disabled .dnd-select-chevron { display: none; }

/* Reads as a plain value in idle, like the sheet's inputs; the edit affordance shows on hover and focus. */
.dnd-select--plain { display: flex; }
.dnd-select--plain .dnd-select-trigger { padding: 4px 6px; border-color: transparent; background: transparent; color: var(--dnd-text-dim, var(--ui-text-secondary)); }
.dnd-select--plain.is-empty .dnd-select-trigger { color: color-mix(in srgb, var(--dnd-text-dim, var(--ui-text-secondary)) 75%, transparent); }
.dnd-select--plain .dnd-select-trigger:hover:not(:disabled):not(:focus-visible) { background: rgba(var(--dnd-fill-rgb, 255, 255, 255), 0.045); border-color: var(--dnd-glass-border, var(--ui-border)); }
.dnd-select--plain .dnd-select-trigger:focus-visible,
.dnd-select--plain.is-open .dnd-select-trigger { background: var(--dnd-field-focus-bg, var(--ui-surface-subtle)); }

/* The list is teleported to <body>: the app's glass tokens, one blurred surface. */
.dnd-select-list { position: fixed; z-index: 10050; display: grid; gap: 2px; box-sizing: border-box; width: max-content; max-width: calc(100vw - 24px); max-height: min(300px, calc(100dvh - 24px)); overflow-y: auto; padding: 6px; border: 1px solid var(--ui-glass-border); border-radius: 14px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); }
.dnd-select-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background-color 120ms ease; }
.dnd-select-option:hover, .dnd-select-option:focus-visible { outline: none; background: var(--ui-glass-btn-hover); }
.dnd-select-option.is-selected { color: var(--ui-glass-accent-text); background: var(--ui-glass-accent-bg); }
.dnd-select-option svg { flex: none; width: 12px; height: 12px; }
@media (max-width: 760px) {
  .dnd-select-option { min-height: 44px; font-size: 14px; }
  .dnd-select--plain .dnd-select-trigger { padding-inline: 1px; }
}
</style>
