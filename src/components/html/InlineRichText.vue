<template>
  <div class="inline-rich-text">
    <div class="inline-rich-toolbar">
      <button type="button" @mousedown.prevent="exec('bold')">B</button>
      <button type="button" @mousedown.prevent="exec('italic')">I</button>
      <button type="button" @mousedown.prevent="promptLink">Link</button>
    </div>
    <div
      class="inline-rich-surface"
      contenteditable="true"
      v-html="modelValue"
      @input="onInput"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeInlineHtml } from '../../html/visualHtml';

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

function exec(command: 'bold' | 'italic') {
  document.execCommand(command);
}

function promptLink() {
  const href = window.prompt('Link URL');
  if (!href) return;
  document.execCommand('createLink', false, href);
}

function onInput(event: Event) {
  const raw = (event.target as HTMLElement).innerHTML;
  emit('update:modelValue', sanitizeInlineHtml(raw));
}
</script>
