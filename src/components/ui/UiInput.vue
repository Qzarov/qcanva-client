<template>
  <input
    ref="field"
    v-bind="$attrs"
    class="ui-input"
    :class="inputClass"
    :value="modelValue"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  modelValue?: string;
  inputClass?: string;
  disabled?: boolean;
}>(), {
  modelValue: '',
  inputClass: '',
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const field = ref<HTMLInputElement | null>(null);
defineExpose({ field });
</script>
<style scoped>
.ui-input {
  font: inherit;
  color: var(--ui-text);
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.ui-input:focus { border-color: color-mix(in srgb, var(--color-brands) 45%, transparent); }
.ui-input:disabled { opacity: 0.55; cursor: default; }
</style>
