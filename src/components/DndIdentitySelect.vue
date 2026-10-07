<template>
  <span class="dnd-identity-select">
    <input
      v-if="typing"
      ref="input"
      :value="value"
      :placeholder="label"
      :aria-label="label + ': свой вариант'"
      autocomplete="off"
      @change="commit(($event.target as HTMLInputElement).value)"
      @blur="typing = false"
      @keydown.esc.prevent.stop="typing = false"
    />
    <DndSelect v-else ref="select" variant="plain" :value="selected" :options="choices" :label="label" :placeholder="label" :disabled="readonly" @change="pick" />
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import DndSelect from './DndSelect.vue';

/**
 * A race or class: chosen from a list, with a way out for anything the list
 * does not have. The value stays plain text, so a sheet filled in before the
 * list existed (or with a homebrew option) shows what it had.
 */
const props = defineProps<{
  value: string;
  options: string[];
  /** What the field is ("Раса"): its accessible name and what it shows while empty. */
  label: string;
  /** The last option, which switches to typing ("Другая…"). */
  otherLabel: string;
  readonly?: boolean;
}>();
const emit = defineEmits<{ change: [value: string] }>();

/** Option values that can never be a race or a class someone typed. */
const CUSTOM_VALUE = '\u0000custom';
const TYPE_VALUE = '\u0000type';
const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
const listed = computed(() => props.options.find((option) => normalize(option) === normalize(props.value)));
/** A stored value the list does not have: shown as its own option. */
const custom = computed(() => Boolean(props.value.trim()) && !listed.value);
const selected = computed(() => listed.value ?? (custom.value ? CUSTOM_VALUE : ''));
const choices = computed(() => [
  ...(props.value.trim() ? [{ value: '', label: '— убрать' }] : []),
  ...props.options.map((option) => ({ value: option, label: option })),
  ...(custom.value ? [{ value: CUSTOM_VALUE, label: props.value.trim() }] : []),
  { value: TYPE_VALUE, label: props.otherLabel },
]);

const typing = ref(false);
const input = ref<HTMLInputElement | null>(null);
const select = ref<InstanceType<typeof DndSelect> | null>(null);

const pick = async (value: string) => {
  if (value === TYPE_VALUE) {
    // Typing takes over in the list's place.
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
/* The typed-in variant: reads as a plain value in idle, like the sheet's inputs. */
.dnd-identity-select input { width: 100%; min-width: 0; box-sizing: border-box; padding: 4px 6px; border: 1px solid transparent; border-radius: 8px; background-color: transparent; color: var(--dnd-text-dim, var(--ui-text-secondary)); font: inherit; transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.dnd-identity-select input:hover:not(:focus) { background-color: rgba(var(--dnd-fill-rgb, 255, 255, 255), 0.045); border-color: var(--dnd-glass-border, var(--ui-border)); }
.dnd-identity-select input:focus { outline: none; background-color: var(--dnd-field-focus-bg, var(--ui-surface-subtle)); border-color: color-mix(in srgb, var(--dnd-glass-accent, var(--ui-brand)) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft, var(--ui-brand-soft)); }
@media (max-width: 760px) {
  .dnd-identity-select input { padding-inline: 1px; }
}
</style>
