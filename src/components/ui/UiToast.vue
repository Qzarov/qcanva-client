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
