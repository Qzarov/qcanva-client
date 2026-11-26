<template>
  <div class="inline-rich-text">
    <div class="inline-rich-toolbar">
      <button type="button" @mousedown.prevent="exec('bold')">B</button>
      <button type="button" @mousedown.prevent="exec('italic')">I</button>
      <button type="button" @mousedown.prevent="promptLink">Link</button>
    </div>
    <div
      ref="surfaceRef"
      class="inline-rich-surface"
      contenteditable="true"
      @input="onInput"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { promptText } from '../../composables/appDialog';
import { sanitizeInlineHtml } from '../../html/visualHtml';
import { safeHref } from '../../utils/safeUrl';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const surfaceRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (surfaceRef.value) {
    surfaceRef.value.innerHTML = sanitizeInlineHtml(props.modelValue || '');
  }
});

watch(() => props.modelValue, (value) => {
  const el = surfaceRef.value;
  if (!el || el === document.activeElement) return;
  el.innerHTML = sanitizeInlineHtml(value || '');
});

function exec(command: 'bold' | 'italic') {
  document.execCommand(command);
}

async function promptLink() {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const rawHref = await promptText('linkUrlTitle', 'linkUrlConfirm');
  if (!rawHref) return;
  const href = safeHref(rawHref);
  if (!href) return;
  // The dialog had the focus: wait for it to go, then put the selection back.
  await nextTick();
  surfaceRef.value?.focus();
  if (range) {
    const current = window.getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
  }
  document.execCommand('createLink', false, href);
}

function onInput(event: Event) {
  const raw = (event.target as HTMLElement).innerHTML;
  emit('update:modelValue', sanitizeInlineHtml(raw));
}
</script>
