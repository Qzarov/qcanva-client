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
<style scoped>
.ui-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 20px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: var(--ui-glass-card-shadow);
}
.ui-card--elevated { box-shadow: var(--ui-shadow); }
.ui-card--subtle { background: var(--ui-surface-subtle); box-shadow: none; }
.ui-card--layout-inherit { display: block; gap: 0; }
</style>
