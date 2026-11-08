<template>
  <span
    class="ui-badge"
    :class="`ui-badge--${variant}`"
    :role="role"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  role?: 'status' | undefined;
}>(), {
  variant: 'neutral',
  role: undefined,
});
</script>
