<template>
  <section
    ref="rootEl"
    class="drive-photos"
    data-drive-photos
    @keydown="onRootKeydown"
  >
    <!-- macOS Photos Topbar (NO < ↑ arrows) -->
    <header
      class="dp-top"
      :class="{ 'is-hidden': isTopChromeHidden }"
      data-testid="gallery-topbar"
    >
      <div class="dp-top-left">
        <button
          v-if="showSidebarExpand"
          type="button"
          class="dp-icon-btn sb-expand-btn"
          data-sidebar-expand-btn
          :aria-label="t('openNavigation')"
          :title="t('openNavigation')"
          @click="emit('expand-sidebar')"
        >
          <PanelLeft :size="16" aria-hidden="true" />
        </button>

        <button
          v-if="isYandexMode"
          type="button"
          class="dp-crumb-pill"
          data-testid="gallery-yandex-crumb"
          @click="clearYandexPath"
        >
          <ChevronLeft :size="14" aria-hidden="true" />
          <span>{{ yandexScopeName }}</span>
        </button>

        <button
          v-if="effectiveAlbumId"
          type="button"
          class="dp-crumb-pill"
          data-testid="gallery-album-crumb"
          @click="clearAlbumFilter"
        >
          <ChevronLeft :size="14" aria-hidden="true" />
          <span>{{ albumName || effectiveAlbumId }}</span>
        </button>

        <button
          v-if="effectiveAlbumId"
          type="button"
          class="dp-icon-pill dp-album-members-pill"
          data-testid="gallery-album-members"
          :aria-label="albumMembersLabel"
          :title="albumMembersLabel"
          @click="emit('share-album', effectiveAlbumId)"
        >
          <Users :size="13" aria-hidden="true" />
          <span>{{ albumMembersLabel }}</span>
        </button>

        <button
          v-if="effectiveAlbumId"
          type="button"
          class="dp-icon-pill dp-album-share-pill"
          data-testid="gallery-album-share"
          :aria-label="t('galleryShare')"
          :title="t('galleryShare')"
          @click="emit('share-album', effectiveAlbumId)"
        >
          <Share2 :size="14" aria-hidden="true" />
          <span>{{ t('galleryShare') }}</span>
        </button>

        <button
          v-if="selectedPeople.length > 0"
          type="button"
          class="dp-crumb-pill"
          data-testid="gallery-people-crumb"
          @click="selectedPeople = []"
        >
          <ChevronLeft :size="14" aria-hidden="true" />
          <span>{{ selectedPeopleLabels.join(', ') }}</span>
        </button>

        <template v-if="!showPeopleGrid && activeSection !== 'trash'">
          <button
            type="button"
            class="dp-icon-pill"
            :class="{ active: prefs.galleryAspectMode.value === 'ratio' }"
            :title="aspectToggleLabel"
            :aria-label="aspectToggleLabel"
            :aria-pressed="prefs.galleryAspectMode.value === 'ratio'"
            data-testid="aspect-toggle"
            @click="prefs.toggleGalleryAspectMode()"
          >
            <LayoutGrid v-if="prefs.galleryAspectMode.value === 'square'" :size="15" aria-hidden="true" />
            <RectangleHorizontal v-else :size="15" aria-hidden="true" />
          </button>

          <div class="dp-zoom-wrap" :title="t('galleryZoomSlider')">
            <button
              type="button"
              class="dp-zoom-step"
              :aria-label="t('galleryZoomOut')"
              data-testid="zoom-out"
              @click="stepZoom(-24)"
            >
              −
            </button>
            <input
              type="range"
              class="dp-zoom-slider"
              :min="GALLERY_TILE_MIN_H"
              :max="GALLERY_TILE_MAX_H"
              :value="prefs.photoTileH.value"
              :aria-label="t('galleryZoomSlider')"
              data-testid="zoom-slider"
              @input="onZoomInput"
            />
            <button
              type="button"
              class="dp-zoom-step"
              :aria-label="t('galleryZoomIn')"
              data-testid="zoom-in"
              @click="stepZoom(24)"
            >
              +
            </button>
          </div>
        </template>
      </div>

      <div class="dp-top-center">
        <div v-if="showPeopleGrid" class="dp-people-title" data-testid="people-topbar-title">
          {{ t('galleryPeople') }}
        </div>
        <div v-else-if="activeSection === 'trash'" class="dp-people-title" data-testid="trash-topbar-title">
          {{ t('galleryDeleted') }}
        </div>
        <div
          v-else
          class="dp-seg-center"
          role="group"
          :aria-label="t('photosGroupBy')"
          data-testid="period-segmented"
        >
          <button
            v-for="p in PERIOD_CONTROLS"
            :key="p.period"
            type="button"
            class="dp-seg-btn"
            :class="{ active: view.state.value.period === p.period }"
            :aria-pressed="view.state.value.period === p.period"
            :data-testid="`period-${p.period}`"
            @click="selectPeriod(p.period)"
          >
            {{ t(p.label) }}
          </button>
        </div>
      </div>

      <div class="dp-top-right">
        <button
          v-if="selected.size >= 2"
          type="button"
          class="dp-sel-badge"
          data-testid="selection-badge"
          :title="t('photosSelClear')"
          @click="clearSelection"
        >
          <span>{{ selected.size }}</span>
          <span aria-hidden="true">✕</span>
        </button>

        <ExplorerInlineSearch
          ref="inlineSearchRef"
          v-model="query"
          v-model:scope-mode="searchScopeMode"
          v-model:type-filter="searchTypeFilter"
          in-gallery
          :scope-label="scopeLabel"
          :albums="inlineSearchAlbums"
          :folders="inlineSearchFolders"
          :items="inlineSearchItems"
          :ml-tags="suggestedTags"
          :loading="searchLoading"
          @select-tag="selectSuggestedTag"
          @select-album="onOpenAlbum"
          @select-folder="onSearchSelectFolder"
          @open-item="onSearchOpenItem"
          @submit="runSearchNow"
        />
      </div>
    </header>

    <p v-if="mockMode" class="dp-mock" role="status" data-photos-mock-banner>{{ t('photosMockBanner') }}</p>

    <div class="dp-body">
      <div
        id="dp-tabpanel"
        class="dp-main"
        data-photos-main
      >
        <!-- Floating translucent Sort pill overlaid directly on top of the sticky curtain -->
        <div
          v-if="!searchActive && !showPeopleGrid && activeSection !== 'trash'"
          class="dp-float-sort"
          :class="{ 'is-headroom-hidden': isTopChromeHidden }"
        >
          <PhotosViewBar
            :hidden="false"
            :force-visible="true"
            :inside-album="Boolean(effectiveAlbumId)"
            @menu-open="sortMenuOpen = $event"
          />
        </div>

        <!-- Search: flat semantic CLIP/hybrid relevance grid -->
        <template v-if="searchActive">
          <p v-if="searchError === 'unavailable'" class="dp-note" role="alert" data-photos-search-unavailable>
            {{ t('photosSearchUnavailable') }}
          </p>
          <p v-else-if="searchError === 'failed'" class="dp-note" role="alert" data-photos-search-error>
            {{ t('photosSearchError') }}
            <button type="button" class="dp-retry" @click="runSearchNow">{{ t('photosRetry') }}</button>
          </p>
          <p v-else-if="searchLoading && !scopedSearchItems.length" class="dp-note" role="status">{{ t('photosLoading') }}</p>
          <p v-else-if="!scopedSearchItems.length" class="dp-note" role="status" data-photos-search-empty>
            {{ t('photosSearchNothing') }}
          </p>
          <PhotosSearchGrid
            v-if="scopedSearchItems.length"
            class="dp-search-grid"
            :items="scopedSearchItems"
            :tile="view.state.value.tile"
            :current="currentId"
            :selected="selected"
            :has-more="searchCursor !== null && !searchLoading"
            @open="onOpen"
            @activate="onActivate"
            @contextmenu="onFeedContextMenu"
            @more="loadMoreSearch"
          />
        </template>

        <!-- In-Gallery Recently Deleted -->
        <div v-else-if="activeSection === 'trash'" class="dp-trash-scroll" data-testid="gallery-trash-view">
          <DashboardTrash @restored="onTrashRestored" @feedback="onTrashFeedback" />
        </div>

        <!-- People grid -->
        <div v-else-if="showPeopleGrid" class="dp-people-scroll">
          <GalleryPeopleGrid
            :people="resolvedPeople"
            :selected-ids="selectedPeople"
            @select="onSelectPeople"
          />
        </div>

        <!-- Continuous edge-to-edge photo wall -->
        <PhotosFeed
          v-else
          :key="isYandexMode ? 'yandex' : (effectiveAlbumId ?? 'feed')"
          ref="feedRef"
          class="dp-feed"
          :params="feedParams"
          :caption-on-tile="effectiveCaptionOnTile"
          :tile="view.state.value.tile"
          :tile-height="prefs.photoTileH.value"
          :aspect-mode="prefs.galleryAspectMode.value"
          :folder-filter-id="isYandexMode ? null : externalFolderId"
          :folder-filter-ids="isYandexMode ? null : effectiveAllowedFolderIds"
          :folder-include-root="isYandexMode ? false : externalFolderId === 'root'"
          :people-filter="selectedPeople"
          :recent-limit="activeSection === 'recent' ? 24 : null"
          :headroom-hidden="isTopChromeHidden"
          :selected="selected"
          :current="currentId"
          :external-items="isYandexMode ? yandexFeedItems : null"
          :external-loading="isYandexMode ? yandexLoading : false"
          @open="onOpen"
          @focus-photo="onFeedFocusPhoto"
          @activate="onActivate"
          @toggle-select="onToggleSelect"
          @set-selection="onSetSelection"
          @contextmenu="onFeedContextMenu"
          @toggle-favorite="toggleSingleFavorite"
          @summary="onFeedSummary"
          @units-loaded="onFeedUnitsLoaded"
        />
      </div>

      <!-- Resizable right ⓘ panel wrapper -->
      <Transition name="dp-panel-slide">
        <div v-if="isPanelVisible" class="dp-panel-shell">
          <div
            class="dp-panel-sash"
            :class="{ active: panelDragging }"
            :title="t('galleryResizePanel')"
            data-testid="panel-sash"
            @pointerdown="onPanelSashDown"
          ></div>
          <div
            class="dp-panel"
            :style="{ width: `${panelWidth}px` }"
            data-photos-panel-wrap
          >
            <PhotoPanel
              :key="panelEpoch"
              :file-id="panelId ?? ''"
              :item="panelItem"
              :can-favorite="!isPanelItemYandex"
              :selected-items="selectedFeedItems"
              :hide-open-folder="hideInternalTabs || isPanelItemYandex"
              @close="closePanel"
              @open-folder="onOpenFolder"
              @open-album="onOpenAlbum"
              @group-favorite="toggleFavoriteAction"
              @group-share="shareAction"
              @group-album="actions.toggleAlbumMenu()"
              @group-download="downloadSelectedAction"
              @group-delete="deleteSelectedAction"
              @changed="onPanelChanged"
            />
          </div>
        </div>
      </Transition>
    </div>

    <!-- Gallery Right-Click Context Menu (Group actions open ONLY on right-click) -->
    <Transition name="card-menu-pop">
      <div
        v-if="ctxMenu"
        ref="ctxMenuEl"
        class="dp-ctx-menu"
        role="menu"
        tabindex="-1"
        data-testid="gallery-context-menu"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        @click.stop
        @pointerdown="markPointerInsideCtx"
        @mousedown="markPointerInsideCtx"
        @focusout="onCtxFocusOut"
      >
        <template v-if="ctxIsYandex">
          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-open @click="ctxOpenViewer">
            <Eye :size="14" aria-hidden="true" />
            <span>{{ t('photosOpen') }}</span>
          </button>

          <button
            v-if="ctxShowFolderTarget"
            type="button"
            role="menuitem"
            class="dp-ctx-item"
            data-ctx-show-folder
            @click="ctxShowFolder"
          >
            <FolderOpen :size="14" aria-hidden="true" />
            <span>{{ t('photosShowFolder') }}</span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-download @click="ctxDownload">
            <Download :size="14" aria-hidden="true" />
            <span>{{ t('photosDownload') }}</span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-properties @click="ctxOpenProperties">
            <Info :size="14" aria-hidden="true" />
            <span>{{ t('fileProperties') }}</span>
          </button>

          <div class="dp-ctx-sep" role="separator"></div>

          <button type="button" role="menuitem" class="dp-ctx-item dp-ctx-danger" data-ctx-delete @click="ctxDelete">
            <Trash2 :size="14" aria-hidden="true" />
            <span>
              {{ t('delete') }}
              <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
            </span>
          </button>
        </template>

        <template v-else>
          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-favorite @click="ctxToggleFavorite">
            <Heart :size="14" aria-hidden="true" />
            <span>
              {{ ctxAllFavorite ? t('explorerRemoveFromFavorites') : t('explorerAddToFavorites') }}
              <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
            </span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-share @click="ctxShare">
            <Share2 :size="14" aria-hidden="true" />
            <span>
              {{ t('galleryShare') }}
              <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
            </span>
          </button>

          <div class="dp-ctx-sep" role="separator"></div>

          <div class="dp-ctx-album-wrap">
            <button
              ref="ctxAlbumTriggerEl"
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              :aria-expanded="ctxAlbumsOpen"
              class="dp-ctx-item"
              :class="{ 'is-submenu-open': ctxAlbumsOpen }"
              data-ctx-album
              @pointerenter="onCtxAlbumTriggerPointerEnter"
              @mouseenter="onCtxAlbumTriggerEnter"
              @mouseleave="scheduleCloseCtxAlbums"
              @focusin="cancelCloseCtxAlbums"
              @keydown="onCtxAlbumTriggerKeydown"
              @pointerdown="onCtxAlbumTriggerPointerDown"
              @click="onCtxAlbumTriggerClick"
            >
              <FolderPlus :size="14" aria-hidden="true" />
              <span>{{ t('explorerAddToAlbum') }}</span>
              <ChevronRight :size="13" class="dp-ctx-chevron" aria-hidden="true" />
            </button>
          </div>

          <button
            v-if="effectiveAlbumId"
            type="button"
            role="menuitem"
            class="dp-ctx-item"
            data-ctx-remove-album
            @click="ctxRemoveFromAlbum"
          >
            <X :size="14" aria-hidden="true" />
            <span>{{ t('photosSelRemoveFromAlbum') }}</span>
          </button>

          <button
            v-if="ctxShowFolderTarget"
            type="button"
            role="menuitem"
            class="dp-ctx-item"
            data-ctx-show-folder
            @click="ctxShowFolder"
          >
            <FolderOpen :size="14" aria-hidden="true" />
            <span>{{ t('photosShowFolder') }}</span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-move @click="ctxOpenMove">
            <FolderInput :size="14" aria-hidden="true" />
            <span>
              {{ t('photosMoveAction') }}
              <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>…
            </span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-download @click="ctxDownload">
            <Download :size="14" aria-hidden="true" />
            <span>{{ t('photosDownload') }}</span>
          </button>

          <button type="button" role="menuitem" class="dp-ctx-item" data-ctx-properties @click="ctxOpenProperties">
            <Info :size="14" aria-hidden="true" />
            <span>{{ t('fileProperties') }}</span>
          </button>

          <div class="dp-ctx-sep" role="separator"></div>

          <button type="button" role="menuitem" class="dp-ctx-item dp-ctx-danger" data-ctx-delete @click="ctxDelete">
            <Trash2 :size="14" aria-hidden="true" />
            <span>
              {{ t('delete') }}
              <template v-if="ctxTargetIds.length > 1">({{ ctxTargetIds.length }})</template>
            </span>
          </button>
        </template>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="ctx-flyout-pop">
        <div
          v-if="ctxMenu && ctxAlbumsOpen"
          ref="ctxFlyoutEl"
          class="dp-ctx-flyout"
          role="menu"
          tabindex="-1"
          :aria-label="t('explorerAddToAlbum')"
          :data-flyout-side="ctxFlyoutSide"
          data-gallery-ctx-album-flyout
          :style="ctxFlyoutStyle"
          @mouseenter="cancelCloseCtxAlbums"
          @mouseleave="scheduleCloseCtxAlbums"
          @pointerdown="markPointerInsideCtx"
          @mousedown="markPointerInsideCtx"
          @focusin="cancelCloseCtxAlbums"
          @focusout="onCtxFocusOut"
          @keydown="onCtxFlyoutKeydown"
          @click.stop
          @contextmenu.prevent
        >
          <div v-if="ctxAlbumsList.length" class="dp-ctx-flyout-scroll">
            <button
              v-for="alb in ctxAlbumsList"
              :key="alb.id"
              type="button"
              role="menuitem"
              class="dp-ctx-item dp-ctx-sub-item"
              :data-gallery-ctx-album="alb.id"
              @click="ctxAddToAlbum(alb.id)"
            >
              <span class="dp-ctx-dot" aria-hidden="true"></span>
              <span class="dp-ctx-sub-name">{{ alb.name }}</span>
              <Check v-if="ctxSingleItemAlbumIds.has(alb.id)" :size="13" class="dp-ctx-check" aria-hidden="true" />
            </button>
          </div>
          <div v-if="ctxAlbumsList.length" class="dp-ctx-sep" role="separator"></div>
          <button
            type="button"
            role="menuitem"
            class="dp-ctx-item dp-ctx-sub-item dp-ctx-new-album"
            data-gallery-ctx-new-album
            @click="ctxCreateAlbumAndAdd"
          >
            <Plus :size="14" aria-hidden="true" />
            <span class="dp-ctx-sub-name">{{ t('photosPanelNewAlbum') }}</span>
          </button>
        </div>
      </Transition>
    </Teleport>

    <PhotoViewer
      v-if="viewerItem"
      :item="viewerItem"
      :items="viewer!.items"
      :index="viewer!.index"
      :total="viewer!.items.length"
      :has-prev="viewer!.index > 0"
      :has-next="viewer!.index < viewer!.items.length - 1"
      :can-favorite="!isViewerItemYandex"
      :can-share="!isViewerItemYandex || Boolean(viewerItemPublicUrl)"
      :can-delete="true"
      :can-info="true"
      @close="viewer = null"
      @prev="stepViewer(-1)"
      @next="stepViewer(1)"
      @jump="jumpViewer"
      @toggle-favorite="toggleSingleFavorite"
      @share="shareSingleItem"
      @delete="onViewerDelete"
      @panel-changed="onPanelChanged"
    />

    <FolderPickerDialog
      v-if="moveOpen"
      :title="fmt('photosMoveTitle', { n: moveTargetIds.length })"
      :confirm-label="t('photosMoveAction')"
      :exclude-ids="moveExcl.ids"
      :exclude-root="moveExcl.root"
      @select="actions.moveTo($event)"
      @close="actions.closeMove()"
    />

    <div
      v-if="actions.albumMenuOpen.value"
      class="dp-album-picker-backdrop"
      data-testid="gallery-group-album-menu"
      @click="actions.closeAlbumMenu()"
    >
      <div class="dp-album-picker" role="dialog" :aria-label="t('galleryAddToAlbum')" @click.stop>
        <div class="dp-album-picker-head">
          <span>{{ t('galleryAddToAlbum') }}</span>
          <button type="button" class="dp-search-clear" :aria-label="t('photosClose')" @click="actions.closeAlbumMenu()">
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
        <p v-if="actions.albumsFailed.value" class="dp-album-picker-note">{{ t('photosAlbumsLoadFailed') }}</p>
        <p v-else-if="actions.albums.value === null" class="dp-album-picker-note">{{ t('photosLoading') }}</p>
        <div v-else class="dp-album-picker-list">
          <button
            v-for="alb in actions.albums.value"
            :key="alb.id"
            type="button"
            class="dp-ctx-item"
            :data-group-album-choice="alb.id"
            @click="actions.addToAlbum(alb.id)"
          >
            <span>{{ alb.name }}</span>
          </button>
          <button
            type="button"
            class="dp-ctx-item"
            data-group-album-new
            @click="actions.createAlbumAndAdd()"
          >
            <span>{{ t('photosPanelNewAlbum') }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Heart,
  Info,
  LayoutGrid,
  PanelLeft,
  Plus,
  RectangleHorizontal,
  Share2,
  Trash2,
  Users,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { resourceFolders, type ResourceFolderSummary } from '../../api/client';
import { downloadDriveFile, driveApi, resolveDownloadUrl } from '../../api/drive';
import {
  isPhotosMock,
  isSearchUnavailable,
  photosApi,
  type Album,
  type FeedItem,
  type FeedPeriod,
  type SortKey,
} from '../../api/photos';
import { spacesApi } from '../../api/spaces';
import {
  downloadYandexLink,
  settleYandexOutcome,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
} from '../../api/yandexDisk';
import { confirmDialog } from '../../composables/appDialog';
import {
  GALLERY_TILE_MAX_H,
  GALLERY_TILE_MIN_H,
  useExplorerLayoutPrefs,
} from '../../composables/useExplorerLayoutPrefs';
import { useI18n, type MessageKey } from '../../composables/useI18n';
import { useSpaces } from '../../composables/useSpaces';
import { useToast } from '../../composables/useToast';
import DashboardTrash from '../dashboard/DashboardTrash.vue';
import ExplorerInlineSearch, {
  type InlineSearchAlbum,
  type InlineSearchFolder,
  type InlineSearchItem,
  type InlineSearchScopeMode,
  type InlineSearchTypeFilter,
} from '../dashboard/ExplorerInlineSearch.vue';
import FolderPickerDialog from '../FolderPickerDialog.vue';
import GalleryPeopleGrid, { type GalleryPerson } from './GalleryPeopleGrid.vue';
import PhotoPanel from './PhotoPanel.vue';
import PhotosFeed from './PhotosFeed.vue';
import PhotosSearchGrid from './PhotosSearchGrid.vue';
import PhotosViewBar from './PhotosViewBar.vue';
import PhotoViewer, { type ViewerMediaItem } from './PhotoViewer.vue';
import {
  invalidateGalleryFolderFilesCache,
  type GallerySection,
  type GallerySidebarCounts,
  type GalleryStorageFolder,
} from './GallerySidebar.vue';
import { addGalleryAlbumItems, listGalleryAlbums, usePhotoSelectionActions } from './usePhotoSelectionActions';
import { usePhotosView } from './usePhotosView';

const props = withDefaults(defineProps<{
  activeSection?: GallerySection;
  externalAlbumId?: string | null;
  externalAlbumMembersCount?: number | null;
  externalFolderId?: string | null;
  externalYandexPath?: string | null;
  folders?: readonly GalleryStorageFolder[];
  hideInternalTabs?: boolean;
  showSidebarExpand?: boolean;
  people?: readonly GalleryPerson[];
}>(), {
  activeSection: 'library',
  externalAlbumId: null,
  externalAlbumMembersCount: null,
  externalFolderId: null,
  externalYandexPath: null,
  folders: undefined,
  hideInternalTabs: false,
  showSidebarExpand: false,
  people: undefined,
});

export interface GalleryFocusTransfer {
  fileId: string;
  folderId: string | null;
  shared: boolean;
  selectedIds: string[];
}

const emit = defineEmits<{
  (e: 'openFolder', folderId: string, fileId: string): void;
  (e: 'show-folder-in-gallery', folderId: string, fileId: string): void;
  (e: 'focus-photo', item: FeedItem): void;
  (e: 'share-album', id: string): void;
  (e: 'share-photos', ids: string[]): void;
  (e: 'select-album', albumId: string): void;
  (e: 'select-yandex-path', path: string | null): void;
  (e: 'clear-album'): void;
  (e: 'open-trash'): void;
  (e: 'expand-sidebar'): void;
  (e: 'update:counts', counts: GallerySidebarCounts): void;
  (e: 'drop-folder', folderId: string | null, fileIds: string[], folderIds: string[]): void;
  (e: 'drop-album', albumId: string, fileIds: string[], folderIds: string[]): void;
  (e: 'folder-contextmenu', payload: { event: MouseEvent; folderId: string }): void;
}>();

const { t, locale } = useI18n();
const homeFolderLabel = computed(() => {
  const translated = (t as (key: string) => string)('explorerHomeFolder');
  if (translated && translated !== 'explorerHomeFolder') return translated;
  return locale.value === 'ru' ? 'Домашняя' : 'Home';
});
const toast = useToast();
const view = usePhotosView();
const prefs = useExplorerLayoutPrefs();
const { spaces, load: loadSpaces } = useSpaces();
const mockMode = isPhotosMock();

const fmt = (key: MessageKey, vars: Record<string, string | number>): string =>
  t(key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_PAGE = 60;
const PANEL_MIN_W = 240;
const PANEL_MAX_W = 480;
const PANEL_COLLAPSE_THRESHOLD = 160;
const PANEL_DEFAULT_W = 320;

const PERIOD_CONTROLS: { period: FeedPeriod; label: MessageKey }[] = [
  { period: 'year', label: 'galleryYears' },
  { period: 'month', label: 'galleryMonths' },
  { period: 'day', label: 'galleryDays' },
];

const rootEl = ref<HTMLElement | null>(null);
const feedRef = ref<InstanceType<typeof PhotosFeed> | null>(null);
const inlineSearchRef = ref<{ focus: () => void; close?: () => void; handleEscape?: () => boolean } | null>(null);

const internalAlbumId = ref<string | null>(null);
const albumName = ref('');
const folderName = ref('');
const albumSourceFolderIds = ref<Set<string>>(new Set());
const effectiveAlbumId = computed(() => props.externalAlbumId ?? internalAlbumId.value);
const effectiveAlbumMembersCount = computed<number>(() => {
  if (typeof props.externalAlbumMembersCount === 'number' && props.externalAlbumMembersCount > 0) {
    return props.externalAlbumMembersCount;
  }
  const id = effectiveAlbumId.value;
  if (id) {
    const found = spaces.value.find((s) => s.id === id);
    if (found && typeof found.memberCount === 'number' && found.memberCount >= 0) {
      return found.memberCount + 1;
    }
  }
  return 1;
});
const albumMembersLabel = computed(() => fmt('explorerMembersCount', { n: effectiveAlbumMembersCount.value }));

const loadedStorageFolders = ref<GalleryStorageFolder[]>([]);
const allStorageFolders = computed<readonly GalleryStorageFolder[]>(() => props.folders ?? loadedStorageFolders.value);
let storageFoldersRequested = false;

async function ensureStorageFolders(): Promise<void> {
  if (props.folders !== undefined || storageFoldersRequested) return;
  storageFoldersRequested = true;
  try {
    if (typeof resourceFolders?.list !== 'function') return;
    const res = await resourceFolders.list();
    const own = (res.own ?? []).map((f: ResourceFolderSummary) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      sortOrder: f.sortOrder,
      role: f.role ?? ('owner' as const),
    }));
    const shared = (res.shared ?? []).map((f: ResourceFolderSummary) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      sortOrder: f.sortOrder,
      role: f.role ?? ('read' as const),
    }));
    loadedStorageFolders.value = [...own, ...shared];
  } catch {
    // Standalone or mock mode without resource folders API
  }
}

