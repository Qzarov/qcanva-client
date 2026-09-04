<template>
  <div
    v-if="mobileOpen"
    class="dashboard-sidebar-backdrop"
    data-sidebar-backdrop
    aria-hidden="true"
    @click="emit('close-mobile')"
  ></div>

  <aside
    ref="sidebarRef"
    class="dashboard-sidebar"
    :class="{ collapsed: widthState === 'collapsed', 'mobile-open': mobileOpen }"
    :aria-label="t('dashboard')"
    :role="mobileOpen ? 'dialog' : undefined"
    :aria-modal="mobileOpen ? 'true' : undefined"
    @keydown.esc.stop="emit('close-mobile')"
    @keydown.tab="trapMobileFocus"
  >
    <header class="dashboard-sidebar-header">
      <span class="dashboard-sidebar-brand">
        <img src="/qcanva-logo.png" alt="QCanva" />
      </span>
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
        <X :size="18" aria-hidden="true" />
      </button>
    </header>

    <div class="dashboard-sidebar-scroll">
      <nav class="dashboard-sidebar-navigation" :aria-label="t('dashboard')">
        <button
          type="button"
          class="btn-ghost dashboard-sidebar-item dashboard-sidebar-home-disclosure"
          :class="{ active: homeGroupActive }"
          :aria-expanded="homeExpanded"
          :aria-controls="homeChildrenId"
          :aria-label="t('home')"
          :title="compactPresentation ? t('home') : undefined"
          data-home-disclosure
          @click="homeExpanded = !homeExpanded"
        >
          <span class="dashboard-sidebar-icon" aria-hidden="true"><House :size="18" /></span>
          <span class="dashboard-sidebar-label">{{ t('home') }}</span>
          <ChevronDown
            class="dashboard-sidebar-home-chevron"
            :class="{ collapsed: !homeExpanded }"
            :size="16"
            aria-hidden="true"
          />
        </button>

        <div v-if="homeExpanded" :id="homeChildrenId" class="dashboard-sidebar-home-children" data-home-children>
          <button
            type="button"
            class="btn-ghost dashboard-sidebar-item dashboard-sidebar-recent"
            :class="{ active: activeSection.kind === 'recent' }"
            :aria-current="activeSection.kind === 'recent' ? 'page' : undefined"
            :aria-label="t('recents')"
            :title="compactPresentation ? t('recents') : undefined"
            data-dashboard-section="recent"
            @click="emit('select', { kind: 'recent' })"
          >
            <span class="dashboard-sidebar-icon" aria-hidden="true"><Clock3 :size="18" /></span>
            <span class="dashboard-sidebar-label">{{ t('recents') }}</span>
          </button>

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
                <Plus :size="17" aria-hidden="true" />
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
                  <ChevronDown :class="{ collapsed: !folder.expanded }" :size="16" aria-hidden="true" />
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
                  :title="compactPresentation ? folder.name : undefined"
                  @click="emit('select', { kind: 'folder', folderId: folder.id })"
                  @dragstart.stop="emit('folder-drag-start', $event, folder.id)"
                  @dragend="emit('folder-drag-end', $event, folder.id)"
                  @dragenter.prevent="emit('folder-drag-enter', $event, folder.id)"
                  @dragover.prevent="emit('folder-drag-over', $event, folder.id)"
                  @dragleave="emit('folder-drag-leave', $event, folder.id)"
                  @drop.prevent="emit('folder-drop', $event, folder.id)"
                >
                  <span class="dashboard-sidebar-icon" aria-hidden="true">
                    <FolderCog v-if="folder.technical" :size="18" />
                    <Folder v-else :size="18" />
                  </span>
                  <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ folder.name }}</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <button
          v-for="item in topLevelItems"
          :key="item.kind"
          type="button"
          class="btn-ghost dashboard-sidebar-item"
          :class="{ active: isActive({ kind: item.kind }) }"
          :aria-current="isActive({ kind: item.kind }) ? 'page' : undefined"
          :aria-label="item.label"
          :title="compactPresentation ? item.label : undefined"
          :data-dashboard-section="item.kind"
          @click="emit('select', { kind: item.kind })"
        >
          <span class="dashboard-sidebar-icon" aria-hidden="true"><component :is="item.icon" :size="18" /></span>
          <span class="dashboard-sidebar-label">{{ item.label }}</span>
        </button>
      </nav>

    </div>

    <footer class="dashboard-sidebar-footer">
      <AccountMenu placement="sidebar" :compact="compactPresentation" />
      <button
        type="button"
        class="btn-ghost btn-sm dashboard-sidebar-width-toggle"
        :aria-label="widthToggleLabel"
        :title="widthToggleLabel"
        data-sidebar-width-toggle
        @click="emit('toggle-width')"
      >
        <PanelLeftOpen v-if="widthState === 'collapsed'" :size="18" aria-hidden="true" />
        <PanelLeftClose v-else :size="18" aria-hidden="true" />
        <span class="dashboard-sidebar-label">{{ widthToggleLabel }}</span>
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { ChevronDown, Clock3, Folder, FolderCog, Globe2, House, PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Plus, Users, X } from '@lucide/vue';
import { computed, ref, watch, type CSSProperties, type Component } from 'vue';
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
const homeChildrenId = 'dashboard-sidebar-home-children';
const sidebarRef = ref<HTMLElement | null>(null);
const homeExpanded = ref(props.activeSection.kind === 'folder');
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const isVisibleFocusable = (element: HTMLElement, boundary: HTMLElement) => {
  if (element.tabIndex < 0 || element.getAttribute('aria-hidden') === 'true') return false;
  let current: HTMLElement | null = element;
  while (current && current !== boundary) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
};

const topLevelItems = computed<Array<{
  kind: DashboardTopLevelSection;
  label: string;
  icon: Component;
}>>(() => [
  { kind: 'shared', label: t('sharedWithMe'), icon: Users },
  { kind: 'interactive', label: t('interactiveTemplate'), icon: PanelsTopLeft },
  { kind: 'public', label: t('public'), icon: Globe2 },
]);

const widthToggleLabel = computed(() => (
  props.widthState === 'collapsed' ? t('expandSidebar') : t('collapseSidebar')
));
const compactPresentation = computed(() => (
  props.widthState === 'collapsed' && !props.mobileOpen
));
const homeGroupActive = computed(() => (
  props.activeSection.kind === 'home'
  || props.activeSection.kind === 'recent'
  || props.activeSection.kind === 'folder'
));

watch(() => props.activeSection, (section) => {
  if (section.kind === 'folder') homeExpanded.value = true;
});

const isActive = (section: DashboardSection) => (
  isDashboardSectionActive(props.activeSection, section)
);

const folderIndent = (depth: number): CSSProperties => ({
  '--folder-depth': Math.max(0, depth),
} as CSSProperties);

const trapMobileFocus = (event: KeyboardEvent) => {
  if (!props.mobileOpen) return;
  const sidebar = sidebarRef.value;
  if (!sidebar) return;
  const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => isVisibleFocusable(element, sidebar));
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !sidebar.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !sidebar.contains(active))) {
    event.preventDefault();
    first.focus();
  }
};
</script>
