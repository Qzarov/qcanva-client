<template>
  <div
    class="ui-toast toast-item"
    :class="[`ui-toast--${type}`, `toast-${type}`]"
    :role="type === 'error' ? 'alert' : 'status'"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <span class="ui-toast__message toast-message">{{ message }}</span>
    <button
      type="button"
      class="ui-toast__close toast-close"
      aria-label="Close notification"
      @click="emit('close')"
    >&times;</button>
  </div>
</template>

<script setup lang="ts">
import type { Toast } from '../../composables/useToast';

withDefaults(defineProps<{
  message: string;
  type?: Toast['type'];
}>(), {
  type: 'info',
});

const emit = defineEmits<{
  close: [];
}>();
</script>
<style scoped>
.ui-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--ui-surface-elevated);
  border: 1px solid var(--ui-border);
  box-shadow: var(--ui-shadow);
  font-size: 13px;
  color: var(--ui-text);
  backdrop-filter: blur(12px);
}
.ui-toast--success { border-left: 3px solid var(--ui-success); }
.ui-toast--error { border-left: 3px solid var(--ui-danger); }
.ui-toast--info { border-left: 3px solid var(--ui-info); }
.ui-toast--success .ui-toast__message { color: var(--ui-success-foreground); }
.ui-toast--error .ui-toast__message { color: var(--ui-danger-foreground); }
.ui-toast--info .ui-toast__message { color: var(--ui-info-foreground); }
.ui-toast__message { flex: 1; line-height: 1.4; }
.ui-toast__close {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--ui-text-secondary);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.ui-toast__close:hover { color: var(--ui-text); background: var(--ui-surface-subtle); }
</style>