function collectSubtreeIds(rootId: string, list: readonly GalleryStorageFolder[]): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const f of list) {
    if (!f.parentId) continue;
    const bucket = byParent.get(f.parentId) ?? [];
    bucket.push(f.id);
    byParent.set(f.parentId, bucket);
  }
  const out = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const childId of byParent.get(cur) ?? []) {
      if (!out.has(childId)) {
        out.add(childId);
        queue.push(childId);
      }
    }
  }
  return out;
}

const ownHomeSubtreeIds = computed<Set<string>>(() => {
  const ids = new Set<string>();
  for (const f of allStorageFolders.value) {
    if (f.role !== 'read') ids.add(f.id);
  }
  return ids;
});

const effectiveAllowedFolderIds = computed<ReadonlySet<string> | null>(() => {
  const fid = props.externalFolderId;
  if (!fid) return null;
  if (fid === 'root') {
    return ownHomeSubtreeIds.value.size > 0 ? ownHomeSubtreeIds.value : null;
  }
  return collectSubtreeIds(fid, allStorageFolders.value);
});

const selected = shallowRef<Set<string>>(new Set());
const focusedId = ref<string | null>(null);
const focusedItemCache = ref<ViewerMediaItem | null>(null);
let preserveFocusForShowFolder = false;
const panelOpen = ref(false);
const panelId = ref<string | null>(null);
const panelEpoch = ref(0);
const panelWidth = ref(PANEL_DEFAULT_W);
const panelDragging = ref(false);
const sortMenuOpen = ref(false);
const viewer = shallowRef<{ items: ViewerMediaItem[]; index: number } | null>(null);
const viewerItem = computed<ViewerMediaItem | null>(() => viewer.value?.items[viewer.value.index] ?? null);
const currentId = computed(() => viewerItem.value?.fileId ?? focusedId.value ?? panelId.value);

