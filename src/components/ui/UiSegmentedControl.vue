<template>
  <div class="ui-segmented-control" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      :class="{ active: modelValue === option.value }"
      :aria-label="option.ariaLabel || option.label"
      :title="option.title || option.ariaLabel || option.label"
      :aria-pressed="modelValue === option.value"
      v-bind="option.attrs"
      @click="emit('update:modelValue', option.value)"
    >
      <slot name="option" :option="option">{{ option.label }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
type SegmentedOption = { value: T; label: string; ariaLabel?: string; title?: string; attrs?: Record<string, string> };
defineProps<{ options: readonly SegmentedOption[]; modelValue: T; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
</script>
<style scoped>
.ui-segmented-control {
  display: inline-flex;
  align-items: center;
}
.ui-segmented-control > button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ui-segmented-control > button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
</style>
