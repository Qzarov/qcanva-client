<template>
  <div
    v-if="activeDrag"
    class="explorer-drag-badge"
    :style="badgeStyle"
    role="status"
    aria-live="polite"
    data-explorer-drag-badge
  >
    <span class="explorer-drag-badge-count">{{ activeDrag.count }}</span>
    <Layers :size="14" aria-hidden="true" />
    <span class="explorer-drag-badge-label">{{ countLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Layers } from '@lucide/vue';
import { formatDragCountLabel, useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';

const { activeDrag, dragCursor } = useExplorerGroupDnd();
const { locale } = useI18n();

const countLabel = computed(() => {
  if (!activeDrag.value) return '';
  return formatDragCountLabel(activeDrag.value.count, locale.value === 'en' ? 'en' : 'ru');
});

const badgeStyle = computed(() => ({
  left: `${Math.round(dragCursor.value.x + 14)}px`,
  top: `${Math.round(dragCursor.value.y + 14)}px`,
}));
</script>

<style scoped>
.explorer-drag-badge {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--ui-glass-tint), var(--ui-glass-bg-deep, rgba(14, 24, 17, 0.92));
  border: 1px solid var(--ui-glass-accent-border, var(--color-brands, #44cf6e));
  box-shadow: var(--ui-glass-accent-shadow, 0 10px 28px rgba(0, 0, 0, 0.45));
  backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.25);
  color: var(--ui-glass-accent-text, var(--ui-text));
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.explorer-drag-badge-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: var(--color-brands, #44cf6e);
  color: var(--color-brand-on, #051806);
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
</style>