// ----- Yandex Disk Media Mode -----
type YandexViewerMediaItem = ViewerMediaItem & {
  yandexPath: string;
  folderName: string;
  publicUrl?: string | null;
};

const YANDEX_ID_PREFIX = 'yandex:';
const isYandexFileId = (fileId: string | null | undefined): boolean =>
  typeof fileId === 'string' && fileId.startsWith(YANDEX_ID_PREFIX);
const yandexPathFromFileId = (fileId: string): string =>
  fileId.startsWith(YANDEX_ID_PREFIX) ? fileId.slice(YANDEX_ID_PREFIX.length) : fileId;

const isYandexMode = computed(() => props.externalYandexPath !== null && props.externalYandexPath !== undefined);

function yandexFolderDisplayName(path: string): string {
  if (!path || path === '/') return t('yandexDisk');
  return path.split('/').filter(Boolean).pop() || t('yandexDisk');
}

const yandexScopeName = computed(() =>
  props.externalYandexPath !== null && props.externalYandexPath !== undefined
    ? yandexFolderDisplayName(props.externalYandexPath)
    : '',
);

function yandexItemToViewerMedia(item: YandexItem): YandexViewerMediaItem {
  const isVideo = item.mediaType === 'video' || Boolean(item.mime?.toLowerCase().startsWith('video/'));
  const parentPath = yandexParentPath(item.path);
  const takenAt = item.modifiedAt || item.createdAt || new Date().toISOString();
  const folderLabel = yandexFolderDisplayName(parentPath);
  return {
    fileId: `${YANDEX_ID_PREFIX}${item.path}`,
    hash: item.md5 || `${YANDEX_ID_PREFIX}${item.path}`,
    name: item.name,
    mime: item.mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
    kind: isVideo ? 'video' : 'photo',
    processed: false,
    takenAt,
    localTakenAt: takenAt,
    width: null,
    height: null,
    durationSec: null,
    bytes: item.size ?? 0,
    folderId: parentPath,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
    previewSrc: yandexPreviewUrl(item),
    noReferrer: true,
    sizeBytes: item.size ?? undefined,
    mimeType: item.mime || undefined,
    folderName: folderLabel,
    yandexPath: item.path,
    publicUrl: item.publicUrl,
    resolveOriginalUrl: async () => (await yandexDisk.downloadLink(item.path)).href,
    downloadAction: async () => {
      const { href } = await yandexDisk.downloadLink(item.path);
      downloadYandexLink(href, item.name);
    },
  };
}

const yandexRawItems = shallowRef<YandexItem[]>([]);
const yandexLoading = ref(false);
let yandexAbort: AbortController | null = null;
let yandexLoadSeq = 0;

const yandexFeedItems = computed<YandexViewerMediaItem[]>(() =>
  yandexRawItems.value.map(yandexItemToViewerMedia),
);

async function loadYandexMedia(path: string): Promise<void> {
  yandexAbort?.abort();
  const controller = new AbortController();
  yandexAbort = controller;
  const seq = ++yandexLoadSeq;
  yandexLoading.value = true;
  try {
    const list = await yandexDisk.listMedia(path, { signal: controller.signal });
    if (seq !== yandexLoadSeq || controller.signal.aborted) return;
    yandexRawItems.value = list;
  } catch (err) {
    if (seq !== yandexLoadSeq || controller.signal.aborted) return;
    yandexRawItems.value = [];
    if ((err as { name?: string })?.name !== 'AbortError') {
      toast.show(t('yandexLoadFailed'), 'error');
    }
  } finally {
    if (seq === yandexLoadSeq) {
      yandexLoading.value = false;
    }
  }
}

function clearYandexPath(): void {
  searchScopeMode.value = 'current';
  clearSelection();
  emit('select-yandex-path', null);
}

const isViewerItemYandex = computed(() => isYandexFileId(viewerItem.value?.fileId));
const viewerItemPublicUrl = computed(() => (viewerItem.value as YandexViewerMediaItem | null)?.publicUrl ?? null);

const panelItem = computed<ViewerMediaItem | null>(() => {
  const id = panelId.value;
  if (!id) return null;
  const found = findLoadedItem(id);
  if (found) return found;
  if (focusedItemCache.value?.fileId === id) return focusedItemCache.value;
  return null;
});
const isPanelItemYandex = computed(() => isYandexFileId(panelId.value) || isYandexFileId(panelItem.value?.fileId));

const feedParams = computed(() => {
  const base = view.feedParams.value;
  if (!effectiveAlbumId.value) return base;
  const filteredSort = base.sort.filter((s) => s.key !== 'album');
  const filteredLevels = base.levels.filter((k) => k !== 'album');
  return {
    ...base,
    sort: filteredSort,
    levels: filteredLevels.length > 0 ? filteredLevels : (['date'] as SortKey[]),
    albumId: effectiveAlbumId.value,
  };
});

const effectiveCaptionOnTile = computed(() => (
  effectiveAlbumId.value
    ? view.captionOnTile.value.filter((k) => k !== 'album')
    : view.captionOnTile.value
));

// ----- search (unified S2 inline search + live CLIP/hybrid POST /api/photos/search) -----

type SearchError = '' | 'unavailable' | 'failed';
const query = ref('');
const searchQuery = ref('');
const searchScopeMode = ref<InlineSearchScopeMode>('current');
const searchTypeFilter = ref<InlineSearchTypeFilter>('all');
const searchItems = shallowRef<FeedItem[]>([]);
const searchCursor = ref<string | null>(null);
const searchLoading = ref(false);
const searchError = ref<SearchError>('');
const searchActive = computed(() => searchQuery.value !== '');

const SUGGESTED_TAGS_RU = ['природа', 'горы', 'море', 'портрет', 'архитектура', 'закат', 'еда', 'документы'] as const;
const SUGGESTED_TAGS_EN = ['nature', 'mountains', 'sea', 'portrait', 'architecture', 'sunset', 'food', 'documents'] as const;
const suggestedTags = computed<string[]>(() => [...(locale.value === 'ru' ? SUGGESTED_TAGS_RU : SUGGESTED_TAGS_EN)]);

const scopeLabel = computed<string>(() => {
  if (isYandexMode.value) return yandexScopeName.value;
  if (effectiveAlbumId.value) return albumName.value || effectiveAlbumId.value;
  if (props.externalFolderId) return folderName.value || homeFolderLabel.value;
  return t('galleryLibrary');
});

function matchesActiveFolderScope(item: FeedItem): boolean {
  const fid = props.externalFolderId;
  if (!fid) return true;
  if (fid === 'root') {
    if (item.share) return false;
    const allowed = effectiveAllowedFolderIds.value;
    if (allowed && allowed.size > 0) {
      return item.folderId === null || allowed.has(item.folderId);
    }
    return true;
  }
  const allowed = effectiveAllowedFolderIds.value;
  if (allowed && allowed.size > 0) {
    return Boolean(item.folderId && allowed.has(item.folderId));
  }
  return item.folderId === fid;
}

function itemMatchesScope(item: FeedItem): boolean {
  if (searchScopeMode.value !== 'current') return true;
  if (effectiveAlbumId.value) {
    if (item.albumIds.includes(effectiveAlbumId.value)) return true;
    if (item.folderId && albumSourceFolderIds.value.has(item.folderId)) return true;
    return false;
  }
  if (props.externalFolderId) {
    return matchesActiveFolderScope(item);
  }
  return true;
}

const isYandexScopedSearch = computed(() => isYandexMode.value && searchScopeMode.value === 'current');

const scopedSearchItems = computed<ViewerMediaItem[]>(() => {
  if (isYandexScopedSearch.value) {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return yandexFeedItems.value;
    return yandexFeedItems.value.filter(
      (it) => it.name.toLowerCase().includes(q) || it.yandexPath.toLowerCase().includes(q),
    );
  }
  return searchItems.value.filter(itemMatchesScope);
});

