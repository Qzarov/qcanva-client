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
  /** Render inside a semi-transparent gradient curtain over the photo wall. */
  curtain?: boolean;
  level: 'h1' | 'h2';
}>();

const emit = defineEmits<{ (e: 'pick'): void }>();
const { t } = useI18n();
</script>

<template>
  <div class="pgh" :class="[`pgh-${level}`, { selecting, 'pgh-curtain': curtain }]">
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
  align-items: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.pgh-curtain {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #f4fff6;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.pgh-curtain .pgh-count {
  color: rgba(240, 255, 240, 0.78);
  font-size: 12.5px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.pgh-curtain .pgh-path {
  color: rgba(240, 255, 240, 0.72);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.pgh-curtain .pgh-pick,
.pgh-curtain.selecting .pgh-pick {
  pointer-events: auto;
}
:root[data-theme='light'] .pgh-curtain {
  color: var(--ui-text);
  text-shadow: none;
}
:root[data-theme='light'] .pgh-curtain .pgh-count,
:root[data-theme='light'] .pgh-curtain .pgh-path {
  color: var(--ui-text-muted);
  text-shadow: none;
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
  pointer-events: auto;
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
@media (hover: none) {
  .pgh-pick {
    opacity: 0.75;
  }
}
</style>
