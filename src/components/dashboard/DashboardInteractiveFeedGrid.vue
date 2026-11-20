<template>
  <article
    v-for="item in items"
    :key="item.id"
    :data-select-key="isLoggedIn ? selectionKey(item) : undefined"
    :data-selected="isSelected(item) || undefined"
    class="canvas-card html-doc-card interactive-template-card"
    :data-template-resource="item.id"
    @click="emit('open', item.id)"
  >
    <ResourceThumb kind="interactive-template" :id="item.id" :version="item.updatedAt" />
    <div class="card-title card-title-with-icon">
      <span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="emit('toggle-selected', selectionKey(item))" @keydown.space.prevent.stop="emit('toggle-selected', selectionKey(item))"><Check :size="12" aria-hidden="true" /></span>
      <ResourceIcon kind="interactive-template" :template-type="item.templateType" data-resource-icon="interactive-template" :data-template-type="item.templateType" role="img" :aria-label="interactiveTemplateTypeLabel(item.templateType)" />
      <span class="card-title-text">{{ item.title }}</span>
    </div>
    <div class="card-meta">
      <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
      <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
    </div>
    <button class="card-manage" :data-menu-trigger="menuId(item)" @click.stop="emit('toggle-menu', menuId(item), $event)" title="Действия с шаблоном" :disabled="isBusy">⋯</button>
    <DashboardResourceMenu
      v-if="openMenuCanvasId === menuId(item)"
      :actions="resourceActions(item, 'interactive')"
      :disabled="isBusy"
      :menu-id="menuId(item)"
      :menu-style="cardMenuStyle"
      @select="emit('select-action', item, $event)"
    />
  </article>
</template>

<script setup lang="ts">
import { Check, Folder } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import ResourceIcon from '../ResourceIcon.vue';
import DashboardResourceMenu from './DashboardResourceMenu.vue';
import ResourceThumb from './ResourceThumb.vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

defineProps<{
  items: any[];
  isLoggedIn: boolean;
  isBusy: boolean;
  openMenuCanvasId: string;
  cardMenuStyle: Record<string, string> | null;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  cardFolderPath: (item: any) => string;
  formatDate: (value: string) => string;
  interactiveTemplateTypeLabel: (value: any) => string;
  resourceActions: (item: any, scope: 'interactive') => DashboardResourceActionItem[];
}>();

const emit = defineEmits<{
  open: [id: string];
  'toggle-selected': [key: string];
  'toggle-menu': [id: string, event: Event];
  'select-action': [item: any, action: DashboardResourceAction];
}>();

const { t } = useI18n();
const menuId = (item: any) => `interactive-template:${item.id}`;
</script>