const inlineSearchAlbums = computed<InlineSearchAlbum[]>(() => {
  if (searchScopeMode.value === 'current' && (props.externalFolderId || isYandexMode.value)) return [];
  return spaces.value.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.mediaCount ?? s.itemCount ?? s.sourceCount,
  }));
});

const inlineSearchFolders = computed<InlineSearchFolder[]>(() => []);

const inlineSearchItems = computed<InlineSearchItem[]>(() => {
  const src: FeedItem[] = searchActive.value
    ? scopedSearchItems.value
    : isYandexScopedSearch.value
      ? yandexFeedItems.value
      : (feedRef.value?.orderedItems() ?? []).filter(itemMatchesScope);
  return src.slice(0, 20).map((it) => ({
    id: it.fileId,
    title: it.name,
    type: 'media',
    folderId: it.folderId,
    fileId: it.fileId,
    mimeType: it.mime,
  }));
});

let searchGen = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function cancelSearchTimer(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

async function runSearch(q: string, more = false): Promise<void> {
  if (isYandexScopedSearch.value) {
    searchGen++;
    searchError.value = '';
    searchLoading.value = false;
    searchCursor.value = null;
    searchItems.value = [];
    return;
  }
  const gen = ++searchGen;
  searchError.value = '';
  searchLoading.value = true;
  if (!more) {
    searchItems.value = [];
    searchCursor.value = null;
  }
  try {
    const res = await photosApi.search(q, {
      shared: view.state.value.shared,
      cursor: more ? searchCursor.value : null,
      limit: SEARCH_PAGE,
    });
    if (gen !== searchGen) return;
    searchItems.value = more ? [...searchItems.value, ...res.items] : res.items;
    searchCursor.value = res.nextCursor;
  } catch (err) {
    if (gen !== searchGen) return;
    searchError.value = isSearchUnavailable(err) ? 'unavailable' : 'failed';
    searchCursor.value = null;
  } finally {
    if (gen === searchGen) searchLoading.value = false;
  }
}

function startSearch(): void {
  cancelSearchTimer();
  const q = query.value.trim();
  if (q === '') {
    endSearch();
    return;
  }
  if (!searchActive.value) {
    viewer.value = null;
    clearSelection();
  }
  searchQuery.value = q;
  void runSearch(q);
}

function endSearch(): void {
  searchGen++;
  searchQuery.value = '';
  searchItems.value = [];
  searchCursor.value = null;
  searchLoading.value = false;
  searchError.value = '';
  viewer.value = null;
}

function runSearchNow(): void {
  startSearch();
}

function clearSearch(): void {
  cancelSearchTimer();
  query.value = '';
  endSearch();
}

function selectSuggestedTag(tag: string): void {
  cancelSearchTimer();
  query.value = tag;
  startSearch();
}

function onSearchSelectFolder(folderId: string): void {
  emit('openFolder', folderId, '');
}

function onSearchOpenItem(item: InlineSearchItem): void {
  const targetId = item.fileId ?? item.id;
  const found = shownItems().find((i) => i.fileId === targetId)
    ?? searchItems.value.find((i) => i.fileId === targetId)
    ?? feedRef.value?.orderedItems().find((i) => i.fileId === targetId);
  if (found) onActivate(found);
}

function loadMoreSearch(): void {
  if (!searchActive.value || searchLoading.value || searchCursor.value === null) return;
  void runSearch(searchQuery.value, true);
}

watch(query, (value) => {
  cancelSearchTimer();
  const trimmed = value.trim();
  if (trimmed === '') {
    if (searchActive.value) endSearch();
    return;
  }
  if (trimmed === searchQuery.value) return;
  searchTimer = setTimeout(startSearch, SEARCH_DEBOUNCE_MS);
});

watch(
  () => view.state.value.shared,
  () => {
    if (searchActive.value) void runSearch(searchQuery.value);
  },
);

watch(searchScopeMode, () => {
  if (searchActive.value) void runSearch(searchQuery.value);
});

// ----- people & sections -----
const selectedPeople = ref<string[]>([]);

const showPeopleGrid = computed(
  () =>
    props.activeSection === 'people'
    && selectedPeople.value.length === 0
    && !effectiveAlbumId.value
    && !props.externalFolderId
    && !isYandexMode.value
    && !searchActive.value,
);

// Face recognition is not available yet (T-039): people only come from explicit props.
const derivedPeople = computed<GalleryPerson[]>(() => (props.people ? [...props.people] : []));

const resolvedPeople = computed(() => derivedPeople.value);
const selectedPeopleLabels = computed(() => {
  const byId = new Map(resolvedPeople.value.map((p) => [p.id, p.name]));
  return selectedPeople.value.map((id) => byId.get(id) ?? id);
});

function onSelectPeople(ids: string[]): void {
  selectedPeople.value = ids;
}

function applySectionFilter(sec: GallerySection): void {
  selectedPeople.value = [];
  if (sec === 'favorites') view.setFilter('fav');
  else if (sec === 'videos') view.setFilter('video');
  else view.setFilter('all');
}

watch(
  () => props.activeSection,
  (sec, prev) => {
    if (sec === prev) return;
    searchScopeMode.value = 'current';
    prefs.setHeadroomHidden(false);
    clearSearch();
    clearSelection();
    if (sec === 'trash') {
      focusedId.value = null;
      focusedItemCache.value = null;
      panelId.value = null;
      panelOpen.value = false;
    } else if (!preserveFocusForShowFolder) {
      focusedId.value = null;
      focusedItemCache.value = null;
    }
    applySectionFilter(sec);
  },
);

if (props.activeSection !== 'library') {
  applySectionFilter(props.activeSection);
}

watch(
  () => props.externalAlbumId,
  (id) => {
    searchScopeMode.value = 'current';
    prefs.setHeadroomHidden(false);
    clearSearch();
    clearSelection();
    if (!preserveFocusForShowFolder) {
      focusedId.value = null;
      focusedItemCache.value = null;
    }
    albumName.value = '';
    albumSourceFolderIds.value = new Set();
    if (id) void loadAlbumName(id);
  },
  { immediate: true },
);

watch(
  () => props.externalFolderId,
  (id) => {
    searchScopeMode.value = 'current';
    prefs.setHeadroomHidden(false);
    clearSearch();
    clearSelection();
    if (!preserveFocusForShowFolder) {
      focusedId.value = null;
      focusedItemCache.value = null;
    }
    folderName.value = '';
    if (!id) return;
    if (props.folders === undefined) void ensureStorageFolders();
    if (id === 'root') {
      folderName.value = homeFolderLabel.value;
      return;
    }
    const localMatch = allStorageFolders.value.find((f) => f.id === id);
    if (localMatch?.name) folderName.value = localMatch.name;
    void loadFolderName(id);
  },
  { immediate: true },
);

watch(
  () => props.externalYandexPath,
  (path) => {
    searchScopeMode.value = 'current';
    prefs.setHeadroomHidden(false);
    clearSearch();
    clearSelection();
    viewer.value = null;
    if (!preserveFocusForShowFolder) {
      focusedId.value = null;
      focusedItemCache.value = null;
    }
    if (path !== null && path !== undefined) {
      yandexRawItems.value = [];
      void loadYandexMedia(path);
    } else {
      yandexAbort?.abort();
      yandexAbort = null;
      yandexLoadSeq++;
      yandexRawItems.value = [];
      yandexLoading.value = false;
    }
  },
  { immediate: true },
);

async function loadFolderName(id: string): Promise<void> {
  try {
    if (typeof driveApi?.getFolder !== 'function') return;
    const res = await driveApi.getFolder(id);
    if (props.externalFolderId === id) {
      folderName.value = res.folder?.name ?? '';
    }
  } catch {
    // Ignore folder metadata error
  }
}

async function loadAlbumName(id: string): Promise<void> {
  try {
    if (!isPhotosMock()) {
      let found = spaces.value.find((s) => s.id === id);
      if (!found) {
        await loadSpaces();
        found = spaces.value.find((s) => s.id === id);
      }
      let resolvedName = found?.name ?? '';
      if ((!resolvedName || (found?.sourceCount ?? 0) > 0) && typeof spacesApi?.get === 'function') {
        const details = await spacesApi.get(id);
        if (!resolvedName) resolvedName = details.name;
        if (effectiveAlbumId.value === id) {
          albumSourceFolderIds.value = new Set(
            (details.sources ?? []).map((s) => s.folderId).filter((x): x is string => Boolean(x)),
          );
        }
      }
      if (effectiveAlbumId.value === id) {
        albumName.value = resolvedName;
      }
      return;
    }
    const list = await photosApi.albums();
    if (effectiveAlbumId.value === id) {
      albumName.value = list.find((a) => a.id === id)?.name ?? '';
    }
  } catch {
    // Ignore album metadata error
  }
}

function clearAlbumFilter(): void {
  internalAlbumId.value = null;
  albumName.value = '';
  albumSourceFolderIds.value = new Set();
  searchScopeMode.value = 'current';
  clearSelection();
  emit('clear-album');
}

// ----- topbar controls: aspect, zoom, period -----
const aspectToggleLabel = computed(() =>
  prefs.galleryAspectMode.value === 'square' ? t('gallerySquareGrid') : t('galleryRatioGrid'),
);

function onZoomInput(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value);
  prefs.setPhotoTileH(val);
}

function stepZoom(delta: number): void {
  prefs.setPhotoTileH(prefs.photoTileH.value + delta);
}

function selectPeriod(period: FeedPeriod): void {
  view.setPeriod(period);
  const firstSort = view.state.value.sort[0]?.key;
  if (firstSort && firstSort !== 'date') {
    view.setSort([]);
  }
}

// ----- selection & focus -----

function onToggleSelect(fileIds: string[], on: boolean): void {
  const next = new Set(selected.value);
  for (const id of fileIds) {
    if (on) next.add(id);
    else next.delete(id);
  }
  selected.value = next;
  if (!focusedId.value && next.size > 0) {
    focusedItemCache.value = findLoadedItem([...next][0]!) ?? null;
  } else if (!focusedId.value && next.size === 0) {
    focusedItemCache.value = null;
  }
}

function onSetSelection(fileIds: string[]): void {
  const next = new Set(fileIds);
  selected.value = next;
  if (!focusedId.value && next.size > 0) {
    focusedItemCache.value = findLoadedItem([...next][0]!) ?? null;
  } else if (!focusedId.value && next.size === 0) {
    focusedItemCache.value = null;
  }
}

function clearSelection(): void {
  if (selected.value.size > 0) selected.value = new Set();
}

const activeTargetIds = computed<string[]>(() => {
  if (selected.value.size >= 2) return [...selected.value];
  const single = focusedId.value ?? [...selected.value][0];
  return single ? [single] : [];
});

function findLoadedItem(fileId: string): FeedItem | undefined {
  return shownItems().find((i) => i.fileId === fileId);
}

const allTargetsFavorite = computed(() => {
  const ids = activeTargetIds.value;
  if (ids.length === 0) return false;
  return ids.every((id) => findLoadedItem(id)?.favorite === true);
});

// ----- selection actions & right-click context menu -----

let folderMap: Map<string, string | null> | null = null;
function folderOf(fileId: string): string | null | undefined {
  if (!folderMap) {
    folderMap = new Map((feedRef.value?.orderedItems() ?? []).map((i) => [i.fileId, i.folderId]));
    queueMicrotask(() => {
      folderMap = null;
    });
  }
  return folderMap.get(fileId);
}

const ctxMenu = ref<{ x: number; y: number; item: FeedItem; targets: string[] } | null>(null);
const ctxMenuEl = ref<HTMLElement | null>(null);
const ctxAlbumTriggerEl = ref<HTMLButtonElement | null>(null);
const ctxFlyoutEl = ref<HTMLElement | null>(null);
const ctxAlbumsOpen = ref(false);
const ctxAlbumsList = ref<Album[]>([]);
const ctxActionTargets = ref<string[] | null>(null);
const ctxFlyoutSide = ref<'right' | 'left'>('right');
const ctxFlyoutPos = ref<{ left: number; top: number }>({ left: 0, top: 0 });
const ctxFlyoutStyle = computed(() => ({
  left: `${Math.round(ctxFlyoutPos.value.left)}px`,
  top: `${Math.round(ctxFlyoutPos.value.top)}px`,
}));
const CTX_FLYOUT_CLOSE_DELAY_MS = 180;
let ctxAlbumsCloseTimer: ReturnType<typeof setTimeout> | null = null;
let ctxAlbumsOpenedByHover = false;
let ctxLastAlbumPointerType = '';
let ctxAlbumsLoadSeq = 0;
let ctxAlbumsLoaded = false;
let ctxAlbumsLoading = false;

