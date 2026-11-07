<template>
  <button
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'ui-button--block': block }]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
}>(), {
  type: 'button',
  variant: 'ghost',
  size: 'md',
  block: false,
  disabled: false,
  loading: false,
});
</script>
