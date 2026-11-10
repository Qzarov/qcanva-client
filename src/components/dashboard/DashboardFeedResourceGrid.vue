<template>
  <template v-for="item in items" :key="`${scope}-${item.type}-${item.id}`">
    <div
      v-if="item.type === 'canvas'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
      :data-selected="isSelected(item) || undefined"
      class="canvas-card"
      @click="emit('open-canvas', item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="emit('toggle-selected', selectionKey(item))" @keydown.space.prevent.stop="emit('toggle-selected', selectionKey(item))"><Check :size="12" aria-hidden="true" /></span>
        <ResourceIcon kind="canvas" data-resource-icon="canvas" aria-label="Canvas" />
        <span class="card-title-text">{{ item.title || 'Untitled' }}</span>
        <span v-if="scope === 'shared' || item.allowPublicEdit" class="badge card-title-badge" :class="scope === 'shared' ? 'badge-shared' : 'badge-public'">{{ scope === 'shared' ? item.role : t('publicEditShort') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" :title="scope === 'shared' ? 'Canvas actions' : 'Canvas actions'" :disabled="isBusy">⋯</button>
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
      class="canvas-card html-doc-card"
      @click="emit('open-html', item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="emit('toggle-selected', selectionKey(item))" @keydown.space.prevent.stop="emit('toggle-selected', selectionKey(item))"><Check :size="12" aria-hidden="true" /></span>
        <ResourceIcon kind="html-document" data-resource-icon="html-document" aria-label="HTML document" />
        <span class="card-title-text">{{ item.title || 'Untitled HTML' }}</span>
        <span v-if="scope === 'shared'" class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" title="HTML actions" :disabled="isBusy">⋯</button>
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
      class="canvas-card html-doc-card"
      @click="emit('open-text', item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon">
        <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="emit('toggle-selected', selectionKey(item))" @keydown.space.prevent.stop="emit('toggle-selected', selectionKey(item))"><Check :size="12" aria-hidden="true" /></span>
        <ResourceIcon kind="text-document" data-resource-icon="text-document" aria-label="Document" />
        <span class="card-title-text">{{ item.title || 'Untitled document' }}</span>
        <span v-if="scope === 'shared'" class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</span>
      </div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" title="Document actions" :disabled="isBusy">⋯</button>
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
import { Check, Folder } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import DashboardResourceMenu from './DashboardResourceMenu.vue';
import ResourceThumb from './ResourceThumb.vue';
import ResourceIcon from '../ResourceIcon.vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

const props = defineProps<{
  items: any[];
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
}>();

const { t } = useI18n();
const menuId = (item: any) => `${props.scope}:${item.type}:${item.id}`;
</script>