const moveTargetIds = computed(() =>
  ctxMenu.value?.targets
  ?? ctxActionTargets.value
  ?? (selected.value.size >= 2 ? [...selected.value] : activeTargetIds.value),
);

const actions = usePhotoSelectionActions({
  selected: () => moveTargetIds.value,
  albumId: () => effectiveAlbumId.value,
  folderOf,
  deselect: (ids) => onToggleSelect(ids, false),
  onMoved: (ids) => {
    invalidateGalleryFolderFilesCache();
    void feedRef.value?.refresh();
    void refreshSidebarCounts();
    if (searchActive.value && searchQuery.value) void runSearch(searchQuery.value);
    if (panelId.value && ids.includes(panelId.value)) panelEpoch.value++;
  },
  onAlbumChanged: (kind, id, fileIds) => {
    const feed = feedRef.value;
    if (!feed) return;
    if (view.state.value.captions.includes('album')) feed.refreshAlbums?.();
    if (effectiveAlbumId.value || feedParams.value.levels.includes('album')) {
      void feed.refresh();
    } else {
      const byId = new Map(feed.orderedItems().map((i) => [i.fileId, i]));
      for (const fid of fileIds) {
        const item = byId.get(fid);
        if (!item) continue;
        const set = new Set(item.albumIds);
        if (kind === 'add') set.add(id);
        else set.delete(id);
        feed.patchItem(fid, { albumIds: [...set] });
      }
    }
    if (panelId.value && fileIds.includes(panelId.value)) panelEpoch.value++;
  },
});
const { moveOpen } = actions;

const moveExcl = ref<{ ids: string[]; root: boolean }>({ ids: [], root: false });
watch(
  moveOpen,
  (open) => {
    if (open) moveExcl.value = actions.moveExclusion();
    else ctxActionTargets.value = null;
  },
  { flush: 'sync' },
);

watch(
  () => selected.value.size,
  (n) => {
    if (n === 0) {
      actions.closeAlbumMenu();
      actions.closeMove();
    }
  },
);

let ctxListenersAttached = false;
let pointerInsideCtx = false;
let pointerInsideCtxTimer: ReturnType<typeof setTimeout> | null = null;

function clearPointerInsideCtx(): void {
  if (pointerInsideCtxTimer !== null) {
    clearTimeout(pointerInsideCtxTimer);
    pointerInsideCtxTimer = null;
  }
  pointerInsideCtx = false;
}

function markPointerInsideCtx(): void {
  if (pointerInsideCtxTimer !== null) {
    clearTimeout(pointerInsideCtxTimer);
  }
  pointerInsideCtx = true;
  pointerInsideCtxTimer = setTimeout(() => {
    pointerInsideCtxTimer = null;
    pointerInsideCtx = false;
  }, 0);
}

function isInsideCtxMenuOrFlyout(node: Node | null): boolean {
  if (!node) return false;
  return Boolean(ctxMenuEl.value?.contains(node) || ctxFlyoutEl.value?.contains(node));
}

function measureCtxFlyout(): void {
  const vw = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;
  const menuRect = ctxMenuEl.value?.getBoundingClientRect();
  const triggerRect = ctxAlbumTriggerEl.value?.getBoundingClientRect();
  const flyoutRect = ctxFlyoutEl.value?.getBoundingClientRect();

  const fallbackLeft = ctxMenu.value?.x ?? 8;
  const fallbackTop = ctxMenu.value?.y ?? 8;
  const hasMenuRect = Boolean(menuRect && (menuRect.width > 0 || menuRect.right > 0 || menuRect.left > 0));
  const menuLeft = hasMenuRect ? menuRect!.left : fallbackLeft;
  const menuRight = hasMenuRect ? menuRect!.right : fallbackLeft + 220;
  const menuTop = hasMenuRect ? menuRect!.top : fallbackTop;

  const rawFlyoutW = ctxFlyoutEl.value?.offsetWidth || (flyoutRect && flyoutRect.width > 0 ? flyoutRect.width : 0);
  const flyoutWidth = rawFlyoutW > 0 ? rawFlyoutW : 216;
  const estimatedHeight = Math.min(320, (ctxAlbumsList.value.length + 1) * 32 + 20);
  const rawFlyoutH = ctxFlyoutEl.value?.offsetHeight || (flyoutRect && flyoutRect.height > 0 ? flyoutRect.height : 0);
  const flyoutHeight = rawFlyoutH > 0 ? rawFlyoutH : estimatedHeight;

  const gap = 6;
  let side: 'right' | 'left' = 'right';
  let left = menuRight + gap;
  if (menuRight + flyoutWidth + 12 > vw && menuLeft - flyoutWidth - gap >= 4) {
    side = 'left';
    left = Math.max(8, menuLeft - flyoutWidth - gap);
  } else if (menuRight + flyoutWidth + 12 > vw) {
    left = Math.max(8, Math.min(menuRight + gap, Math.max(8, vw - flyoutWidth - 8)));
  }

  const hasTriggerRect = Boolean(triggerRect && (triggerRect.height > 0 || triggerRect.top > 0));
  const anchorTop = hasTriggerRect ? triggerRect!.top : menuTop;
  const top = Math.max(8, Math.min(anchorTop - 4, Math.max(8, vh - flyoutHeight - 8)));

  ctxFlyoutSide.value = side;
  ctxFlyoutPos.value = { left, top };
}

function cancelCloseCtxAlbums(): void {
  if (ctxAlbumsCloseTimer !== null) {
    clearTimeout(ctxAlbumsCloseTimer);
    ctxAlbumsCloseTimer = null;
  }
}

function scheduleCloseCtxAlbums(): void {
  cancelCloseCtxAlbums();
  ctxAlbumsCloseTimer = setTimeout(() => {
    ctxAlbumsCloseTimer = null;
    ctxAlbumsOpen.value = false;
    ctxAlbumsOpenedByHover = false;
  }, CTX_FLYOUT_CLOSE_DELAY_MS);
}

async function preloadCtxAlbums(): Promise<void> {
  const seq = ++ctxAlbumsLoadSeq;
  ctxAlbumsLoading = true;
  try {
    const list = await listGalleryAlbums();
    if (seq === ctxAlbumsLoadSeq && ctxMenu.value) {
      ctxAlbumsList.value = list;
      ctxAlbumsLoaded = true;
      if (ctxAlbumsOpen.value) {
        void nextTick(measureCtxFlyout);
      }
    }
  } catch {
    if (seq === ctxAlbumsLoadSeq && ctxMenu.value) {
      ctxAlbumsList.value = [];
      ctxAlbumsLoaded = true;
    }
  } finally {
    if (seq === ctxAlbumsLoadSeq) {
      ctxAlbumsLoading = false;
    }
  }
}

function openCtxAlbumsFlyout(byHover: boolean, focusFirst = false): void {
  cancelCloseCtxAlbums();
  const wasOpen = ctxAlbumsOpen.value;
  ctxAlbumsOpen.value = true;
  if (byHover) ctxAlbumsOpenedByHover = true;
  else if (!wasOpen) ctxAlbumsOpenedByHover = false;
  if (!ctxAlbumsLoaded && !ctxAlbumsLoading) {
    void preloadCtxAlbums();
  }
  measureCtxFlyout();
  void nextTick(() => {
    measureCtxFlyout();
    if (focusFirst) {
      const firstBtn = ctxFlyoutEl.value?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      firstBtn?.focus({ preventScroll: true });
    }
  });
}

function closeCtxAlbumsFlyout(returnFocus = false): void {
  cancelCloseCtxAlbums();
  ctxAlbumsOpen.value = false;
  ctxAlbumsOpenedByHover = false;
  if (returnFocus) {
    ctxAlbumTriggerEl.value?.focus({ preventScroll: true });
  }
}

function onOutsidePointer(e: Event): void {
  if (!ctxMenu.value || !ctxMenuEl.value) return;
  const target = e.target as Node | null;
  if (!isInsideCtxMenuOrFlyout(target)) {
    closeCtxMenu();
  }
}

function onCtxFocusOut(e: FocusEvent): void {
  if (!ctxMenu.value || pointerInsideCtx) return;
  const next = e.relatedTarget as Node | null;
  if (!next || !isInsideCtxMenuOrFlyout(next)) {
    closeCtxMenu();
  }
}

function onDocFocusIn(e: FocusEvent): void {
  if (!ctxMenu.value || !ctxMenuEl.value) return;
  const target = e.target as Node | null;
  if (target && !isInsideCtxMenuOrFlyout(target)) {
    closeCtxMenu();
  }
}

function onWindowScroll(e: Event): void {
  if (!ctxMenu.value || !ctxMenuEl.value) return;
  const target = e.target as Node | null;
  if (isInsideCtxMenuOrFlyout(target)) return;
  closeCtxMenu();
}

function attachCtxListeners(): void {
  if (ctxListenersAttached) return;
  ctxListenersAttached = true;
  window.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('mousedown', onOutsidePointer, true);
  window.addEventListener('click', onOutsidePointer, true);
  document.addEventListener('focusin', onDocFocusIn, true);
  window.addEventListener('blur', closeCtxMenu);
  window.addEventListener('scroll', onWindowScroll, true);
}

function detachCtxListeners(): void {
  if (!ctxListenersAttached) return;
  ctxListenersAttached = false;
  window.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('mousedown', onOutsidePointer, true);
  window.removeEventListener('click', onOutsidePointer, true);
  document.removeEventListener('focusin', onDocFocusIn, true);
  window.removeEventListener('blur', closeCtxMenu);
  window.removeEventListener('scroll', onWindowScroll, true);
}

function closeCtxMenu(): void {
  cancelCloseCtxAlbums();
  ctxAlbumsOpenedByHover = false;
  ctxLastAlbumPointerType = '';
  ctxAlbumsLoadSeq++;
  ctxAlbumsLoaded = false;
  ctxAlbumsLoading = false;
  ctxMenu.value = null;
  ctxAlbumsOpen.value = false;
  clearPointerInsideCtx();
  detachCtxListeners();
}

function onFeedContextMenu(e: MouseEvent, item: FeedItem): void {
  const targets =
    selected.value.size >= 2 && selected.value.has(item.fileId)
      ? [...selected.value]
      : [item.fileId];
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const x = Math.min(e.clientX, vw - 240);
  const y = Math.min(e.clientY, vh - 320);
  cancelCloseCtxAlbums();
  ctxAlbumsOpen.value = false;
  ctxAlbumsOpenedByHover = false;
  ctxLastAlbumPointerType = '';
  ctxAlbumsLoaded = false;
  ctxAlbumsLoading = false;
  ctxMenu.value = { x: Math.max(8, x), y: Math.max(8, y), item, targets };
  if (!isYandexFileId(item.fileId) && !targets.some(isYandexFileId)) {
    void preloadCtxAlbums();
  }
  attachCtxListeners();
  void nextTick(() => {
    ctxMenuEl.value?.focus({ preventScroll: true });
  });
}

