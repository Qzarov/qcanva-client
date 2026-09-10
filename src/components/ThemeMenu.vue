<template>
  <div class="theme-menu" @keydown.esc.stop="close(true)">
    <button
      ref="triggerRef"
      type="button"
      class="theme-menu-trigger"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="t('theme')"
      :title="t('theme')"
      :aria-controls="open ? popoverId : undefined"
      data-theme-menu-trigger
      @click.stop="toggleFromClick"
      @keydown.down.prevent.stop="openFromKeyboard"
    >
      <span aria-hidden="true">{{ triggerIcon }}</span>
    </button>
    <div
      v-if="open"
      class="theme-menu-backdrop"
      data-theme-menu-backdrop
      aria-hidden="true"
      @click="close(false)"
    ></div>
    <div
      v-if="open"
      :id="popoverId"
      ref="popoverRef"
      class="theme-menu-popover"
      role="dialog"
      :aria-label="t('theme')"
      data-theme-menu
      @click.stop
    >
      <ThemeSelector ref="selectorRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from '../composables/useI18n';
import { useTheme } from '../composables/useTheme';
import ThemeSelector from './ThemeSelector.vue';

const { t } = useI18n();
const { effectiveTheme } = useTheme();
const triggerIcon = computed(() => effectiveTheme.value === 'light' ? '☀' : '☾');
const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const selectorRef = ref<InstanceType<typeof ThemeSelector> | null>(null);
const popoverId = 'theme-menu-popover';

const focusTrigger = () => {
  triggerRef.value?.focus();
};

const focusFirstChoice = () => {
  selectorRef.value?.focusFirstChoice();
};

const openMenu = async (focusFirst = false) => {
  open.value = true;
  if (!focusFirst) return;
  await nextTick();
  focusFirstChoice();
};

const close = (restoreFocus = false) => {
  open.value = false;
  if (restoreFocus) {
    void nextTick(() => focusTrigger());
  }
};

const toggleFromClick = () => {
  if (open.value) {
    close(false);
    return;
  }
  void openMenu(false);
};

const openFromKeyboard = () => {
  void openMenu(true);
};
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
