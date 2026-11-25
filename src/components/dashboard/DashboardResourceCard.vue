<template>
  <component
    :is="cardTag"
    :data-select-key="selectable ? selectKey : undefined"
    :data-selected="selectable ? selected || undefined : undefined"
    :class="cardClasses"
    :data-folder-resource="folderResource"
    :draggable="isDraggable"
    @click="emit('open')"
    @dragstart="onDragStart"
    @drag="onDragMove"
    @dragend="onDragEnd"
  >
    <ResourceThumb :kind="kind" :id="resource.id" :version="resource.updatedAt" />
    <a
      v-if="openHref"
      class="card-open-link"
      :href="openHref"
      :aria-label="openLabel"
      @click.stop="emit('open-link')"
    ></a>
    <div class="card-title card-title-with-icon" @dblclick.stop="renameable && emit('rename')">
      <span
        v-if="selectable"
        class="card-select"
        data-select-box
        role="checkbox"
        tabindex="0"
        :aria-checked="selected"
        :aria-label="selectLabel"
        @keydown.enter.prevent.stop="emit('toggle-select')"
        @keydown.space.prevent.stop="emit('toggle-select')"
      >
        <Check :size="12" aria-hidden="true" />
      </span>
      <slot name="icon">
        <ResourceIcon :kind="kind" :template-type="resource.templateType" :data-resource-icon="kind" :aria-label="iconLabel" />
      </slot>
      <slot name="title">
        <span class="card-title-text">{{ resource.title || titleFallback }}</span>
      </slot>
      <span v-if="badgeText" class="badge card-title-badge" :class="badgeClass">{{ badgeText }}</span>
    </div>
    <div class="card-meta">
      <div v-if="showTags && resource.tags?.length" class="card-tags">
        <span
          v-for="tag in resource.tags"
          :key="tag.name"
          class="card-tag color-tag"
          :style="{ '--tag-color': tag.color }"
        >#{{ tag.name }}</span>
      </div>
      <span v-if="folderPath" class="card-folder" data-card-folder :title="folderPath">{{ folderPath }}</span>
      <span class="card-date">{{ dateLabel }}</span>
    </div>
    <div class="card-meta-mobile">
      <span class="card-date">{{ mobileDateLabel }}</span>
    </div>
    <button
      v-if="showPin"
      class="card-pin"
      :class="{ active: resource.pinned }"
      :title="pinTitle"
      :disabled="busy"
      @click.stop="emit('toggle-pin')"
    >{{ resource.pinned ? '★' : '☆' }}</button>
    <button
      class="card-manage"
      :data-menu-trigger="menuId"
      :disabled="busy"
      :title="menuTitle"
      @click.stop="emit('toggle-menu', $event)"
    >⋯</button>
    <DashboardResourceMenu
      v-if="menuOpen"
      :actions="actions"
      :disabled="busy"
      :menu-id="menuId"
      :menu-style="menuStyle"
      @select="emit('select-action', $event)"
    />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
import DashboardResourceMenu from './DashboardResourceMenu.vue';
import { useExplorerGroupDnd, type GroupDragEntry } from '../../composables/useExplorerGroupDnd';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

type ResourceTag = { name: string; color: string };
type CardResource = {
  id: string;
  title?: string | null;
  updatedAt?: string | null;
  role?: string | null;
  pinned?: boolean;
  tags?: ResourceTag[];
  templateType?: string | null;
  folderId?: string | null;
};

const props = withDefaults(defineProps<{
  resource: CardResource;
  kind: string;
  titleFallback: string;
  iconLabel: string;
  selectLabel: string;
  dateLabel: string;
  mobileDateLabel: string;
  selectKey?: string;
  selected?: boolean;
  selectable?: boolean;
  selectedKeys?: readonly string[];
  busy?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  renaming?: boolean;
  renameable?: boolean;
  cardTag?: 'article' | 'div';
  folderResource?: string;
  folderPath?: string | null;
  openHref?: string;
  openLabel?: string;
  badgeText?: string | null;
  badgeClass?: string;
  showTags?: boolean;
  showPin?: boolean;
  pinTitle?: string;
  menuTitle?: string;
  menuId: string;
  menuOpen?: boolean;
  menuStyle?: Record<string, string> | null;
  actions?: DashboardResourceActionItem[];
}>(), {
  selectKey: undefined,
  selected: false,
  selectable: false,
  selectedKeys: undefined,
  busy: false,
  dragging: false,
  draggable: false,
  renaming: false,
  renameable: false,
  cardTag: 'article',
  folderResource: undefined,
  folderPath: null,
  openHref: undefined,
  openLabel: undefined,
  badgeText: null,
  badgeClass: 'badge-shared',
  showTags: true,
  showPin: false,
  pinTitle: '',
  menuTitle: 'Actions',
  menuOpen: false,
  menuStyle: null,
  actions: () => [],
});

const emit = defineEmits<{
  open: [];
  'open-link': [];
  rename: [];
  'toggle-select': [];
  'toggle-pin': [];
  'toggle-menu': [event: Event];
  'select-action': [action: DashboardResourceAction];
}>();

const dnd = useExplorerGroupDnd();
const cardKey = computed(() => props.selectKey || `${props.kind}:${props.resource.id}`);
const isDraggable = computed(() => (props.draggable || props.selectable) && !props.renaming);

function parseSelectedKeyEntry(key: string): GroupDragEntry {
  const sep = key.indexOf(':');
  if (sep > 0) {
    return {
      key,
      id: key.slice(sep + 1),
      kind: key.slice(0, sep),
    };
  }
  return { key, id: key, kind: props.kind };
}

function onDragStart(event: DragEvent): void {
  if (!isDraggable.value) return;
  if ((event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return;
  const key = cardKey.value;
  const selfEntry: GroupDragEntry = {
    key,
    id: props.resource.id,
    kind: props.kind,
    name: props.resource.title ?? undefined,
    folderId: props.resource.folderId ?? null,
  };
  const items: GroupDragEntry[] = props.selectedKeys?.includes(key) && props.selectedKeys.length > 1
    ? props.selectedKeys.map((k) => (k === key ? selfEntry : parseSelectedKeyEntry(k)))
    : [selfEntry];
  dnd.startGroupDrag({ source: 'explorer', items }, event);
}

function onDragMove(event: DragEvent): void {
  if (event.clientX || event.clientY) {
    dnd.updateGroupDragPosition(event.clientX, event.clientY);
  }
}

function onDragEnd(): void {
  dnd.endGroupDrag();
}

const cardClasses = computed(() => [
  'canvas-card',
  props.kind !== 'canvas' ? 'html-doc-card' : '',
  props.kind === 'interactive-template' ? 'interactive-template-card' : '',
  {
    dragging: props.dragging,
    'is-dragging-group': Boolean(dnd.activeDrag.value?.keys.includes(cardKey.value)),
  },
]);
</script>
