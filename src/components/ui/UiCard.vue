<template>
  <component :is="as" class="ui-card" :class="`ui-card--${variant}`">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: 'div' | 'section' | 'article' | 'form';
  variant?: 'glass' | 'elevated' | 'subtle';
}>(), {
  as: 'div',
  variant: 'glass',
});
</script>
