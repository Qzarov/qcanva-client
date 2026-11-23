<template>
  <div v-if="active" class="drive-drop-overlay" data-drop-overlay aria-hidden="true">
    <div class="drive-drop-overlay-content">
      <Upload :size="48" class="drive-drop-icon" />
      <span class="drive-drop-text">{{ label || t('driveDropFilesHere') }}</span>
    </div>
  </div>
  <input v-if="showInput" ref="fileInput" type="file" multiple style="display: none" data-file-input @change="emit('selected', $event)" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Upload } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

withDefaults(defineProps<{ active: boolean; label?: string; showInput?: boolean }>(), {
  showInput: true,
});
const emit = defineEmits<{ selected: [event: Event] }>();
const fileInput = ref<HTMLInputElement | null>(null);
const { t } = useI18n();
defineExpose({ open: () => fileInput.value?.click() });
</script>

<style scoped>
.drive-drop-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--ui-surface-solid, #171a19) 82%, transparent);
  backdrop-filter: blur(4px);
  border: 2px dashed var(--ui-accent-strong, #8cff8c);
  border-radius: inherit;
  z-index: 350;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  pointer-events: none;
}
.drive-drop-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--ui-accent-strong, #8cff8c);
}
.drive-drop-text { font-size: 18px; font-weight: 600; }
</style>
