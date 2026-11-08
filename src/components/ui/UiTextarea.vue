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
