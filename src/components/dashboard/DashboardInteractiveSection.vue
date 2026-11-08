<template>
<section
  :id="isHomeFeed ? 'feed-interactive' : undefined"
  class="dash-section"
  :class="{ 'dashboard-feed-section': isHomeFeed }"
  :data-dashboard-view="isHomeFeed ? undefined : 'interactive'"
  :data-feed-section="isHomeFeed ? 'interactive' : undefined"
  data-section="interactive-templates"
>
  <div class="dash-section-head"><h2>{{ t('interactiveTemplate') }}</h2></div>
  <div class="dash-grid" data-feed-grid="interactive">
    <article v-for="item in feedItems(visibleInteractiveTemplateItems, 'interactive')" :key="item.id" :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card interactive-template-card" :data-template-resource="item.id" @click="openInteractiveTemplate(item.id)">
      <ResourceThumb :kind="'interactive-template'" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="interactive-template" :template-type="item.templateType" data-resource-icon="interactive-template" :data-template-type="item.templateType" role="img" :aria-label="interactiveTemplateTypeLabel(item.templateType)" /><span class="card-title-text">{{ item.title }}</span></div>
      <div class="card-meta"><span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span><span class="card-date">{{ formatDate(item.updatedAt) }}</span></div>
      <button class="card-manage" :data-menu-trigger="`interactive-template:${item.id}`" @click.stop="toggleCardMenu(`interactive-template:${item.id}`, $event)" title="Действия с шаблоном" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `interactive-template:${item.id}`" class="card-menu" :data-card-menu="`interactive-template:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveInteractiveTemplateFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
        <button v-if="item.role === 'owner'" class="card-menu-item danger" data-action="delete" @click="deleteInteractiveTemplate(item)" :disabled="isBusy">{{ t('delete') }}</button>
      </div>
    </article>
    <button v-if="!visibleInteractiveTemplateItems.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="interactive" data-feed-empty="interactive" @click.stop="openAddFromTile('interactive')">
      <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
    </button>
  </div>
  <UiEmptyState v-if="!visibleInteractiveTemplateItems.length && hasActiveFilter" empty-class="dash-empty" data-feed-empty="interactive">
    {{ t('noFilterMatches') }}
    <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
  </UiEmptyState>
  <button
    v-if="isHomeFeed && visibleInteractiveTemplateItems.length > feedLimit('interactive')"
    type="button"
    class="dashboard-recent-show-all"
    :data-feed-show-all="'interactive'"
    :aria-expanded="isFeedSectionExpanded('interactive')"
    @click="toggleFeedSectionExpanded('interactive')"
  >
    <span>{{ isFeedSectionExpanded('interactive') ? t('showLess') : `${t('showAll')} ${visibleInteractiveTemplateItems.length}` }}</span>
    <ChevronDown v-if="!isFeedSectionExpanded('interactive')" :size="15" aria-hidden="true" />
    <ChevronUp v-else :size="15" aria-hidden="true" />
  </button>
</section>

</template>

<script setup lang="ts">
import UiEmptyState from '../ui/UiEmptyState.vue';
import { computed } from 'vue';
import { Check, ChevronDown, ChevronUp, Folder, Plus } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const isLoggedIn = computed(() => context.value.isLoggedIn);
const isHomeFeed = computed(() => context.value.isHomeFeed);
const visibleInteractiveTemplateItems = computed(() => context.value.visibleInteractiveTemplateItems);
const hasActiveFilter = computed(() => context.value.hasActiveFilter);
const t = computed(() => context.value.t);
const feedItems = computed(() => context.value.feedItems);
const selectionKey = computed(() => context.value.selectionKey);
const isSelected = computed(() => context.value.isSelected);
const toggleSelected = computed(() => context.value.toggleSelected);
const openInteractiveTemplate = computed(() => context.value.openInteractiveTemplate);
const interactiveTemplateTypeLabel = computed(() => context.value.interactiveTemplateTypeLabel);
const cardFolderPath = computed(() => context.value.cardFolderPath);
const formatDate = computed(() => context.value.formatDate);
const toggleCardMenu = computed(() => context.value.toggleCardMenu);
const openMenuCanvasId = computed(() => context.value.openMenuCanvasId);
const cardMenuStyle = computed(() => context.value.cardMenuStyle);
const isBusy = computed(() => context.value.isBusy);
const openMoveInteractiveTemplateFolderModal = computed(() => context.value.openMoveInteractiveTemplateFolderModal);
const deleteInteractiveTemplate = computed(() => context.value.deleteInteractiveTemplate);
const openAddFromTile = computed(() => context.value.openAddFromTile);
const resetFilters = computed(() => context.value.resetFilters);
const feedLimit = computed(() => context.value.feedLimit);
const isFeedSectionExpanded = computed(() => context.value.isFeedSectionExpanded);
const toggleFeedSectionExpanded = computed(() => context.value.toggleFeedSectionExpanded);
</script>
