<template>
  <span class="dnd-identity-select">
    <input
      v-if="typing"
      ref="input"
      :value="value"
      :placeholder="placeholder"
      :aria-label="label + ': свой вариант'"
      autocomplete="off"
      @change="commit(($event.target as HTMLInputElement).value)"
      @blur="typing = false"
      @keydown.esc.prevent.stop="typing = false"
    />
    <select v-else ref="select" :value="selected" :disabled="readonly" :aria-label="label" :title="value.trim() || undefined" :class="{ 'is-empty': !value }" @change="pick(($event.target as HTMLSelectElement).value)">
      <option value="">{{ placeholder }}</option>
      <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
      <option v-if="custom" :value="CUSTOM_VALUE">{{ value }}</option>
      <option :value="TYPE_VALUE">{{ otherLabel }}</option>
    </select>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

/**
 * A race or class: chosen from a list, with a way out for anything the list
 * does not have. The value stays plain text, so a sheet filled in before the
 * list existed (or with a homebrew option) shows what it had.
 */
const props = defineProps<{
  value: string;
  options: string[];
  /** What the field is ("Раса"): its accessible name and the empty option. */
  label: string;
  /** The last option, which switches to typing ("Другая…"). */
  otherLabel: string;
  readonly?: boolean;
}>();
const emit = defineEmits<{ change: [value: string] }>();

const CUSTOM_VALUE = '\u0000custom';
const TYPE_VALUE = '\u0000type';
const placeholder = computed(() => props.label);
const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
const listed = computed(() => props.options.find((option) => normalize(option) === normalize(props.value)));
/** A stored value the list does not have: shown as its own option. */
const custom = computed(() => Boolean(props.value.trim()) && !listed.value);
const selected = computed(() => listed.value ?? (custom.value ? CUSTOM_VALUE : ''));

const typing = ref(false);
const input = ref<HTMLInputElement | null>(null);
const select = ref<HTMLSelectElement | null>(null);

const pick = async (value: string) => {
  if (value === TYPE_VALUE) {
    // The select keeps showing the current value; typing takes over in its place.
    if (select.value) select.value.value = selected.value;
    typing.value = true;
    await nextTick();
    input.value?.focus();
    input.value?.select();
    return;
  }
  if (value !== CUSTOM_VALUE) emit('change', value);
};
const commit = (value: string) => {
  typing.value = false;
  const text = value.trim();
  if (text !== props.value.trim()) emit('change', text);
};
</script>

<style scoped>
.dnd-identity-select { display: block; min-width: 0; }
/* Reads as a plain value in idle, like the sheet's inputs; the edit affordance shows on hover and focus. */
.dnd-identity-select select,
.dnd-identity-select input { width: 100%; min-width: 0; box-sizing: border-box; padding: 4px 6px; border: 1px solid transparent; border-radius: 8px; background-color: transparent; color: var(--dnd-text-dim, var(--ui-text-secondary)); font: inherit; transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.dnd-identity-select select { appearance: none; -webkit-appearance: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.dnd-identity-select select.is-empty { color: color-mix(in srgb, var(--dnd-text-dim, var(--ui-text-secondary)) 75%, transparent); }
.dnd-identity-select select:disabled { cursor: default; opacity: 1; }
.dnd-identity-select select:hover:not(:disabled):not(:focus),
.dnd-identity-select input:hover:not(:focus) { background-color: rgba(var(--dnd-fill-rgb, 255, 255, 255), 0.045); border-color: var(--dnd-glass-border, var(--ui-border)); }
.dnd-identity-select select:focus,
.dnd-identity-select input:focus { outline: none; background-color: var(--dnd-field-focus-bg, var(--ui-surface-subtle)); border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-brand)) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft, var(--ui-brand-soft)); }
/* The popup is drawn by the system in the app's colour scheme: tokens, not a literal. */
.dnd-identity-select select option { background: var(--ui-surface-solid); color: var(--ui-text); }
@media (max-width: 760px) {
  .dnd-identity-select select, .dnd-identity-select input { padding-inline: 1px; }
}
</style>