const ctxTargetIds = computed(() => ctxMenu.value?.targets ?? []);
const ctxIsYandex = computed(() =>
  Boolean(ctxMenu.value && (isYandexFileId(ctxMenu.value.item.fileId) || ctxMenu.value.targets.some(isYandexFileId))),
);
const ctxSingleItemAlbumIds = computed<ReadonlySet<string>>(() => {
  if (!ctxMenu.value || ctxMenu.value.targets.length !== 1) return new Set();
  const item = findLoadedItem(ctxMenu.value.targets[0]!) ?? ctxMenu.value.item;
  return new Set(item?.albumIds ?? []);
});
const ctxAllFavorite = computed(() =>
  ctxTargetIds.value.length > 0 && ctxTargetIds.value.every((id) => findLoadedItem(id)?.favorite === true),
);
const ctxShowFolderTarget = computed<string | null>(() => {
  if (!ctxMenu.value) return null;
  const ids = ctxTargetIds.value;
  if (ids.length === 0) return null;
  const fallback = ctxMenu.value.item;
  const items = ids
    .map((id) => findLoadedItem(id) ?? (fallback.fileId === id ? fallback : undefined))
    .filter((x): x is FeedItem => Boolean(x));
  if (items.length !== ids.length) return null;
  const resolveTarget = (item: FeedItem): string | null => {
    if (isYandexFileId(item.fileId)) {
      return typeof item.folderId === 'string' && item.folderId.length > 0
        ? item.folderId
        : yandexParentPath(yandexPathFromFileId(item.fileId));
    }
    if (typeof item.folderId === 'string' && item.folderId.length > 0) return item.folderId;
    if (!item.share) return 'root';
    return null;
  };
  const first = resolveTarget(items[0]!);
  if (!first) return null;
  return items.every((item) => resolveTarget(item) === first) ? first : null;
});

async function setFavoriteForIds(ids: string[], nextFav: boolean): Promise<void> {
  const qspaceIds = ids.filter((id) => !isYandexFileId(id));
  if (qspaceIds.length === 0) return;
  for (const id of qspaceIds) {
    feedRef.value?.patchItem(id, { favorite: nextFav });
    if (searchItems.value.some((i) => i.fileId === id)) {
      searchItems.value = searchItems.value.map((i) => (i.fileId === id ? { ...i, favorite: nextFav } : i));
    }
  }
  await Promise.allSettled(qspaceIds.map((id) => photosApi.edit(id, { favorite: nextFav })));
  if (view.state.value.filter === 'fav') {
    void feedRef.value?.refresh();
  }
  void refreshSidebarCounts();
}

async function toggleSingleFavorite(item: FeedItem): Promise<void> {
  if (isYandexFileId(item.fileId)) return;
  await setFavoriteForIds([item.fileId], !item.favorite);
}

async function toggleFavoriteAction(): Promise<void> {
  const ids = activeTargetIds.value;
  if (ids.length === 0) return;
  await setFavoriteForIds(ids, !allTargetsFavorite.value);
}

async function shareSingleItem(item: ViewerMediaItem): Promise<void> {
  if (isYandexFileId(item.fileId)) {
    const publicUrl = (item as YandexViewerMediaItem).publicUrl;
    if (publicUrl) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(publicUrl);
        }
        toast.show(t('yandexLinkCopied'), 'success');
      } catch {
        toast.show(item.name, 'info');
      }
    }
    return;
  }
  try {
    const res = await driveApi.getDownloadLink(item.fileId);
    const fullUrl = resolveDownloadUrl(res.url);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullUrl);
    }
    toast.show(t('explorerAlbumLinkCopied'), 'success');
  } catch {
    toast.show(item.name, 'info');
  }
}

async function shareAction(): Promise<void> {
  if (effectiveAlbumId.value && activeTargetIds.value.length === 0) {
    emit('share-album', effectiveAlbumId.value);
    return;
  }
  const ids = activeTargetIds.value;
  if (ids.length === 0) return;
  const first = findLoadedItem(ids[0]!);
  if (ids.length === 1 && first) {
    await shareSingleItem(first);
  } else {
    emit('share-photos', ids);
  }
}

async function ctxToggleFavorite(): Promise<void> {
  const ids = ctxTargetIds.value;
  const nextFav = !ctxAllFavorite.value;
  closeCtxMenu();
  await setFavoriteForIds(ids, nextFav);
}

async function ctxShare(): Promise<void> {
  const ids = ctxTargetIds.value;
  const item = ctxMenu.value?.item;
  closeCtxMenu();
  if (ids.length === 1 && item) await shareSingleItem(item);
  else if (ids.length > 1) emit('share-photos', ids);
}

function onCtxAlbumTriggerPointerEnter(e: PointerEvent): void {
  if (e.pointerType) {
    ctxLastAlbumPointerType = e.pointerType;
  }
}

function onCtxAlbumTriggerEnter(): void {
  if (ctxLastAlbumPointerType === 'touch') return;
  openCtxAlbumsFlyout(true);
}

function onCtxAlbumTriggerPointerDown(e: PointerEvent): void {
  ctxLastAlbumPointerType = e.pointerType || 'mouse';
}

function onCtxAlbumTriggerKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopPropagation();
    openCtxAlbumsFlyout(false, true);
  } else if (e.key === 'ArrowLeft' && ctxAlbumsOpen.value) {
    e.preventDefault();
    e.stopPropagation();
    closeCtxAlbumsFlyout(true);
  } else if (e.key === 'Enter' || e.key === ' ') {
    ctxLastAlbumPointerType = 'keyboard';
  }
}

function onCtxFlyoutKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    e.stopPropagation();
    closeCtxAlbumsFlyout(true);
  }
}

function onCtxAlbumTriggerClick(): void {
  const pointerType = ctxLastAlbumPointerType;
  ctxLastAlbumPointerType = '';
  if (!ctxAlbumsOpen.value) {
    openCtxAlbumsFlyout(false);
    return;
  }
  if (pointerType === 'touch' || pointerType === 'keyboard' || !ctxAlbumsOpenedByHover) {
    closeCtxAlbumsFlyout();
    return;
  }
  cancelCloseCtxAlbums();
  void nextTick(measureCtxFlyout);
}

async function ctxAddToAlbum(albId: string): Promise<void> {
  const ids = ctxTargetIds.value;
  const targetAlbumName = ctxAlbumsList.value.find((a) => a.id === albId)?.name ?? '';
  closeCtxMenu();
  if (ids.length === 0) return;
  try {
    const added = await addGalleryAlbumItems(albId, ids);
    if (added <= 0) {
      toast.show(fmt('photosAlreadyInAlbumToast', { album: targetAlbumName }), 'info');
      return;
    }
    const vars = { n: added, total: ids.length, album: targetAlbumName };
    toast.show(
      fmt(added < ids.length ? 'photosAddedPartialToast' : 'photosAddedToAlbumToast', vars),
      'success',
    );
    if (!isPhotosMock()) void useSpaces().load(true);
    feedRef.value?.refreshAlbums?.();
    void feedRef.value?.refresh();
    panelEpoch.value++;
  } catch {
    toast.show(t('photosAlbumAddFailedToast'), 'error');
  }
}

async function ctxCreateAlbumAndAdd(): Promise<void> {
  const ids = [...ctxTargetIds.value];
  closeCtxMenu();
  if (ids.length === 0) return;
  ctxActionTargets.value = ids;
  try {
    await actions.createAlbumAndAdd();
  } finally {
    ctxActionTargets.value = null;
  }
}

async function ctxRemoveFromAlbum(): Promise<void> {
  const ids = [...ctxTargetIds.value];
  closeCtxMenu();
  if (ids.length === 0) return;
  ctxActionTargets.value = ids;
  try {
    await actions.removeFromAlbum();
  } finally {
    ctxActionTargets.value = null;
  }
}

function ctxOpenViewer(): void {
  const item = ctxMenu.value?.item ?? null;
  closeCtxMenu();
  if (item) onActivate(item);
}

function ctxShowFolder(): void {
  const folderId = ctxShowFolderTarget.value;
  const item = ctxMenu.value?.item ?? null;
  const fileId = item?.fileId ?? ctxTargetIds.value[0] ?? '';
  const isYandex = ctxIsYandex.value;
  closeCtxMenu();
  if (!folderId) return;
  if (isYandex) {
    preserveFocusForShowFolder = true;
    searchTypeFilter.value = 'all';
    clearSearch();
    if (fileId) {
      focusedId.value = fileId;
      if (item) focusedItemCache.value = item;
    }
    emit('select-yandex-path', folderId);
    void nextTick(() => {
      preserveFocusForShowFolder = false;
      if (fileId) focusTile(fileId);
    });
    return;
  }
  preserveFocusForShowFolder = true;
  searchTypeFilter.value = 'all';
  clearSearch();
  internalAlbumId.value = null;
  albumName.value = '';
  albumSourceFolderIds.value = new Set();
  if (fileId) {
    focusedId.value = fileId;
    if (item) focusedItemCache.value = item;
  }
  emit('show-folder-in-gallery', folderId, fileId);
  void nextTick(() => {
    preserveFocusForShowFolder = false;
    if (fileId) focusTile(fileId);
  });
}

function ctxOpenMove(): void {
  const ids = [...ctxTargetIds.value];
  closeCtxMenu();
  if (ids.length === 0) return;
  ctxActionTargets.value = ids;
  actions.openMove();
}

async function downloadFeedItems(items: readonly ViewerMediaItem[]): Promise<void> {
  if (items.length === 0) return;
  const results = await Promise.allSettled(
    items.map(async (it) => {
      if (it.downloadAction) {
        await it.downloadAction();
        return;
      }
      if (isYandexFileId(it.fileId)) {
        const { href } = await yandexDisk.downloadLink(yandexPathFromFileId(it.fileId));
        downloadYandexLink(href, it.name);
        return;
      }
      await downloadDriveFile(it.fileId, it.name);
    }),
  );
  if (results.some((r) => r.status === 'rejected')) {
    toast.show(t('photosDownloadError'), 'error');
  }
}

async function ctxDownload(): Promise<void> {
  const ids = [...ctxTargetIds.value];
  const fallbackItem = ctxMenu.value?.item;
  closeCtxMenu();
  const targets = ids
    .map((id) => findLoadedItem(id) ?? (fallbackItem?.fileId === id ? fallbackItem : undefined))
    .filter((x): x is ViewerMediaItem => Boolean(x));
  if (targets.length === 0 && fallbackItem) targets.push(fallbackItem);
  await downloadFeedItems(targets);
}

function ctxOpenProperties(): void {
  const item = ctxMenu.value?.item ?? null;
  const id = item?.fileId ?? ctxTargetIds.value[0] ?? null;
  closeCtxMenu();
  if (id) {
    focusedId.value = id;
    if (item) focusedItemCache.value = item;
    panelId.value = id;
  }
  panelOpen.value = true;
}

