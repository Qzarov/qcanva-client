<template>
  <div class="toast-container">
    <transition-group name="toast">
      <UiToast
        v-for="t in toasts"
        :key="t.id"
        :message="t.message"
        :type="t.type"
        @close="dismiss(t.id)"
      />
    </transition-group>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useToast } from '../composables/useToast';
import UiToast from './ui/UiToast.vue';

export default defineComponent({
  components: { UiToast },
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
