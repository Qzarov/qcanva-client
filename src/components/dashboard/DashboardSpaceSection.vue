<template>
  <section class="dashboard-folder-content" data-dashboard-view="space">
    <DashboardSpace
      ref="spaceView"
      :space-id="spaceId"
      :view-mode="viewMode"
      :query="query"
      :me-id="meId"
      :folder-options="folderOptions"
      @update:view-mode="emit('update:view-mode', $event)"
      @open="(kind, id) => emit('open', kind, id)"
      @open-media="(items, start) => emit('open-media', items, start)"
      @gone="emit('gone')"
      @feedback="(type, message) => emit('feedback', type, message)"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DashboardSpace from './DashboardSpace.vue';
import type { MediaViewerItem } from './DashboardMediaViewer.vue';

type ViewMode = 'grid' | 'list';

defineProps<{
  spaceId: string;
  viewMode: ViewMode;
  query: string;
  meId: string;
  folderOptions: ReadonlyArray<{ id: string; name: string; depth: number; path: string }>;
}>();
const emit = defineEmits<{
  'update:view-mode': [mode: ViewMode];
  open: [kind: string, id: string];
  'open-media': [items: MediaViewerItem[], start: number];
  gone: [];
  feedback: [type: 'success' | 'error', message: string];
}>();

const spaceView = ref<InstanceType<typeof DashboardSpace> | null>(null);
defineExpose({ startAdd: (event?: Event) => spaceView.value?.startAdd(event) });
</script>
