<template>
  <input
    v-bind="$attrs"
    class="ui-input"
    :class="inputClass"
    :value="modelValue"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
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
</script>
