<template>
  <section class="dashboard-folder-content" data-dashboard-view="yandex">
    <DashboardYandexDisk
      ref="yandexView"
      :path="path"
      :query="query"
      :sort-mode="sortMode"
      :view-mode="viewMode"
      :refresh-key="refreshKey"
      :selected-keys="selectedKeys"
      @navigate="emit('navigate', $event)"
      @update:view-mode="emit('update:view-mode', $event)"
      @toggle-select="emit('toggle-select', $event)"
      @items="emit('items', $event)"
      @upload="(files, uploadPath) => emit('upload', files, uploadPath)"
      @move="emit('move', $event)"
      @changed="emit('changed')"
      @feedback="(type, message) => emit('feedback', type, message)"
      @open-image="emit('open-image', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DashboardYandexDisk from './DashboardYandexDisk.vue';
import type { YandexItem } from '../../api/yandexDisk';

type SortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
type ViewMode = 'grid' | 'list';

defineProps<{
  path: string;
  query: string;
  sortMode: SortMode;
  viewMode: ViewMode;
  refreshKey: number;
  selectedKeys: readonly string[];
}>();
const emit = defineEmits<{
  navigate: [path: string];
  'update:view-mode': [mode: ViewMode];
  'toggle-select': [key: string];
  items: [items: YandexItem[]];
  upload: [files: File[], path: string];
  move: [paths: string[]];
  changed: [];
  feedback: [type: 'success' | 'error', message: string];
  'open-image': [file: YandexItem];
}>();

const yandexView = ref<InstanceType<typeof DashboardYandexDisk> | null>(null);
defineExpose({ pickFiles: () => yandexView.value?.pickFiles() });
</script>
