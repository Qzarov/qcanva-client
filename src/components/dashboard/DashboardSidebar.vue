<template>
  <div
    v-if="mobileOpen"
    class="dashboard-sidebar-backdrop"
    data-sidebar-backdrop
    aria-hidden="true"
    @click="emit('close-mobile')"
  ></div>

  <aside
    class="dashboard-sidebar"
    :class="{ collapsed: widthState === 'collapsed', 'mobile-open': mobileOpen }"
    :aria-label="t('dashboard')"
    @keydown.esc.stop="emit('close-mobile')"
  >
    <header class="dashboard-sidebar-header">
      <span class="dashboard-sidebar-brand" aria-hidden="true">Q</span>
      <span class="dashboard-sidebar-label">QCanva</span>
      <LanguageToggle />
      <button
        type="button"
        class="btn-ghost btn-sm dashboard-sidebar-close"
        :aria-label="t('closeNavigation')"
        :title="t('closeNavigation')"
        data-sidebar-close
        @click="emit('close-mobile')"
      >
        <span aria-hidden="true">×</span>
      </button>
    </header>

    <div class="dashboard-sidebar-scroll">
      <nav class="dashboard-sidebar-navigation" :aria-label="t('dashboard')">
        <button
          v-for="item in topLevelItems"
          :key="item.kind"
          type="button"
          class="btn-ghost dashboard-sidebar-item"
          :class="{ active: isActive({ kind: item.kind }) }"
          :aria-current="isActive({ kind: item.kind }) ? 'page' : undefined"
          :aria-label="item.label"
          :title="widthState === 'collapsed' ? item.label : undefined"
          :data-dashboard-section="item.kind"
          @click="emit('select', { kind: item.kind })"
        >
          <span class="dashboard-sidebar-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="dashboard-sidebar-label">{{ item.label }}</span>
        </button>
      </nav>

      <section class="dashboard-sidebar-folders" :aria-labelledby="foldersHeadingId">
        <div class="dashboard-sidebar-section-heading">
          <h2 :id="foldersHeadingId" class="dashboard-sidebar-label">{{ t('folders') }}</h2>
          <button
            type="button"
            class="btn-ghost btn-sm dashboard-sidebar-create-folder"
            :aria-label="t('createFolder')"
            :title="t('createFolder')"
            data-sidebar-create-folder
            @click="emit('create-folder')"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>

        <div class="dashboard-sidebar-folder-list">
          <div
            v-for="folder in folders"
            :key="folder.id"
            class="dashboard-sidebar-folder-row"
            :style="folderIndent(folder.depth)"
          >
            <button
              v-if="folder.hasChildren"
              type="button"
              class="btn-ghost dashboard-sidebar-folder-toggle"
              :aria-label="folder.expanded ? t('collapseSubfolders') : t('expandSubfolders')"
              :aria-expanded="folder.expanded"
              :data-folder-toggle="folder.id"
              @click.stop="emit('toggle-folder', folder.id)"
            >
              <span :class="{ collapsed: !folder.expanded }" aria-hidden="true">▾</span>
            </button>
            <span v-else class="dashboard-sidebar-folder-toggle-spacer" aria-hidden="true"></span>

            <button
              type="button"
              class="btn-ghost dashboard-sidebar-folder"
              :class="{
                active: isActive({ kind: 'folder', folderId: folder.id }),
                'drop-active': folder.dropActive,
                'reorder-target': folder.reorderTarget,
              }"
              :style="folderIndent(folder.depth)"
              :data-dashboard-folder="folder.id"
              :draggable="folder.draggable"
              :aria-current="isActive({ kind: 'folder', folderId: folder.id }) ? 'page' : undefined"
              :aria-label="folder.name"
              :title="widthState === 'collapsed' ? folder.name : undefined"
              @click="emit('select', { kind: 'folder', folderId: folder.id })"
              @dragstart.stop="emit('folder-drag-start', $event, folder.id)"
              @dragend="emit('folder-drag-end', $event, folder.id)"
              @dragenter.prevent="emit('folder-drag-enter', $event, folder.id)"
              @dragover.prevent="emit('folder-drag-over', $event, folder.id)"
              @dragleave="emit('folder-drag-leave', $event, folder.id)"
              @drop.prevent="emit('folder-drop', $event, folder.id)"
            >
              <span class="dashboard-sidebar-icon" aria-hidden="true">{{ folder.technical ? '⚙' : '◇' }}</span>
              <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ folder.name }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <footer class="dashboard-sidebar-footer">
      <AccountMenu placement="sidebar" :compact="widthState === 'collapsed'" />
      <button
        type="button"
        class="btn-ghost btn-sm dashboard-sidebar-width-toggle"
        :aria-label="widthToggleLabel"
        :title="widthToggleLabel"
        data-sidebar-width-toggle
        @click="emit('toggle-width')"
      >
        <span aria-hidden="true">{{ widthState === 'collapsed' ? '›' : '‹' }}</span>
        <span class="dashboard-sidebar-label">{{ widthToggleLabel }}</span>
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import AccountMenu from '../AccountMenu.vue';
import LanguageToggle from '../LanguageToggle.vue';
import { useI18n } from '../../composables/useI18n';
import {
  isDashboardSectionActive,
  type DashboardFolderNavItem,
  type DashboardSection,
  type DashboardTopLevelSection,
  type SidebarWidthState,
} from '../../dashboard/navigation';

const props = defineProps<{
  activeSection: DashboardSection;
  widthState: SidebarWidthState;
  mobileOpen: boolean;
  folders: readonly DashboardFolderNavItem[];
}>();

const emit = defineEmits<{
  select: [section: DashboardSection];
  'toggle-width': [];
  'close-mobile': [];
  'create-folder': [];
  'toggle-folder': [folderId: string];
  'folder-drag-start': [event: DragEvent, folderId: string];
  'folder-drag-end': [event: DragEvent, folderId: string];
  'folder-drag-enter': [event: DragEvent, folderId: string];
  'folder-drag-over': [event: DragEvent, folderId: string];
  'folder-drag-leave': [event: DragEvent, folderId: string];
  'folder-drop': [event: DragEvent, folderId: string];
}>();

const { t } = useI18n();
const foldersHeadingId = 'dashboard-sidebar-folders-heading';

const topLevelItems = computed<Array<{
  kind: DashboardTopLevelSection;
  label: string;
  icon: string;
}>>(() => [
  { kind: 'home', label: t('home'), icon: '⌂' },
  { kind: 'shared', label: t('sharedWithMe'), icon: '↗' },
  { kind: 'interactive', label: t('interactiveTemplate'), icon: '▦' },
  { kind: 'public', label: t('public'), icon: '◎' },
]);

const widthToggleLabel = computed(() => (
  props.widthState === 'collapsed' ? t('expandSidebar') : t('collapseSidebar')
));

const isActive = (section: DashboardSection) => (
  isDashboardSectionActive(props.activeSection, section)
);

const folderIndent = (depth: number): CSSProperties => ({
  '--folder-depth': Math.max(0, depth),
} as CSSProperties);
</script>
