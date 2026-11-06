<template>
  <!-- Spaces: where files live. Q Space is ours; Yandex Disk is the user's
       own, connected through Yandex ID. More will come. Folds like Home. -->
  <div class="dashboard-sidebar-home-row dashboard-sidebar-spaces-row">
    <button
      type="button"
      class="btn-ghost dashboard-sidebar-item dashboard-sidebar-home"
      :aria-expanded="expanded"
      :aria-controls="childrenId"
      :aria-label="t('spaces')"
      :title="compact ? t('spaces') : undefined"
      data-sidebar-spaces
      @click="toggleExpanded"
    >
      <span class="dashboard-sidebar-icon" aria-hidden="true"><Layers :size="18" /></span>
      <span class="dashboard-sidebar-label">{{ t('spaces') }}</span>
    </button>
    <button
      type="button"
      class="dashboard-sidebar-home-disclosure"
      :aria-expanded="expanded"
      :aria-controls="childrenId"
      :aria-label="expanded ? t('hideSpaces') : t('showSpaces')"
      :title="expanded ? t('hideSpaces') : t('showSpaces')"
      data-sidebar-spaces-disclosure
      @click="toggleExpanded"
    >
      <ChevronDown class="dashboard-sidebar-home-chevron" :class="{ collapsed: !expanded }" :size="16" aria-hidden="true" />
    </button>
  </div>

  <Transition :css="false" @enter="heightTransitionHooks.onEnter" @leave="heightTransitionHooks.onLeave">
    <div v-if="expanded" :id="childrenId" class="dashboard-sidebar-home-children" data-sidebar-spaces-children>
      <section class="dashboard-sidebar-folders" :aria-label="t('spaces')">
        <TransitionGroup
          tag="div"
          class="dashboard-sidebar-folder-list"
          :css="false"
          @enter="heightTransitionHooks.onEnter"
          @leave="heightTransitionHooks.onLeave"
        >
          <div key="space:q" class="dashboard-sidebar-folder-row" :style="indent(0)">
            <span class="dashboard-sidebar-folder-toggle-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="btn-ghost dashboard-sidebar-folder"
              :aria-label="t('qSpace')"
              :title="compact ? t('qSpace') : undefined"
              data-space="q"
              @click="emit('select', { kind: 'drive' })"
            >
              <span class="dashboard-sidebar-icon" aria-hidden="true"><HardDrive :size="18" /></span>
              <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ t('qSpace') }}</span>
            </button>
          </div>

          <div v-if="status?.enabled" key="space:yandex" class="dashboard-sidebar-folder-row" :style="indent(0)">
            <button
              v-if="status.connected"
              type="button"
              class="btn-ghost dashboard-sidebar-folder-toggle"
              :aria-label="isOpen('/') ? t('collapseSubfolders') : t('expandSubfolders')"
              :aria-expanded="isOpen('/')"
              data-yandex-toggle="/"
              @click.stop="toggle('/')"
            >
              <ChevronDown :class="{ collapsed: !isOpen('/') }" :size="16" aria-hidden="true" />
            </button>
            <span v-else class="dashboard-sidebar-folder-toggle-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="btn-ghost dashboard-sidebar-folder"
              :class="{ active: isActiveYandex('/') }"
              :aria-current="isActiveYandex('/') ? 'page' : undefined"
              :aria-label="t('yandexDisk')"
              :title="compact ? t('yandexDisk') : undefined"
              data-space="yandex"
              @click="emit('select', { kind: 'yandex', path: '/' })"
            >
              <span class="dashboard-sidebar-icon" aria-hidden="true"><Cloud :size="18" /></span>
              <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ t('yandexDisk') }}</span>
            </button>
          </div>

          <div
            v-for="row in yandexRows"
            :key="row.key"
            class="dashboard-sidebar-folder-row"
            :class="{ 'dashboard-sidebar-file-row': row.kind === 'file', 'dashboard-sidebar-more-row': row.kind === 'more' }"
            :style="indent(row.depth)"
          >
            <template v-if="row.kind === 'dir'">
              <button
                type="button"
                class="btn-ghost dashboard-sidebar-folder-toggle"
                :aria-label="isOpen(row.path) ? t('collapseSubfolders') : t('expandSubfolders')"
                :aria-expanded="isOpen(row.path)"
                :data-yandex-toggle="row.path"
                @click.stop="toggle(row.path)"
              >
                <ChevronDown :class="{ collapsed: !isOpen(row.path) }" :size="16" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="btn-ghost dashboard-sidebar-folder"
                :class="{ active: isActiveYandex(row.path) }"
                :aria-current="isActiveYandex(row.path) ? 'page' : undefined"
                :aria-label="row.name"
                :title="compact ? row.name : undefined"
                :data-yandex-folder="row.path"
                @click="emit('select', { kind: 'yandex', path: row.path })"
              >
                <span class="dashboard-sidebar-icon" aria-hidden="true"><Folder :size="18" /></span>
                <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ row.name }}</span>
              </button>
            </template>
            <template v-else-if="row.kind === 'file'">
              <span class="dashboard-sidebar-folder-toggle-spacer" aria-hidden="true"></span>
              <button
                type="button"
                class="btn-ghost dashboard-sidebar-folder dashboard-sidebar-file"
                :aria-label="row.name"
                :title="row.name"
                :data-yandex-file="row.path"
                @click="emit('open-yandex-file', row.item)"
              >
                <span class="dashboard-sidebar-icon" aria-hidden="true">
                  <Video v-if="row.item.mediaType === 'video'" :size="16" />
                  <ImageIcon v-else-if="row.item.mediaType === 'image'" :size="16" />
                  <FileIcon v-else :size="16" />
                </span>
                <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ row.name }}</span>
              </button>
            </template>
            <template v-else>
              <span class="dashboard-sidebar-folder-toggle-spacer" aria-hidden="true"></span>
              <button
                type="button"
                class="btn-ghost dashboard-sidebar-folder dashboard-sidebar-more"
                :data-yandex-more="row.path"
                :title="t('sidebarMoreItemsTitle')"
                @click="emit('select', { kind: 'yandex', path: row.path })"
              >
                <span class="dashboard-sidebar-label dashboard-sidebar-folder-name">{{ t('sidebarMoreItems').replace('{n}', String(row.count)) }}</span>
              </button>
            </template>
          </div>
        </TransitionGroup>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import { ChevronDown, Cloud, File as FileIcon, Folder, HardDrive, Image as ImageIcon, Layers, Video } from '@lucide/vue';
