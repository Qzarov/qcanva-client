<template>
  <div class="theme-menu" @keydown.esc.stop="close">
    <button
      type="button"
      class="theme-menu-trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('theme')"
      data-theme-menu-trigger
      @click.stop="open = !open"
    >
      <span aria-hidden="true">◐</span>
    </button>
    <div
      v-if="open"
      class="theme-menu-backdrop"
      data-theme-menu-backdrop
      aria-hidden="true"
      @click="close"
    ></div>
    <div v-if="open" class="theme-menu-popover" role="menu" data-theme-menu @click.stop>
      <ThemeSelector />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../composables/useI18n';
import ThemeSelector from './ThemeSelector.vue';

const { t } = useI18n();
const open = ref(false);
const close = () => { open.value = false; };
</script>

<style scoped>
.theme-menu {
  position: relative;
  display: inline-flex;
}
.theme-menu-trigger {
  position: relative;
  z-index: 402;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-sm);
  color: var(--ui-text-secondary);
  background: var(--ui-surface-subtle);
  font-size: 18px;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
}
.theme-menu-trigger:hover,
.theme-menu-trigger:focus-visible {
  border-color: color-mix(in srgb, var(--color-brands) 55%, var(--ui-border));
  color: var(--ui-text);
  background: var(--ui-brand-soft);
}
.theme-menu-backdrop {
  position: fixed;
  z-index: 400;
  inset: 0;
}
.theme-menu-popover {
  position: absolute;
  z-index: 403;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-md);
  color: var(--ui-text);
  background: var(--ui-surface-elevated);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(12px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

@media (prefers-reduced-motion: reduce) {
  .theme-menu-popover {
    transition: none;
  }
}
</style>
