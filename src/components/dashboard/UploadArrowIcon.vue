<template>
  <!-- Lucide's "upload", drawn here so the arrow can hop over a still tray
       while files go up (style.css: .upload-arrow-icon.is-hopping). -->
  <svg
    class="upload-arrow-icon"
    :class="{ 'is-hopping': hopping }"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g class="upload-arrow-icon-arrow" data-upload-arrow>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
    </g>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ hopping?: boolean; size?: number }>(), { hopping: false, size: 16 });
</script>
