<template>
  <div class="ui-empty-state" :class="emptyClass" :role="role">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  emptyClass?: string;
  role?: 'status' | 'alert' | undefined;
}>(), {
  emptyClass: '',
  role: undefined,
});
</script>
<style scoped>
.ui-empty-state { color: var(--ui-text-secondary); }
</style>
