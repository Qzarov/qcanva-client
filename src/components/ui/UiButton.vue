<template>
  <button
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'ui-button--block': block }]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
}>(), {
  type: 'button',
  variant: 'ghost',
  size: 'md',
  block: false,
  disabled: false,
  loading: false,
});
</script>
<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
}
.ui-button--md { min-height: 36px; padding: 8px 18px; }
.ui-button--sm { min-height: 28px; padding: 4px 10px; font-size: 12px; }
.ui-button--block { width: 100%; }
.ui-button--primary { background: var(--color-brands); color: var(--color-brand-on); }
.ui-button--primary:hover:not(:disabled) { border-color: var(--color-brands-light); }
.ui-button--ghost { background: transparent; border-color: var(--ui-border); color: var(--ui-text-secondary); }
.ui-button--ghost:hover:not(:disabled) { background: var(--ui-surface-subtle); color: var(--ui-text); }
.ui-button--danger { background: var(--ui-danger); color: var(--ui-danger-on); }
.ui-button--danger:hover:not(:disabled) { filter: brightness(1.08); }
.ui-button--subtle { background: var(--ui-surface-subtle); border-color: var(--ui-border); color: var(--ui-text); }
.ui-button:disabled { opacity: 0.55; cursor: default; pointer-events: none; }
.ui-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.ui-button__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ui-button-spin 0.7s linear infinite;
}
@keyframes ui-button-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .ui-button__spinner { animation: none; }
}
</style>
