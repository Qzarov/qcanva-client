<template>
  <Transition name="dashboard-download-status">
    <div v-if="downloadPhase !== 'idle'" class="dashboard-download-status" :class="'is-' + downloadPhase" role="status" aria-live="polite" data-download-status>
      <span class="dashboard-download-status-text">{{ transferStatusText }}</span>
      <span class="dashboard-download-status-track" aria-hidden="true"><span class="dashboard-download-status-bar" :style="{ width: transferStatusPercent + '%' }"></span></span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  downloadPhase: 'idle' | 'collect' | 'pack' | 'done' | 'error';
  transferStatusText: string;
  transferStatusPercent: number;
}>();

</script>
