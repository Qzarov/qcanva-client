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
<style scoped>
.ui-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
.ui-badge--accent { background: var(--ui-focus); color: var(--ui-on-accent, #fff); }
.ui-badge--success { background: var(--ui-success-soft); color: var(--ui-success-foreground); }
.ui-badge--warning { background: var(--ui-warning-soft); color: var(--ui-warning-foreground); }
.ui-badge--danger { background: var(--ui-danger-soft); color: var(--ui-danger-foreground); }
.ui-badge.dashboard-filter-badge {
  padding: 0 5px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
</style>
