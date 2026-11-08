<template>
<div
  :id="isHomeFeed ? 'feed-shared' : undefined"
  class="dash-section"
  :class="{ 'dashboard-feed-section': isHomeFeed }"
  :data-dashboard-view="isHomeFeed ? undefined : 'shared'"
  :data-feed-section="isHomeFeed ? 'shared' : undefined"
  data-section="shared"
>
  <div class="dash-section-head"><h2>{{ t('sharedWithMe') }}</h2></div>
  <div class="dash-grid" data-feed-grid="shared">
    <template v-for="item in feedItems(sharedFiltered, 'shared')" :key="'shared-' + item.type + '-' + item.id">
    <div
      v-if="item.type === 'canvas'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card"
      @click="openCanvas(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="canvas" data-resource-icon="canvas" aria-label="Canvas" /><span class="card-title-text">{{ item.title || 'Untitled' }}</span><UiBadge class="badge badge-shared card-title-badge">{{ item.role }}</UiBadge></div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span
          v-for="tag in item.tags"
          :key="tag.name"
          class="card-tag color-tag"
          :style="{ '--tag-color': tag.color }"
        >#{{ tag.name }}</span>
      </div>
      <button
        class="card-manage"
        :data-menu-trigger="`shared:${item.type}:${item.id}`"
        @click.stop="toggleCardMenu(`shared:${item.type}:${item.id}`, $event)"
        title="Canvas actions"
        :disabled="isBusy"
      >⋯</button>
      <div v-if="openMenuCanvasId === `shared:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`shared:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </div>
    <article
      v-else-if="item.type === 'html-document'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
      @click="openHtmlDocument(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="html-document" data-resource-icon="html-document" aria-label="HTML document" /><span class="card-title-text">{{ item.title || 'Untitled HTML' }}</span><UiBadge class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</UiBadge></div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="`shared:${item.type}:${item.id}`" @click.stop="toggleCardMenu(`shared:${item.type}:${item.id}`, $event)" title="HTML actions" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `shared:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`shared:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveHtmlFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </article>
    <article
      v-else-if="item.type === 'text-document'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
      @click="openTextDocument(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="text-document" data-resource-icon="text-document" aria-label="Document" /><span class="card-title-text">{{ item.title || 'Untitled document' }}</span><UiBadge class="badge badge-shared card-title-badge">{{ item.role || t('sharedWithMe') }}</UiBadge></div>
      <div class="card-meta">
        <span v-if="cardFolderPath(item)" class="card-folder" data-card-folder :title="cardFolderPath(item)"><Folder :size="12" aria-hidden="true" /><span class="card-folder-name">{{ cardFolderPath(item) }}</span></span>
        <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
      </div>
      <div v-if="item.tags?.length" class="card-tags">
        <span v-for="tag in item.tags" :key="tag.name" class="card-tag color-tag" :style="{ '--tag-color': tag.color }">#{{ tag.name }}</span>
      </div>
      <button class="card-manage" :data-menu-trigger="`shared:${item.type}:${item.id}`" @click.stop="toggleCardMenu(`shared:${item.type}:${item.id}`, $event)" title="Document actions" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `shared:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`shared:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveTextDocumentFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </article>
    </template>
    <button v-if="!sharedFiltered.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="shared" data-feed-empty="shared" @click.stop="openAddFromTile('shared')">
      <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
    </button>
  </div>
  <UiEmptyState v-if="!sharedFiltered.length && hasActiveFilter" empty-class="dash-empty" data-feed-empty="shared">
    {{ t('noFilterMatches') }}
    <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
  </UiEmptyState>
  <button
    v-if="isHomeFeed && sharedFiltered.length > feedLimit('shared')"
    type="button"
    class="dashboard-recent-show-all"
    :data-feed-show-all="'shared'"
    :aria-expanded="isFeedSectionExpanded('shared')"
    @click="toggleFeedSectionExpanded('shared')"
  >
    <span>{{ isFeedSectionExpanded('shared') ? t('showLess') : `${t('showAll')} ${sharedFiltered.length}` }}</span>
    <ChevronDown v-if="!isFeedSectionExpanded('shared')" :size="15" aria-hidden="true" />
    <ChevronUp v-else :size="15" aria-hidden="true" />
  </button>
</div>

</template>

<script setup lang="ts">
import UiEmptyState from '../ui/UiEmptyState.vue';
import UiBadge from '../ui/UiBadge.vue';
import { computed } from 'vue';
import { Check, Folder, Plus } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const isLoggedIn = computed(() => context.value.isLoggedIn);
const isHomeFeed = computed(() => context.value.isHomeFeed);
const sharedFiltered = computed(() => context.value.sharedFiltered);
const isBusy = computed(() => context.value.isBusy);
const hasActiveFilter = computed(() => context.value.hasActiveFilter);
const openMenuCanvasId = computed(() => context.value.openMenuCanvasId);
const cardMenuStyle = computed(() => context.value.cardMenuStyle);
const t = computed(() => context.value.t);
const feedItems = computed(() => context.value.feedItems);
const selectionKey = computed(() => context.value.selectionKey);
const isSelected = computed(() => context.value.isSelected);
const toggleSelected = computed(() => context.value.toggleSelected);
const openCanvas = computed(() => context.value.openCanvas);
const openHtmlDocument = computed(() => context.value.openHtmlDocument);
const openTextDocument = computed(() => context.value.openTextDocument);
const cardFolderPath = computed(() => context.value.cardFolderPath);
const formatDate = computed(() => context.value.formatDate);
const toggleCardMenu = computed(() => context.value.toggleCardMenu);
const openMoveFolderModal = computed(() => context.value.openMoveFolderModal);
const openMoveHtmlFolderModal = computed(() => context.value.openMoveHtmlFolderModal);
const openMoveTextDocumentFolderModal = computed(() => context.value.openMoveTextDocumentFolderModal);
const openAddFromTile = computed(() => context.value.openAddFromTile);
const resetFilters = computed(() => context.value.resetFilters);
const feedLimit = computed(() => context.value.feedLimit);
const isFeedSectionExpanded = computed(() => context.value.isFeedSectionExpanded);
const toggleFeedSectionExpanded = computed(() => context.value.toggleFeedSectionExpanded);
</script>
