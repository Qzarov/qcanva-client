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
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  color: var(--dark-text-secondary);
  background: var(--dark-input-bg);
  font-size: 18px;
  cursor: pointer;
}
.theme-menu-trigger:hover,
.theme-menu-trigger:focus-visible {
  border-color: color-mix(in srgb, var(--color-brands) 55%, var(--dark-neutral-border));
  color: var(--dark-text-primary);
  outline: none;
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
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-md);
  background: var(--dark-menu-bg);
  box-shadow: var(--shadow-dropdown);
  backdrop-filter: blur(12px);
}
</style>
