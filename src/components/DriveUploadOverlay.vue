<template>
  <div v-if="active" class="drive-drop-overlay" data-drop-overlay aria-hidden="true"><div class="drive-drop-overlay-content"><Upload :size="48" class="drive-drop-icon" /><span class="drive-drop-text">{{ t('driveDropFilesHere') }}</span></div></div>
  <input ref="fileInput" type="file" multiple style="display: none" data-file-input @change="emit('selected', $event)" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Upload } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

defineProps<{ active: boolean }>();
const emit = defineEmits<{ selected: [event: Event] }>();
const fileInput = ref<HTMLInputElement | null>(null);
const { t } = useI18n();
defineExpose({ open: () => fileInput.value?.click() });
</script>

<style scoped>
.drive-drop-overlay { position: absolute; inset: 0; background: rgba(13, 23, 16, 0.75); backdrop-filter: blur(4px); border: 2px dashed var(--ui-accent-strong, #8cff8c); z-index: 150; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.drive-drop-overlay-content { display: flex; flex-direction: column; align-items: center; gap: 14px; color: var(--ui-accent-strong, #8cff8c); }
.drive-drop-text { font-size: 18px; font-weight: 600; }
</style>