async function deleteYandexIds(ids: string[]): Promise<boolean> {
  const yandexPaths = ids.filter(isYandexFileId).map(yandexPathFromFileId);
  if (yandexPaths.length === 0) return false;
  const title = yandexPaths.length === 1
    ? fmt('yandexDeleteTitle', { name: findLoadedItem(ids[0]!)?.name ?? yandexPaths[0]!.split('/').pop() ?? yandexPaths[0]! })
    : fmt('bulkDeleteTitle', { n: yandexPaths.length });
  const confirmed = await confirmDialog({
    title,
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return false;

  const removedPaths = new Set<string>();
  let failed = false;
  for (const path of yandexPaths) {
    try {
      const outcome = await yandexDisk.remove(path);
      if (outcome && outcome.status === 'pending') {
        await settleYandexOutcome(outcome);
      }
      removedPaths.add(path);
    } catch {
      failed = true;
    }
  }
  if (removedPaths.size > 0) {
    yandexRawItems.value = yandexRawItems.value.filter((it) => !removedPaths.has(it.path));
    clearSelection();
    const removedIds = new Set([...removedPaths].map((p) => `${YANDEX_ID_PREFIX}${p}`));
    if (focusedId.value && removedIds.has(focusedId.value)) {
      focusedId.value = null;
      focusedItemCache.value = null;
    }
    if (panelId.value && removedIds.has(panelId.value)) panelId.value = null;
    if (props.externalYandexPath) {
      void loadYandexMedia(props.externalYandexPath);
    }
  }
  if (failed) {
    toast.show(t('yandexOperationFailed'), 'error');
  }
  return removedPaths.size > 0;
}

async function deleteFileIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (ids.some(isYandexFileId)) {
    await deleteYandexIds(ids);
    return;
  }
  await Promise.allSettled(ids.map((id) => driveApi.trashFile(id)));
  clearSelection();
  if (focusedId.value && ids.includes(focusedId.value)) {
    focusedId.value = null;
    focusedItemCache.value = null;
  }
  if (panelId.value && ids.includes(panelId.value)) panelId.value = null;
  feedRef.value?.removeItems?.(ids);
  if (searchItems.value.some((i) => ids.includes(i.fileId))) {
    const idSet = new Set(ids);
    searchItems.value = searchItems.value.filter((i) => !idSet.has(i.fileId));
  }
  void feedRef.value?.refresh();
  void refreshSidebarCounts();
}

const deletingViewerIds = new Set<string>();
async function onViewerDelete(item: ViewerMediaItem): Promise<void> {
  if (!item?.fileId || deletingViewerIds.has(item.fileId)) return;
  deletingViewerIds.add(item.fileId);
  const isYandex = isYandexFileId(item.fileId);
  if (isYandex) {
    const confirmed = await confirmDialog({
      title: fmt('yandexDeleteTitle', { name: item.name }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!confirmed) {
      deletingViewerIds.delete(item.fileId);
      return;
    }
  }
  try {
    if (isYandex) {
      const path = yandexPathFromFileId(item.fileId);
      const outcome = await yandexDisk.remove(path);
      if (outcome && outcome.status === 'pending') {
        await settleYandexOutcome(outcome);
      }
      yandexRawItems.value = yandexRawItems.value.filter((it) => it.path !== path);
    } else {
      await driveApi.trashFile(item.fileId);
    }
  } catch (err) {
    deletingViewerIds.delete(item.fileId);
    toast.show(err instanceof Error && err.message ? err.message : t('photosPanelSaveError'), 'error');
    return;
  }
  deletingViewerIds.delete(item.fileId);

  if (!isYandex) {
    feedRef.value?.removeItems?.([item.fileId]);
    if (searchItems.value.some((i) => i.fileId === item.fileId)) {
      searchItems.value = searchItems.value.filter((i) => i.fileId !== item.fileId);
    }
  }
  if (selected.value.has(item.fileId)) {
    onToggleSelect([item.fileId], false);
  }

  const v = viewer.value;
  if (v) {
    const nextItems = v.items.filter((i) => i.fileId !== item.fileId);
    if (nextItems.length === 0) {
      viewer.value = null;
      if (focusedId.value === item.fileId) {
        focusedId.value = null;
        focusedItemCache.value = null;
      }
      if (panelId.value === item.fileId) panelId.value = null;
    } else {
      const nextIndex = Math.min(v.index, nextItems.length - 1);
      const nextItem = nextItems[nextIndex]!;
      viewer.value = { items: nextItems, index: nextIndex };
      focusedId.value = nextItem.fileId;
      focusedItemCache.value = nextItem;
      if (panelOpen.value && panelId.value) panelId.value = nextItem.fileId;
      emitFocusPhoto(nextItem);
      maybeLoadMoreForViewer(nextIndex, nextItems);
    }
  }

  if (isYandex && props.externalYandexPath) {
    void loadYandexMedia(props.externalYandexPath);
  } else {
    void refreshSidebarCounts();
  }
}

async function ctxDelete(): Promise<void> {
  const ids = ctxTargetIds.value;
  closeCtxMenu();
  await deleteFileIds(ids);
}

async function downloadSelectedAction(): Promise<void> {
  await downloadFeedItems(selectedFeedItems.value);
}

async function deleteSelectedAction(): Promise<void> {
  await deleteFileIds([...selected.value]);
}

const isTopChromeHidden = computed(() => (
  prefs.headroomHidden.value
  && !searchActive.value
  && selected.value.size < 2
  && !ctxMenu.value
  && !sortMenuOpen.value
  && !actions.albumMenuOpen.value
  && !moveOpen.value
  && props.activeSection !== 'trash'
  && !showPeopleGrid.value
));

watch(searchActive, (active) => {
  if (active) prefs.setHeadroomHidden(false);
});

function onWindowKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (
    viewer.value
    || moveOpen.value
    || document.querySelector('[role="dialog"]:not(.dp-album-picker), .modal-backdrop')
  ) {
    return;
  }
  if (ctxMenu.value) {
    e.preventDefault();
    closeCtxMenu();
    return;
  }
  if (actions.albumMenuOpen.value) {
    e.preventDefault();
    actions.closeAlbumMenu();
    return;
  }
  if (inlineSearchRef.value?.handleEscape?.()) {
    e.preventDefault();
    return;
  }
  if (searchActive.value || query.value.trim() !== '' || searchTypeFilter.value !== 'all') {
    e.preventDefault();
    searchTypeFilter.value = 'all';
    clearSearch();
    return;
  }
  if (selected.value.size > 0 || focusedId.value !== null) {
    e.preventDefault();
    clearSelection();
    focusedId.value = null;
    focusedItemCache.value = null;
    return;
  }
  if (panelOpen.value) {
    e.preventDefault();
    closePanel();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
  if (!isPhotosMock()) void loadSpaces();
  void refreshSidebarCounts();
});

// ----- panel (resizable) and viewer -----

function shownItems(): ViewerMediaItem[] {
  if (searchActive.value) return scopedSearchItems.value;
  const fromFeed = (feedRef.value?.orderedItems() ?? []) as ViewerMediaItem[];
  if (isYandexMode.value && fromFeed.length === 0) return yandexFeedItems.value;
  return fromFeed;
}

const selectedFeedItems = computed<FeedItem[]>(() => {
  if (selected.value.size < 2) return [];
  const byId = new Map(shownItems().map((i) => [i.fileId, i]));
  return [...selected.value].map((id) => byId.get(id)).filter((x): x is FeedItem => Boolean(x));
});

const isPanelVisible = computed(() => panelOpen.value && (Boolean(panelId.value) || selectedFeedItems.value.length > 1));

let lastFeedTotal: number | undefined;
let lastSidebarCounts: GallerySidebarCounts = {};

async function refreshSidebarCounts(): Promise<void> {
  const counts: GallerySidebarCounts = {};
  const loaded = feedRef.value?.orderedItems() ?? [];
  const baseParams = {
    sort: [],
    levels: ['date' as const],
    period: 'month' as const,
    shared: view.state.value.shared,
  };

  const sumGroups = (res: { groups?: Array<{ count: number }> } | undefined): number | undefined =>
    Array.isArray(res?.groups) ? res.groups.reduce((s, g) => s + g.count, 0) : undefined;

  const isAllSection =
    props.activeSection === 'library'
    && !effectiveAlbumId.value
    && !props.externalFolderId
    && !isYandexMode.value
    && selectedPeople.value.length === 0;

  let libraryTotal = isAllSection ? lastFeedTotal : undefined;
  if (libraryTotal === undefined && typeof photosApi?.summary === 'function') {
    try {
      libraryTotal = sumGroups(await photosApi.summary({ ...baseParams, filter: 'all' }));
    } catch {
      // Ignore summary count error
    }
  }
  if ((libraryTotal === undefined || libraryTotal === 0) && isAllSection && loaded.length > 0) {
    libraryTotal = loaded.length;
  }

  if (typeof libraryTotal === 'number') {
    counts.library = libraryTotal;
    counts.recent = Math.min(24, libraryTotal);
  }

  if (loaded.length > 0 && typeof libraryTotal === 'number' && loaded.length >= libraryTotal && isAllSection) {
    counts.favorites = loaded.filter((i) => i.favorite).length;
    counts.videos = loaded.filter((i) => i.kind === 'video').length;
  } else if (typeof photosApi?.summary === 'function') {
    const [favRes, vidRes] = await Promise.allSettled([
      photosApi.summary({ ...baseParams, filter: 'fav' }),
      photosApi.summary({ ...baseParams, filter: 'video' }),
    ]);
    if (favRes.status === 'fulfilled') {
      const n = sumGroups(favRes.value);
      if (typeof n === 'number') counts.favorites = n;
    }
    if (vidRes.status === 'fulfilled') {
      const n = sumGroups(vidRes.value);
      if (typeof n === 'number') counts.videos = n;
    }
  }

  counts.people = resolvedPeople.value.length;

  if (typeof driveApi?.getTrash === 'function') {
    try {
      const trashRes = await driveApi.getTrash({ limit: 100 });
      if (Array.isArray(trashRes?.items)) counts.trash = trashRes.items.length;
    } catch {
      // Ignore trash count error
    }
  }

  lastSidebarCounts = counts;
  emit('update:counts', counts);
}

function onFeedSummary(total: number): void {
  lastFeedTotal = total;
  void refreshSidebarCounts();
}

function onFeedUnitsLoaded(): void {
  const nextPeople = resolvedPeople.value.length;
  if (lastSidebarCounts.people !== nextPeople) {
    lastSidebarCounts = { ...lastSidebarCounts, people: nextPeople };
    emit('update:counts', { ...lastSidebarCounts });
  }
}

function onTrashRestored(): void {
  void feedRef.value?.refresh();
  void refreshSidebarCounts();
}

function onTrashFeedback(type: 'success' | 'error', message: string): void {
  toast.show(message, type);
}

function toggleInfoPanel(): void {
  if (isPanelVisible.value) {
    panelOpen.value = false;
    return;
  }
  const target = focusedId.value ?? [...selected.value][0] ?? shownItems()[0]?.fileId ?? null;
  if (target) {
    panelId.value = target;
    focusedId.value = target;
  }
  panelOpen.value = true;
}

let stopDrag: (() => void) | null = null;

function onPanelSashDown(e: PointerEvent): void {
  e.preventDefault();
  stopDrag?.();
  const startX = e.clientX;
  const startW = panelWidth.value;
  panelDragging.value = true;

  const onMove = (ev: PointerEvent) => {
    const dx = startX - ev.clientX;
    const raw = startW + dx;
    if (raw < PANEL_COLLAPSE_THRESHOLD) {
      panelOpen.value = false;
    } else {
      panelWidth.value = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, Math.round(raw)));
    }
  };

  const cleanup = () => {
    panelDragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (stopDrag === cleanup) stopDrag = null;
  };

  const onUp = () => {
    cleanup();
  };

  stopDrag = cleanup;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function emitFocusPhoto(item: FeedItem): void {
  if (effectiveAlbumId.value || isYandexFileId(item.fileId)) return;
  emit('focus-photo', item);
}

function onOpen(item: FeedItem): void {
  focusedId.value = item.fileId;
  focusedItemCache.value = item;
  emitFocusPhoto(item);
  if (panelOpen.value) {
    panelId.value = item.fileId;
  }
}

function onFeedFocusPhoto(item: FeedItem): void {
  if (focusedId.value === item.fileId && focusedItemCache.value?.fileId === item.fileId) return;
  focusedId.value = item.fileId;
  focusedItemCache.value = item;
  emitFocusPhoto(item);
}

function maybeLoadMoreForViewer(index: number, items: ViewerMediaItem[]): void {
  if (index < items.length - 5) return;
  if (isYandexMode.value) return;
  if (searchActive.value) {
    if (searchCursor.value !== null) loadMoreSearch();
    return;
  }
  const activeId = items[index]?.fileId;
  void Promise.resolve(feedRef.value?.loadMore?.()).then((loaded) => {
    if (!loaded || !viewer.value || searchActive.value) return;
    const fresh = feedRef.value?.orderedItems() ?? [];
    if (fresh.length === 0) return;
    const targetId = viewer.value.items[viewer.value.index]?.fileId ?? activeId;
    const found = targetId ? fresh.findIndex((i) => i.fileId === targetId) : -1;
    const nextIdx = found >= 0 ? found : Math.min(viewer.value.index, fresh.length - 1);
    viewer.value = { items: fresh, index: nextIdx };
  });
}

function onActivate(item: ViewerMediaItem): void {
  const items = shownItems();
  const index = items.findIndex((i) => i.fileId === item.fileId);
  if (index < 0) return;
  focusedId.value = item.fileId;
  focusedItemCache.value = item;
  emitFocusPhoto(item);
  if (panelOpen.value) panelId.value = item.fileId;
  viewer.value = { items, index };
  maybeLoadMoreForViewer(index, items);
}

function stepViewer(delta: number): void {
  const v = viewer.value;
  if (!v) return;
  const index = Math.min(v.items.length - 1, Math.max(0, v.index + delta));
  if (index === v.index) return;
  const next = v.items[index]!;
  viewer.value = { items: v.items, index };
  focusedId.value = next.fileId;
  focusedItemCache.value = next;
  if (panelOpen.value && panelId.value) panelId.value = next.fileId;
  emitFocusPhoto(next);
  maybeLoadMoreForViewer(index, v.items);
}

function jumpViewer(index: number): void {
  const v = viewer.value;
  if (!v || index < 0 || index >= v.items.length) return;
  const next = v.items[index]!;
  viewer.value = { items: v.items, index };
  focusedId.value = next.fileId;
  focusedItemCache.value = next;
  if (panelOpen.value && panelId.value) panelId.value = next.fileId;
  emitFocusPhoto(next);
  maybeLoadMoreForViewer(index, v.items);
}

watch(scopedSearchItems, (list) => {
  if (viewer.value && searchActive.value) {
    viewer.value = { ...viewer.value, items: list };
  }
});

function focusTile(fileId: string): void {
  const safe = fileId.replace(/"/g, '');
  rootEl.value?.querySelector<HTMLElement>(`[data-file-id="${safe}"]`)?.focus();
}

function focusFile(fileId: string): void {
  if (!fileId) return;
  focusedId.value = fileId;
  const found = findLoadedItem(fileId);
  if (found) focusedItemCache.value = found;
  else if (focusedItemCache.value?.fileId !== fileId) focusedItemCache.value = null;
  panelId.value = fileId;
  focusTile(fileId);
  void nextTick(() => focusTile(fileId));
}

function focusSearch(): void {
  inlineSearchRef.value?.focus();
}

function getActiveFocusTransfer(): GalleryFocusTransfer | null {
  const primaryId = focusedId.value ?? (selected.value.size > 0 ? [...selected.value][0]! : null);
  if (!primaryId || isYandexFileId(primaryId)) return null;
  const item = findLoadedItem(primaryId)
    ?? (focusedItemCache.value?.fileId === primaryId ? focusedItemCache.value : null);
  const resolvedFolderId = item ? item.folderId : (folderOf(primaryId) ?? null);
  const primaryShared = Boolean(item?.share);
  const matchingSelectedIds = selected.value.size >= 2
    ? [...selected.value].filter((id) => {
      if (id === primaryId) return true;
      const candidate = findLoadedItem(id);
      const candFolderId = candidate ? candidate.folderId : (folderOf(id) ?? null);
      const candShared = Boolean(candidate?.share);
      return candFolderId === resolvedFolderId && candShared === primaryShared;
    })
    : [primaryId];
  if (!matchingSelectedIds.includes(primaryId)) matchingSelectedIds.unshift(primaryId);
  return {
    fileId: primaryId,
    folderId: resolvedFolderId,
    shared: primaryShared,
    selectedIds: matchingSelectedIds,
  };
}

function refresh(opts?: { clearSelection?: boolean; invalidateFolders?: boolean }): void {
  if (opts?.clearSelection !== false) {
    selected.value = new Set();
  }
  if (opts?.invalidateFolders !== false) {
    invalidateGalleryFolderFilesCache();
  }
  if (isYandexMode.value && props.externalYandexPath !== null && props.externalYandexPath !== undefined) {
    void loadYandexMedia(props.externalYandexPath);
  } else {
    void feedRef.value?.refresh();
  }
  void refreshSidebarCounts();
  if (searchActive.value && searchQuery.value) {
    void runSearch(searchQuery.value);
  }
}

defineExpose({ focusFile, focusSearch, getActiveFocusTransfer, refresh });

function closePanel(restoreFocus = true): void {
  const id = panelId.value;
  panelOpen.value = false;
  if (restoreFocus && id) void nextTick(() => focusTile(id));
}

function onRootKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key.toLowerCase() === 'i' && !viewer.value && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    toggleInfoPanel();
  }
}

