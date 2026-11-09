<template>
  <component :is="as" class="ui-card" :class="[`ui-card--${variant}`, `ui-card--layout-${layout}`]">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: 'div' | 'section' | 'article' | 'form';
  variant?: 'glass' | 'elevated' | 'subtle';
  layout?: 'grid' | 'inherit';
}>(), {
  as: 'div',
  variant: 'glass',
  layout: 'grid',
});
</script>
