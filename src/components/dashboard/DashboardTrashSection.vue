<template>
  <section class="dashboard-folder-content" data-dashboard-view="trash">
    <DashboardTrash
      @restored="emit('restored', $event)"
      @feedback="(type, message) => emit('feedback', type, message)"
    />
  </section>
</template>

<script setup lang="ts">
import DashboardTrash from './DashboardTrash.vue';
import type { DriveItem } from '../../api/drive';

const emit = defineEmits<{
  restored: [item: DriveItem];
  feedback: [type: 'success' | 'error', message: string];
}>();
</script>
