<template>
  <Teleport to="body">
    <div class="node-fullscreen-editor" role="dialog" aria-modal="true" :aria-label="t('editText')">
      <header class="node-fullscreen-editor-header">
        <button class="node-fullscreen-editor-back" type="button" :aria-label="t('backToCanvas')" :title="t('backToCanvas')" @click="emit('close')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <span class="node-fullscreen-editor-title">{{ t('editText') }}</span>
        <span class="node-text-save-status" role="status" aria-live="polite">{{ saveStatusLabel }}</span>
        <button class="node-text-history" type="button" :aria-label="t('textUndo')" :title="t('textUndo')" :disabled="!canUndo" @pointerdown.prevent @click="emit('undo')">↶</button>
        <button class="node-text-history" type="button" :aria-label="t('textRedo')" :title="t('textRedo')" :disabled="!canRedo" @pointerdown.prevent @click="emit('redo')">↷</button>
      </header>
      <div class="node-fullscreen-editor-card">
        <textarea ref="editorRef" class="node-editor node-fullscreen-editor-input" :style="{ color: resolveFontColor(node.fontColor) || undefined }" :value="node.text" @input="emit('input', $event)" @keydown.stop="emit('keydown', $event)" @keyup.stop></textarea>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from '../composables/useI18n';

defineProps<{
  node: { text?: string; fontColor?: string };
  saveStatusLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  resolveFontColor: (value?: string) => string | null | undefined;
}>();
const emit = defineEmits<{ close: []; undo: []; redo: []; input: [event: Event]; keydown: [event: KeyboardEvent]; ready: [element: HTMLTextAreaElement | null] }>();
const { t } = useI18n();
const editorRef = ref<HTMLTextAreaElement | null>(null);
defineExpose({ editorRef });
onMounted(() => emit('ready', editorRef.value));
</script>
