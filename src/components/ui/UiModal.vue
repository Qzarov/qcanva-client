<template>
  <div
    ref="root"
    class="ui-modal-backdrop"
    :class="backdropClass"
    @click.self="emit('close')"
  >
    <section
      v-bind="$attrs"
      class="ui-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @keydown.esc.prevent.stop="emit('close')"
    >
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

defineProps<{
  label: string;
  backdropClass?: string;
}>();

const emit = defineEmits<{ close: [] }>();
const root = ref<HTMLElement | null>(null);

defineExpose({ root });
</script>
<style scoped>
.ui-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: var(--ui-modal-align-items, center);
  justify-content: center;
  padding: var(--ui-modal-padding, 24px);
  background: var(--ui-overlay);
}
.ui-modal {
  width: min(560px, 100%);
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-lg);
  background: var(--ui-surface-elevated);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(10px);
}
</style>
