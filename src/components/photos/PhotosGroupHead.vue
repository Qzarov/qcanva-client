<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  title: string;
  secondary?: string;
  count: number;
  /** Folder groups get a folder glyph before the title. */
  folder?: boolean;
  /** Whole group is selected. */
  pressed: boolean;
  /** Selection mode: the circle is always visible. */
  selecting?: boolean;
  level: 'h1' | 'h2';
}>();

const emit = defineEmits<{ (e: 'pick'): void }>();
const { t } = useI18n();
</script>

<template>
  <div class="pgh" :class="[`pgh-${level}`, { selecting }]">
    <button
      type="button"
      class="pgh-pick"
      data-testid="group-pick"
      :aria-pressed="pressed"
      :aria-label="`${t('photosSelectGroup')}: ${props.title}`"
      @click.stop="emit('pick')"
      @dblclick.stop
    ></button>
    <span class="pgh-title" :class="{ folder }">{{ title }}</span>
    <span v-if="secondary" class="pgh-path">{{ secondary }}</span>
    <span class="pgh-count">{{ count }}</span>
  </div>
</template>

<style scoped>
.pgh {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  color: var(--ui-text);
}
.pgh-h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.pgh-h2 {
  align-items: center;
  gap: 8px;
  color: var(--ui-text-secondary);
  font-weight: 600;
  font-size: 14px;
}
.pgh-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pgh-title.folder::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 11px;
  margin-right: 9px;
  border-radius: 2px 2px 3px 3px;
  background: var(--ui-accent-strong);
  opacity: 0.8;
  vertical-align: 1px;
}
.pgh-h2 .pgh-title.folder::before {
  width: 10px;
  height: 8px;
  margin-right: 6px;
}
.pgh-path {
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 400;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pgh-count {
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 400;
  flex: none;
}
.pgh-pick {
  flex: none;
  align-self: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid var(--ui-text-muted);
  background: transparent;
  opacity: 0;
  transition: opacity 0.12s;
  cursor: pointer;
}
.pgh:hover .pgh-pick,
.pgh.selecting .pgh-pick,
.pgh-pick:focus-visible {
  opacity: 1;
}
.pgh-pick[aria-pressed='true'] {
  background: var(--ui-brand);
  border-color: var(--ui-brand);
  opacity: 1;
}
</style>
