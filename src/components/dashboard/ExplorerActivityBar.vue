<template>
  <aside
    class="explorer-activity-bar activity-bar"
    :aria-label="t('dashboardSections')"
    data-activity-bar
  >
    <button
      type="button"
      class="act-brand"
      :aria-label="t('home')"
      :title="t('home')"
      data-activity-brand
      @click="onActivityClick('home')"
    >
      Q
    </button>

    <button
      v-for="item in topItems"
      :key="item.id"
      type="button"
      class="act-btn"
      :class="{ active: activeActivity === item.id }"
      :aria-label="item.label"
      :aria-pressed="activeActivity === item.id"
      :title="item.title"
      :data-activity="item.id"
      @click="onActivityClick(item.id)"
    >
      <component :is="item.icon" :size="19" aria-hidden="true" />
    </button>

    <div class="act-spacer" aria-hidden="true"></div>

    <router-link
      to="/drive/devices"
      class="act-btn"
      :aria-label="t('explorerDevicesSync')"
      :title="t('explorerDevicesSync')"
      data-activity="devices"
    >
      <MonitorSmartphone :size="19" aria-hidden="true" />
      <span v-if="devicesOnlineCount > 0" class="act-badge" aria-hidden="true"></span>
    </router-link>

    <router-link
      to="/downloads"
      class="act-btn"
      :aria-label="t('downloadsNavLabel')"
      :title="t('downloadsNavLabel')"
      data-activity="downloads"
      data-sidebar-downloads
    >
      <Download :size="19" aria-hidden="true" />
    </router-link>

    <button
      type="button"
      class="act-btn"
      :class="{ active: activeActivity === 'trash' }"
      :aria-label="t('driveTrash')"
      :aria-pressed="activeActivity === 'trash'"
      :title="t('driveTrash')"
      data-activity="trash"
      data-dashboard-section="trash"
      @click="onActivityClick('trash')"
    >
      <Trash2 :size="19" aria-hidden="true" />
    </button>

    <router-link
      v-if="admin"
      to="/admin"
      class="act-btn"
      :aria-label="t('admin')"
      :title="t('admin')"
      data-activity="admin"
      data-sidebar-admin
    >
      <ShieldCheck :size="19" aria-hidden="true" />
    </router-link>
  </aside>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  Download,
  FolderTree,
  House,
  Images,
  MonitorSmartphone,
  Search,
  ShieldCheck,
  Trash2,
} from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

export type ExplorerActivityId = 'home' | 'explorer' | 'search' | 'gallery' | 'trash';

const props = withDefaults(defineProps<{
  activeActivity: ExplorerActivityId;
  sidebarCollapsed?: boolean;
  admin?: boolean;
  devicesOnlineCount?: number;
}>(), {
  sidebarCollapsed: false,
  admin: false,
  devicesOnlineCount: 0,
});

const emit = defineEmits<{
  'select-activity': [activity: ExplorerActivityId];
  'toggle-collapse': [];
}>();

const { t } = useI18n();

const topItems = computed<Array<{
  id: Exclude<ExplorerActivityId, 'trash'>;
  label: string;
  title: string;
  icon: Component;
}>>(() => [
  { id: 'home', label: t('home'), title: t('home'), icon: House },
  { id: 'explorer', label: t('explorerTitle'), title: t('explorerTitle'), icon: FolderTree },
  { id: 'search', label: t('explorerSearchTitle'), title: `${t('explorerSearchTitle')} (Ctrl+K)`, icon: Search },
  { id: 'gallery', label: t('explorerGalleryTitle'), title: t('explorerGalleryTitle'), icon: Images },
]);

function onActivityClick(id: ExplorerActivityId) {
  if (props.activeActivity === id) {
    emit('toggle-collapse');
    return;
  }
  emit('select-activity', id);
}
</script>
