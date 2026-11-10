<template>
  <template v-for="item in items" :key="`${item.type}-${item.id}`">
    <DashboardResourceCard
      v-if="item.type === 'canvas'"
      :resource="item"
      kind="canvas"
      :title-fallback="t('untitled')"
      :icon-label="t('canvas')"
      :select-label="t('selectItem')"
      :date-label="formatDate(item.updatedAt)"
      :mobile-date-label="formatCardDateMobile(item.updatedAt)"
      :select-key="selectionKey(item)"
      :selected="isSelected(item)"
      :selectable="isLoggedIn"
      :busy="isBusy"
      :dragging="draggingResourceId === item.id"
      card-tag="div"
      :renameable="true"
      :show-pin="isOwnedResource(item)"
      pin-title="Pin canvas"
      :menu-id="item.id"
      :menu-open="openMenuCanvasId === item.id"
      :menu-style="cardMenuStyle"
      :actions="resourceActions(item, 'owned')"
      @open="emit('open-canvas', item.slug || item.id)"
      @rename="emit('start-rename', item.id)"
      @toggle-select="emit('toggle-selected', selectionKey(item))"
      @toggle-pin="emit('toggle-pinned', item)"
      @toggle-menu="emit('toggle-menu', item.id, $event)"
      @select-action="emit('select-action', item, $event)"
    >
      <template #title>
        <input
          v-if="renamingId === item.id"
          ref="renameInput"
          class="card-title-input"
          :value="item.title"
          @blur="emit('finish-rename', $event, item)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @keydown.escape="emit('cancel-rename')"
          @click.stop
        />
        <span v-else class="card-title-text">{{ item.title || t('untitled') }}</span>
      </template>
    </DashboardResourceCard>

    <DashboardResourceCard
      v-else-if="item.type === 'html-document'"
      :resource="item"
      kind="html-document"
      title-fallback="Untitled HTML"
      icon-label="HTML document"
      :select-label="t('selectItem')"
      :date-label="formatDate(item.updatedAt)"
      :mobile-date-label="formatCardDateMobile(item.updatedAt)"
      :select-key="selectionKey(item)"
      :selected="isSelected(item)"
      :selectable="isLoggedIn"
      :busy="isBusy"
      :dragging="draggingResourceId === item.id"
      :show-pin="isOwnedResource(item)"
      pin-title="Pin HTML"
      :open-href="`/edit/html/${item.slug || item.id}`"
      :open-label="`Open HTML document ${item.title || 'Untitled HTML'}`"
      :menu-id="item.id"
      :menu-open="openMenuCanvasId === item.id"
      :menu-style="cardMenuStyle"
      :actions="resourceActions(item, 'owned')"
      @open="emit('open-html', item.slug || item.id)"
      @open-link="emit('remember', 'html-document', item.slug || item.id)"
      @toggle-select="emit('toggle-selected', selectionKey(item))"
      @toggle-pin="emit('toggle-pinned', item)"
      @toggle-menu="emit('toggle-menu', item.id, $event)"
      @select-action="emit('select-action', item, $event)"
    />

    <DashboardResourceCard
      v-else-if="item.type === 'interactive-template'"
      :resource="item"
      kind="interactive-template"
      :title-fallback="t('untitled')"
      :icon-label="interactiveTemplateTypeLabel(item.templateType)"
      :select-label="t('selectItem')"
      :date-label="formatDate(item.updatedAt)"
      :mobile-date-label="formatCardDateMobile(item.updatedAt)"
      :select-key="selectionKey(item)"
      :selected="isSelected(item)"
      :selectable="isLoggedIn"
      :busy="isBusy"
      :dragging="draggingResourceId === item.id"
      :folder-resource="`interactive-template:${item.id}`"
      :badge-text="item.role && item.role !== 'owner' ? item.role : null"
      :show-tags="false"
      :menu-id="`folder:interactive-template:${item.id}`"
      :menu-open="openMenuCanvasId === `folder:interactive-template:${item.id}`"
      :menu-style="cardMenuStyle"
      :actions="resourceActions(item, 'interactive')"
      menu-title="Действия с шаблоном"
      @open="emit('open-interactive', item.id)"
      @toggle-select="emit('toggle-selected', selectionKey(item))"
      @toggle-menu="emit('toggle-menu', `folder:interactive-template:${item.id}`, $event)"
      @select-action="emit('select-action', item, $event)"
    />

    <DashboardResourceCard
      v-else
      :resource="item"
      kind="text-document"
      title-fallback="Untitled document"
      icon-label="Document"
      :select-label="t('selectItem')"
      :date-label="formatDate(item.updatedAt)"
      :mobile-date-label="formatCardDateMobile(item.updatedAt)"
      :select-key="selectionKey(item)"
      :selected="isSelected(item)"
      :selectable="isLoggedIn"
      :busy="isBusy"
      :dragging="draggingResourceId === item.id"
      :show-pin="isOwnedResource(item)"
      pin-title="Pin document"
      :open-href="`/docs/${item.slug || item.id}`"
      :open-label="`Open document ${item.title || 'Untitled document'}`"
      :menu-id="item.id"
      :menu-open="openMenuCanvasId === item.id"
      :menu-style="cardMenuStyle"
      :actions="resourceActions(item, 'owned')"
      @open="emit('open-text', item.slug || item.id)"
      @open-link="emit('remember', 'text-document', item.slug || item.id)"
      @toggle-select="emit('toggle-selected', selectionKey(item))"
      @toggle-pin="emit('toggle-pinned', item)"
      @toggle-menu="emit('toggle-menu', item.id, $event)"
      @select-action="emit('select-action', item, $event)"
    />
  </template>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import DashboardResourceCard from './DashboardResourceCard.vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

type RecentResourceType = 'html-document' | 'text-document';

const props = defineProps<{
  items: any[];
  isLoggedIn: boolean;
  isBusy: boolean;
  draggingResourceId: string | null;
  openMenuCanvasId: string;
  renamingId: string;
  cardMenuStyle: Record<string, string> | null;
  selectionKey: (item: any) => string;
  isSelected: (item: any) => boolean;
  isOwnedResource: (item: any) => boolean;
  formatDate: (value: string) => string;
  formatCardDateMobile: (value: string) => string;
  interactiveTemplateTypeLabel: (value: any) => string;
  resourceActions: (item: any, context: 'owned' | 'interactive') => DashboardResourceActionItem[];
}>();

const emit = defineEmits<{
  'open-canvas': [id: string];
  'open-html': [id: string];
  'open-text': [id: string];
  'open-interactive': [id: string];
  remember: [type: RecentResourceType, id: string];
  'start-rename': [id: string];
  'finish-rename': [event: Event, item: any];
  'cancel-rename': [];
  'toggle-selected': [key: string];
  'toggle-pinned': [item: any];
  'toggle-menu': [id: string, event: Event];
  'select-action': [item: any, action: DashboardResourceAction];
}>();

const { t } = useI18n();
const renameInput = ref<HTMLInputElement | null>(null);

watch(() => props.renamingId, (id) => {
  if (!id) return;
  void nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
});
</script>