function onOpenFolder(folderId: string): void {
  emit('openFolder', folderId, panelId.value ?? '');
}

function onOpenAlbum(id: string): void {
  clearSearch();
  internalAlbumId.value = id;
  albumName.value = '';
  clearSelection();
  void loadAlbumName(id);
  emit('select-album', id);
}

function onPanelChanged(change: { fileId: string; favorite?: boolean; albumIds?: string[] }): void {
  const { fileId, ...patch } = change;
  const feed = feedRef.value;
  if (patch.albumIds !== undefined && view.state.value.captions.includes('album')) {
    feed?.refreshAlbums?.();
  }
  feed?.patchItem(fileId, patch);
  const albumMoved = patch.albumIds !== undefined && (effectiveAlbumId.value !== null || feedParams.value.levels.includes('album'));
  const leavesFavorites = patch.favorite !== undefined && view.state.value.filter === 'fav';
  if (albumMoved || leavesFavorites) void feed?.refresh();
  if (searchItems.value.some((i) => i.fileId === fileId)) {
    searchItems.value = searchItems.value.map((i) => (i.fileId === fileId ? { ...i, ...patch } : i));
  }
}

onBeforeUnmount(() => {
  stopDrag?.();
  cancelCloseCtxAlbums();
  clearPointerInsideCtx();
  detachCtxListeners();
  window.removeEventListener('keydown', onWindowKeydown);
  cancelSearchTimer();
  searchGen++;
  yandexAbort?.abort();
  yandexAbort = null;
  yandexLoadSeq++;
  prefs.setHeadroomHidden(false);
});
</script>

<style scoped>
.drive-photos {
  --dp-top-h: 50px;
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  min-width: 0;
  color: var(--ui-text);
}

.dp-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--dp-top-h, 50px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-tint, transparent), var(--ui-glass-bg, transparent);
  backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.18);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 16px)) saturate(1.18);
  z-index: 25;
  transition: transform 0.22s ease, opacity 0.2s ease;
}
.dp-top.is-hidden {
  transform: translateY(calc(-100% - 2px));
  opacity: 0;
  pointer-events: none;
}
.dp-top .sb-expand-btn {
  display: inline-flex;
}

.dp-top-left,
.dp-top-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dp-top-right {
  flex: 1 1 auto;
  justify-content: flex-end;
}

.dp-top-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dp-crumb-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  max-width: 150px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.dp-crumb-pill span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-icon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.dp-icon-pill:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.dp-icon-pill.active {
  background: var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}

.dp-zoom-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
  color: var(--ui-text-muted);
  flex: none;
  min-width: 0;
}
.dp-zoom-step {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 3px;
  cursor: pointer;
}
.dp-zoom-step:hover {
  color: var(--ui-text);
}
.dp-zoom-slider {
  width: clamp(64px, 7vw, 96px);
  min-width: 48px;
  accent-color: var(--ui-brand);
  cursor: pointer;
}

.dp-seg-center {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 9px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
}
.dp-seg-btn {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.dp-seg-btn:hover {
  color: var(--ui-text);
}
.dp-seg-btn.active {
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-weight: 600;
  box-shadow: var(--ui-glass-accent-shadow);
}
.dp-people-title {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.dp-sel-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.dp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  cursor: pointer;
  flex: none;
}
.dp-icon-btn:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}
.dp-icon-btn.active {
  background: var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
}

.dp-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  flex: none;
}
.dp-search-clear:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.dp-top button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.dp-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.dp-main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.dp-float-sort {
  position: absolute;
  top: calc(var(--dp-top-h, 50px) + 7px);
  right: 64px;
  z-index: 12;
  transition: top 0.22s ease;
}
.dp-float-sort.is-headroom-hidden {
  top: 7px;
}

.dp-search-grid {
  padding-top: calc(var(--dp-top-h, 50px) + 6px);
}

.dp-feed {
  flex: 1;
  min-height: 0;
}

.dp-people-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: var(--dp-top-h, 50px);
}

.dp-note {
  margin: 0;
  padding: calc(var(--dp-top-h, 50px) + 24px) 20px 24px;
  color: var(--ui-text-secondary);
}

.dp-retry {
  margin-left: 8px;
  padding: 4px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
}

.dp-mock {
  margin: var(--dp-top-h, 50px) 0 0;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface-subtle);
}

.dp-panel-shell {
  display: flex;
  flex: none;
  min-height: 0;
  max-width: 100%;
}

.dp-panel-slide-enter-active {
  transition:
    opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dp-panel-slide-leave-active {
  transition:
    opacity 0.13s ease-in,
    transform 0.13s ease-in;
}
.dp-panel-slide-enter-from,
.dp-panel-slide-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

.dp-panel-sash {
  width: 6px;
  flex: none;
  margin-left: -3px;
  margin-right: -3px;
  position: relative;
  z-index: 22;
  cursor: col-resize;
}
.dp-panel-sash::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
  transition: background 0.15s;
}
.dp-panel-sash:hover::after,
.dp-panel-sash.active::after {
  background: var(--ui-glass-accent-text);
}

.dp-panel {
  flex: none;
  max-width: 100%;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  padding-top: var(--dp-top-h, 50px);
}

.dp-ctx-menu {
  position: fixed;
  z-index: 1100;
  min-width: 210px;
  max-width: 280px;
  padding: 6px;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  display: flex;
  flex-direction: column;
  gap: 2px;
  outline: none;
  transform-origin: top left;
}
.dp-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.dp-ctx-item:hover,
.dp-ctx-item.is-submenu-open {
  background: var(--ui-glass-btn-hover);
}
.dp-ctx-danger {
  color: var(--ui-danger);
}
.dp-ctx-sep {
  height: 1px;
  background: var(--ui-glass-border);
  margin: 3px 4px;
}
.dp-ctx-chevron {
  margin-left: auto;
  flex: none;
  opacity: 0.72;
}
.dp-ctx-flyout {
  position: fixed;
  z-index: 1110;
  min-width: 204px;
  max-width: min(272px, calc(100vw - 16px));
  max-height: min(320px, calc(100dvh - 16px));
  padding: 6px;
  border-radius: 13px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.25);
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--ui-text);
  outline: none;
  overflow: visible;
  transform-origin: top left;
}
.dp-ctx-flyout[data-flyout-side="left"] {
  transform-origin: top right;
}
.dp-ctx-flyout::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -10px;
  width: 10px;
}
.dp-ctx-flyout[data-flyout-side="left"]::before {
  left: auto;
  right: -10px;
}
.dp-ctx-flyout-scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dp-ctx-sub-item {
  font-size: 12.5px;
  padding: 6px 9px;
}
.dp-ctx-sub-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dp-ctx-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--color-brands, #44cf6e);
}
.dp-ctx-check {
  flex: none;
  color: var(--ui-glass-accent-text, var(--color-brands));
}
.dp-ctx-new-album {
  color: var(--ui-glass-accent-text, var(--color-brands));
  font-weight: 500;
}

.dp-trash-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--dp-top-h, 50px) + 14px) 18px 14px;
}

.dp-album-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1150;
  background: rgba(0, 0, 0, 0.36);
  display: grid;
  place-items: center;
  padding: 16px;
}
.dp-album-picker {
  width: min(320px, 100%);
  padding: 12px;
  border-radius: 14px;
  background: var(--ui-glass-tint), var(--ui-surface-solid);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dp-album-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.dp-album-picker-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--ui-text-muted);
}
.dp-album-picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}

@media (max-width: 820px) {
  .dp-zoom-wrap {
    display: none;
  }
}

@media (max-width: 720px) {
  .dp-top {
    padding: 0 6px;
    gap: 4px;
  }
  .dp-top-left {
    flex: 0 0 auto;
    gap: 4px;
  }
  .dp-top-right {
    flex: 0 1 auto;
    min-width: 0;
    gap: 4px;
  }
  .dp-top-center {
    position: static;
    transform: none;
    margin: 0 auto;
    flex: 0 0 auto;
  }
  .dp-crumb-pill {
    max-width: 82px;
    height: 26px;
    padding: 0 6px;
    font-size: 11px;
  }
  .dp-album-members-pill {
    height: 26px;
    padding: 0 7px;
    font-size: 11px;
  }
  .dp-album-share-pill {
    height: 26px;
    padding: 0 7px;
  }
  .dp-album-share-pill span {
    display: none;
  }
  .dp-icon-pill[data-testid='aspect-toggle'] {
    height: 26px;
    padding: 0 7px;
  }
  .dp-icon-btn {
    width: 26px;
    height: 26px;
  }
  .dp-seg-btn {
    height: 26px;
    padding: 0 7px;
    font-size: 11.5px;
  }
  .dp-panel-shell {
    position: absolute;
    inset: 0;
    z-index: 20;
  }
  .dp-panel-sash {
    display: none;
  }
  .dp-panel {
    position: static;
    flex: 1 1 auto;
    width: auto !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dp-panel-slide-enter-active,
  .dp-panel-slide-leave-active {
    transition: none;
  }
}
</style>
