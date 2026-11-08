<template>
<div
  :id="isHomeFeed ? 'feed-public' : undefined"
  class="dash-section"
  :class="{ 'dashboard-feed-section': isHomeFeed }"
  :data-dashboard-view="isHomeFeed ? undefined : 'public'"
  :data-feed-section="isHomeFeed ? 'public' : undefined"
  data-section="public"
>
  <!-- Heading row like Recents': title, Mine/Others, and the phone sort
       control (it used to sit in the toolbar, a row above the title). -->
  <div class="dash-section-head dashboard-public-head">
    <h2>{{ t('public') }}</h2>
    <div class="dashboard-public-head-controls">
      <div v-if="isLoggedIn" :ref="setPublicOwnerFilterEl" class="dashboard-public-owner-filter dashboard-segmented" role="group" :aria-label="t('publicOwnerFilter')">
        <button
          v-for="option in PUBLIC_OWNER_FILTERS"
          :key="option"
          type="button"
          :class="{ active: publicOwnerFilter === option }"
          :aria-pressed="publicOwnerFilter === option"
          :data-public-owner-filter="option"
          @click.stop="setPublicOwnerFilter(option)"
        >{{ t(PUBLIC_OWNER_FILTER_LABELS[option]) }}</button>
      </div>
    </div>
  </div>
  <div class="dash-grid" data-feed-grid="public">
    <template v-for="item in feedItems(publicFiltered, 'public')" :key="'public-' + item.type + '-' + item.id">
    <div
      v-if="item.type === 'canvas'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card"
      @click="openCanvas(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="canvas" data-resource-icon="canvas" aria-label="Canvas" /><span class="card-title-text">{{ item.title || 'Untitled' }}</span><UiBadge v-if="item.allowPublicEdit" class="badge badge-public card-title-badge">{{ t('publicEditShort') }}</UiBadge></div>
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
      <button class="card-manage" :data-menu-trigger="`public:${item.type}:${item.id}`" @click.stop="toggleCardMenu(`public:${item.type}:${item.id}`, $event)" title="Canvas actions" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `public:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`public:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </div>
    <article
      v-else-if="item.type === 'html-document'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
      @click="openHtmlDocument(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="html-document" data-resource-icon="html-document" aria-label="HTML document" /><span class="card-title-text">{{ item.title || 'Untitled HTML' }}</span></div>
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
      <button class="card-manage" :data-menu-trigger="`public:${item.type}:${item.id}`" @click.stop="toggleCardMenu(`public:${item.type}:${item.id}`, $event)" title="HTML actions" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `public:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`public:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveHtmlFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </article>
    <article
      v-else-if="item.type === 'text-document'"
      :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
      @click="openTextDocument(item.slug || item.id)"
    >
      <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
      <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="text-document" data-resource-icon="text-document" aria-label="Document" /><span class="card-title-text">{{ item.title || 'Untitled document' }}</span></div>
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
      <button class="card-manage" :data-menu-trigger="`public:${item.type}:${item.id}`" @click.stop="toggleCardMenu(`public:${item.type}:${item.id}`, $event)" title="Document actions" :disabled="isBusy">⋯</button>
      <div v-if="openMenuCanvasId === `public:${item.type}:${item.id}`" class="card-menu" :data-card-menu="`public:${item.type}:${item.id}`" :style="cardMenuStyle" @click.stop>
        <button class="card-menu-item" data-action="move-to-folder" @click="openMoveTextDocumentFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
      </div>
    </article>
    </template>
    <button v-if="isLoggedIn && !publicFiltered.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="public" data-public-empty data-feed-empty="public" @click.stop="openAddFromTile('public')">
      <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
    </button>
  </div>
  <UiEmptyState v-if="!publicFiltered.length && (hasActiveFilter || !isLoggedIn)" empty-class="dash-empty" data-public-empty data-feed-empty="public">
    {{ hasActiveFilter ? t('noFilterMatches') : publicAnyOwner.length ? t('noPublicMatches') : t('noPublicResources') }}
    <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
  </UiEmptyState>
  <button
    v-if="isHomeFeed && publicFiltered.length > feedLimit('public')"
    type="button"
    class="dashboard-recent-show-all"
    :data-feed-show-all="'public'"
    :aria-expanded="isFeedSectionExpanded('public')"
    @click="toggleFeedSectionExpanded('public')"
  >
    <span>{{ isFeedSectionExpanded('public') ? t('showLess') : `${t('showAll')} ${publicFiltered.length}` }}</span>
    <ChevronDown v-if="!isFeedSectionExpanded('public')" :size="15" aria-hidden="true" />
    <ChevronUp v-else :size="15" aria-hidden="true" />
  </button>
</div>
</template>

<script setup lang="ts">
import UiEmptyState from '../ui/UiEmptyState.vue';
import UiBadge from '../ui/UiBadge.vue';
import { computed } from 'vue';
import { Check, ChevronDown, ChevronUp, Folder, Plus } from '@lucide/vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const isLoggedIn = computed(() => context.value.isLoggedIn);
const isHomeFeed = computed(() => context.value.isHomeFeed);
const publicFiltered = computed(() => context.value.publicFiltered);
const publicAnyOwner = computed(() => context.value.publicAnyOwner);
const publicOwnerFilter = computed(() => context.value.publicOwnerFilter);
const PUBLIC_OWNER_FILTERS = computed(() => context.value.PUBLIC_OWNER_FILTERS);
const PUBLIC_OWNER_FILTER_LABELS = computed(() => context.value.PUBLIC_OWNER_FILTER_LABELS);
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
const openMenuCanvasId = computed(() => context.value.openMenuCanvasId);
const cardMenuStyle = computed(() => context.value.cardMenuStyle);
const isBusy = computed(() => context.value.isBusy);
const openMoveFolderModal = computed(() => context.value.openMoveFolderModal);
const openMoveHtmlFolderModal = computed(() => context.value.openMoveHtmlFolderModal);
const openMoveTextDocumentFolderModal = computed(() => context.value.openMoveTextDocumentFolderModal);
const openAddFromTile = computed(() => context.value.openAddFromTile);
const hasActiveFilter = computed(() => context.value.hasActiveFilter);
const resetFilters = computed(() => context.value.resetFilters);
const feedLimit = computed(() => context.value.feedLimit);
const isFeedSectionExpanded = computed(() => context.value.isFeedSectionExpanded);
const toggleFeedSectionExpanded = computed(() => context.value.toggleFeedSectionExpanded);
const setPublicOwnerFilter = computed(() => context.value.setPublicOwnerFilter);
const setPublicOwnerFilterEl = (element: any) => context.value.setPublicOwnerFilterEl?.(element as HTMLElement | null);
</script>
