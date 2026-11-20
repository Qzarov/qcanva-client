<template>
  <textarea
    ref="field"
    v-bind="$attrs"
    class="ui-textarea"
    :class="textareaClass"
    :value="modelValue"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  modelValue?: string;
  textareaClass?: string;
  disabled?: boolean;
}>(), {
  modelValue: '',
  textareaClass: '',
  disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const field = ref<HTMLTextAreaElement | null>(null);
defineExpose({ field });
</script>
<style scoped>
.ui-textarea {
  font: inherit;
  color: var(--ui-text);
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.ui-textarea:focus { border-color: color-mix(in srgb, var(--color-brands) 45%, transparent); }
.ui-textarea:disabled { opacity: 0.55; cursor: default; }
</style>
