<template>
  <input ref="canvasInput" type="file" accept=".canvas,.json" tabindex="-1" aria-hidden="true" hidden @change="onCanvasChange" />
  <input ref="imageInput" type="file" accept="image/*" tabindex="-1" aria-hidden="true" hidden @change="onImageChange" />
  <input ref="portraitInput" type="file" accept="image/*" tabindex="-1" aria-hidden="true" hidden @change="onPortraitChange" />
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  'canvas-selected': [file: File];
  'image-selected': [file: File];
  'portrait-selected': [file: File];
}>();

const canvasInput = ref<HTMLInputElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const portraitInput = ref<HTMLInputElement | null>(null);

const selectedFile = (input: HTMLInputElement): File | null => {
  const file = input.files?.[0] ?? null;
  input.value = '';
  return file;
};

const onCanvasChange = () => {
  const file = canvasInput.value && selectedFile(canvasInput.value);
  if (file) emit('canvas-selected', file);
};

const onImageChange = () => {
  const file = imageInput.value && selectedFile(imageInput.value);
  if (file) emit('image-selected', file);
};

const onPortraitChange = () => {
  const file = portraitInput.value && selectedFile(portraitInput.value);
  if (file) emit('portrait-selected', file);
};

const openCanvas = () => canvasInput.value?.click();
const openImage = () => imageInput.value?.click();
const openPortrait = () => portraitInput.value?.click();

defineExpose({ openCanvas, openImage, openPortrait });
</script>
