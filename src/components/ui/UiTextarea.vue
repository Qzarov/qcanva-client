<template>
  <textarea
    v-bind="$attrs"
    class="ui-textarea"
    :class="textareaClass"
    :value="modelValue"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>

<script setup lang="ts">
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
</script>
