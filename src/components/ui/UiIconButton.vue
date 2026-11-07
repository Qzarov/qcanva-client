<template>
  <button
    class="ui-icon-button"
    :class="[`ui-icon-button--${variant}`, `ui-icon-button--${size}`]"
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :title="title || label"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'default' | 'danger' | 'clear';
  size?: 'sm' | 'md';
  disabled?: boolean;
}>(), {
  type: 'button',
  variant: 'default',
  size: 'md',
  disabled: false,
});
</script>
