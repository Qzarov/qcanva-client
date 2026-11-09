<template>
  <button
    class="ui-icon-button"
    :class="[`ui-icon-button--${variant}`, `ui-icon-button--${size}`]"
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :title="title || label"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'default' | 'danger' | 'clear';
  size?: 'sm' | 'md';
  disabled?: boolean;
}>(), {
  type: 'button',
  variant: 'default',
  size: 'md',
  disabled: false,
});
</script>
<style scoped>
.ui-icon-button {
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--ui-glass-border);
  border-radius: 50%;
  background: var(--ui-glass-btn-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight);
  color: var(--ui-text);
  cursor: pointer;
}
.ui-icon-button--md { width: 34px; height: 34px; }
.ui-icon-button--sm { width: 28px; height: 28px; }
.ui-icon-button:hover:not(:disabled) { background: var(--ui-glass-btn-hover); }
.ui-icon-button--danger { color: var(--ui-danger); }
.ui-icon-button--clear { border-color: transparent; background: transparent; box-shadow: none; }
.ui-icon-button:disabled { opacity: 0.55; cursor: default; pointer-events: none; }
.ui-icon-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
</style>
