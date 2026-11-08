<template>
  <BubbleMenu
    class="text-doc-bubble-menu"
    :editor="editor"
    :should-show="shouldShow"
    :tippy-options="tippyOptions"
    :update-delay="0"
  >
    <template v-if="!linkEditorOpen">
      <button
        v-for="button in markButtons"
        :key="button.mark"
        class="text-doc-bubble-btn"
        :class="{ active: editor.isActive(button.mark) }"
        :data-bubble-mark="button.mark"
        :title="button.label"
        :aria-label="button.label"
        type="button"
        @pointerdown.prevent
        @click="emit('apply-mark', button.mark)"
      >
        <span class="text-doc-bubble-icon" v-html="button.icon"></span>
      </button>
      <button
        class="text-doc-bubble-btn"
        :class="{ active: editor.isActive('link') }"
        data-bubble-action="link"
        :title="t('linkAdd')"
        :aria-label="t('linkAdd')"
        type="button"
        @pointerdown.prevent
        @click="emit('open-link-editor')"
      >
        <span class="text-doc-bubble-icon" v-html="linkIcon"></span>
      </button>
      <button
        v-if="editor.isActive('link')"
        class="text-doc-bubble-btn"
        data-bubble-action="unlink"
        :title="t('linkRemove')"
        :aria-label="t('linkRemove')"
        type="button"
        @pointerdown.prevent
        @click="emit('remove-link')"
      >
        <span class="text-doc-bubble-icon" v-html="unlinkIcon"></span>
      </button>
    </template>
    <form v-else class="text-doc-bubble-link-form text-doc-bubble-link-form-desktop" @submit.prevent="emit('apply-link')">
      <UiInput
        :model-value="linkInput"
        input-class="text-doc-bubble-link-input"
        data-bubble-link-input
        :placeholder="t('linkUrl')"
        :aria-label="t('linkUrl')"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @update:model-value="emit('update:linkInput', $event)"
        @keydown.esc.prevent="emit('close-link-editor')"
      />
      <button class="text-doc-bubble-btn text-doc-bubble-btn-text" data-bubble-action="apply-link" type="submit">
        {{ t('linkApply') }}
      </button>
    </form>
  </BubbleMenu>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/vue-3';
import { useI18n } from '../composables/useI18n';
import UiInput from './ui/UiInput.vue';
import type { BubbleMarkButton } from '../text-documents/bubble-menu';

defineProps<{
  editor: Editor;
  shouldShow: (args: { state: unknown; from: number; to: number }) => boolean;
  tippyOptions: Record<string, unknown>;
  updateDelay?: number;
  linkEditorOpen: boolean;
  linkInput: string;
  markButtons: Array<BubbleMarkButton & { label: string }>;
  linkIcon: string;
  unlinkIcon: string;
}>();

const emit = defineEmits<{
  'apply-mark': [mark: string];
  'open-link-editor': [];
  'remove-link': [];
  'apply-link': [];
  'close-link-editor': [];
  'update:linkInput': [value: string];
}>();

const { t } = useI18n();
</script>
