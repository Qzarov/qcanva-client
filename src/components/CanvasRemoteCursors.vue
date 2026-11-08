<template>
  <div
    v-for="cursor in cursors"
    :key="'cursor-' + cursor.socketId"
    class="remote-cursor"
    :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
  >
    <svg width="16" height="20" viewBox="0 0 16 20" :fill="cursor.color">
      <path d="M0 0 L16 12 L8 12 L4 20 Z"/>
    </svg>
    <span class="remote-cursor-name" :style="{ background: cursor.color }">{{ cursor.userName }}</span>
  </div>
</template>

<script setup lang="ts">
type RemoteCursor = { socketId: string; userId: string; userName: string; x: number; y: number; color: string };
defineProps<{ cursors: readonly RemoteCursor[] }>();
</script>
