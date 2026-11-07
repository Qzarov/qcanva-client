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
