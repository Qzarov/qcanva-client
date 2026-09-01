<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast-item"
        :class="'toast-' + t.type"
      >
        <span class="toast-message">{{ t.message }}</span>
        <button class="toast-close" @click="dismiss(t.id)">&times;</button>
      </div>
    </transition-group>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useToast } from '../composables/useToast';

export default defineComponent({
  setup() {
    const { toasts } = useToast();

    function dismiss(id: number) {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }

    return { toasts, dismiss };
  },
});
</script>

<style>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
  max-width: 380px;
}
.toast-item {
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
.toast-success {
  border-left: 3px solid #44cf6e;
}
.toast-error {
  border-left: 3px solid #fb464c;
}
.toast-info {
  border-left: 3px solid #7c8aff;
}
.toast-success .toast-message { color: #44cf6e; }
.toast-error .toast-message { color: #fb464c; }
.toast-info .toast-message { color: #7c8aff; }
.toast-message {
  flex: 1;
  line-height: 1.4;
}
.toast-close {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.toast-close:hover {
  color: var(--ui-text);
  background: var(--ui-surface-subtle);
}
/* Transition animations */
.toast-enter-active {
  transition: all 0.3s ease;
}
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.toast-move {
  transition: transform 0.3s ease;
}
</style>