import { yandexDisk, type YandexItem } from '../../api/yandexDisk';
import { heightTransitionHooks } from '../../dashboard/motion';
import { SIDEBAR_FOLDER_CHILD_LIMIT, type DashboardSection } from '../../dashboard/navigation';
import { useI18n } from '../../composables/useI18n';
import { useYandexDisk } from '../../composables/useYandexDisk';

const props = defineProps<{
  activeSection: DashboardSection;
  compact?: boolean;
  /** Bumped by the dashboard after it changed the Yandex Disk: opened folders read again. */
  yandexRefreshKey?: number;
}>();
const emit = defineEmits<{
  select: [section: DashboardSection];
  'open-yandex-file': [item: YandexItem];
}>();

const { t } = useI18n();
const { status, load: loadStatus, noteError } = useYandexDisk();
const childrenId = 'dashboard-sidebar-spaces-children';
const STORAGE_KEY = 'qcanva:sidebar-spaces:v1';

const readExpanded = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'collapsed';
  } catch {
    return true;
  }
};
const expanded = ref(readExpanded() || props.activeSection.kind === 'yandex');
const toggleExpanded = () => {
  expanded.value = !expanded.value;
  try {
    localStorage.setItem(STORAGE_KEY, expanded.value ? 'expanded' : 'collapsed');
  } catch { /* private mode: just not remembered */ }
};

const indent = (depth: number): CSSProperties => ({ '--folder-depth': Math.max(0, depth) } as CSSProperties);
const isActiveYandex = (path: string) => props.activeSection.kind === 'yandex' && props.activeSection.path === path;

// ----- the Yandex tree: opened folders and what they hold, read on opening
type Node = { items: YandexItem[] | null; total: number; loading: boolean };
const nodes = reactive<Record<string, Node>>({});
const open = ref<string[]>([]);
const isOpen = (path: string) => open.value.includes(path);

async function read(path: string) {
  const node = (nodes[path] ??= { items: null, total: 0, loading: false });
  node.loading = true;
  try {
    const listing = await yandexDisk.list(path, { limit: SIDEBAR_FOLDER_CHILD_LIMIT + 1, sort: 'name' });
    // Folders first, as the Disk shows them.
    node.items = [...listing.items].sort((a, b) => Number(b.type === 'dir') - Number(a.type === 'dir'));
    node.total = listing.total;
  } catch (error) {
    noteError(error);
    node.items = [];
    node.total = 0;
  } finally {
    node.loading = false;
  }
}

async function toggle(path: string) {
  if (isOpen(path)) {
    open.value = open.value.filter((p) => p !== path && !p.startsWith(path === '/' ? '/' : `${path}/`));
    return;
  }
  if (!nodes[path]?.items) await read(path);
  open.value = [...open.value, path];
}

type Row =
  | { kind: 'dir'; key: string; path: string; name: string; depth: number }
  | { kind: 'file'; key: string; path: string; name: string; depth: number; item: YandexItem }
  | { kind: 'more'; key: string; path: string; count: number; depth: number };

const yandexRows = computed<Row[]>(() => {
  if (!status.value?.connected) return [];
  const rows: Row[] = [];
  const walk = (path: string, depth: number) => {
    if (!isOpen(path)) return;
    const node = nodes[path];
    if (!node?.items) return;
    const shown = node.items.slice(0, SIDEBAR_FOLDER_CHILD_LIMIT);
    for (const item of shown) {
      if (item.type === 'dir') {
        rows.push({ kind: 'dir', key: `y:${item.path}`, path: item.path, name: item.name, depth });
        walk(item.path, depth + 1);
      } else {
        rows.push({ kind: 'file', key: `y:${item.path}`, path: item.path, name: item.name, depth, item });
      }
    }
    const hidden = node.total - shown.length;
    if (hidden > 0) rows.push({ kind: 'more', key: `y:${path}/more`, path, count: hidden, depth });
  };
  walk('/', 1);
  return rows;
});

watch(() => props.yandexRefreshKey, () => {
  for (const path of open.value) void read(path);
});
watch(() => props.activeSection.kind, (kind) => {
  if (kind === 'yandex' && !expanded.value) expanded.value = true;
});
// Disconnected: forget what was read with the old account.
watch(() => status.value?.connected, (connected) => {
  if (connected) return;
  open.value = [];
  for (const key of Object.keys(nodes)) delete nodes[key];
});

onMounted(() => { void loadStatus(); });
</script>
