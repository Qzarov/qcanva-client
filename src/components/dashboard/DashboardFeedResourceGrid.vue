<template>
  <template v-for="item in items" :key="`${scope}-${item.type}-${item.id}`">
    <div
      v-if="item.type === 'canvas'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
      :data-selected="isSelected(item) || undefined"
      :draggable="isLoggedIn || undefined"
      class="canvas-card"
      :class="{ 'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes(selectionKey(item))) }"
      @click="emit('open-canvas', item.slug || item.id)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item)"
      @dragstart="onDragStart($event, item)"
      @drag="onDragMove"
      @dragend="onDragEnd"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <ResourceIcon kind="canvas" data-resource-icon="canvas" :aria-label="t('canvas')" />
        <span class="card-title-text">{{ item.title || t('untitled') }}</span>
        <span v-if="scope === 'shared' || item.allowPublicEdit" class="badge card-title-badge" :class="scope === 'shared' ? 'badge-shared' : 'badge-public'">{{ scope === 'shared' ? item.role : t('publicEditShort') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" :title="t('groupActions')" :disabled="isBusy">⋯</button>
      <DashboardResourceMenu
        v-if="openMenuCanvasId === menuId(item)"
        :actions="resourceActions(item, scope)"
        :disabled="isBusy"
        :menu-id="menuId(item)"
        :menu-style="cardMenuStyle"
        @select="emit('select-action', item, $event)"
      />
    </div>

    <article
      v-else-if="item.type === 'html-document'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
      :data-selected="isSelected(item) || undefined"
      :draggable="isLoggedIn || undefined"
      class="canvas-card html-doc-card"
      :class="{ 'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes(selectionKey(item))) }"
      @click="emit('open-html', item.slug || item.id)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item)"
      @dragstart="onDragStart($event, item)"
      @drag="onDragMove"
      @dragend="onDragEnd"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <ResourceIcon kind="html-document" data-resource-icon="html-document" :aria-label="t('htmlDocument')" />
        <span class="card-title-text">{{ item.title || t('untitledHtml') }}</span>
        <span v-if="scope === 'shared'" class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" :title="t('groupActions')" :disabled="isBusy">⋯</button>
      <DashboardResourceMenu
        v-if="openMenuCanvasId === menuId(item)"
        :actions="resourceActions(item, scope)"
        :disabled="isBusy"
        :menu-id="menuId(item)"
        :menu-style="cardMenuStyle"
        @select="emit('select-action', item, $event)"
      />
    </article>

    <article
      v-else
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
      :data-selected="isSelected(item) || undefined"
      :draggable="isLoggedIn || undefined"
      class="canvas-card html-doc-card"
      :class="{ 'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes(selectionKey(item))) }"
      @click="emit('open-text', item.slug || item.id)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item)"
      @dragstart="onDragStart($event, item)"
      @drag="onDragMove"
      @dragend="onDragEnd"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <ResourceIcon kind="text-document" data-resource-icon="text-document" :aria-label="t('document')" />
        <span class="card-title-text">{{ item.title || t('untitledDocument') }}</span>
        <span v-if="scope === 'shared'" class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" :title="t('groupActions')" :disabled="isBusy">⋯</button>
      <DashboardResourceMenu
        v-if="openMenuCanvasId === menuId(item)"
        :actions="resourceActions(item, scope)"
        :disabled="isBusy"
        :menu-id="menuId(item)"
        :menu-style="cardMenuStyle"
        @select="emit('select-action', item, $event)"
      />
    </article>
  </template>
</template>

<script setup lang="ts">
import { Folder } from '@lucide/vue';
import { useExplorerGroupDnd, type GroupDragEntry } from '../../composables/useExplorerGroupDnd';
import { useI18n } from '../../composables/useI18n';
import DashboardResourceMenu from './DashboardResourceMenu.vue';
import ResourceThumb from './ResourceThumb.vue';
import ResourceIcon from '../ResourceIcon.vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

type FeedResourceItem = any;

const props = defineProps<{
  items: FeedResourceItem[];
  scope: 'shared' | 'public';
  isLoggedIn: boolean;
  isBusy: boolean;
  openMenuCanvasId: string;
  cardMenuStyle: Record<string, string> | null;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  cardFolderPath: (item: any) => string;
  formatDate: (value: string) => string;
  resourceActions: (item: any, scope: 'shared' | 'public') => DashboardResourceActionItem[];
}>();

const emit = defineEmits<{
  'open-canvas': [id: string];
  'open-html': [id: string];
  'open-text': [id: string];
  'toggle-selected': [key: string];
  'toggle-menu': [id: string, event: Event];
  'select-action': [item: any, action: DashboardResourceAction];
  'contextmenu': [event: MouseEvent, item: FeedResourceItem];
}>();

const { t } = useI18n();
const dnd = useExplorerGroupDnd();
const menuId = (item: any) => `${props.scope}:${item.type}:${item.id}`;

function toDragEntry(item: FeedResourceItem): GroupDragEntry {
  return {
    key: props.selectionKey(item),
    id: item.id,
    kind: item.type,
    name: item.title || t('untitled'),
    folderId: item.folderId ?? null,
  };
}

function onDragStart(event: DragEvent, item: FeedResourceItem): void {
  if (!props.isLoggedIn) return;
  const dragged = props.isSelected(item)
    ? props.items.filter((candidate) => props.isSelected(candidate))
    : [item];
  dnd.startGroupDrag({
    source: 'explorer',
    items: (dragged.length ? dragged : [item]).map(toDragEntry),
  }, event);
}

function onDragMove(event: DragEvent): void {
  if (event.clientX || event.clientY) {
    dnd.updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onDragEnd(): void {
  dnd.endGroupDrag();
}
</script>
