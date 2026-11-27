<template>
  <div
    class="app-layout dashboard-view"
    :class="{ 'is-android-app': isAndroidApp }"
    @click.capture="onAppClickCapture"
    @keydown.capture="onAppKeydownCapture"
    @click="closeCardMenu"
  >
    <div
      class="dashboard-app-shell explorer-app-shell"
      :class="{
        'sidebar-collapsed': isLoggedIn && sidebarCollapsed,
        'dashboard-app-shell-public': !isLoggedIn,
        'is-gallery-mode': isLoggedIn && activeSection.kind === 'gallery',
      }"
    >
      <DashboardSidebar
        ref="sidebarRef"
        :admin="admin"
        v-if="isLoggedIn"
        :active-section="activeSection"
        :feed-section="isHomeFeed ? activeFeedSection : null"
        :mode="sidebarMode"
        :width-state="sidebarWidthState"
        :collapsed="sidebarCollapsed"
        :mobile-open="mobileSidebarOpen"
        :android-app="isAndroidApp"
        :folders="sidebarFolders"
        :all-folders="sidebarAllFolders"
        :spaces="isLoggedIn"
        :yandex-refresh-key="yandexRefreshKey"
        :incoming-access-requests-count="incomingRequests.length"
        :devices-online-count="devicesOnlineCount"
        :devices-paired="devicesPaired"
        :folder-drag-id="folderDragId"
        @select="onSidebarSelect"
        @switch-mode="onSwitchSidebarMode"
        @toggle-mobile-drawer="onToggleMobileDrawer"
        @update:collapsed="onSidebarCollapsedChange"
        @toggle-collapse="onSidebarCollapseButton"
        @open-yandex-file="openYandexSidebarFile"
        @create-space="createSpace"
        @create-folder="openCreateGroupModal"
        @share-space="openAlbumShareById"
        @toggle-width="toggleSidebarWidth"
        @close-mobile="closeMobileSidebar"
        @open-file="openSidebarFile"
        @toggle-folder="toggleTreeExpanded"
        @navigate-up="goToParentFolder"
        @tree-contextmenu="onTreeContextMenu"
        @drop-group-to-folder="(p) => onDropGroupToFolder(p.folderId, p.drag)"
        @drop-group-to-album="(p) => onDropGroupToAlbum(p.albumId, p.drag)"
        @drop-external-files="(p) => onDropExternalFilesToFolder(p.folderId, p.files)"
        @folder-drag-start="onSidebarFolderDragStart"
        @folder-drag-end="onFolderDragEnd"
        @folder-drag-enter="onSidebarFolderDragEnter"
        @folder-drag-over="onSidebarFolderDragOver"
        @folder-drag-leave="onSidebarFolderDragLeave"
        @folder-drop="onSidebarFolderDrop"
      >
        <template #gallery-sidebar>
          <GallerySidebar
            :active-section="(gallerySection as GallerySection)"
            :active-album-id="galleryAlbumId"
            :active-folder-id="galleryFolderId"
            :highlighted-folder-id="galleryHighlightFolderId"
            :highlighted-file-id="galleryHighlightFileId"
            :folders="galleryStorageFolders"
            :counts="gallerySidebarCounts"
            @select-section="onGallerySelectSection"
            @select-album="onGallerySelectAlbum"
            @select-folder="onGallerySelectFolder"
            @select-file="onGallerySelectFile"
            @select-yandex="openYandexPath"
            @create-album="createSpace"
            @share-album="openAlbumShareById"
            @open-trash="onGalleryOpenTrash"
            @drop-favorites="onGalleryDropFavorites"
            @drop-album="onGalleryDropAlbum"
            @drop-folder="onGalleryDropFolder"
          />
        </template>
      </DashboardSidebar>
      <div
        class="dashboard-central-shell"
        data-dashboard-dropzone
        @dragenter="onExternalDragEnter"
        @dragover="onExternalDragOver"
        @dragleave="onExternalDragLeave"
        @drop="onExternalDrop"
      >
      <DriveUploadOverlay
        :active="isExternalDraggingOver"
        :label="externalDropLabel"
        :show-input="false"
      />
      <div
        v-if="marquee"
        class="dashboard-marquee"
        :style="{ left: marquee.left + 'px', top: marquee.top + 'px', width: marquee.width + 'px', height: marquee.height + 'px' }"
        aria-hidden="true"
        data-marquee
      ></div>
      <Transition name="dashboard-upload-panel">
        <DashboardUploadPanel
          v-if="!journalActive && uploadPanelOpen && uploads.length"
          :uploads="uploads"
          :summary="uploadSummary"
          @cancel="cancelUpload"
          @collapse="uploadPanelOpen = false"
          @hide="clearFinishedUploads"
        />
      </Transition>
      <Transition name="dashboard-upload-badge">
        <DashboardUploadBadge v-if="!journalActive && !uploadPanelOpen && uploads.length" :summary="uploadSummary" @open="uploadPanelOpen = true" />
      </Transition>
      <DashboardStatusOverlays
        v-if="!journalActive"
        :download-phase="downloadStatus.phase"
        :transfer-status-text="transferStatusText"
        :transfer-status-percent="transferStatusPercent"
      />
    <DashboardPublicHeader v-if="!isLoggedIn" v-model:search-query="searchQuery" :folder-search-placeholder="folderSearchPlaceholder" />
    <ExplorerHeadroomBar
      v-else-if="activeSection.kind !== 'gallery'"
      ref="headroomBarRef"
      :headroom-hidden="headroomHidden"
      :elevated="headroomElevated"
      :view-mode="explorerViewMode"
      :album-view-mode="albumViewMode"
      :view-toggle-mode="headroomViewToggleMode"
      :can-go-back="activeSection.kind === 'folder' || activeSection.kind === 'yandex' || activeSection.kind === 'space'"
      :can-go-up="activeSection.kind === 'folder' || activeSection.kind === 'space' || activeSection.kind === 'yandex'"
      :show-nav-arrows="true"
      :show-expand-button="showSidebarExpand"
      :show-mobile-menu-button="false"
      :android-app="isAndroidApp"
      v-model:search-query="searchQuery"
      v-model:search-scope-mode="s2ScopeMode"
      :search-scope-label="s2ScopeLabel"
      v-model:search-type-filter="s2TypeFilter"
      :search-folders="s2SearchFolders"
      :search-albums="s2SearchAlbums"
      :search-items="s2SearchItems"
      :search-ml-tags="allTagNames"
      @expand-sidebar="onExpandSidebar"
      @open-mobile-sidebar="openMobileSidebar"
      @go-back="goToParentFolder"
      @go-up="goToParentFolder"
      @select-search-folder="onSearchSelectFolder"
      @select-search-album="onSearchSelectAlbum"
      @open-search-item="onSearchOpenItem"
      @select-search-tag="onSearchSelectTag"
      @update:view-mode="setExplorerViewMode"
      @update:album-view-mode="setAlbumViewMode"
    >
      <template #filters>
        <DashboardFilterMenu
          v-if="spaceId === null"
          :open="openControlMenu === 'filter:desktop'"
          :types="contentTypes"
          :tags="allTagNames"
          :selected-tags="selectedTags"
          :with-files="activeSection.kind === 'folder' || activeSection.kind === 'home'"
          :sheet="isAndroidApp && isMobileHeadroom"
          @toggle="toggleToolbarMenu('filter:desktop')"
          @update:types="contentTypes = $event"
          @toggle-tag="toggleSelectedTag"
          @reset="clearTypeAndTagFilters"
        />
        <button
          v-else
          type="button"
          class="icon-btn headroom-space-filter-btn"
          :class="{ active: (spaceView?.activeFilterCount ?? 0) > 0 }"
          :aria-label="t('filters')"
          :title="t('filters')"
          :aria-expanded="Boolean(spaceView?.filterMenuOpen)"
          data-headroom-space-filter
          @click.stop="spaceView?.toggleFilters()"
        >
          <SlidersHorizontal :size="15" aria-hidden="true" />
          <span
            v-if="(spaceView?.activeFilterCount ?? 0) > 0"
            class="dashboard-filter-badge"
            data-headroom-space-filter-count
          >{{ spaceView?.activeFilterCount }}</span>
        </button>
        <DashboardSortMenu
          v-if="activeSection.kind !== 'trash'"
          :open="openControlMenu === 'sort:desktop'"
          :mode="sortMode"
          :sheet="isAndroidApp && isMobileHeadroom"
          @toggle="toggleToolbarMenu('sort:desktop')"
          @select="selectSortMode"
        />
      </template>
      <template #actions>
        <button
          v-if="selectedKeys.length >= 1"
          type="button"
          class="dp-sel-badge explorer-sel-badge"
          data-explorer-sel-badge
          :title="t('clearSelection')"
          :aria-label="t('clearSelection')"
          @click="clearSelection"
        >
          <span>{{ selectedKeys.length }}</span>
          <span aria-hidden="true">✕</span>
        </button>

        <div
          v-if="activeSection.kind === 'folder' && activeFolder && activeFolder.role === 'owner'"
          class="folder-manager-menu headroom-folder-menu"
        >
          <button
            type="button"
            class="icon-btn headroom-actions-trigger"
            data-headroom-folder-menu
            :title="t('groupActions')"
            :aria-label="t('groupActions')"
            :aria-expanded="openControlMenu === 'folder:' + activeFolder.id"
            :disabled="isBusy"
            @click.stop="toggleFolderMenu(activeFolder.id)"
          >⋯</button>
          <Transition name="card-menu-pop">
            <div
              v-if="openControlMenu === 'folder:' + activeFolder.id"
              class="mobile-action-popover headroom-action-popover"
              data-headroom-folder-actions
              @click.stop
            >
              <button type="button" class="card-menu-item" data-folder-import @click="openAddDialog({ folderId: activeFolder.id, importKind: 'file' })" :disabled="isBusy">{{ t('import') }}</button>
              <button type="button" class="card-menu-item" data-folder-share @click="openFolderShareModal(activeFolder)" :disabled="isBusy">{{ t('share') }}</button>
              <button v-if="activeFolder.name !== 'Unsorted'" type="button" class="card-menu-item" data-folder-rename @click="openRenameFolderModal(activeFolder)" :disabled="isBusy">{{ t('rename') }}</button>
              <button type="button" class="card-menu-item" data-folder-add-subfolder @click="openSubfolderModal(activeFolder)" :disabled="isBusy">{{ t('addFolder') }}</button>
              <button v-if="activeFolder.name !== 'Unsorted'" type="button" class="card-menu-item" data-action="move-folder-parent" @click="openFolderParentModal(activeFolder)" :disabled="isBusy">{{ t('moveFolderInto') }}</button>
              <button v-if="activeFolder.name !== 'Unsorted'" type="button" class="card-menu-item danger" data-folder-delete @click="deleteFolder(activeFolder)" :disabled="isBusy">{{ t('delete') }}</button>
            </div>
          </Transition>
        </div>

        <template v-if="spaceId !== null && activeSpace">
          <button
            type="button"
            class="headroom-members-pill"
            data-headroom-space-members
            :title="headroomSpaceCountLabel"
            :aria-label="headroomSpaceCountLabel"
            @click="openAlbumShareById(spaceId)"
          >
            <Users :size="13" aria-hidden="true" />
            <span class="headroom-members-prefix">{{ headroomSpaceCountPrefix }}</span><span class="headroom-members-num">{{ headroomSpaceMembersTotal }}</span>
          </button>
          <button
            type="button"
            class="space-share-btn headroom-share-btn"
            data-headroom-space-share
            @click="openAlbumShareById(spaceId)"
          >
            <Share2 :size="14" aria-hidden="true" />
            <span>{{ t('explorerShareGroup') }}</span>
          </button>
        </template>
      </template>
    </ExplorerHeadroomBar>

    <main
      ref="dashboardMain"
      class="app-main dashboard"
      :class="{ 'app-main-gallery': isLoggedIn && activeSection.kind === 'gallery' }"
      @scroll.passive="onDashboardMainScroll"
      @pointerdown="onDashboardMainPointerDown"
      @contextmenu="onDashboardMainContextMenu"
      @touchstart.passive="onDashboardPullStart"
      @touchmove="onDashboardPullMove"
      @touchend="onDashboardPullEnd"
      @touchcancel="resetDashboardPull"
    >
    <!-- One grid/list choice for the whole dashboard: every feed section
         and every folder (persisted in localStorage via qspace:viewMode). -->
    <div
      ref="dashboardShell"
      class="dashboard-shell"
      :class="[{ 'dashboard-list-view': !isLoggedIn && recentViewMode === 'list', 'dashboard-selecting': selectedKeys.length > 0, 'dashboard-marquee-active': Boolean(marquee), 'dashboard-shell-gallery': isLoggedIn && activeSection.kind === 'gallery' }, 'dashboard-nav-' + navDirection]"
      @click.capture="onSelectionClickCapture"
      @pointerdown.capture="onSelectionPointerDown"
      @pointermove.capture="onSelectionPointerMove"
      @pointerup.capture="cancelLongPress"
      @pointercancel.capture="cancelLongPress"
      @contextmenu.capture="onSelectionContextMenu"
    >
    <DashboardToolbarControls
      v-if="!isLoggedIn"
      :show-controls="spaceId === null"
      :filter-open="openControlMenu === 'filter:desktop'"
      :sort-open="openControlMenu === 'sort:desktop'"
      :content-types="contentTypes"
      :tags="allTagNames"
      :selected-tags="selectedTags"
      :with-files="activeSection.kind === 'folder'"
      :sort-mode="sortMode"
      :search-query="searchQuery"
      :search-placeholder="folderSearchPlaceholder"
      @add="spaceId !== null ? spaceView?.startAdd($event) : yandexPath !== null ? yandexView?.pickFiles() : openAddDialog()"
      @toggle-filter="toggleToolbarMenu('filter:desktop')"
      @toggle-sort="toggleToolbarMenu('sort:desktop')"
      @update:types="contentTypes = $event"
      @toggle-tag="toggleSelectedTag"
      @reset-filters="clearTypeAndTagFilters"
      @select-sort="selectSortMode"
      @update:search="searchQuery = $event"
    />

    <!-- Floating (style.css), never in the page flow: the list must not
         shift down and back up around a refresh or an action's result. -->
    <div v-if="isRefreshing && !loading" class="dashboard-refresh-status" role="status" aria-live="polite">
      <span class="dashboard-refresh-spinner" aria-hidden="true"></span>
      <span>{{ t('updatingList') }}</span>
    </div>
    <section
      v-if="isLoggedIn && activeSection.kind === 'recent'"
      id="feed-recent"
      class="dash-section dashboard-recents dashboard-feed-section"
      data-dashboard-view="recent"
      data-feed-section="recent"
    >
      <template v-if="favoriteTiles.length">
        <div id="feed-favorites" class="dash-section-head dashboard-recent-folders-head" data-feed-section="favorites">
          <h2>{{ t('explorerFavorites') }}</h2>
        </div>
        <div class="dash-grid subfolder-grid" data-home-favorites>
          <button
            v-for="fav in favoriteTiles"
            :key="fav.key"
            type="button"
            class="subfolder-card"
            :data-favorite-tile="fav.key"
            @click="openFavoriteTile(fav)"
            @contextmenu.prevent.stop="onFavoriteTileContextMenu($event, fav)"
          >
            <span class="subfolder-card-icon" aria-hidden="true">
              <UsersRound v-if="fav.kind === 'space'" :size="13" />
              <Folder v-else-if="fav.kind === 'folder'" :size="13" />
              <FileIcon v-else-if="fav.kind === 'drive-file' || fav.kind === 'file'" :size="13" />
              <ResourceIcon v-else :kind="fav.kind" :size="13" />
            </span>
            <span class="subfolder-card-name">{{ fav.name }}</span>
            <span class="subfolder-card-count">{{ fav.subtitle }}</span>
          </button>
        </div>
      </template>

      <div class="dash-section-head dashboard-recent-head">
        <h2>{{ t('recents') }}</h2>
      </div>
      <p v-if="recentRefreshFailed && visibleRecent.length" class="dashboard-recents-stale" role="status" data-recent-stale>
        {{ t('recentStale') }}
        <button type="button" class="dash-empty-reset" @click.stop="retryRecent">{{ t('retry') }}</button>
      </p>
      <ExplorerTableView
        v-if="visibleRecent.length && explorerViewMode === 'table'"
        :rows="recentTableRows"
        :selected-keys="selectedKeys"
        :hide-albums="true"
        :external-sort-mode="sortMode"
        :external-sort-seq="sortSyncSeq"
        @update:selected-keys="selectedKeys = $event"
        @update:sort="onExplorerTableSort"
        @open="openExplorerTableRow"
        @contextmenu="onTableRowContextMenu"
      />
      <DashboardRecentResources
        v-else-if="visibleRecent.length"
        :items="visibleRecent"
        :recent-view-mode="recentViewMode"
        :is-logged-in="isLoggedIn"
        :selection-key="selectionKey"
        :is-selected="isSelected"
        :folder-path="recentFolderPath"
        :format-opened-at="formatRecentOpenedAt"
        :format-mobile-date="formatCardDateMobile"
        @open="openRecentResource"
        @toggle="(item) => toggleSelected(selectionKey(item))"
        @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
      />
      <div v-else-if="recentRefreshFailed" class="dash-empty dashboard-recents-error" role="alert" data-recent-error>
        {{ t('recentLoadFailed') }}
        <button type="button" class="dash-empty-reset" data-recent-retry @click.stop="retryRecent">{{ t('retry') }}</button>
      </div>
      <div v-else-if="recentResources.length" class="dash-empty dashboard-recents-empty">
        {{ t('noRecentMatches') }}
        <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
      </div>
      <div v-else class="dash-grid" data-feed-grid="recent">
          <button type="button" class="dashboard-add-tile dashboard-recents-empty" data-feed-add="recent" @click.stop="openAddFromTile('recent')">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
      </div>
      <button
        v-if="recentShowAllAvailable"
        type="button"
        class="dashboard-recent-show-all"
        @click="toggleRecentExpanded"
      >
        <span>{{ recentExpanded ? t('showLess') : `${t('showAll')} ${recentTotal}` }}</span>
        <ChevronDown v-if="!recentExpanded" :size="15" aria-hidden="true" />
        <ChevronUp v-else :size="15" aria-hidden="true" />
      </button>

      <div id="feed-folders" class="dash-section-head dashboard-recent-folders-head dashboard-feed-anchor" data-feed-anchor="folders">
        <h2>{{ t('folders') }}</h2>
        <button
          type="button"
          class="tree-alb-add-btn dashboard-feed-folders-add"
          data-feed-folders-add
          :aria-label="t('explorerNewFolder')"
          :title="t('explorerNewFolder')"
          @click.stop="openCreateGroupModal()"
        >
          <Plus :size="14" aria-hidden="true" />
        </button>
      </div>
      <div v-if="recentFolderTiles.length" class="dash-grid subfolder-grid" data-recent-folders>
        <button
          v-for="folder in recentFolderTiles"
          :key="'recent-folder-' + folder.id"
          type="button"
          class="subfolder-card"
          :class="{ 'subfolder-card-zero-match': folder.zeroMatch }"
          :data-recent-folder-tile="folder.id"
          @click="selectFolder(folder.id)"
          @contextmenu.prevent.stop="onGridFolderContextMenu($event, folder)"
        >
          <span class="subfolder-card-icon" aria-hidden="true">▤</span>
          <span class="subfolder-card-name">{{ folder.name }}</span>
          <span class="subfolder-card-count">{{ folder.displayCount }}</span>
          <span v-if="folder.latest" class="subfolder-card-date" data-folder-tile-date>{{ formatDate(folder.latest) }}</span>
        </button>
      </div>
      <div v-else class="dash-grid subfolder-grid" data-recent-folders-empty>
        <button type="button" class="dashboard-add-tile dashboard-add-tile-folder" data-feed-add="folders" @click.stop="openAddFromTile('folders')">
          <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
        </button>
      </div>

      <!-- Unified Albums (Spaces) on Home feed. Yandex Disk lives only under Clouds. -->
      <div id="feed-spaces" class="dash-section-head dashboard-recent-folders-head dashboard-feed-anchor" data-feed-anchor="spaces">
        <h2>{{ t('spaces') }}</h2>
      </div>
      <div v-if="spaceTiles.length" class="dash-grid subfolder-grid" data-recent-spaces>
        <div
          v-for="space in spaceTiles"
          :key="'recent-space-' + space.id"
          class="space-overview-card-wrap"
        >
          <button
            type="button"
            class="subfolder-card"
            :data-recent-space-tile="space.id"
            @click="selectDashboardSection({ kind: 'space', spaceId: space.id })"
            @contextmenu.prevent.stop="onSpaceTileContextMenu($event, space)"
          >
            <span class="subfolder-card-icon" aria-hidden="true"><UsersRound :size="13" /></span>
            <span class="subfolder-card-name">{{ space.name }}</span>
            <span class="subfolder-card-count">{{ space.itemCount || space.sourceCount || t('emptyFolder') }}</span>
            <span v-if="space.updatedAt" class="subfolder-card-date" data-folder-tile-date>{{ formatDate(space.updatedAt) }}</span>
          </button>
          <button
            type="button"
            class="space-overview-share-btn"
            :aria-label="t('share')"
            :title="t('share')"
            :data-recent-space-share="space.id"
            @click.stop="openAlbumShareById(space.id)"
          >
            {{ t('share') }}
          </button>
        </div>
      </div>
      <div v-else class="dash-grid subfolder-grid" data-recent-spaces-empty>
        <button type="button" class="dashboard-add-tile dashboard-add-tile-folder" data-feed-add="spaces" @click.stop="createSpace">
          <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
        </button>
      </div>
    </section>
    <div
      v-if="isNativeDashboard && (dashboardPullDistance > 0 || isRefreshing)"
      class="dashboard-pull-status"
      :class="{ ready: dashboardPullDistance >= DASHBOARD_PULL_THRESHOLD, refreshing: isRefreshing }"
      role="status"
      aria-live="polite"
    >
      <span class="dashboard-pull-icon" aria-hidden="true">{{ isRefreshing ? '↻' : '↓' }}</span>
      <span>{{ isRefreshing ? t('updatingList') : dashboardPullDistance >= DASHBOARD_PULL_THRESHOLD ? t('releaseToRefresh') : t('pullToRefresh') }}</span>
    </div>

    <div
      v-if="feedback.message"
      class="dashboard-toast"
      :class="`dashboard-toast-${feedback.type}`"
      :role="feedback.type === 'error' ? 'alert' : 'status'"
      aria-live="polite"
      data-dashboard-toast
    >
      {{ feedback.message }}
    </div>

    <div v-if="loading" class="dash-loading">{{ t('loading') }}</div>

    <template v-else>
      <DashboardAccessRequests
        v-if="isLoggedIn && activeSection.kind === 'recent'"
        :requests="incomingRequests"
        :is-busy="isBusy"
        @refresh="load"
        @resolve="resolveAccessRequest"
      />

      <section
        v-if="isLoggedIn && activeSection.kind === 'home'"
        class="dashboard-folder-content"
        data-dashboard-view="home"
      >
        <div class="folder-manager-row">
          <div class="folder-manager-body" @contextmenu.prevent.stop="onEmptyAreaContextMenu">
            <ExplorerTableView
              v-if="explorerViewMode === 'table'"
              :rows="homeRootTableRows"
              :selected-keys="selectedKeys"
              :external-sort-mode="sortMode"
              :external-sort-seq="sortSyncSeq"
              :allow-empty-context-menu="true"
              @update:selected-keys="selectedKeys = $event"
              @update:sort="onExplorerTableSort"
              @open="openExplorerTableRow"
              @contextmenu="onTableRowContextMenu"
              @empty-contextmenu="onEmptyAreaContextMenu"
              @drop-on-folder="(targetRow, payload) => onDropGroupToFolder(targetRow.id, payload)"
              @drop-external-files="(p) => onDropExternalFilesToFolder(p.folderId, p.files)"
            />
            <DashboardActiveSubfolders
              v-if="explorerViewMode !== 'table'"
              :subfolders="homeRootSubfolders"
              :active-folder-empty="homeRootEmpty"
              :has-active-filter="hasActiveFilter"
              :is-owner="true"
              :format-date="formatDate"
              :selected-keys="selectedKeys"
              :build-group-drag-entries="buildGroupDragEntriesForKeys"
              @select="selectFolder"
              @reset="resetFilters"
              @add="openAddDialog()"
              @contextmenu="(ev, folder) => onGridFolderContextMenu(ev, folder)"
              @drop-external-files="(p) => onDropExternalFilesToFolder(p.folderId, p.files)"
              @drop-on-folder="(targetFolderId, payload) => onDropGroupToFolder(targetFolderId, payload)"
            />
            <div
              v-if="showScopedSearchEverywhereCta"
              class="explorer-search-everywhere-bar"
              data-search-everywhere-bar
            >
              <button
                type="button"
                class="btn-secondary"
                data-search-everywhere-btn
                @click="s2ScopeMode = 'global'"
              >
                {{ locale === 'ru' ? 'Искать везде' : 'Search everywhere' }}
              </button>
            </div>
            <div class="dash-grid" v-show="explorerViewMode !== 'table'">
              <DashboardFolderResourceGrid
                :items="homeRootItems"
                :selected-keys="selectedKeys"
                :is-logged-in="isLoggedIn"
                :is-busy="isBusy"
                :dragging-resource-id="draggingResourceId"
                :open-menu-canvas-id="openMenuCanvasId"
                :renaming-id="renamingId"
                :card-menu-style="cardMenuStyle"
                :selection-key="selectionKey"
                :is-selected="isSelected"
                :is-owned-resource="isOwnedResource"
                :format-date="formatDate"
                :format-card-date-mobile="formatCardDateMobile"
                :interactive-template-type-label="interactiveTemplateTypeLabel"
                :resource-actions="resourceActions"
                @open-canvas="openCanvasFromCard"
                @open-html="openHtmlDocumentFromCard"
                @open-text="openTextDocumentFromCard"
                @open-interactive="openInteractiveTemplate"
                @remember="rememberRecentResource"
                @start-rename="startRename"
                @finish-rename="finishRename"
                @cancel-rename="renamingId = ''"
                @toggle-selected="toggleSelected"
                @toggle-pinned="togglePinned"
                @toggle-menu="toggleCardMenu"
                @select-action="handleResourceAction"
                @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
              />
              <DashboardFolderFiles
                folder-id="root"
                :query="searchQuery"
                :filtered-out="(!typePasses(contentTypes, 'file') && !typePasses(contentTypes, 'text-document')) || selectedTags.length > 0"
                :markdown-only="!typePasses(contentTypes, 'file') && typePasses(contentTypes, 'text-document')"
                :sort-mode="sortMode"
                :refresh-key="folderFilesRefreshKey"
                :selectable="isLoggedIn"
                :selected-keys="selectedKeys"
                @count="homeRootFileCount = $event"
                @files="homeRootDriveFiles = $event"
                @toggle-select="toggleSelected"
                @open-image="openDriveImage"
                @open-markdown="openDriveMarkdown"
                @previews="folderDrivePreviews = $event"
                @contextmenu="(ev, file) => onGridDriveFileContextMenu(ev, file)"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="isLoggedIn && activeSection.kind === 'folder' && activeFolder"
        class="dashboard-folder-content"
        data-dashboard-view="folder"
      >
          <div
            :key="activeFolder.id"
            class="folder-manager-row"
          >
              <div ref="activeFolderBody" class="folder-manager-body" @scroll="onFolderBodyScroll" @contextmenu.prevent.stop="onEmptyAreaContextMenu">
                <ExplorerTableView
                  v-if="explorerViewMode === 'table'"
                  :rows="activeFolderTableRows"
                  :selected-keys="selectedKeys"
                  :external-sort-mode="sortMode"
                  :external-sort-seq="sortSyncSeq"
                  :allow-empty-context-menu="true"
                  @update:selected-keys="selectedKeys = $event"
                  @update:sort="onExplorerTableSort"
                  @open="openExplorerTableRow"
                  @contextmenu="onTableRowContextMenu"
                  @empty-contextmenu="onEmptyAreaContextMenu"
                  @drop-on-folder="(targetRow, payload) => onDropGroupToFolder(targetRow.id, payload)"
                  @drop-external-files="(p) => onDropExternalFilesToFolder(p.folderId, p.files)"
                />
                <DashboardActiveSubfolders
                  v-if="explorerViewMode !== 'table'"
                  :subfolders="activeSubfolders"
                  :active-folder-empty="activeFolderEmpty"
                  :has-active-filter="hasActiveFilter"
                  :is-owner="activeFolder.role === 'owner'"
                  :format-date="formatDate"
                  :selected-keys="selectedKeys"
                  :build-group-drag-entries="buildGroupDragEntriesForKeys"
                  @select="selectFolder"
                  @reset="resetFilters"
                  @add="openAddFromTile('folder')"
                  @contextmenu="(ev, folder) => onGridFolderContextMenu(ev, folder)"
                  @drop-external-files="(p) => onDropExternalFilesToFolder(p.folderId, p.files)"
                  @drop-on-folder="(targetFolderId, payload) => onDropGroupToFolder(targetFolderId, payload)"
                />
                <div
                  v-if="showScopedSearchEverywhereCta"
                  class="explorer-search-everywhere-bar"
                  data-search-everywhere-bar
                >
                  <button
                    type="button"
                    class="btn-secondary"
                    data-search-everywhere-btn
                    @click="s2ScopeMode = 'global'"
                  >
                    {{ locale === 'ru' ? 'Искать везде' : 'Search everywhere' }}
                  </button>
                </div>
                <div class="dash-grid" v-show="explorerViewMode !== 'table'">
                  <DashboardFolderResourceGrid
                    :items="activeFolder.items"
                    :selected-keys="selectedKeys"
                    :is-logged-in="isLoggedIn"
                    :is-busy="isBusy"
                    :dragging-resource-id="draggingResourceId"
                    :open-menu-canvas-id="openMenuCanvasId"
                    :renaming-id="renamingId"
                    :card-menu-style="cardMenuStyle"
                    :selection-key="selectionKey"
                    :is-selected="isSelected"
                    :is-owned-resource="isOwnedResource"
                    :format-date="formatDate"
                    :format-card-date-mobile="formatCardDateMobile"
                    :interactive-template-type-label="interactiveTemplateTypeLabel"
                    :resource-actions="resourceActions"
                    @open-canvas="openCanvasFromCard"
                    @open-html="openHtmlDocumentFromCard"
                    @open-text="openTextDocumentFromCard"
                    @open-interactive="openInteractiveTemplate"
                    @remember="rememberRecentResource"
                    @start-rename="startRename"
                    @finish-rename="finishRename"
                    @cancel-rename="renamingId = ''"
                    @toggle-selected="toggleSelected"
                    @toggle-pinned="togglePinned"
                    @toggle-menu="toggleCardMenu"
                    @select-action="handleResourceAction"
                    @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
                  />
                  <DashboardFolderFiles
                    v-if="activeFolder.id !== 'legacy-resource-inbox'"
                    :folder-id="activeFolder.id"
                    :query="searchQuery"
                    :filtered-out="(!typePasses(contentTypes, 'file') && !typePasses(contentTypes, 'text-document')) || selectedTags.length > 0"
                    :markdown-only="!typePasses(contentTypes, 'file') && typePasses(contentTypes, 'text-document')"
                    :sort-mode="sortMode"
                    :refresh-key="folderFilesRefreshKey"
                    :selectable="isLoggedIn"
                    :selected-keys="selectedKeys"
                    @count="activeFolderFileCount = $event"
                    @files="folderDriveFiles = $event"
                    @toggle-select="toggleSelected"
                    @open-image="openDriveImage"
                    @open-markdown="openDriveMarkdown"
                    @previews="folderDrivePreviews = $event"
                    @contextmenu="(ev, file) => onGridDriveFileContextMenu(ev, file)"
                  />
                </div>
              </div>
          </div>
        </section>

      <section
        v-if="isLoggedIn && yandexPath !== null"
        class="dashboard-folder-content"
        data-dashboard-view="yandex"
      >
        <DashboardYandexDisk
          ref="yandexView"
          :path="yandexPath"
          :query="searchQuery"
          :sort-mode="sortMode"
          :view-mode="recentViewMode"
          :hide-view-toggle="true"
          :refresh-key="yandexRefreshKey"
          :selected-keys="selectedKeys"
          @navigate="openYandexPath"
          @update:view-mode="setRecentViewMode"
          @update:selected-keys="selectedKeys = $event"
          @toggle-select="toggleSelected"
          @items="yandexFiles = $event"
          @upload="uploadToYandex"
          @move="openYandexMove"
          @changed="yandexRefreshKey += 1"
          @feedback="setFeedback"
          @open-image="openYandexImage"
          @open-markdown="openYandexMarkdown"
        />
      </section>

      <section
        v-if="isLoggedIn && spaceId !== null"
        class="dashboard-folder-content"
        data-dashboard-view="space"
      >
        <DashboardSpace
          ref="spaceView"
          :space-id="spaceId"
          :view-mode="explorerViewMode"
          :hierarchical="true"
          :active-folder-id="activeSpaceFolderId"
          :active-yandex-source-id="activeSpaceYandexSourceId"
          :active-yandex-subpath="activeSpaceYandexSubpath"
          :sort-mode="sortMode"
          :external-sort-seq="sortSyncSeq"
          :hide-view-toggle="true"
          :hide-header="true"
          :query="searchQuery"
          :me-id="currentUser?.id || ''"
          :folder-options="folderOptions"
          :selected-keys="selectedKeys"
          @update:view-mode="setExplorerViewMode"
          @update:selected-keys="selectedKeys = $event"
          @update:sort="onExplorerTableSort"
          @navigate-space-folder="onNavigateSpaceFolder"
          @open="openSpaceResource"
          @open-media="(items, start) => (mediaViewer = { items, start })"
          @open-markdown="openSpaceMarkdown"
          @toggle-select="toggleSelected"
          @items="spaceFeedItems = $event"
          @space="activeSpace = $event"
          @gone="leaveSpaceSection"
          @move="openBulkMoveModal"
          @delete="bulkDelete"
          @feedback="setFeedback"
        />
      </section>

      <section
        v-if="isLoggedIn && activeSection.kind === 'trash'"
        class="dashboard-folder-content"
        data-dashboard-view="trash"
      >
        <DashboardTrash @restored="onTrashRestored" @feedback="setFeedback" />
      </section>

      <section
        v-if="isLoggedIn && activeSection.kind === 'gallery'"
        class="dashboard-gallery-content"
        data-dashboard-view="gallery"
      >
        <DrivePhotos
          ref="galleryViewRef"
          :key="galleryRefreshKey"
          :active-section="(gallerySection as GallerySection)"
          :external-album-id="galleryAlbumId"
          :external-album-members-count="galleryAlbumMembersCount"
          :external-folder-id="galleryFolderId"
          :folders="galleryStorageFolders"
          :hide-internal-tabs="true"
          :show-sidebar-expand="showSidebarExpand"
          @expand-sidebar="onExpandSidebar"
          @focus-photo="onGalleryFocusPhoto"
          @clear-album="onGalleryClearAlbum"
          @select-album="onGallerySelectAlbum"
          @share-album="openAlbumShareById"
          @share-photos="onGallerySharePhotos"
          @open-trash="onGalleryOpenTrash"
          @update:counts="gallerySidebarCounts = $event"
          @show-folder-in-gallery="onGalleryShowFolder"
          @open-folder="(folderId) => selectFolder(folderId)"
        />
      </section>

      <div
        v-if="isLoggedIn && (activeSection.kind === 'shared' || isHomeFeed)"
        :id="isHomeFeed ? 'feed-shared' : undefined"
        class="dash-section"
        :class="{ 'dashboard-feed-section': isHomeFeed }"
        :data-dashboard-view="isHomeFeed ? undefined : 'shared'"
        :data-feed-section="isHomeFeed ? 'shared' : undefined"
        data-section="shared"
      >
        <div class="dash-section-head"><h2>{{ t('sharedWithMe') }}</h2></div>
        <ExplorerTableView
          v-if="sharedFiltered.length && explorerViewMode === 'table'"
          :rows="sharedTableRows"
          :selected-keys="selectedKeys"
          :hide-albums="true"
          :external-sort-mode="sortMode"
          :external-sort-seq="sortSyncSeq"
          @update:selected-keys="selectedKeys = $event"
          @update:sort="onExplorerTableSort"
          @open="openExplorerTableRow"
          @contextmenu="onTableRowContextMenu"
        />
        <div v-else class="dash-grid" data-feed-grid="shared">
          <DashboardFeedResourceGrid
            :items="feedItems(sharedFiltered, 'shared')"
            scope="shared"
            :is-logged-in="isLoggedIn"
            :is-busy="isBusy"
            :open-menu-canvas-id="openMenuCanvasId"
            :card-menu-style="cardMenuStyle"
            :selection-key="selectionKey"
            :is-selected="isSelected"
            :card-folder-path="cardFolderPath"
            :format-date="formatDate"
            :resource-actions="resourceActions"
            @open-canvas="openCanvas"
            @open-html="openHtmlDocument"
            @open-text="openTextDocument"
            @toggle-selected="toggleSelected"
            @toggle-menu="toggleCardMenu"
            @select-action="handleResourceAction"
            @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
          />
          <button v-if="!sharedFiltered.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="shared" data-feed-empty="shared" @click.stop="openAddFromTile('shared')">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
        </div>
        <div v-if="!sharedFiltered.length && hasActiveFilter" class="dash-empty" data-feed-empty="shared">
          {{ t('noFilterMatches') }}
          <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
        </div>
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

      <section
        v-if="isLoggedIn && (activeSection.kind === 'interactive' || isHomeFeed)"
        :id="isHomeFeed ? 'feed-interactive' : undefined"
        class="dash-section"
        :class="{ 'dashboard-feed-section': isHomeFeed }"
        :data-dashboard-view="isHomeFeed ? undefined : 'interactive'"
        :data-feed-section="isHomeFeed ? 'interactive' : undefined"
        data-section="interactive-templates"
      >
        <div class="dash-section-head"><h2>{{ t('interactiveTemplate') }}</h2></div>
        <ExplorerTableView
          v-if="visibleInteractiveTemplateItems.length && explorerViewMode === 'table'"
          :rows="interactiveTableRows"
          :selected-keys="selectedKeys"
          :hide-albums="true"
          :external-sort-mode="sortMode"
          :external-sort-seq="sortSyncSeq"
          @update:selected-keys="selectedKeys = $event"
          @update:sort="onExplorerTableSort"
          @open="openExplorerTableRow"
          @contextmenu="onTableRowContextMenu"
        />
        <div v-else class="dash-grid" data-feed-grid="interactive">
          <DashboardInteractiveFeedGrid
            :items="feedItems(visibleInteractiveTemplateItems, 'interactive')"
            :is-logged-in="isLoggedIn"
            :is-busy="isBusy"
            :open-menu-canvas-id="openMenuCanvasId"
            :card-menu-style="cardMenuStyle"
            :selection-key="selectionKey"
            :is-selected="isSelected"
            :card-folder-path="cardFolderPath"
            :format-date="formatDate"
            :interactive-template-type-label="interactiveTemplateTypeLabel"
            :resource-actions="resourceActions"
            @open="openInteractiveTemplate"
            @toggle-selected="toggleSelected"
            @toggle-menu="toggleCardMenu"
            @select-action="handleResourceAction"
            @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
          />
          <button v-if="!visibleInteractiveTemplateItems.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="interactive" data-feed-empty="interactive" @click.stop="openAddFromTile('interactive')">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
        </div>
        <div v-if="!visibleInteractiveTemplateItems.length && hasActiveFilter" class="dash-empty" data-feed-empty="interactive">
          {{ t('noFilterMatches') }}
          <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
        </div>
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

      <div
        v-if="activeSection.kind === 'public' || isHomeFeed"
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
            <div v-if="isLoggedIn" ref="publicOwnerFilterEl" class="dashboard-public-owner-filter dashboard-segmented" role="group" :aria-label="t('publicOwnerFilter')">
              <button
                v-for="option in PUBLIC_OWNER_FILTERS"
                :key="option"
                type="button"
                :class="{ active: publicOwnerFilter === option }"
                :aria-pressed="publicOwnerFilter === option"
                :data-public-owner-filter="option"
                @click.stop="publicOwnerFilter = option"
              >{{ t(PUBLIC_OWNER_FILTER_LABELS[option]) }}</button>
            </div>
          </div>
        </div>
        <ExplorerTableView
          v-if="publicFiltered.length && explorerViewMode === 'table'"
          :rows="publicTableRows"
          :selected-keys="selectedKeys"
          :hide-albums="true"
          :external-sort-mode="sortMode"
          :external-sort-seq="sortSyncSeq"
          @update:selected-keys="selectedKeys = $event"
          @update:sort="onExplorerTableSort"
          @open="openExplorerTableRow"
          @contextmenu="onTableRowContextMenu"
        />
        <div v-else class="dash-grid" data-feed-grid="public">
          <DashboardFeedResourceGrid
            :items="feedItems(publicFiltered, 'public')"
            scope="public"
            :is-logged-in="isLoggedIn"
            :is-busy="isBusy"
            :open-menu-canvas-id="openMenuCanvasId"
            :card-menu-style="cardMenuStyle"
            :selection-key="selectionKey"
            :is-selected="isSelected"
            :card-folder-path="cardFolderPath"
            :format-date="formatDate"
            :resource-actions="resourceActions"
            @open-canvas="openCanvas"
            @open-html="openHtmlDocument"
            @open-text="openTextDocument"
            @toggle-selected="toggleSelected"
            @toggle-menu="toggleCardMenu"
            @select-action="handleResourceAction"
            @contextmenu="(ev, item) => onGridItemContextMenu(ev, item)"
          />
          <button v-if="isLoggedIn && !publicFiltered.length && !hasActiveFilter" type="button" class="dashboard-add-tile" data-feed-add="public" data-public-empty data-feed-empty="public" @click.stop="openAddFromTile('public')">
            <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
          </button>
        </div>
        <div v-if="!publicFiltered.length && (hasActiveFilter || !isLoggedIn)" class="dash-empty" data-public-empty data-feed-empty="public">
          {{ hasActiveFilter ? t('noFilterMatches') : publicAnyOwner.length ? t('noPublicMatches') : t('noPublicResources') }}
          <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
        </div>
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
    </div>
    </main>
      <button
        v-if="isLoggedIn && showFolderFab"
        type="button"
        class="dashboard-fab fab-create"
        data-explorer-fab
        :aria-label="t('add')"
        :title="t('add')"
        @click.stop="openAddDialog({ folderId: activeSection.kind === 'folder' ? activeFolder?.id : undefined })"
      ><Plus :size="24" aria-hidden="true" /></button>
      <ExplorerMobileTabBar
        v-if="isLoggedIn && isAndroidApp"
        :active-activity="mobileTabActivity"
        @select-activity="onSelectActivity"
        @open-menu="openMobileSidebar"
      />
      </div>
    </div>

    <DashboardModalLayer :context="modalContext" />

    <DashboardAddDialog
      v-if="addDialog.open"
      :folders="newItemFolderOptions"
      :initial-folder-id="addDialog.folderId"
      :target-folder-name="addDialogTargetFolderName"
      :initial-import="addDialog.importKind"
      :busy="isBusy"
      @close="closeAddDialog"
      @create="onAddCreate"
      @create-template="onAddCreateTemplate"
      @import-character="onAddImportCharacter"
      @create-folder="onAddCreateFolder"
      @create-album="onAddCreateAlbum"
      @import="onAddImport"
    />

    <AlbumShareDialog
      v-if="sharingAlbum"
      :space="sharingAlbum"
      :me-id="currentUser?.id || ''"
      @changed="onSharingAlbumChanged"
      @close="onCloseSharingAlbum"
    />

    <ResourceSharePanel
      v-if="resourceShare.open"
      :open="resourceShare.open"
      :title="resourceShare.title"
      :url="resourceShareUrl"
      :copy-link="copyResourceShareLink"
      :slug-prefix="resourceShareSlugPrefix"
      :slug-error="resourceShare.slugError"
      :saving-slug="resourceShare.savingSlug"
      :visibility="resourceShare.visibility"
      :allow-public-edit="resourceShare.allowPublicEdit"
      :listed-in-public="resourceShare.listedInPublic"
      :public-hidden="resourceShare.publicHidden"
      :permissions="resourceShare.permissions"
      glass
      v-model:slug="resourceShare.slug"
      v-model:share-email="resourceShare.shareEmail"
      v-model:share-role="resourceShare.shareRole"
      v-model:password-access-enabled="resourceShare.passwordAccessEnabled"
      v-model:password-access-password="resourceShare.passwordAccessPassword"
      v-model:password-access-role="resourceShare.passwordAccessRole"
      @close="closeResourceShareModal"
      @update:visibility="setResourceShareVisibility"
      @update:allow-public-edit="setResourceShareAllowPublicEdit"
      @update:listed-in-public="setResourceShareListedInPublic"
      @save-password="saveResourceSharePassword"
      @save-slug="saveResourceShareSlug"
      @invite="inviteResourceShare"
      @revoke="revokeResourceShare"
    />

    <ExplorerContextMenu
      :open="explorerCtxMenu.open"
      :x="explorerCtxMenu.x"
      :y="explorerCtxMenu.y"
      :items="explorerCtxMenu.items"
      :empty-area="explorerCtxMenu.emptyArea"
      :can-move="explorerCtxMenu.canMove"
      :can-album="contextMenuCanAlbum"
      :can-delete="explorerCtxMenu.canDelete"
      :can-rename="explorerCtxMenu.canRename"
      :can-download="explorerCtxMenu.canDownload"
      :can-properties="explorerCtxMenu.canProperties"
      :delete-label="explorerCtxMenu.deleteLabel"
      :is-favorite="explorerCtxMenu.isFavorite"
      :albums="contextMenuAlbums"
      @close="explorerCtxMenu.open = false"
      @open="onCtxMenuOpen"
      @share="onCtxMenuShare"
      @add-to-album="onCtxMenuAddToAlbum"
      @toggle-favorite="onCtxMenuToggleFavorite"
      @move="onCtxMenuMove"
      @rename="onCtxMenuRename"
      @download="onCtxMenuDownload"
      @properties="onCtxMenuProperties"
      @delete="onCtxMenuDelete"
      @create-folder="onCtxMenuEmptyCreateFolder"
      @add="onCtxMenuEmptyAdd"
      @refresh="onCtxMenuEmptyRefresh"
    />

    <DriveFileProperties
      v-if="propertiesFile"
      :file-id="propertiesFile.id"
      :file-name="propertiesFile.name"
      @close="propertiesFile = null"
    />

    <ExplorerDragBadge />

    <DashboardMediaViewer
      v-if="mediaViewer"
      :items="mediaViewer.items"
      :start="mediaViewer.start"
      @close="mediaViewer = null"
    />

    <MarkdownDocumentViewer
      v-if="markdownViewer"
      :item="markdownViewer"
      @close="markdownViewer = null"
    />

    <YandexFolderPicker
      v-if="yandexMove"
      ref="yandexPicker"
      :sources="yandexMove.sources"
      :start="yandexMove.start"
      :busy="isBusy"
      @confirm="confirmYandexMove"
      @close="yandexMove = null"
    />

    <InteractiveTemplatePicker
      v-if="templatePickerOpen"
      :busy="isBusy"
      @close="closeInteractiveTemplatePicker"
      @create="createInteractiveTemplate"
      @import="importCharacter"
    />

  </div>
</template>

<script lang="ts">
import { ChevronDown, ChevronUp, File as FileIcon, Folder, Plus, Share2, SlidersHorizontal, Users, UsersRound } from '@lucide/vue';
import { defineAsyncComponent, defineComponent, ref, reactive, onBeforeUnmount, onMounted, computed, nextTick, watch, type Ref } from 'vue';
import { alertDialog, confirmDelete, confirmDialog, promptDialog } from '../composables/appDialog';
import { selectAll, selectRange, selectionKey, toggleSelection } from '../dashboard/selection';
import { buildZip, canvasFileContent, safeFileName, saveBlob, splitFileName, textDocumentFileContent, uniqueFileName, type ArchiveFile } from '../dashboard/archive';
import { DEFAULT_TAG_COLOR, genTagId, normalizeCanvas, normalizeHtmlDocument, normalizeInteractiveTemplate, normalizeResourceFolder, normalizeTextDocument } from '../dashboard/resource-normalizers';
import { downloadDriveFile, driveApi, formatFileSize, resolveDownloadUrl, type DriveItem } from '../api/drive';
import { useSidebarDriveFiles } from '../composables/useSidebarDriveFiles';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { markResourceOpened } from '../composables/useRecentResource';
import * as vueRouter from 'vue-router';
import { useRouter } from 'vue-router';
import { accessRequests, canvas, getCurrentUser, htmlDocuments, interactiveTemplates, isAdmin, isAuthenticated, MAX_DESCRIPTION_LENGTH, recentResources as recentResourcesApi, refreshCurrentUserRole, resourceFolders, tags, textDocuments, type InteractiveTemplate, type ResourceFolderSummary, type ResourceTag } from '../api/client';
import { useI18n } from '../composables/useI18n';
import { LAYOUT, matchesMedia, useMediaQuery } from '../composables/layoutMedia';
import { useBackHandler } from '../composables/useBackHandler';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import DashboardSidebar, { type ExplorerSidebarMode, type TreeContextMenuPayload } from '../components/dashboard/DashboardSidebar.vue';
import ExplorerHeadroomBar, { type HeadroomViewToggleMode } from '../components/dashboard/ExplorerHeadroomBar.vue';
import ExplorerTableView, { type ExplorerSortCol, type ExplorerSortDir, type ExplorerTableRow } from '../components/dashboard/ExplorerTableView.vue';
import ExplorerContextMenu, { type ExplorerContextMenuItem } from '../components/dashboard/ExplorerContextMenu.vue';
import ExplorerDragBadge from '../components/dashboard/ExplorerDragBadge.vue';
import ExplorerMobileTabBar, { type ExplorerMobileTabId } from '../components/dashboard/ExplorerMobileTabBar.vue';
import type {
  InlineSearchAlbum,
  InlineSearchFolder,
  InlineSearchItem,
  InlineSearchScopeMode,
  InlineSearchTypeFilter,
} from '../components/dashboard/ExplorerInlineSearch.vue';
import AlbumShareDialog from '../components/dashboard/AlbumShareDialog.vue';
const DriveFileProperties = defineAsyncComponent(() => import('../components/DriveFileProperties.vue'));
import DashboardFilterMenu from '../components/dashboard/DashboardFilterMenu.vue';
import DashboardSortMenu from '../components/dashboard/DashboardSortMenu.vue';
import DrivePhotos, { type GalleryFocusTransfer } from '../components/photos/DrivePhotos.vue';
import GallerySidebar, { type GallerySection, type GallerySidebarCounts, type GalleryStorageFolder } from '../components/photos/GallerySidebar.vue';
import { photosApi, type FeedItem as PhotoFeedItem } from '../api/photos';
import { createHeadroomScrollHandler, useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { GROUP_DND_MIME, useExplorerGroupDnd, type GroupDragEntry, type GroupDragPayload } from '../composables/useExplorerGroupDnd';
import { buildFolderExplorerTableRows, resourceTypeLabel } from '../composables/useExplorerWorkspaceHelpers';
import { forgetResourceTab } from '../tabs/forget';
import DashboardViewToggle from '../components/dashboard/DashboardViewToggle.vue';
import DashboardResourceCard from '../components/dashboard/DashboardResourceCard.vue';
import ResourceIcon from '../components/ResourceIcon.vue';
import ResourceSharePanel, { type SharePermission, type ShareRole, type ShareVisibility } from '../components/ResourceSharePanel.vue';
import DashboardToolbarControls from '../components/dashboard/DashboardToolbarControls.vue';
import DashboardStatusOverlays from '../components/dashboard/DashboardStatusOverlays.vue';
import DashboardRecentResources from '../components/dashboard/DashboardRecentResources.vue';
import DashboardActiveSubfolders from '../components/dashboard/DashboardActiveSubfolders.vue';
import DashboardFolderResourceGrid from '../components/dashboard/DashboardFolderResourceGrid.vue';
import DashboardFeedResourceGrid from '../components/dashboard/DashboardFeedResourceGrid.vue';
import DashboardInteractiveFeedGrid from '../components/dashboard/DashboardInteractiveFeedGrid.vue';
import DashboardModalLayer from '../components/dashboard/DashboardModalLayer.vue';
import DashboardPublicHeader from '../components/dashboard/DashboardPublicHeader.vue';
import DashboardAuthHeader from '../components/dashboard/DashboardAuthHeader.vue';
import DashboardAccessRequests from '../components/dashboard/DashboardAccessRequests.vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from '../components/dashboard/resource-card.types';
import { vHint } from '../directives/hint';
import DashboardFolderFiles from '../components/dashboard/DashboardFolderFiles.vue';
import { singleType, typePasses, type DashboardContentType } from '../dashboard/content-filter';
import { matchesCanvas as matchesCanvasResource, matchesFolderItem as matchesFolderResource, matchesPublicItem as matchesPublicResource, sortResources } from '../dashboard/resource-filters';
import { useFolderFileCounts } from '../composables/useFolderFileCounts';
import { TAG_COLORS } from '../dashboard/tag-colors';
import { FEED_FALLBACK_COLUMNS, FEED_PHONE_QUERY, feedColumnCount, feedSectionLimit, type FeedRowSection } from '../dashboard/feed-rows';
import InteractiveTemplatePicker from '../components/dashboard/InteractiveTemplatePicker.vue';
import DashboardAddDialog, { type AddCreateKind } from '../components/dashboard/DashboardAddDialog.vue';
import DashboardUploadPanel, { type DashboardUpload } from '../components/dashboard/DashboardUploadPanel.vue';
import DashboardUploadBadge from '../components/dashboard/DashboardUploadBadge.vue';
import DriveUploadOverlay from '../components/DriveUploadOverlay.vue';
import { useUploadSummary } from '../dashboard/upload-summary';
import { plansApi } from '../api/plans';
import { uploadClientPreviewForItems } from '../api/clientMediaUpload';
import DashboardYandexDisk from '../components/dashboard/DashboardYandexDisk.vue';
import YandexFolderPicker from '../components/dashboard/YandexFolderPicker.vue';
import DashboardMediaViewer, { type MediaViewerItem } from '../components/dashboard/DashboardMediaViewer.vue';
import MarkdownDocumentViewer, { type MarkdownViewerItem } from '../components/MarkdownDocumentViewer.vue';
import { fetchMarkdownTextFromUrl } from '../documents/markdown-viewer';
import DashboardSpace from '../components/dashboard/DashboardSpace.vue';
import DashboardTrash from '../components/dashboard/DashboardTrash.vue';
import { createUploadWakeLock, runUploadQueue, type UploadJob } from '../dashboard/upload-queue';
import { nativeUploadAvailable } from '../api/native-upload';
import { adminApi, type PublicResourceType } from '../api/admin';
import { spacesApi, type SpaceDetails, type SpaceFeedItem } from '../api/spaces';
import {
  partitionDeletableSpaceItems,
  partitionMovableSpaceItems,
  toFolderResourceType,
} from '../dashboard/space-selection';
import { useSpaces } from '../composables/useSpaces';
import {
  downloadYandexLink,
  fetchYandexContent,
  joinYandexPath,
  settleYandexOutcome,
  uploadYandexFile,
  yandexDisk,
  yandexParentPath,
  yandexPreviewUrl,
  type YandexItem,
} from '../api/yandexDisk';
import { useYandexDisk } from '../composables/useYandexDisk';
import { importTitle, type ImportKind } from '../dashboard/import-files';
import { marked } from 'marked';
import type { CharacterImport } from '../dnd/importLongStoryShort';
import {
  SIDEBAR_FOLDER_CHILD_LIMIT,
  buildSidebarNavItems,
  writeSidebarWidthState,
  type DashboardFileNavItem,
  type DashboardFolderNavItem,
  type DashboardSidebarNavItem,
  type DashboardSection,
  type SidebarWidthState,
} from '../dashboard/navigation';
import { animateHeight, heightOfFirstChildren } from '../dashboard/motion';
import { useSegmentThumb } from '../composables/useSegmentThumb';
import { writeRecentViewMode, type RecentViewMode } from '../dashboard/recent-view';
import { descendantFolderIds, folderIdByResourceKey, folderPaths } from '../dashboard/folder-paths';
import { childFolderCounts, folderLatestChange } from '../dashboard/folder-stats';
import { isMarkdownFile, isPictureFile, isVideoFile } from '../dashboard/thumb-kinds';
import { formatRelativeDate } from '../dashboard/relative-date';
import { computeVisibleTagFitCount } from '../dashboard/tag-fit';
import { useDashboardFeedScrollSpy, type FeedSection } from '../composables/useDashboardFeedScrollSpy';
import { useDashboardFramePinning } from '../composables/useDashboardFramePinning';
import { useDashboardMobileSidebar } from '../composables/useDashboardMobileSidebar';
import { useDashboardSectionTransition } from '../composables/useDashboardSectionTransition';
import { useDashboardResourceDrag } from '../composables/useDashboardResourceDrag';
import { useDashboardFolderDrag } from '../composables/useDashboardFolderDrag';
import { useDashboardMarquee } from '../composables/useDashboardMarquee';
import { useDashboardLongPress } from '../composables/useDashboardLongPress';
import { useDashboardBulkDownload } from '../composables/useDashboardBulkDownload';
import { useDashboardBulkDelete } from '../composables/useDashboardBulkDelete';
import { useDashboardActionRunner } from '../composables/useDashboardActionRunner';
import { useDriveDropzone } from '../composables/useDriveDropzone';
import { useActivityJournal } from '../composables/useActivityJournal';
import {
  clearDashboardReturnOrigin,
  consumeDashboardReturnOrigin,
  isResourceEditorRoute,
  saveDashboardReturnOrigin,
} from '../composables/useDashboardReturnOrigin';

type CanvasTag = { id: string; name: string; color: string };
type CanvasRecord = {
  type: 'canvas';
  id: string;
  slug?: string | null;
  title: string;
  updatedAt: string;
  role?: string;
  isOwn?: boolean;
  folder: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
  allowPublicEdit?: boolean;
  ownerName?: string;
  ownerEmail?: string;
  ownerId?: string;
};
type HtmlDocumentRecord = {
  type: 'html-document';
  id: string;
  ownerId?: string;
  role?: string;
  visibility?: 'private' | 'authenticated' | 'public';
  slug?: string | null;
  title: string;
  updatedAt: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
};
type TextDocumentRecord = {
  type: 'text-document';
  id: string;
  ownerId?: string;
  role?: string;
  visibility?: 'private' | 'authenticated' | 'public';
  slug?: string | null;
  title: string;
  updatedAt: string;
  folderId?: string | null;
  description?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
};
type InteractiveTemplateRecord = InteractiveTemplate & {
  type: 'interactive-template';
  ownerId?: string;
  folderId?: string | null;
  tags: CanvasTag[];
  pinned?: false;
  description?: null;
};
type FolderItem = CanvasRecord | HtmlDocumentRecord | TextDocumentRecord | InteractiveTemplateRecord;
type FolderSummary = Omit<ResourceFolderSummary, 'items'> & {
  items: FolderItem[];
  /** Nesting level in the sidebar tree; set while ordering the flat list. */
  depth?: number;
  hasChildren?: boolean;
};

type DashboardCacheState = {
  own: CanvasRecord[];
  shared: CanvasRecord[];
  publicCanvases: CanvasRecord[];
  publicHtmlDocuments: HtmlDocumentRecord[];
  publicTextDocuments: TextDocumentRecord[];
  sharedHtmlDocuments: HtmlDocumentRecord[];
  sharedTextDocuments: TextDocumentRecord[];
  ownResourceFolders: ResourceFolderSummary[];
  sharedResourceFolders: ResourceFolderSummary[];
  unfiledCanvases: CanvasRecord[];
  unfiledHtmlDocuments: HtmlDocumentRecord[];
  unfiledTextDocuments: TextDocumentRecord[];
  sharedResourceTags: ResourceTag[];
  incomingRequests: any[];
};

type DashboardCache = { savedAt: number; state: DashboardCacheState };
type RecentResourceType = FolderItem['type'];
/** The raw open-history store: just enough to look the item up again later. */
type RecentHistoryEntry = { id: string; routeId: string; type: RecentResourceType; title: string; openedAt: number };
/** recentResources' joined shape - the history entry plus what filtering needs. */
type RecentResource = RecentHistoryEntry & { tags: CanvasTag[]; folder: string; templateType?: InteractiveTemplate['templateType']; updatedAt?: string | null };
type RecentResourceItem = FolderItem;

const DASHBOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_PULL_THRESHOLD = 72;
const RECENT_RESOURCES_LIMIT = 12;

export default defineComponent({
  directives: { hint: vHint },
  components: {
    DashboardSidebar,
    ExplorerHeadroomBar,
    ExplorerTableView,
    ExplorerContextMenu,
    ExplorerDragBadge,
    ExplorerMobileTabBar,
    AlbumShareDialog,
    DriveFileProperties,
    DashboardFilterMenu,
    DashboardSortMenu,
    DrivePhotos,
    GallerySidebar,
    DashboardViewToggle,
    DashboardResourceCard,
    ResourceIcon,
    ResourceSharePanel,
    DashboardToolbarControls,
    DashboardStatusOverlays,
    DashboardRecentResources,
    DashboardActiveSubfolders,
    DashboardFolderResourceGrid,
    DashboardFeedResourceGrid,
    DashboardInteractiveFeedGrid,
    DashboardModalLayer,
    DashboardPublicHeader,
    DashboardAuthHeader,
    DashboardAccessRequests,
    DashboardFolderFiles,
    DashboardUploadPanel,
    DashboardUploadBadge,
    DriveUploadOverlay,
    DashboardYandexDisk,
    YandexFolderPicker,
    DashboardMediaViewer,
    MarkdownDocumentViewer,
    DashboardSpace,
    DashboardTrash,
    DashboardAddDialog,
    InteractiveTemplatePicker,
    ChevronDown,
    ChevronUp,
    FileIcon,
    Folder,
    Plus,
    Share2,
    SlidersHorizontal,
    Users,
    UsersRound,
  },
  setup() {
    const router = useRouter();
    const { t, locale } = useI18n();
    useDocumentTitle(computed(() => t('home')));
    /** Admin shows in the sidebar; checked again with the hub once the dashboard opens. */
    const admin = ref(isAdmin());
    const isLoggedIn = isAuthenticated();
    const own = ref<CanvasRecord[]>([]);
    const shared = ref<CanvasRecord[]>([]);
    const publicCanvases = ref<CanvasRecord[]>([]);
    const publicHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const publicTextDocuments = ref<TextDocumentRecord[]>([]);
    const sharedHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const sharedTextDocuments = ref<TextDocumentRecord[]>([]);
    const ownResourceFolders = ref<ResourceFolderSummary[]>([]);
    const sharedResourceFolders = ref<ResourceFolderSummary[]>([]);
    const unfiledCanvases = ref<CanvasRecord[]>([]);
    const unfiledHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const unfiledTextDocuments = ref<TextDocumentRecord[]>([]);
    /**
     * The full, unfiltered list each is filtered down FROM (see load()) -
     * unlike canvases, a foldered HTML/text document has no other source
     * with real tags: /resource-folders' nested items carry no tags for
     * html documents at all, so dashboardItemsByKey needs this to enrich
     * them for tag filtering. Not used for anything else - the filtered
     * unfiled/shared refs above remain what's actually rendered.
     */
    const allHtmlDocumentsRaw = ref<HtmlDocumentRecord[]>([]);
    const allTextDocumentsRaw = ref<TextDocumentRecord[]>([]);
    const interactiveTemplateItems = ref<InteractiveTemplate[]>([]);
    const templatePickerOpen = ref(false);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const isRefreshing = ref(false);
    const dashboardMain = ref<HTMLElement | null>(null);
    const dashboardPullDistance = ref(0);
    const isAndroidApp = computed(() => Capacitor.isNativePlatform());
    const isNativeDashboard = isAndroidApp.value;
    let dashboardPullStartY: number | null = null;
    const searchQuery = ref('');
    /**
     * Multi-select, AND semantics: an item must carry every tag in this list
     * to match (see matchesFolderItem). One shared array backs the desktop
     * tag bar, the mobile compact bar and the tag bottom sheet - there is no
     * separate per-surface selection state.
     */
    const selectedTags = ref<string[]>([]);
    /** Types shown; none chosen means all of them (see dashboard/content-filter.ts). */
    const contentTypes = ref<DashboardContentType[]>([]);
    /** The single-value view of contentTypes, for older callers: 'canvas' chooses just canvases, 'all' clears. */
    const contentFilter = computed<'all' | 'mixed' | DashboardContentType>({
      get: () => singleType(contentTypes.value),
      set: (value) => { contentTypes.value = value === 'all' || value === 'mixed' ? [] : [value]; },
    });
    const sortMode = ref<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
    const sortSyncSeq = ref(0);
    const isMobileHeadroom = useMediaQuery(LAYOUT.dashboardDrawer);
    const openMenuCanvasId = ref('');
    const openControlMenu = ref('');
    const activeSection = ref<DashboardSection>({ kind: isLoggedIn ? 'recent' : 'public' });
    const gallerySection = ref<GallerySection | 'trash'>('library');
    const galleryAlbumId = ref<string | null>(null);
    const galleryFolderId = ref<string | null>(null);
    const recordDashboardReturnOrigin = () => {
      if (!isLoggedIn) return;
      const mode = activeSection.value.kind === 'gallery' ? 'media' : 'files';
      saveDashboardReturnOrigin({
        mode,
        section: activeSection.value,
        ...(mode === 'media'
          ? {
              gallerySection: gallerySection.value,
              galleryAlbumId: galleryAlbumId.value,
              galleryFolderId: galleryFolderId.value,
            }
          : {}),
      });
    };
    try {
      const registerRouteLeave = vueRouter.onBeforeRouteLeave;
      if (typeof registerRouteLeave === 'function') {
        registerRouteLeave((to) => {
          if (isResourceEditorRoute(to)) {
            recordDashboardReturnOrigin();
          }
        });
      }
    } catch {
      // Unit tests with partial vue-router mocks skip route-leave hooks cleanly.
    }
    const storage = () => {
      try {
        return typeof window === 'undefined' ? null : window.localStorage;
      } catch {
        return null;
      }
    };
    const layoutPrefs = useExplorerLayoutPrefs();
    const groupDnd = useExplorerGroupDnd();
    const sidebarCollapsed = layoutPrefs.sidebarCollapsed;
    const sidebarWidthState = computed<SidebarWidthState>(() => (
      sidebarCollapsed.value ? 'collapsed' : 'expanded'
    ));
    const explorerViewMode = layoutPrefs.viewMode;
    const setExplorerViewMode = (mode: 'grid' | 'table' | 'list') => {
      layoutPrefs.setViewMode(mode);
    };
    const albumViewMode = layoutPrefs.albumView;
    const setAlbumViewMode = (mode: 'feed' | 'table') => {
      layoutPrefs.setAlbumView(mode);
    };
    const recentViewMode = computed<RecentViewMode>(() => layoutPrefs.legacyRecentViewMode.value);
    const setRecentViewMode = (mode: RecentViewMode) => {
      layoutPrefs.setViewMode(mode === 'list' ? 'table' : 'grid');
      writeRecentViewMode(storage(), mode);
    };
    const sidebarRef = ref<InstanceType<typeof DashboardSidebar> | null>(null);
    const headroomBarRef = ref<InstanceType<typeof ExplorerHeadroomBar> | null>(null);
    const headroomHidden = layoutPrefs.headroomHidden;
    const headroomElevated = ref(false);
    const handleHeadroomScroll = createHeadroomScrollHandler();
    const onDashboardMainScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const top = target?.scrollTop ?? 0;
      headroomElevated.value = top > 8;
      handleHeadroomScroll(top);
    };
    const s2ScopeMode = ref<InlineSearchScopeMode>('current');
    const s2TypeFilter = ref<InlineSearchTypeFilter>('all');
    const devicesOnlineCount = ref(0);
    const devicesPaired = ref(false);
    const onSidebarCollapsedChange = (collapsed: boolean) => {
      layoutPrefs.setSidebarCollapsed(collapsed);
      writeSidebarWidthState(storage(), collapsed ? 'collapsed' : 'expanded');
    };
    const mobileSidebarOpen = ref(false);
    const SIDEBAR_DESKTOP_QUERY = LAYOUT.dashboardSidebarDocked;
    const { open: openMobileSidebar, close: closeMobileSidebar } = useDashboardMobileSidebar({
      open: mobileSidebarOpen,
      opener: ref<HTMLElement | null>(null),
      desktopQuery: SIDEBAR_DESKTOP_QUERY,
    });
    // Folders are expanded by default and act as lightweight organizational
    // headers. We track only the folders the user has explicitly collapsed, so
    // any new/unseen folder shows open without a click.
    const collapsedFolderIds = ref<string[]>([]);
    const selectedFolderId = ref('');
    /** Files shown in the open folder (DashboardFolderFiles reports them). */
    const activeFolderFileCount = ref(0);
    /** Files each folder holds (from the Drive), added to the folder tiles' counts. */
    const folderFiles = useFolderFileCounts();
    watch(selectedFolderId, (id) => {
      activeFolderFileCount.value = 0;
      if (id === 'legacy-resource-inbox') {
        folderDriveFiles.value = [];
      }
    });
    const draggingResourceId = ref('');
    const draggingResourceType = ref<FolderItem['type']>('canvas');
    const draggingResourceFolderId = ref<string | null>(null);
    const dragTargetFolder = ref('');
    const suppressNextCardClick = ref(false);
    const incomingRequests = ref<any[]>([]);
    const { pendingAction, feedback, setFeedback, runAction } = useDashboardActionRunner();
    const activityJournal = useActivityJournal();
    const journalActive = activityJournal.isActive;
    const tagColors = TAG_COLORS;
    const currentUser = computed(() => getCurrentUser());
    const isOwnedResource = (item: { ownerId?: string }) =>
      !item.ownerId || item.ownerId === currentUser.value?.id;

    const dashboardCacheKey = () => `qcanva:dashboard:v1:${currentUser.value?.id || currentUser.value?.email || 'public'}`;
    const lastFolderKey = () => `qcanva:dashboard:folder:v1:${currentUser.value?.id || currentUser.value?.email || 'public'}`;

    const readLastFolderId = () => {
      try {
        return localStorage.getItem(lastFolderKey()) || '';
      } catch {
        // A browser with site data blocked must not break the dashboard.
        return '';
      }
    };

    const writeLastFolderId = (folderId: string) => {
      try {
        if (folderId) localStorage.setItem(lastFolderKey(), folderId);
        else localStorage.removeItem(lastFolderKey());
      } catch {
        // Ignore: remembering the folder is a convenience, not a requirement.
      }
    };
    const recentResourceHistory = ref<RecentHistoryEntry[]>([]);
    /** The last refresh of the open history, or of the dashboard itself, failed. */
    const recentLoadFailed = ref(false);
    const dashboardLoadFailed = ref(false);
    const tagFilterList = ref<HTMLElement | null>(null);
    const activeFolderBody = ref<HTMLElement | null>(null);
    const hasTagOverflow = ref(false);
    // MOBILE TAG FIT (front task). Refs into the visible row and its hidden
    // measurement twin - see the template's own comment on why a hidden row
    // exists at all - plus how many of tagsInPriorityOrder actually fit,
    // computed by recomputeMobileTagFit below.
    const tagFilterMobileEl = ref<HTMLElement | null>(null);
    const tagMeasureEl = ref<HTMLElement | null>(null);
    const tagMeasureAllEl = ref<HTMLElement | null>(null);
    const tagMeasureMoreEl = ref<HTMLElement | null>(null);
    const tagMeasureClearEl = ref<HTMLElement | null>(null);
    const mobileVisibleTagCount = ref(0);
    const loadRecentResources = async () => {
      if (!isLoggedIn) {
        recentResourceHistory.value = [];
        return;
      }
      try {
        const rows = await recentResourcesApi.list(RECENT_RESOURCES_LIMIT);
        recentResourceHistory.value = rows.map((row) => ({
          id: row.resourceId,
          routeId: row.resourceId,
          type: row.resourceType,
          title: '',
          openedAt: new Date(row.updatedAt).getTime(),
        })).sort((a, b) => b.openedAt - a.openedAt);
        recentLoadFailed.value = false;
      } catch {
        // Keep what was shown: a failed refresh is not "nothing opened yet".
        recentLoadFailed.value = true;
      }
    };
    // Browser navigation should always read the current resource list. The
    // native shell keeps a short-lived snapshot only to avoid a blank screen.
    const dashboardCacheAvailable = () => typeof window !== 'undefined' && import.meta.env.MODE !== 'test' && Capacitor.isNativePlatform();
    const writeDashboardCache = () => {
      if (!dashboardCacheAvailable()) return;
      const state: DashboardCacheState = {
        own: own.value,
        shared: shared.value,
        publicCanvases: publicCanvases.value,
        publicHtmlDocuments: publicHtmlDocuments.value,
        publicTextDocuments: publicTextDocuments.value,
        sharedHtmlDocuments: sharedHtmlDocuments.value,
        sharedTextDocuments: sharedTextDocuments.value,
        ownResourceFolders: ownResourceFolders.value,
        sharedResourceFolders: sharedResourceFolders.value,
        unfiledCanvases: unfiledCanvases.value,
        unfiledHtmlDocuments: unfiledHtmlDocuments.value,
        unfiledTextDocuments: unfiledTextDocuments.value,
        sharedResourceTags: sharedResourceTags.value,
        incomingRequests: incomingRequests.value,
      };
      try {
        sessionStorage.setItem(dashboardCacheKey(), JSON.stringify({ savedAt: Date.now(), state } satisfies DashboardCache));
      } catch {
        // A full or unavailable storage must never prevent the dashboard opening.
      }
    };
    const restoreDashboardCache = () => {
      if (!dashboardCacheAvailable()) return { found: false, fresh: false };
      try {
        const raw = sessionStorage.getItem(dashboardCacheKey());
        if (!raw) return { found: false, fresh: false };
        const cached = JSON.parse(raw) as DashboardCache;
        if (!cached?.state || typeof cached.savedAt !== 'number') return { found: false, fresh: false };
        own.value = cached.state.own || [];
        shared.value = cached.state.shared || [];
        publicCanvases.value = cached.state.publicCanvases || [];
        publicHtmlDocuments.value = cached.state.publicHtmlDocuments || [];
        publicTextDocuments.value = cached.state.publicTextDocuments || [];
        sharedHtmlDocuments.value = cached.state.sharedHtmlDocuments || [];
        sharedTextDocuments.value = cached.state.sharedTextDocuments || [];
        ownResourceFolders.value = cached.state.ownResourceFolders || [];
        sharedResourceFolders.value = cached.state.sharedResourceFolders || [];
        unfiledCanvases.value = cached.state.unfiledCanvases || [];
        unfiledHtmlDocuments.value = cached.state.unfiledHtmlDocuments || [];
        unfiledTextDocuments.value = cached.state.unfiledTextDocuments || [];
        sharedResourceTags.value = cached.state.sharedResourceTags || [];
        incomingRequests.value = cached.state.incomingRequests || [];
        loading.value = false;
        return { found: true, fresh: Date.now() - cached.savedAt < DASHBOARD_CACHE_TTL_MS };
      } catch {
        return { found: false, fresh: false };
      }
    };

    const folderModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; folderId: string; value: string; bulk?: string[]; bulkSkipped?: number }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      folderId: '',
      value: '',
    });
    /** The folder dialog moves something (one item, or the selection) rather than creating a folder. */
    const folderModalMoves = computed(() => Boolean(folderModal.value.resourceId || folderModal.value.bulk?.length));
    const renameFolderModal = ref<{ open: boolean; folderId: string; sourceName: string; value: string }>({
      open: false,
      folderId: '',
      sourceName: '',
      value: '',
    });
    const folderShareModal = ref<{ open: boolean; folderId: string; name: string; email: string; role: 'read' | 'edit'; permissions: any[]; loading: boolean }>({
      open: false,
      folderId: '',
      name: '',
      email: '',
      role: 'read',
      permissions: [],
      loading: false,
    });
    const tagsModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; tags: CanvasTag[] }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      tags: [],
    });
    const transferModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; email: string }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      email: '',
    });

    const resourceFilterOptions = () => ({
      contentTypes: contentTypes.value,
      searchQuery: searchQuery.value,
      selectedTags: selectedTags.value,
    });
    const matchesCanvas = (item: CanvasRecord) => matchesCanvasResource(item, resourceFilterOptions());
    const matchesFolderItem = (item: { type: FolderItem['type']; title: string; tags: CanvasTag[] }, folderName: string) =>
      matchesFolderResource(item, folderName, resourceFilterOptions());
    const matchesPublicItem = (item: FolderItem) => matchesPublicResource(item, resourceFilterOptions());
    const sortFolderItems = (items: FolderItem[]) => sortResources(items, sortMode.value);

    const placedResourceKeys = computed(() => new Set(
      [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) => [
        ...(folder.items?.canvases || folder.canvases || []).map((item: any) => `canvas:${item.id}`),
        ...(folder.items?.htmlDocuments || folder.htmlDocuments || []).map((item: any) => `html-document:${item.id}`),
        ...(folder.items?.textDocuments || folder.textDocuments || []).map((item: any) => `text-document:${item.id}`),
        ...(folder.items?.interactiveTemplates || folder.interactiveTemplates || []).map((item: any) => `interactive-template:${item.id}`),
      ]),
    ));
    const interactiveTemplateRecords = computed<InteractiveTemplateRecord[]>(() =>
      interactiveTemplateItems.value.map(normalizeInteractiveTemplate),
    );
    const unfiledInteractiveTemplateItems = computed(() =>
      interactiveTemplateRecords.value.filter(
        (item) => !placedResourceKeys.value.has(`interactive-template:${item.id}`),
      ),
    );
    // Раздел показывает все шаблоны, в том числе разложенные по папкам: шаблон в папке
    // остаётся и в папке, и в своём разделе (то же у «Доступные мне» и «Публичные»).
    const visibleInteractiveTemplateItems = computed(() => sortFolderItems(
      interactiveTemplateRecords.value.filter((item) => matchesFolderItem(item, t('interactiveTemplate'))),
    ) as InteractiveTemplateRecord[]);

    const sharedFiltered = computed(() => sortFolderItems(
      [...shared.value, ...sharedHtmlDocuments.value, ...sharedTextDocuments.value]
        // Not matchesPublicItem: that one searches the word "Public" too, so
        // searching "public" listed every shared document.
        .filter((item) => item.type === 'canvas' ? matchesCanvas(item) : matchesFolderItem(item, String(('folder' in item && item.folder) || ''))),
    ));
    // Public lists every public resource, wherever it is filed: unlike
    // Shared (whose foldered items already show in their folder), a public
    // doc of mine inside one of my folders simply vanished from Public.
    const PUBLIC_OWNER_FILTERS = ['all', 'mine', 'others'] as const;
    const PUBLIC_OWNER_FILTER_LABELS = { all: 'all', mine: 'publicMine', others: 'publicOthers' } as const;
    const publicOwnerFilter = ref<(typeof PUBLIC_OWNER_FILTERS)[number]>('all');
    const publicOwnerFilterEl = ref<HTMLElement | null>(null);
    useSegmentThumb(publicOwnerFilterEl, publicOwnerFilter);
    const matchesPublicOwner = (item: { ownerId?: string | null }) => {
      if (publicOwnerFilter.value === 'all') return true;
      const mine = !!currentUser.value?.id && item.ownerId === currentUser.value.id;
      return publicOwnerFilter.value === 'mine' ? mine : !mine;
    };
    // The server's public lists only look at the latest 100 updated
    // resources (of everyone), so an older public doc of MINE could be
    // missing. Mine are already loaded in full (own lists, foldered ones
    // included), so they are added here - by the same rules the server uses
    // (explicit visibility, else the legacy isPublic / shared flag; and not
    // opted out of Public) - without duplicating any the server did return.
    const isOwnPublic = (item: any, legacyPublic: boolean) => {
      if (!currentUser.value?.id || item.ownerId !== currentUser.value.id) return false;
      if (item.listedInPublic === false) return false;
      // An admin took it out of Public: out for its owner too.
      if (item.publicHidden) return false;
      if (item.visibility === 'public') return true;
      if (item.visibility === 'authenticated') return false;
      return legacyPublic;
    };
    const ownPublicResources = computed(() => [
      ...own.value.filter((c: any) => isOwnPublic(c, !!c.isPublic)).map((c: any) => normalizeCanvas(c, false)),
      ...allHtmlDocumentsRaw.value.filter((d: any) => isOwnPublic(d, !!d.shared)),
      ...allTextDocumentsRaw.value.filter((d: any) => isOwnPublic(d, false)),
    ]);
    const publicAnyOwner = computed(() => {
      const listed = [...publicCanvases.value, ...publicHtmlDocuments.value, ...publicTextDocuments.value];
      const seen = new Set(listed.map((item) => `${item.type}:${item.id}`));
      const extra = ownPublicResources.value.filter((item) => !seen.has(`${item.type}:${item.id}`));
      return [...listed, ...extra].filter(matchesPublicItem);
    });
    const publicFiltered = computed(() => sortFolderItems(publicAnyOwner.value.filter(matchesPublicOwner)));

    /**
     * Every resource the user can see and filter, folder-nested or not, goes
     * through dashboardItemsByKey (see below) - it's already the complete,
     * tag-enriched set built for Recent/folder counters, so it's the right
     * single source here too instead of re-deriving from six separate lists.
     * The previous version of this computed looped `allResourceFolders`
     * directly, reading `folder.items?.canvases` - but the raw
     * ownResourceFolders/sharedResourceFolders refs are the flat API shape
     * (`folder.canvases`, not `folder.items.canvases`), so that branch always
     * read `undefined` and silently contributed nothing: a tag used only on
     * a resource inside a folder never appeared in the Tag Filter UI at all.
     */
    const allTagNames = computed(() => {
      const names = new Set<string>();
      for (const item of dashboardItemsByKey.value.values()) {
        if (!typePasses(contentTypes.value, item.type)) continue;
        for (const tag of item.tags || []) names.add(tag.name);
      }
      return Array.from(names).sort();
    });

    const isTagSelected = (tag: string) => selectedTags.value.includes(tag);
    const toggleSelectedTag = (tag: string) => {
      selectedTags.value = isTagSelected(tag) ? selectedTags.value.filter((t) => t !== tag) : [...selectedTags.value, tag];
    };
    const clearSelectedTags = () => {
      selectedTags.value = [];
    };

    // MOBILE TAG FIT (front task). Selected tags first (they're what the
    // user is actively filtering by, so they stay visible even once the
    // full list no longer fits), then everything else in the same order
    // allTagNames already sorts them in.
    const tagsInPriorityOrder = computed(() => {
      const selected = allTagNames.value.filter((tag) => isTagSelected(tag));
      const unselected = allTagNames.value.filter((tag) => !isTagSelected(tag));
      return [...selected, ...unselected];
    });
    const visibleMobileTags = computed(() => tagsInPriorityOrder.value.slice(0, mobileVisibleTagCount.value));
    const mobileTagOverflowCount = computed(() => tagsInPriorityOrder.value.length - visibleMobileTags.value.length);

    /**
     * Measures the hidden twin row's real chip widths and feeds them into
     * computeVisibleTagFitCount (see src/dashboard/tag-fit.ts for the pure
     * "how many fit" math this wraps). Re-run from the same resize
     * listener/data watcher the desktop tag row's own overflow arrow
     * already uses (refreshOverflowIndicators below), not a second
     * parallel mechanism.
     */
    function recomputeMobileTagFit() {
      const container = tagFilterMobileEl.value;
      const measure = tagMeasureEl.value;
      if (!container || !measure) {
        mobileVisibleTagCount.value = tagsInPriorityOrder.value.length;
        return;
      }
      const chipEls = Array.from(measure.querySelectorAll<HTMLElement>(':scope > .tag-filter'));
      // Children, in DOM order: [All, ...one per tag, +N, clear]. Only the
      // per-tag slice in the middle has a variable count.
      const chipWidths = chipEls.slice(1, 1 + tagsInPriorityOrder.value.length).map((el) => el.getBoundingClientRect().width);
      const allChipWidth = tagMeasureAllEl.value?.getBoundingClientRect().width ?? 0;
      const clearChipWidth = selectedTags.value.length ? (tagMeasureClearEl.value?.getBoundingClientRect().width ?? 0) : 0;
      const moreChipWidth = tagMeasureMoreEl.value?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(container).columnGap || '0') || 0;
      const reserved = allChipWidth + (clearChipWidth ? clearChipWidth + gap : 0);
      mobileVisibleTagCount.value = computeVisibleTagFitCount(
        container.clientWidth,
        reserved,
        chipWidths,
        gap,
        moreChipWidth + gap,
      );
    }

    watch(contentTypes, () => {
      selectedTags.value = selectedTags.value.filter((tag) => allTagNames.value.includes(tag));
    });

    const tagSuggestions = computed(() => {
      const byName = new Map<string, ResourceTag>();
      for (const tag of sharedResourceTags.value) byName.set(tag.name, tag);
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvasRecord of list) {
          for (const tag of canvasRecord.tags) byName.set(tag.name, tag);
        }
      }
      for (const document of unfiledHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of sharedHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of publicHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of unfiledTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of sharedTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      for (const document of publicTextDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    });

    const allResourceFolders = computed(() => [...ownResourceFolders.value, ...sharedResourceFolders.value]);
    const { navDirection } = useDashboardSectionTransition({ activeSection, folders: allResourceFolders });
    // Where a resource lives, for the Recent tiles ("Work / Plans").
    const folderPathById = computed(() => folderPaths(allResourceFolders.value));
    const folderIdByKey = computed(() => folderIdByResourceKey(allResourceFolders.value));
    const recentFolderPath = (item: { type: string; id: string }) => {
      const folderId = folderIdByKey.value.get(`${item.type}:${item.id}`);
      return folderId ? folderPathById.value.get(folderId) || '' : '';
    };
    /**
     * The folder a Shared / Public card says it is in: its path in this
     * user's own tree when known (by the tree's index, else by the
     * resource's own folderId), else the folder name the resource itself
     * carries (someone else's resource in their folder).
     */
    const cardFolderPath = (item: { type?: string; id: string; folder?: string | null; folderId?: string | null }) =>
      recentFolderPath({ type: item.type || '', id: item.id })
      || (item.folderId ? folderPathById.value.get(item.folderId) || '' : '')
      || (typeof item.folder === 'string' ? item.folder.trim() : '');
    /**
     * Destinations for the move dialog, in tree order. Each carries its depth and
     * the path to its parent, so picking a nested folder is unambiguous.
     */
    const folderOptions = computed(() => {
      // A folder whose parent is not among these (or comes back as '' instead
      // of null) is a root here, as in the sidebar: it used to drop out of the
      // list, its subfolders with it.
      const own = new Set(ownResourceFolders.value.map((folder) => folder.id));
      const byParent = new Map<string | null, ResourceFolderSummary[]>();
      for (const folder of ownResourceFolders.value) {
        const key = folder.parentId && own.has(folder.parentId) ? folder.parentId : null;
        byParent.set(key, [...(byParent.get(key) || []), folder]);
      }
      const options: { id: string; name: string; depth: number; path: string }[] = [];
      const walk = (parentId: string | null, depth: number, trail: string[]) => {
        const children = (byParent.get(parentId) || [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of children) {
          options.push({ id: folder.id, name: folder.name, depth, path: trail.join(' / ') });
          walk(folder.id, depth + 1, [...trail, folder.name]);
        }
      };
      walk(null, 0, []);
      return options;
    });
    const folderNames = computed(() => folderOptions.value.map((folder) => folder.name));
    const canSaveFolderModal = computed(() => {
      if (!folderModal.value.open) return false;
      if (folderModal.value.bulk?.length) return Boolean(folderModal.value.folderId);
      if (!folderModal.value.resourceId) return Boolean(folderModal.value.value.trim());
      return Boolean(folderModal.value.folderId && folderModal.value.folderId !== draggingResourceFolderId.value);
    });
    /**
     * Subtrees the user has opened. Tracking the open ones (rather than the closed
     * ones) is what makes a subtree start folded, including folders that only
     * appear after a reload.
     */
    const expandedTreeIds = ref<string[]>([]);

    const isTreeExpanded = (folderId: string) =>
      expandedTreeIds.value.includes(folderId);

    const toggleTreeExpanded = (folderId: string) => {
      expandedTreeIds.value = isTreeExpanded(folderId)
        ? expandedTreeIds.value.filter((id) => id !== folderId)
        : [...expandedTreeIds.value, folderId];
    };

    const expandTree = (folderId: string) => {
      if (!isTreeExpanded(folderId)) {
        expandedTreeIds.value = [...expandedTreeIds.value, folderId];
      }
    };

    /**
     * Arrange the flat folder list into parent-then-children order and tag each
     * entry with its depth. Folders whose parent is missing from the visible set
     * are treated as roots so nothing can disappear from the sidebar.
     */
    const buildFolderTree = (folders: FolderSummary[]): FolderSummary[] => {
      const present = new Set(folders.map((folder) => folder.id));
      const childrenOf = new Map<string, FolderSummary[]>();
      const roots: FolderSummary[] = [];
      for (const folder of folders) {
        const parentId = folder.parentId && present.has(folder.parentId) ? folder.parentId : null;
        if (!parentId) {
          roots.push(folder);
          continue;
        }
        const siblings = childrenOf.get(parentId) || [];
        siblings.push(folder);
        childrenOf.set(parentId, siblings);
      }
      const bySortOrder = (a: FolderSummary, b: FolderSummary) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

      const ordered: FolderSummary[] = [];
      const walk = (nodes: FolderSummary[], depth: number, hidden: boolean) => {
        for (const node of nodes.slice().sort(bySortOrder)) {
          const children = childrenOf.get(node.id) || [];
          if (!hidden) {
            ordered.push({ ...node, depth, hasChildren: Boolean(node.hasChildren || children.length) });
          }
          walk(children, depth + 1, hidden || !isTreeExpanded(node.id));
        }
      };
      walk(roots, 0, false);
      return ordered;
    };

    const allFolderSummaries = computed<FolderSummary[]>(() => {
      const parentIds = new Set(
        allResourceFolders.value
          .map((folder) => folder.parentId ?? null)
          .filter((parentId): parentId is string => Boolean(parentId)),
      );
      return allResourceFolders.value.map((folder) => {
        const canvases = (folder.items?.canvases || folder.canvases || []).map((item) => normalizeCanvas({ ...item, folder: folder.name, folderId: folder.id }, true));
        const htmlDocs = (folder.items?.htmlDocuments || folder.htmlDocuments || []).map((item) => normalizeHtmlDocument({ ...item, folderId: folder.id }));
        const docs = (folder.items?.textDocuments || folder.textDocuments || []).map((item) => normalizeTextDocument({ ...item, folderId: folder.id }));
        const templates = (folder.items?.interactiveTemplates || folder.interactiveTemplates || []).map((item) => normalizeInteractiveTemplate({ ...item, folderId: folder.id }));
        return {
          ...folder,
          items: sortFolderItems([...canvases, ...htmlDocs, ...docs, ...templates]),
          canvasCount: canvases.length,
          htmlDocumentCount: htmlDocs.length,
          textDocumentCount: docs.length,
          interactiveTemplateCount: templates.length,
          hasChildren: parentIds.has(folder.id),
        };
      });
    });

    const legacyInboxSourceItems = computed<FolderItem[]>(() => [
      ...unfiledCanvases.value,
      ...unfiledHtmlDocuments.value,
      ...unfiledTextDocuments.value,
    ]);

    const buildLegacyInboxFolder = (items: FolderItem[]): FolderSummary => ({
      id: 'legacy-resource-inbox',
      name: 'Inbox',
      role: 'owner',
      sortOrder: Number.MAX_SAFE_INTEGER,
      canvasCount: unfiledCanvases.value.length,
      htmlDocumentCount: unfiledHtmlDocuments.value.length,
      textDocumentCount: unfiledTextDocuments.value.length,
      interactiveTemplateCount: 0,
      items,
    });

    /**
     * The sidebar's folder tree. It is navigation, so search / type / tags
     * leave it alone: filtering it made folders (and Inbox) blink in and out
     * of the sidebar as filters changed. The filters narrow what a folder
     * shows once opened, and the Folders tiles' counts on the feed.
     */
    const folderSummaries = computed<FolderSummary[]>(() => {
      const folders = allFolderSummaries.value
      .filter((folder) => {
        const isDefaultFolder = folder.name.toLowerCase() === 'default';
        if (folder.items.length) return true;
        if (folder.role === 'owner') return isDefaultFolder || !isTechnicalFolder(folder as FolderSummary);
        // A folder shared with the user is always theirs to see - also when it
        // holds only files (photos, videos), only subfolders, or nothing yet.
        // `items` counts QCanva documents alone, so the old rule hid it.
        return !isTechnicalFolder(folder as FolderSummary);
      });

      // A parent that is empty itself must stay visible when a descendant survived
      // the filter, otherwise its subtree would vanish from the sidebar.
      type FolderRow = (typeof folders)[number];
      const kept = new Map<string, FolderRow>(
        folders.map((folder) => [folder.id, folder]),
      );
      const byId = new Map(allResourceFolders.value.map((folder) => [folder.id, folder]));
      for (const folder of [...folders]) {
        let parentId = folder.parentId ?? null;
        const guard = new Set<string>();
        while (parentId && !kept.has(parentId) && !guard.has(parentId)) {
          guard.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) break;
          const ancestor = {
            ...(parent as unknown as FolderRow),
            items: [],
            canvasCount: 0,
            htmlDocumentCount: 0,
            textDocumentCount: 0,
            interactiveTemplateCount: 0,
          } satisfies FolderRow;
          kept.set(parent.id, ancestor);
          folders.push(ancestor);
          parentId = parent.parentId ?? null;
        }
      }

      if (legacyInboxSourceItems.value.length) {
        folders.push(buildLegacyInboxFolder(sortFolderItems(legacyInboxSourceItems.value)));
      }
      return buildFolderTree(folders);
    });
    const activeFolderEmpty = computed(() => Boolean(
      activeFolder.value
      && !activeFolder.value.items.length
      && !activeFolderFileCount.value
      && !activeSubfolders.value.length,
    ));
    const matchesS2ItemType = (itemType: FolderItem['type']): boolean => {
      const f = s2TypeFilter.value;
      if (f === 'all') return true;
      if (f === 'doc') return itemType === 'canvas' || itemType === 'html-document' || itemType === 'text-document' || itemType === 'interactive-template';
      return false;
    };
    const activeFolder = computed(() => {
      const folder = allFolderSummaries.value.find((item) => item.id === selectedFolderId.value);
      if (selectedFolderId.value === 'legacy-resource-inbox' && legacyInboxSourceItems.value.length) {
        return buildLegacyInboxFolder(
          sortFolderItems(legacyInboxSourceItems.value.filter((item) => matchesFolderItem(item, 'Inbox') && matchesS2ItemType(item.type))),
        );
      }
      if (!folder) return null;
      const isGlobalSearch = s2ScopeMode.value === 'global' && (Boolean(searchQuery.value.trim()) || s2TypeFilter.value !== 'all');
      if (isGlobalSearch) {
        const seen = new Set<string>();
        const globalItems: FolderItem[] = [];
        for (const summary of allFolderSummaries.value) {
          for (const item of summary.items) {
            const k = `${item.type}:${item.id}` as const;
            if (seen.has(k)) continue;
            const enriched = dashboardItemsByKey.value.get(k) || item;
            if (matchesFolderItem(enriched, summary.name) && matchesS2ItemType(enriched.type)) {
              seen.add(k);
              globalItems.push(enriched);
            }
          }
        }
        return {
          ...folder,
          items: sortFolderItems(globalItems),
        };
      }
      return {
        ...folder,
        items: sortFolderItems(folder.items.filter((item) => matchesFolderItem(item, folder.name) && matchesS2ItemType(item.type))),
      };
    });
    const sidebarFolderRows = computed<DashboardFolderNavItem[]>(() => folderSummaries.value.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId || null,
      depth: folder.depth || 0,
      role: folder.role,
      technical: isTechnicalFolder(folder),
      expanded: isTreeExpanded(folder.id),
      // Files count as children only when showFilesInTree is enabled; otherwise only subfolders count.
      hasChildren: layoutPrefs.showFilesInTree.value
        ? Boolean(folder.hasChildren || folder.items.length > 0 || (folderFiles.counts[folder.id] ?? 0) > 0)
        : Boolean(folder.hasChildren),
      draggable: canReorderFolder(folder),
      dropActive: canDropToFolder(folder) && dragTargetFolder.value === folder.id,
      reorderTarget: folderDragOverId.value === folder.id,
    })));
    const sidebarAllFolders = computed(() =>
      allFolderSummaries.value.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId ?? null,
        hasChildren: Boolean(folder.hasChildren),
      })),
    );
    /**
     * The tree as the sidebar shows it: an opened folder lists its
     * subfolders, then its documents, then its Drive files (the first few,
     * fetched when it opens; how many in all comes from the file counts).
     */
    const sidebarDriveFiles = useSidebarDriveFiles(SIDEBAR_FOLDER_CHILD_LIMIT);
    const sidebarServerFolderIds = computed(() => {
      const known = new Set(allResourceFolders.value.map((folder) => folder.id));
      return folderSummaries.value
        .map((folder) => folder.id)
        .filter((id) => id !== 'legacy-resource-inbox' && known.has(id));
    });
    watch(sidebarServerFolderIds, (ids) => {
      // Counts for every folder in view (so one holding only files can open);
      // the files themselves only for the opened ones.
      folderFiles.want(ids);
      sidebarDriveFiles.want(ids.filter(isTreeExpanded));
    }, { immediate: true });
    watch(expandedTreeIds, (ids) => sidebarDriveFiles.want(ids.filter((id) => sidebarServerFolderIds.value.includes(id))));
    watch(layoutPrefs.showFilesInTree, (on) => {
      if (on) {
        sidebarDriveFiles.want(expandedTreeIds.value.filter((id) => sidebarServerFolderIds.value.includes(id)));
      }
    });
    const sidebarFolders = computed<DashboardSidebarNavItem[]>(() => {
      const itemsById = new Map(folderSummaries.value.map((folder) => [folder.id, folder.items]));
      return buildSidebarNavItems(
        sidebarFolderRows.value,
        (folderId) => [
          ...(itemsById.get(folderId) || []).map((item) => ({
            ...item,
            title: ('title' in item ? item.title : '') || ('name' in item ? (item as { name?: string }).name : '') || t('untitled'),
          })),
          ...(sidebarDriveFiles.files[folderId] || []).map((file) => ({
            id: file.id,
            title: file.name || t('untitled'),
            type: 'drive-file' as const,
            fileKind: file.kind === 'photo' || file.mime?.startsWith('image/') ? 'image' as const
              : file.kind === 'video' || file.mime?.startsWith('video/') ? 'video' as const
                : isMarkdownFile(file) ? 'markdown' as const
                  : 'file' as const,
          })),
        ],
        SIDEBAR_FOLDER_CHILD_LIMIT,
        (folderId) => (itemsById.get(folderId)?.length || 0) + (folderFiles.counts[folderId] ?? 0),
      );
    });
    const openSidebarFile = async (file: DashboardFileNavItem) => {
      if (file.type === 'drive-file' && (file.fileKind === 'image' || file.fileKind === 'video')) {
        // As its card in the folder does: a picture or a video opens full screen.
        mobileSidebarOpen.value = false;
        mediaViewer.value = { items: [driveViewerItem({ id: file.id, name: file.title || t('untitled'), kind: file.fileKind })], start: 0 };
        return;
      }
      if (file.type === 'drive-file' && (file.fileKind === 'markdown' || isMarkdownFile({ name: file.title }))) {
        mobileSidebarOpen.value = false;
        openDriveMarkdown({ id: file.id, name: file.title || t('untitled'), folderId: file.folderId });
        return;
      }
      if (file.type === 'drive-file') {
        // As its card in the folder does: a Drive file downloads.
        try {
          await downloadDriveFile(file.id, file.title);
        } catch (error) {
          await alertDialog({
            title: t('driveDownloadFailedTitle'),
            message: error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'),
          });
        }
        return;
      }
      const item = folderSummaries.value
        .find((folder) => folder.id === file.folderId)?.items
        .find((candidate) => candidate.type === file.type && candidate.id === file.id);
      const routeId = (item && 'slug' in item && item.slug) || file.id;
      mobileSidebarOpen.value = false;
      if (file.type === 'canvas') openCanvas(routeId);
      else if (file.type === 'html-document') openHtmlDocument(routeId);
      else if (file.type === 'text-document') openTextDocument(routeId);
      else openInteractiveTemplate(file.id);
    };
    const isBusy = computed(() => pendingAction.value.length > 0);
    const allDashboardResources = computed<FolderItem[]>(() => [
      ...allFolderSummaries.value.flatMap((folder) => folder.items),
      ...own.value,
      ...shared.value,
      ...sharedHtmlDocuments.value,
      ...sharedTextDocuments.value,
      ...publicCanvases.value,
      ...publicHtmlDocuments.value,
      ...publicTextDocuments.value,
      ...unfiledCanvases.value,
      ...unfiledHtmlDocuments.value,
      ...unfiledTextDocuments.value,
      ...unfiledInteractiveTemplateItems.value,
    ]);
    const allRecentResourceItems = computed<RecentResourceItem[]>(() => [
      ...allDashboardResources.value,
    ]);
    /**
     * allDashboardResources includes each folder's own items AND the same
     * canvases/documents again from own/shared/unfiled/public. /resource-
     * folders now returns tags on its nested canvases/htmlDocuments too (a
     * backend fix - it used to omit them, matching only its textDocuments),
     * but this enrichment stays regardless: it's what keeps the client
     * correct against an OLDER backend still running that gap (compatibility
     * during a rolling/independent frontend-backend deploy is exactly the
     * case where the two are out of sync), and it's free - own/shared/
     * allHtmlDocumentsRaw/allTextDocumentsRaw are already loaded for other
     * reasons. Building the lookup keeps whichever copy came LAST for a
     * given id, so listing the tag-complete sources after
     * allRecentResourceItems means anything resolved through this map has
     * its real tags, wherever it came from - own/shared cover every canvas
     * regardless of folder, allHtmlDocumentsRaw/allTextDocumentsRaw do the
     * same for HTML/text documents.
     */
    const dashboardItemsByKey = computed(() => new Map(
      [...allRecentResourceItems.value, ...allHtmlDocumentsRaw.value, ...allTextDocumentsRaw.value]
        .map((item) => [`${item.type}:${item.id}`, item] as const),
    ));
    /**
     * Creating counts as much as opening: the user's own items join Recent at
     * the time they were made, so a new file is there at once, and a user who
     * has opened nothing yet still sees what they made. Only one's own: an
     * item of someone else's is "recent" for them only once opened.
     */
    const createdRecentEntries = computed<RecentHistoryEntry[]>(() => {
      const userId = currentUser.value?.id;
      const entries: RecentHistoryEntry[] = [];
      for (const item of dashboardItemsByKey.value.values()) {
        const mine = item.type === 'interactive-template'
          ? (item as { role?: string }).role === 'owner'
          : Boolean(userId) && item.ownerId === userId;
        if (!mine) continue;
        const raw = item as { createdAt?: string; updatedAt?: string };
        const createdAt = Date.parse(raw.createdAt || raw.updatedAt || '');
        if (!Number.isFinite(createdAt)) continue;
        entries.push({ id: item.id, routeId: ('slug' in item && item.slug) || item.id, type: item.type, title: item.title || '', openedAt: createdAt });
      }
      return entries;
    });
    const recentResources = computed<RecentResource[]>(() => {
      const opened = new Set(recentResourceHistory.value.map((entry) => `${entry.type}:${entry.id}`));
      const history = [
        ...recentResourceHistory.value,
        ...createdRecentEntries.value.filter((entry) => !opened.has(`${entry.type}:${entry.id}`)),
      ].sort((a, b) => b.openedAt - a.openedAt).slice(0, RECENT_RESOURCES_LIMIT);
      return history.flatMap((recent) => {
        const item = dashboardItemsByKey.value.get(`${recent.type}:${recent.id}`);
        if (!item) return [];
        return [{
          ...recent,
          title: item.title || recent.title,
          routeId: ('slug' in item && item.slug) || item.id,
          tags: item.tags || [],
          folder: ('folder' in item && item.folder) || '',
          templateType: item.type === 'interactive-template' ? item.templateType : undefined,
          // The card's picture is versioned by the resource's own last change.
          updatedAt: ('updatedAt' in item && item.updatedAt) ? String(item.updatedAt) : null,
        }];
      });
    });

    /**
     * Recent, same as a folder's own contents, run through contentFilter +
     * selectedTags + searchQuery via matchesFolderItem - previously Recent
     * ignored all three entirely, which was the whole "filters don't affect
     * Recent" bug: there was no filtering step here at all, not a broken one.
     */
    const filteredRecentResources = computed(() =>
      recentResources.value.filter((item) => matchesFolderItem(item, item.folder)),
    );

    /**
     * sortMode is shared with folders/public via sortFolderItems, but Recent
     * items have no `updatedAt`/`pinned` - "when opened" is Recent's own
     * notion of recency, so updated-desc/-asc sort by openedAt instead.
     */
    const sortedRecentResources = computed(() => [...filteredRecentResources.value].sort((a, b) => {
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      return sortMode.value === 'updated-asc' ? a.openedAt - b.openedAt : b.openedAt - a.openedAt;
    }));

    /**
     * Columns the feed's card grid has right now (see feed-rows.ts): each
     * section shows whole rows of it before "Show all", not a fixed 4.
     */
    const dashboardShell = ref<HTMLElement | null>(null);
    useDashboardFramePinning();
    const feedColumns = ref(FEED_FALLBACK_COLUMNS);
    let feedResizeObserver: ResizeObserver | null = null;
    let feedResizeRaf: number | null = null;
    let feedPhoneMedia: MediaQueryList | null = null;
    const measureFeedColumns = () => {
      feedColumns.value = feedColumnCount(dashboardShell.value?.clientWidth ?? 0, !!feedPhoneMedia?.matches);
    };
    const scheduleMeasureFeedColumns = () => {
      if (typeof requestAnimationFrame !== 'function') {
        measureFeedColumns();
        return;
      }
      if (feedResizeRaf !== null) cancelAnimationFrame(feedResizeRaf);
      feedResizeRaf = requestAnimationFrame(() => {
        feedResizeRaf = null;
        measureFeedColumns();
      });
    };
    onMounted(() => {
      feedPhoneMedia = typeof window.matchMedia === 'function' ? window.matchMedia(FEED_PHONE_QUERY) : null;
      feedPhoneMedia?.addEventListener?.('change', measureFeedColumns);
      if (typeof ResizeObserver !== 'undefined' && dashboardShell.value) {
        feedResizeObserver = new ResizeObserver(() => scheduleMeasureFeedColumns());
        feedResizeObserver.observe(dashboardShell.value);
      }
      measureFeedColumns();
    });
    onBeforeUnmount(() => {
      feedResizeObserver?.disconnect();
      if (feedResizeRaf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(feedResizeRaf);
        feedResizeRaf = null;
      }
      feedPhoneMedia?.removeEventListener?.('change', measureFeedColumns);
    });
    const feedLimit = (section: FeedRowSection) => feedSectionLimit(section, feedColumns.value);

    const recentExpanded = ref(false);
    const recentTotal = computed(() => sortedRecentResources.value.length);
    const visibleRecent = computed(() =>
      recentExpanded.value ? sortedRecentResources.value : sortedRecentResources.value.slice(0, feedLimit('recent')),
    );
    const recentShowAllAvailable = computed(() => recentTotal.value > feedLimit('recent'));
    const recentRefreshFailed = computed(() => recentLoadFailed.value || dashboardLoadFailed.value);
    const retryRecent = () => {
      void load({ showLoading: false });
      void loadRecentResources();
    };

    /**
     * HOME AS ONE FEED. Shared / Interactive / Public render on Home too,
     * below Recent and Folders, as the SAME blocks their own sections use,
     * capped at whole rows of cards (feedLimit); "Show all N" unfolds the
     * rest in place.
     * A signed-in user never leaves the feed for a page of one section: the
     * sections stay on it even when empty (or emptied by the filters, with a
     * note saying so), so the sidebar always has somewhere to scroll to.
     */
    const isHomeFeed = computed(() => isLoggedIn && activeSection.value.kind === 'recent');
    type ExpandableFeedSection = 'shared' | 'interactive' | 'public';
    const expandedFeedSections = ref<ExpandableFeedSection[]>([]);
    const isFeedSectionExpanded = (section: ExpandableFeedSection) => expandedFeedSections.value.includes(section);
    /** Unfold / fold a feed block, its grid easing to the new height. */
    const animateFeedGrid = (selector: string, collapsing: boolean, limit: number, change: () => void) => {
      const grid = dashboardShell.value?.querySelector<HTMLElement>(selector);
      void animateHeight(grid, change, collapsing && grid ? { collapseTo: heightOfFirstChildren(grid, limit) } : {});
    };
    const toggleFeedSectionExpanded = (section: ExpandableFeedSection) => {
      const collapsing = isFeedSectionExpanded(section);
      animateFeedGrid(`[data-feed-grid="${section}"]`, collapsing, feedLimit(section), () => {
        expandedFeedSections.value = collapsing
          ? expandedFeedSections.value.filter((item) => item !== section)
          : [...expandedFeedSections.value, section];
      });
    };
    const feedItems = <T,>(items: T[], section: ExpandableFeedSection): T[] => (
      isHomeFeed.value && !isFeedSectionExpanded(section) ? items.slice(0, feedLimit(section)) : items
    );
    /** The home feed's Spaces tiles: Yandex Disk (when enabled) and the user's shared spaces, narrowed by the search like the folders. */
    const { spaces: allSpaces } = useSpaces();
    const { status: yandexStatus, load: loadYandexStatus, noteError: noteYandexError } = useYandexDisk();
    const yandexAccountLabel = computed(() => {
      if (!yandexStatus.value?.connected) return '';
      return yandexStatus.value.displayName || yandexStatus.value.email || yandexStatus.value.login || '';
    });
    const showYandexSpaceTile = computed(() => {
      if (!yandexStatus.value?.enabled) return false;
      const needle = searchQuery.value.trim().toLocaleLowerCase();
      if (!needle) return true;
      const haystacks = [
        t('yandexDisk'),
        yandexAccountLabel.value,
        yandexStatus.value.email ?? '',
        yandexStatus.value.login ?? '',
      ];
      return haystacks.some((text) => text.toLocaleLowerCase().includes(needle));
    });
    const spaceTiles = computed(() => {
      const needle = searchQuery.value.trim().toLocaleLowerCase();
      return needle ? allSpaces.value.filter((space) => space.name.toLocaleLowerCase().includes(needle)) : allSpaces.value;
    });
    const feedNavSections = computed<FeedSection[]>(() => {
      if (!isHomeFeed.value) return [];
      const sections: FeedSection[] = ['recent'];
      if (recentFolderTiles.value.length) sections.push('folders');
      if (spaceTiles.value.length) sections.push('spaces');
      sections.push('shared', 'interactive', 'public');
      return sections;
    });
    const { activeFeedSection, scrollToFeedSection } = useDashboardFeedScrollSpy(feedNavSections);

    /**
     * The header never scrolls away. Only `.app-main` scrolls; the frame
     * around it (the page, .app-layout, the shells) is overflow: hidden, but
     * a browser still scrolls such a box itself: a phone does when the
     * keyboard opens for an input (iOS Safari leaves the page scrolled after
     * it closes), and focus() / scrollIntoView() scroll every ancestor. The
     * header then sat above the screen with nothing to drag it back by.
     * Whatever scrolls the frame, it goes back to the top.
     */
    const toggleRecentExpanded = () => {
      const collapsing = recentExpanded.value;
      animateFeedGrid('[data-recent-layout]', collapsing, feedLimit('recent'), () => {
        recentExpanded.value = !collapsing;
      });
    };

    const actionLabel = (action: string, idleLabel: string) =>
      pendingAction.value === action ? 'Saving...' : idleLabel;

    const load = async ({ showLoading = !own.value.length && !publicCanvases.value.length && !ownResourceFolders.value.length } = {}) => {
      if (showLoading) loading.value = true;
      isRefreshing.value = true;
      try {
        const res = await canvas.list();
        if (isLoggedIn) {
          const folders = await resourceFolders.list();
          ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
          sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
          refreshFolderFileCounts();
          const folderDocumentIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.htmlDocuments || []).map((document: any) => document.id),
            ),
          );
          const folderTextDocumentIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.textDocuments || []).map((document: any) => document.id),
            ),
          );
          const legacyState = await htmlDocuments.list();
          allHtmlDocumentsRaw.value = (legacyState.documents || []).map((document: any) => normalizeHtmlDocument(document));
          unfiledHtmlDocuments.value = allHtmlDocumentsRaw.value
            .filter((document) => document.ownerId === currentUser.value?.id)
            .filter((document) => !folderDocumentIds.has(document.id));
          sharedHtmlDocuments.value = allHtmlDocumentsRaw.value
            .filter((document) => document.ownerId !== currentUser.value?.id)
            .filter((document) => document.visibility !== 'public')
            .filter((document) => !folderDocumentIds.has(document.id));
          const textState = await textDocuments.list();
          allTextDocumentsRaw.value = (textState.documents || []).map((document: any) => normalizeTextDocument(document));
          unfiledTextDocuments.value = allTextDocumentsRaw.value
            .filter((document) => document.ownerId === currentUser.value?.id)
            .filter((document) => !folderTextDocumentIds.has(document.id));
          sharedTextDocuments.value = allTextDocumentsRaw.value
            .filter((document) => document.ownerId !== currentUser.value?.id)
            .filter((document) => document.visibility !== 'public')
            .filter((document) => !folderTextDocumentIds.has(document.id));
          const templateState = await interactiveTemplates.list();
          const templates = [...(templateState.templates || []), ...(templateState.own || []), ...(templateState.shared || [])];
          interactiveTemplateItems.value = [...new Map(templates.map((item) => [item.id, item])).values()];
        }
        own.value = res.own.map((c: any) => normalizeCanvas(c, true));
        unfiledCanvases.value = own.value.filter((canvasRecord) => !canvasRecord.folderId || !ownResourceFolders.value.some((folder) => folder.id === canvasRecord.folderId));
        if (isLoggedIn) {
          const visibleFolderCanvasIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.canvases || []).map((canvasItem: any) => canvasItem.id),
            ),
          );
          unfiledCanvases.value = own.value.filter((canvasRecord) => !visibleFolderCanvasIds.has(canvasRecord.id));
        }
        shared.value = res.shared.map((c: any) => normalizeCanvas(c, false));
        publicCanvases.value = (res.public || []).map((c: any) => normalizeCanvas(c, false));
        const publicDocuments = await htmlDocuments.publicList();
        publicHtmlDocuments.value = (publicDocuments.documents || []).map((document: any) => normalizeHtmlDocument(document));
        const publicDocs = await textDocuments.publicList();
        publicTextDocuments.value = (publicDocs.documents || []).map((document: any) => normalizeTextDocument(document));
        incomingRequests.value = isLoggedIn ? await accessRequests.incoming() : [];
        if (isLoggedIn) {
          sharedResourceTags.value = (await tags.list()).tags.map(({ name, color }) => ({ name, color }));
        }
        const availableFolders = new Set(ownResourceFolders.value.map((folder) => folder.id));
        // Drop collapse flags for folders that no longer exist; everything else
        // stays expanded by default.
        collapsedFolderIds.value = collapsedFolderIds.value.filter((id) => availableFolders.has(id));
        const knownFolders = new Set(allResourceFolders.value.map((folder) => folder.id));
        expandedTreeIds.value = expandedTreeIds.value.filter((id) => knownFolders.has(id));
        restoreSelectedFolder();
        writeDashboardCache();
        dashboardLoadFailed.value = false;
      } catch (error) {
        dashboardLoadFailed.value = true;
        if (showLoading) setFeedback('error', error instanceof Error ? error.message : 'Failed to load dashboard');
      } finally {
        if (showLoading) loading.value = false;
        isRefreshing.value = false;
      }
    };

    const resetDashboardPull = () => {
      dashboardPullStartY = null;
      dashboardPullDistance.value = 0;
    };

    const onDashboardPullStart = (event: TouchEvent) => {
      if (!isNativeDashboard || isRefreshing.value || loading.value || resourceDrag.value || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.dashboard-modal-backdrop, input, textarea, select, [contenteditable="true"]')) return;
      if ((dashboardMain.value?.scrollTop || 0) > 0) return;
      // An open folder scrolls its own nested body (.folder-manager-body),
      // separate from dashboardMain - without this check, scrolling up
      // inside a folder that isn't at ITS OWN top reads as "page at top"
      // and wrongly starts a pull-to-refresh instead.
      if ((activeFolderBody.value?.scrollTop || 0) > 0) return;
      const point = event.touches[0];
      if (!point) return;
      dashboardPullStartY = point.clientY;
    };

    const onDashboardPullMove = (event: TouchEvent) => {
      if (dashboardPullStartY === null || !isNativeDashboard || resourceDrag.value?.active) return;
      const point = event.touches[0];
      if (!point) return;
      const distance = point.clientY - dashboardPullStartY;
      if (distance <= 0) {
        dashboardPullDistance.value = 0;
        return;
      }
      if ((dashboardMain.value?.scrollTop || 0) > 0) {
        resetDashboardPull();
        return;
      }
      if ((activeFolderBody.value?.scrollTop || 0) > 0) {
        resetDashboardPull();
        return;
      }
      dashboardPullDistance.value = Math.min(distance, DASHBOARD_PULL_THRESHOLD + 36);
      // Prevent the native elastic overscroll only while this dashboard gesture
      // is active, leaving ordinary scrolling and card dragging unchanged.
      event.preventDefault();
    };

    const onDashboardPullEnd = () => {
      const shouldRefresh = dashboardPullDistance.value >= DASHBOARD_PULL_THRESHOLD && !isRefreshing.value;
      resetDashboardPull();
      if (shouldRefresh) {
        void load({ showLoading: false });
        void loadRecentResources();
      }
    };

    /** Just created: into Recent now, from what the server answered. */
    const rememberCreatedResource = (type: RecentResourceType, record: { id: string; slug?: string | null; title?: string | null }) => {
      const recent: RecentHistoryEntry = { id: record.id, routeId: record.slug || record.id, type, title: record.title || '', openedAt: Date.now() };
      recentResourceHistory.value = [recent, ...recentResourceHistory.value.filter((entry) => !(entry.type === type && entry.id === record.id))].slice(0, RECENT_RESOURCES_LIMIT);
      markResourceOpened(type, record.id);
    };
    const rememberRecentResource = (type: RecentResourceType, routeId: string) => {
      recordDashboardReturnOrigin();
      const item = allRecentResourceItems.value.find((resource) => resource.type === type && (resource.id === routeId || ('slug' in resource && resource.slug === routeId)));
      if (!item) return;
      const recent: RecentHistoryEntry = { id: item.id, routeId: ('slug' in item && item.slug) || item.id, type, title: item.title || '', openedAt: Date.now() };
      recentResourceHistory.value = [recent, ...recentResourceHistory.value.filter((entry) => !(entry.type === recent.type && entry.id === recent.id))].slice(0, RECENT_RESOURCES_LIMIT);
      markResourceOpened(type, item.id);
    };

    const openCanvas = (id: string) => {
      rememberRecentResource('canvas', id);
      recordDashboardReturnOrigin();
      router.push(`/canvas/${id}`);
    };

    const openInteractiveTemplate = (id: string) => {
      rememberRecentResource('interactive-template', id);
      recordDashboardReturnOrigin();
      router.push({ name: 'interactive-template', params: { id } });
    };

    const openCanvasFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openCanvas(id);
    };

    const openHtmlDocument = (id: string) => {
      rememberRecentResource('html-document', id);
      recordDashboardReturnOrigin();
      router.push(`/edit/html/${id}`);
    };

    const openHtmlDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openHtmlDocument(id);
    };

    const openTextDocument = (id: string) => {
      rememberRecentResource('text-document', id);
      recordDashboardReturnOrigin();
      router.push({ name: 'text-document', params: { id } });
    };

    const openRecentResource = (item: RecentResource) => {
      if (item.type === 'canvas') openCanvas(item.routeId);
      else if (item.type === 'html-document') openHtmlDocument(item.routeId);
      else if (item.type === 'text-document') openTextDocument(item.routeId);
      else openInteractiveTemplate(item.routeId);
    };
    // Same format as every other card's date ("Oct 13, 05:15 PM"), not a
    // numeric "11/05, 10:15 PM" of its own.
    const formatRecentOpenedAt = (openedAt: number) => new Date(openedAt).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const refreshOverflowIndicators = () => {
      void nextTick(() => {
        const tagsList = tagFilterList.value;
        hasTagOverflow.value = Boolean(tagsList && tagsList.scrollWidth > tagsList.clientWidth + 2);
        recomputeMobileTagFit();
      });
    };
    watch([allTagNames, activeFolder, selectedTags], refreshOverflowIndicators, { flush: 'post' });

    const openTextDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openTextDocument(id);
    };

    /**
     * Where a new item goes: the folder asked for (a folder's own menu), else
     * the New menu's "Create in" choice - which defaults to the folder you
     * are in - else Unsorted, as before.
     */
    const newItemFolderId = ref('');
    const newItemFolderOptions = computed(() => folderOptions.value.filter((option) => !isTechnicalFolder(option)));
    const resolveCreateFolderId = async (explicitFolderId?: unknown) => {
      if (typeof explicitFolderId === 'string' && explicitFolderId) return explicitFolderId;
      if (newItemFolderId.value && ownResourceFolders.value.some((f) => f.id === newItemFolderId.value)) return newItemFolderId.value;
      return (await ensureFolderByName('Unsorted'))?.id;
    };

    // `folderId` is optional; a click handler may pass its event instead.
    const createCanvas = async (folderId?: unknown, title = 'Untitled') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      const c = await runAction('create-canvas', () => canvas.create(title, undefined, targetFolderId), 'Canvas created');
      if (!c) return;
      rememberCreatedResource('canvas', c);
      recordDashboardReturnOrigin();
      router.push(`/canvas/${c.id}`);
    };

    const createHtmlDocument = async (folderId?: unknown, title = 'Untitled HTML') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      // The page starts with its name as the heading.
      const heading = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doc = await runAction(
        'create-html-document',
        () => htmlDocuments.create({ title, html: `<main><h1>${heading}</h1></main>`, folderId: targetFolderId }),
        'HTML document created',
      );
      if (!doc) return;
      rememberCreatedResource('html-document', doc);
      recordDashboardReturnOrigin();
      router.push(`/edit/html/${doc.id}`);
    };

    const createTextDocument = async (folderId?: unknown, title = 'Untitled document') => {
      openControlMenu.value = '';
      const targetFolderId = await resolveCreateFolderId(folderId);
      const doc = await runAction(
        'create-text-document',
        () => textDocuments.create({ title, folderId: targetFolderId }),
        'Document created',
      );
      if (!doc) return;
      rememberCreatedResource('text-document', doc);
      openTextDocument(doc.id);
    };

    const interactiveTemplateTypeLabel = (templateType: InteractiveTemplate['templateType']) =>
      templateType === 'trello-board' ? 'Канбан-доска' : 'D&D персонаж';

    // `imported` is a character read from a file: the sheet is created already filled in.
    const createInteractiveTemplate = async (templateType: InteractiveTemplate['templateType'] = 'dnd-character', imported?: CharacterImport) => {
      openControlMenu.value = '';
      templatePickerOpen.value = false;
      const isBoard = templateType === 'trello-board';
      const template = await runAction(
        'create-interactive-template',
        () => interactiveTemplates.create(imported
          ? { templateType, title: imported.title, data: imported.data as unknown as Record<string, unknown> }
          : { templateType, title: isBoard ? '' : 'Новый персонаж' }),
        imported ? 'Персонаж импортирован' : isBoard ? 'Канбан-доска создана' : 'Шаблон персонажа создан',
      );
      if (!template) return;
      const folderId = templateFolderId.value;
      templateFolderId.value = null;
      if (folderId) await resourceFolders.move(folderId, 'interactive-template', template.id);
      interactiveTemplateItems.value = [{ ...template, role: 'owner' }, ...interactiveTemplateItems.value];
      rememberCreatedResource('interactive-template', template);
      openInteractiveTemplate(template.id);
    };

    // Куда положить новый шаблон: папка из «+» папки или место создания из меню «Новое».
    const templateFolderId = ref<string | null>(null);
    const openInteractiveTemplatePicker = (folderId?: unknown) => {
      templateFolderId.value =
        typeof folderId === 'string' && folderId
          ? folderId
          : newItemFolderId.value && ownResourceFolders.value.some((f) => f.id === newItemFolderId.value)
            ? newItemFolderId.value
            : null;
      openControlMenu.value = '';
      templatePickerOpen.value = true;
    };
    const closeInteractiveTemplatePicker = () => { templatePickerOpen.value = false; };
    const importCharacter = (imported: CharacterImport) => createInteractiveTemplate('dnd-character', imported);

    const deleteInteractiveTemplate = async (template: InteractiveTemplate) => {
      if (!(await confirmDelete('deleteTemplateTitle', template.title))) return;
      await runAction('delete-interactive-template', () => interactiveTemplates.delete(template.id), 'Шаблон удалён');
      forgetResourceTab('template', template.id);
      interactiveTemplateItems.value = interactiveTemplateItems.value.filter((item) => item.id !== template.id);
      await load({ showLoading: false });
    };

    const openCreateGroupModal = () => {
      closeCardMenu();
      openControlMenu.value = '';
      folderModal.value = {
        open: true,
        resourceId: '',
        resourceType: 'canvas',
        folderId: '',
        value: '',
      };
    };

    const openMoveFolderModal = (c: CanvasRecord) => {
      closeCardMenu();
      draggingResourceFolderId.value = c.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: c.id,
        resourceType: 'canvas',
        folderId: c.folderId || '',
        value: c.folder || '',
      };
    };

    const openMoveHtmlFolderModal = (doc: HtmlDocumentRecord) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === doc.folderId);
      draggingResourceFolderId.value = doc.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: doc.id,
        resourceType: 'html-document',
        folderId: doc.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveTextDocumentFolderModal = (doc: TextDocumentRecord) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === doc.folderId);
      draggingResourceFolderId.value = doc.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: doc.id,
        resourceType: 'text-document',
        folderId: doc.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveInteractiveTemplateFolderModal = (template: InteractiveTemplate) => {
      closeCardMenu();
      const currentFolder = ownResourceFolders.value.find((folder) => folder.id === template.folderId);
      draggingResourceFolderId.value = template.folderId || null;
      folderModal.value = {
        open: true,
        resourceId: template.id,
        resourceType: 'interactive-template',
        folderId: template.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const openMoveResourceFolderModal = (item: FolderItem) => {
      if (item.type === 'canvas') return openMoveFolderModal(item);
      if (item.type === 'html-document') return openMoveHtmlFolderModal(item);
      if (item.type === 'text-document') return openMoveTextDocumentFolderModal(item);
      return openMoveInteractiveTemplateFolderModal(item);
    };

    const closeFolderModal = () => {
      folderModal.value = { open: false, resourceId: '', resourceType: 'canvas', folderId: '', value: '' };
      draggingResourceFolderId.value = null;
    };

    const ensureFolderByName = async (name: string) => {
      const normalizedName = name.trim() || 'Unsorted';
      const existing = ownResourceFolders.value.find((folder) => folder.name.toLowerCase() === normalizedName.toLowerCase());
      if (existing) return existing;
      return runAction('create-folder', () => resourceFolders.create(normalizedName), `Folder ${normalizedName} created`);
    };

    const runBulkMoveWithJournal = async (targetFolderName: string, ops: Array<() => Promise<unknown>>) => {
      const total = ops.length;
      if (!total) return;
      let done = 0;
      let cancelled = false;
      let taskId = '';
      const detail = () => `${targetFolderName} · ${t('activityJournalBulkProgress').replace('{done}', String(done)).replace('{total}', String(total))}`;
      taskId = activityJournal.startTask({
        kind: 'bulk',
        title: t('activityJournalBulkMoveTitle').replace('{n}', String(total)),
        detail: detail(),
        progress: 0,
        cancellable: true,
        cancel: () => {
          cancelled = true;
          if (taskId) activityJournal.cancelTask(taskId);
        },
      });
      try {
        await runAction('move-folder', async () => {
          for (const op of ops) {
            if (cancelled) break;
            await op();
            done += 1;
            if (!cancelled) {
              activityJournal.updateTask(taskId, {
                progress: Math.round((done / total) * 100),
                detail: detail(),
              });
            }
          }
        });
        if (!cancelled) {
          setFeedback('success', t('bulkMovedTo').replace('{folder}', targetFolderName).replace('{n}', String(total)));
          activityJournal.completeTask(taskId, detail());
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error && error.message ? error.message : undefined;
          activityJournal.failTask(taskId, msg);
        }
        throw error;
      }
    };

    const saveFolderModal = async () => {
      const folderName = folderModal.value.value.trim();
      const targetFolder = folderModal.value.folderId
        ? ownResourceFolders.value.find((folder) => folder.id === folderModal.value.folderId)
        : await ensureFolderByName(folderName);
      if (!targetFolder) return;
      if (folderModal.value.bulk?.length) {
        const spaceItems = selectedSpaceItemsOf(folderModal.value.bulk);
        if (spaceItems.length) {
          const { movable } = partitionMovableSpaceItems(spaceItems, activeSpace.value?.role, currentUser.value?.id || '');
          if (!movable.length) {
            closeFolderModal();
            return;
          }
          const docItemsToMove = movable
            .filter((item) => item.kind !== 'file' && item.id)
            .filter((item) => dashboardItemsByKey.value.get(`${toFolderResourceType(item.kind)}:${item.id}`)?.folderId !== targetFolder.id);
          const fileItemsToMove = movable.filter((item) => item.kind === 'file' && item.id);
          let moved = false;
          const moveOps: Array<() => Promise<unknown>> = [
            ...docItemsToMove.map((item) => () => resourceFolders.move(targetFolder.id, toFolderResourceType(item.kind), item.id!)),
            ...fileItemsToMove.map((item) => () => driveApi.moveFile(item.id!, targetFolder.id)),
          ];
          try {
            await runBulkMoveWithJournal(targetFolder.name, moveOps);
            moved = true;
          } catch {
            // runAction already displayed the error toast.
          }
          if (!moved) {
            await Promise.all([load(), spaceView.value?.reload()]);
            return;
          }
          closeFolderModal();
          clearSelection();
          if (fileItemsToMove.length) {
            folderFilesRefreshKey.value += 1;
            refreshFolderFileCounts();
          }
          await Promise.all([load(), spaceView.value?.reload(), loadSpaces(true)]);
          return;
        }
        const items = selectedItemsOf(folderModal.value.bulk).filter((item) => item.folderId !== targetFolder.id);
        const driveFiles = selectedDriveFilesOf(folderModal.value.bulk).filter((file) => file.folderId !== targetFolder.id);
        const moveOps: Array<() => Promise<unknown>> = [
          ...items.map((item) => () => resourceFolders.move(targetFolder.id, item.type, item.id)),
          ...driveFiles.map((file) => () => driveApi.moveFile(file.id, targetFolder.id)),
        ];
        await runBulkMoveWithJournal(targetFolder.name, moveOps);
        closeFolderModal();
        clearSelection();
        if (driveFiles.length) {
          folderFilesRefreshKey.value += 1;
          refreshFolderFileCounts();
        }
        await load();
        return;
      }
      if (!folderModal.value.resourceId) {
        closeFolderModal();
        await load();
        return;
      }
      await runAction(
        'move-folder',
        () => resourceFolders.move(targetFolder.id, folderModal.value.resourceType, folderModal.value.resourceId),
        `Moved to ${targetFolder.name}`,
      );
      closeFolderModal();
      await load();
    };

    const moveResourceLocally = (resourceId: string, resourceType: FolderItem['type'], targetFolder: FolderSummary) => {
      let movedItem: any | null = null;
      const sourceFolders = [...ownResourceFolders.value, ...sharedResourceFolders.value];
      for (const folder of sourceFolders) {
        const list = resourceType === 'canvas'
          ? folder.items?.canvases || []
          : resourceType === 'html-document'
            ? folder.items?.htmlDocuments || []
            : folder.items?.textDocuments || [];
        const index = list.findIndex((item) => item.id === resourceId);
        if (index >= 0) {
          [movedItem] = list.splice(index, 1);
          if (resourceType === 'canvas') {
            folder.canvasCount = list.length;
          } else if (resourceType === 'html-document') {
            folder.htmlDocumentCount = list.length;
          } else {
            folder.textDocumentCount = list.length;
          }
          break;
        }
      }
      if (!movedItem) {
        const fallbackItems = resourceType === 'canvas'
          ? unfiledCanvases.value
          : resourceType === 'html-document'
            ? unfiledHtmlDocuments.value
            : unfiledTextDocuments.value;
        const index = fallbackItems.findIndex((item) => item.id === resourceId);
        if (index >= 0) {
          [movedItem] = fallbackItems.splice(index, 1);
        }
      }
      const destination = ownResourceFolders.value.find((folder) => folder.id === targetFolder.id);
      if (!movedItem || !destination?.items) return null;
      const nextItem = {
        ...movedItem,
        folderId: destination.id,
      };
      if (resourceType === 'canvas') {
        nextItem.folder = destination.name;
        destination.items.canvases = [nextItem, ...(destination.items.canvases || [])];
        destination.canvasCount = destination.items.canvases.length;
        const ownCanvas = own.value.find((item) => item.id === resourceId);
        if (ownCanvas) {
          ownCanvas.folderId = destination.id;
          ownCanvas.folder = destination.name;
        }
      } else if (resourceType === 'html-document') {
        destination.items.htmlDocuments = [nextItem, ...(destination.items.htmlDocuments || [])];
        destination.htmlDocumentCount = destination.items.htmlDocuments.length;
      } else {
        destination.items.textDocuments = [nextItem, ...(destination.items.textDocuments || [])];
        destination.textDocumentCount = destination.items.textDocuments.length;
      }
      return nextItem;
    };

    const startCanvasDrag = (event: DragEvent, c: CanvasRecord) => {
      if (isBusy.value) {
        event.preventDefault();
        return;
      }
      closeCardMenu();
      draggingResourceId.value = c.id;
      draggingResourceType.value = 'canvas';
      draggingResourceFolderId.value = c.folderId || null;
      event.dataTransfer?.setData('text/plain', c.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    const endResourceDrag = () => {
      draggingResourceId.value = '';
      draggingResourceFolderId.value = null;
      dragTargetFolder.value = '';
    };

    const canDropToFolder = (folder: FolderSummary) => {
      return Boolean(
        draggingResourceId.value
        && !isBusy.value
        && folder.role === 'owner'
        && draggingResourceFolderId.value !== folder.id
        && ownResourceFolders.value.some((ownedFolder) => ownedFolder.id === folder.id),
      );
    };

    const findDropFolder = (folderId: string) => {
      return folderSummaries.value.find((folder) => folder.id === folderId && canDropToFolder(folder));
    };

    const resolveSidebarFolder = (folderId: string) =>
      folderSummaries.value.find((folder) => folder.id === folderId) || null;

    const onSidebarFolderDragStart = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragStart(event, folder);
    };

    const onSidebarFolderDragEnter = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragEnter(event, folder);
    };

    const onSidebarFolderDragOver = (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragOverEvent(event, folder);
    };

    const onSidebarFolderDragLeave = (_event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) onFolderDragLeave(folder);
    };

    const onSidebarFolderDrop = async (event: DragEvent, folderId: string) => {
      const folder = resolveSidebarFolder(folderId);
      if (folder) await onFolderDrop(event, folder);
    };

    const dropResourceToFolder = async (folder: FolderSummary) => {
      const resourceId = draggingResourceId.value;
      const resourceType = draggingResourceType.value;
      const sourceFolderId = draggingResourceFolderId.value;
      const canDrop = canDropToFolder(folder);
      endResourceDrag();
      if (!resourceId || !canDrop) return;
      if (sourceFolderId === folder.id) return;
      const previousOwnFolders = ownResourceFolders.value.map((folder) => ({
        ...folder,
        items: {
          canvases: [...(folder.items?.canvases || [])],
          htmlDocuments: [...(folder.items?.htmlDocuments || [])],
          textDocuments: [...(folder.items?.textDocuments || [])],
        },
      }));
      const previousSharedFolders = sharedResourceFolders.value.map((folder) => ({
        ...folder,
        items: {
          canvases: [...(folder.items?.canvases || [])],
          htmlDocuments: [...(folder.items?.htmlDocuments || [])],
          textDocuments: [...(folder.items?.textDocuments || [])],
        },
      }));
      const previousUnfiledCanvases = [...unfiledCanvases.value];
      const previousUnfiledHtmlDocuments = [...unfiledHtmlDocuments.value];
      const previousUnfiledTextDocuments = [...unfiledTextDocuments.value];
      const previousOwn = own.value.map((item) => ({ ...item }));
      moveResourceLocally(resourceId, resourceType, folder);
      try {
        await runAction('move-folder', () => resourceFolders.move(folder.id, resourceType, resourceId), `Moved to ${folder.name}`);
      } catch (error) {
        ownResourceFolders.value = previousOwnFolders;
        sharedResourceFolders.value = previousSharedFolders;
        unfiledCanvases.value = previousUnfiledCanvases;
        unfiledHtmlDocuments.value = previousUnfiledHtmlDocuments;
        unfiledTextDocuments.value = previousUnfiledTextDocuments;
        own.value = previousOwn;
      }
    };

    const {
      folderDragId,
      folderDragOverId,
      canReorderFolder,
      onFolderDragStart,
      onFolderDragEnd,
      onFolderDragEnter,
      onFolderDragOverEvent,
      onFolderDragLeave,
      onFolderDrop,
    } = useDashboardFolderDrag<FolderSummary>({
      ownFolders: ownResourceFolders as unknown as Ref<FolderSummary[]>,
      isBusy,
      isTechnicalFolder: (folder) => isTechnicalFolder(folder),
      canDropResource: canDropToFolder,
      expandTree,
      onResourceDragOver: (folder) => {
        dragTargetFolder.value = folder.id;
        if (folder.hasChildren) expandTree(folder.id);
      },
      onResourceDragLeave: (folder) => {
        if (dragTargetFolder.value === folder.id) dragTargetFolder.value = '';
      },
      dropResourceToFolder,
      reorderFoldersApi: async (ids) => { await resourceFolders.reorder(ids); },
      setFeedback,
    });

    const { resourceDrag, startResourceMouseDrag, startResourceTouchDrag } = useDashboardResourceDrag<FolderItem, FolderSummary>({
      draggingResourceId,
      draggingResourceType,
      draggingResourceFolderId,
      dragTargetFolder,
      suppressNextCardClick,
      closeCardMenu: () => closeCardMenu(),
      endResourceDrag,
      findDropFolder,
      dropResourceToFolder,
      expandTree,
      canStart: (item, sourceFolder, target) => (
        !isBusy.value
        && sourceFolder.role === 'owner'
        && ownResourceFolders.value.some((folder) => folder.id === sourceFolder.id)
        && !target?.closest('button,input,a,textarea,select,[contenteditable="true"]')
        && item.id.length > 0
      ),
    });

    const openRenameFolderModal = (folder: FolderSummary) => {
      closeCardMenu();
      renameFolderModal.value = { open: true, folderId: folder.id, sourceName: folder.name, value: folder.name };
    };

    const closeRenameFolderModal = () => {
      renameFolderModal.value = { open: false, folderId: '', sourceName: '', value: '' };
    };

    const saveRenameFolderModal = async () => {
      const nextFolder = renameFolderModal.value.value.trim();
      const currentFolder = renameFolderModal.value.sourceName;
      if (!nextFolder || nextFolder === currentFolder || !renameFolderModal.value.folderId) {
        closeRenameFolderModal();
        return;
      }
      await runAction(
        'rename-folder',
        () => resourceFolders.rename(renameFolderModal.value.folderId, nextFolder),
        `Folder renamed to ${nextFolder}`,
      );
      closeRenameFolderModal();
      await load();
    };

    const deleteFolder = async (folder: FolderSummary) => {
      closeCardMenu();
      const confirmed = await confirmDelete('deleteGroupTitle', folder.name, 'deleteGroupNote');
      if (!confirmed) return;
      await runAction(
        'delete-folder',
        () => resourceFolders.delete(folder.id),
        `Folder ${folder.name} removed`,
      );
      await load();
    };

    const loadFolderPermissions = async () => {
      if (!folderShareModal.value.folderId) return;
      folderShareModal.value.loading = true;
      try {
        folderShareModal.value.permissions = await resourceFolders.permissions(folderShareModal.value.folderId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load folder permissions';
        setFeedback('error', message);
      } finally {
        folderShareModal.value.loading = false;
      }
    };

    const openFolderShareModal = async (folder: FolderSummary) => {
      closeCardMenu();
      folderShareModal.value = {
        open: true,
        folderId: folder.id,
        name: folder.name,
        email: '',
        role: 'read',
        permissions: [],
        loading: false,
      };
      await loadFolderPermissions();
    };

    const closeFolderShareModal = () => {
      folderShareModal.value = { open: false, folderId: '', name: '', email: '', role: 'read', permissions: [], loading: false };
    };

    const shareFolder = async () => {
      const email = folderShareModal.value.email.trim();
      if (!folderShareModal.value.folderId || !email) return;
      await runAction(
        'share-folder',
        () => resourceFolders.share(folderShareModal.value.folderId, email, folderShareModal.value.role),
        `Shared folder with ${email}`,
      );
      folderShareModal.value.email = '';
      await loadFolderPermissions();
    };

    const revokeFolderAccess = async (userId: string) => {
      if (!folderShareModal.value.folderId || !userId) return;
      await runAction(
        'revoke-folder',
        () => resourceFolders.revoke(folderShareModal.value.folderId, userId),
        'Folder access revoked',
      );
      await loadFolderPermissions();
    };

    const openTagsModal = (item: FolderItem) => {
      closeCardMenu();
      tagsModal.value = {
        open: true,
        resourceId: item.id,
        resourceType: item.type,
        tags: item.tags.length ? item.tags.map((tag) => ({ ...tag })) : [{ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR }],
      };
    };

    const closeTagsModal = () => {
      tagsModal.value = { open: false, resourceId: '', resourceType: 'canvas', tags: [] };
    };

    const addTag = () => {
      tagsModal.value.tags.push({ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR });
    };

    const addSuggestedTag = (tag: ResourceTag) => {
      if (tagsModal.value.tags.some((current) => current.name === tag.name)) return;
      tagsModal.value.tags.push({ id: genTagId(), name: tag.name, color: tag.color });
    };

    const removeTag = (index: number) => {
      tagsModal.value.tags.splice(index, 1);
      if (!tagsModal.value.tags.length) addTag();
    };

    const saveTagsModal = async () => {
      const tags = tagsModal.value.tags
        .map((tag) => ({ name: tag.name.trim().toLowerCase(), color: tag.color }))
        .filter((tag) => tag.name);
      const save = tagsModal.value.resourceType === 'canvas'
        ? () => canvas.update(tagsModal.value.resourceId, { tags })
        : tagsModal.value.resourceType === 'html-document'
          ? () => htmlDocuments.update(tagsModal.value.resourceId, { tags })
          : () => textDocuments.update(tagsModal.value.resourceId, { tags });
      await runAction('save-tags', save, 'Tags saved');
      closeTagsModal();
      await load();
    };

    const openTransferModal = (item: FolderItem) => {
      closeCardMenu();
      transferModal.value = { open: true, resourceId: item.id, resourceType: item.type, email: '' };
    };

    const closeTransferModal = () => {
      transferModal.value = { open: false, resourceId: '', resourceType: 'canvas', email: '' };
    };

    const saveTransferModal = async () => {
      const email = transferModal.value.email.trim();
      if (!email) return;
      const transfer = transferModal.value.resourceType === 'canvas'
        ? () => canvas.transferOwnership(transferModal.value.resourceId, email)
        : transferModal.value.resourceType === 'html-document'
          ? () => htmlDocuments.transferOwnership(transferModal.value.resourceId, email)
          : () => textDocuments.transferOwnership(transferModal.value.resourceId, email);
      await runAction('transfer-ownership', transfer, 'Ownership transferred');
      closeTransferModal();
      await load();
    };

    const duplicateCanvas = async (canvasRecord: CanvasRecord) => {
      closeCardMenu();
      const title = canvasRecord.title?.trim() || 'Untitled';
      await runAction('duplicate-canvas', () => canvas.duplicate(canvasRecord.id), `Duplicated "${title}"`);
      await load();
    };

    const duplicateHtmlDocument = async (doc: HtmlDocumentRecord) => {
      closeCardMenu();
      const title = doc.title?.trim() || 'Untitled HTML';
      await runAction('duplicate-html-document', () => htmlDocuments.duplicate(doc.id), `Duplicated "${title}"`);
      await load();
    };

    const duplicateTextDocument = async (doc: TextDocumentRecord) => {
      closeCardMenu();
      const title = doc.title?.trim() || 'Untitled document';
      await runAction('duplicate-text-document', () => textDocuments.duplicate(doc.id), `Duplicated "${title}"`);
      await load();
    };

    const deleteCanvas = async (canvasRecord: CanvasRecord) => {
      const title = canvasRecord.title?.trim() || 'Untitled';
      const confirmed = await confirmDelete('deleteCanvasTitle', title);
      if (!confirmed) return;
      await runAction('delete-canvas', () => canvas.delete(canvasRecord.id), `Deleted ${title}`);
      forgetResourceTab('canvas', canvasRecord.id);
      own.value = own.value.filter((c) => c.id !== canvasRecord.id);
      await load();
    };

    const deleteHtmlDocument = async (doc: HtmlDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled HTML';
      const confirmed = await confirmDelete('deleteHtmlDocumentTitle', title);
      if (!confirmed) return;
      await runAction('delete-html-document', () => htmlDocuments.delete(doc.id), `Deleted ${title}`);
      forgetResourceTab('html', doc.id);
      await load();
    };

    const deleteTextDocument = async (doc: TextDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled document';
      const confirmed = await confirmDelete('deleteDocumentTitle', title);
      if (!confirmed) return;
      await runAction('delete-text-document', () => textDocuments.delete(doc.id), `Deleted ${title}`);
      forgetResourceTab('doc', doc.id);
      await load();
    };

    /**
     * SEVERAL ITEMS AT ONCE. A card is ticked by its box (on hover, or on
     * every card once something is ticked), by Ctrl/Cmd-click, Shift-click
     * for a range, or a long press on a phone; while anything is ticked a
     * click ticks instead of opening. The bar over the dashboard then moves,
     * pins or deletes them all.
     */
    const selectedKeys = ref<string[]>([]);
    let selectionAnchor = '';
    const isSelected = (item: { type: string; id: string }) => selectedKeys.value.includes(selectionKey(item));
    const itemsBySelectionKey = computed(() => dashboardItemsByKey.value as ReadonlyMap<string, FolderItem>);
    const selectedItemsOf = (keys: readonly string[]) => keys
      .map((key) => itemsBySelectionKey.value.get(key))
      .filter((item): item is FolderItem => Boolean(item));
    const selectedItems = computed(() => selectedItemsOf(selectedKeys.value));
    const ownsItem = (item: FolderItem) => (
      item.type === 'interactive-template' ? (item as { role?: string }).role === 'owner' : isOwnedResource(item)
    );
    /**
     * Feed items of the open Shared Space (`spaceFeedItems`) tick the same way:
     * any item can be downloaded as part of a zip, while only own QCanva items
     * can be moved or deleted (and never by a read-only viewer).
     */
    const spaceFeedItems = ref<SpaceFeedItem[]>([]);
    const activeSpace = ref<SpaceDetails | null>(null);
    const spaceItemsByKey = computed<ReadonlyMap<string, SpaceFeedItem>>(() => (
      activeSection.value.kind === 'space'
        ? new Map(spaceFeedItems.value.map((item) => [item.key, item]))
        : new Map()
    ));
    const selectedSpaceItemsOf = (keys: readonly string[]) => keys
      .map((key) => spaceItemsByKey.value.get(key))
      .filter((item): item is SpaceFeedItem => Boolean(item));
    const selectedSpaceItems = computed(() => selectedSpaceItemsOf(selectedKeys.value));
    const spaceMovable = computed(() => (
      activeSection.value.kind === 'space'
        ? partitionMovableSpaceItems(selectedSpaceItems.value, activeSpace.value?.role, currentUser.value?.id || '')
        : { movable: [], skipped: 0 }
    ));
    const spaceDeletable = computed(() => (
      activeSection.value.kind === 'space'
        ? partitionDeletableSpaceItems(selectedSpaceItems.value, activeSpace.value?.role, currentUser.value?.id || '')
        : { docs: [], files: [], skipped: 0 }
    ));
    const bulkDeletable = computed(() => (
      activeSection.value.kind === 'space'
        ? spaceDeletable.value.docs.map((item) => ({
          type: toFolderResourceType(item.kind),
          id: item.id!,
          title: item.name,
        }) as FolderItem)
        : selectedItems.value.filter(ownsItem)
    ));
    /**
     * The open folder's Drive files tick like its other items (`drive-file:<id>`)
     * and take the same actions: moved, downloaded, deleted (to the Drive's
     * trash) - one way to handle every kind of file.
     */
    const folderDriveFiles = ref<DriveItem[]>([]);
    const homeRootDriveFiles = ref<DriveItem[]>([]);
    const homeRootFileCount = ref(0);
    const activeDriveFiles = computed(() => (
      activeSection.value.kind === 'home' ? homeRootDriveFiles.value : folderDriveFiles.value
    ));
    const driveFilesByKey = computed<ReadonlyMap<string, DriveItem>>(() => new Map(activeDriveFiles.value.map((file) => [`drive-file:${file.id}`, file])));
    const selectedDriveFilesOf = (keys: readonly string[]) => keys
      .map((key) => driveFilesByKey.value.get(key))
      .filter((file): file is DriveItem => Boolean(file));
    const selectedDriveFiles = computed(() => selectedDriveFilesOf(selectedKeys.value));
    /** A Drive file goes to the trash when the folder is one's own. */
    const bulkDeletableDriveFiles = computed(() => {
      if (activeSection.value.kind === 'space') {
        return spaceDeletable.value.files.map((item) => ({
          id: item.id!,
          name: item.name,
        }) as DriveItem);
      }
      return (activeSection.value.kind === 'folder' && activeFolder.value?.role === 'owner') || activeSection.value.kind === 'home'
        ? selectedDriveFiles.value
        : [];
    });
    /**
     * Files of the open Yandex Disk folder tick the same way (`yandex:<path>`):
     * moved within the Disk, downloaded into the zip, deleted to its trash.
     */
    const yandexFiles = ref<YandexItem[]>([]);
    const yandexRefreshKey = ref(0);
    const yandexFilesByKey = computed<ReadonlyMap<string, YandexItem>>(() => new Map(yandexFiles.value.map((file) => [`yandex:${file.path}`, file])));
    const selectedYandexFiles = computed(() => selectedKeys.value
      .map((key) => yandexFilesByKey.value.get(key))
      .filter((file): file is YandexItem => Boolean(file)));
    const canBulkMove = computed(() => (
      activeSection.value.kind === 'space'
        ? spaceMovable.value.movable.length > 0 && folderOptions.value.length > 0
        : true
    ));
    const bulkDeleteCount = computed(() => bulkDeletable.value.length + bulkDeletableDriveFiles.value.length + selectedYandexFiles.value.length);
    /** The ticked files' total size, QCanva folders, Spaces and Yandex Disk alike. */
    const selectedSize = computed(() => (
      selectedDriveFiles.value.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)
      + selectedYandexFiles.value.reduce((sum, file) => sum + (file.size ?? 0), 0)
      + selectedSpaceItems.value.reduce((sum, item) => sum + (item.size ?? 0), 0)
    ));
    /** Cards and subfolders on screen that can be ticked, in visual DOM order. */
    const selectableOnScreen = () => {
      const root = dashboardShell.value;
      if (!root) return [];
      const selector = explorerViewMode.value === 'table'
        ? '[data-explorer-table] [data-select-key]'
        : '[data-select-key], .subfolder-card[data-select-key]';
      const seen = new Set<string>();
      const keys: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (explorerViewMode.value !== 'table' && el.closest('[data-explorer-table]')) continue;
        const key = el.dataset.selectKey;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
      }
      return keys;
    };
    const allOnScreenSelected = ref(false);
    watch([selectedKeys, spaceFeedItems], () => {
      void nextTick(() => {
        const onScreen = selectableOnScreen();
        allOnScreenSelected.value = onScreen.length > 0 && onScreen.every((key) => selectedKeys.value.includes(key));
      });
    });
    const galleryFocusedPhoto = ref<PhotoFeedItem | null>(null);
    const pendingExplorerSelectionKeys = ref<string[] | null>(null);
    const transferredExplorerKeys = ref<Set<string> | null>(null);
    const pendingScrollToSelectKey = ref<string | null>(null);
    const clearSelection = () => {
      selectedKeys.value = [];
      selectionAnchor = '';
      transferredExplorerKeys.value = null;
      pendingScrollToSelectKey.value = null;
    };
    const toggleSelected = (key: string) => {
      selectedKeys.value = toggleSelection(selectedKeys.value, key);
      selectionAnchor = key;
    };
    const selectAllOnScreen = () => {
      selectedKeys.value = selectAll(selectedKeys.value, selectableOnScreen());
    };
    // Another section, another folder: the selection was of what is gone.
    watch(activeSection, (next) => {
      if (pendingExplorerSelectionKeys.value && next.kind !== 'gallery') {
        selectedKeys.value = pendingExplorerSelectionKeys.value;
        selectionAnchor = pendingExplorerSelectionKeys.value[0] ?? '';
        pendingExplorerSelectionKeys.value = null;
      } else {
        clearSelection();
      }
      if (next.kind === 'gallery') {
        galleryFocusedPhoto.value = null;
      }
      layoutPrefs.setHeadroomHidden(false);
      headroomElevated.value = false;
      if (next.kind !== 'space') {
        spaceFeedItems.value = [];
        activeSpace.value = null;
      }
    });
    // After a reload, whatever no longer exists drops out.
    watch([itemsBySelectionKey, driveFilesByKey, yandexFilesByKey, spaceItemsByKey, allFolderSummaries, transferredExplorerKeys], ([items, files, yandex, spaceItems, folders]) => {
      const folderIds = new Set(folders.map((f) => f.id));
      const known = (key: string) =>
        items.has(key)
        || files.has(key)
        || yandex.has(key)
        || spaceItems.has(key)
        || (key.startsWith('folder:') && folderIds.has(key.slice('folder:'.length)))
        || Boolean(pendingExplorerSelectionKeys.value?.includes(key))
        || Boolean(transferredExplorerKeys.value?.has(key));
      if (selectedKeys.value.some((key) => !known(key))) {
        selectedKeys.value = selectedKeys.value.filter(known);
      }
    });
    watch([folderDriveFiles, homeRootDriveFiles, activeSection], () => {
      const key = pendingScrollToSelectKey.value;
      if (!key || activeSection.value.kind === 'gallery') return;
      void nextTick(() => {
        if (pendingScrollToSelectKey.value !== key) return;
        const safeKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const selector = explorerViewMode.value === 'table'
          ? `[data-explorer-table] [data-select-key="${safeKey}"]`
          : `[data-select-key="${safeKey}"]`;
        const el = dashboardMain.value?.querySelector<HTMLElement>(selector);
        if (el) {
          el.scrollIntoView?.({ block: 'nearest' });
          pendingScrollToSelectKey.value = null;
          transferredExplorerKeys.value = null;
        }
      });
    });

    const { marquee, startMarquee } = useDashboardMarquee({ enabled: isLoggedIn, dashboardShell, selectedKeys });
    const onDashboardMainPointerDown = (event: PointerEvent) => {
      if (activeSection.value.kind === 'gallery') return;
      startMarquee(event);
    };
    const { cancelLongPress, onSelectionPointerDown, onSelectionPointerMove, onSelectionContextMenu, consumeSwallowNextClick } = useDashboardLongPress({
      enabled: isLoggedIn,
      toggleSelected,
    });
    const onSelectionClickCapture = (event: MouseEvent) => {
      if (consumeSwallowNextClick()) {
        // The click that ends a long press must not open the card it ticked.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!isLoggedIn) return;
      const target = event.target as HTMLElement | null;
      // ExplorerTableView owns its own Click / Ctrl+Click / Shift+Click / double-click semantics.
      if (target?.closest('[data-explorer-table]')) return;
      const card = target?.closest<HTMLElement>('[data-select-key]');
      if (!card) return;
      const onBox = Boolean(target?.closest('[data-select-box]'));
      const withModifier = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!onBox && !withModifier && !selectedKeys.value.length) return;
      // The card's own menu and rename field keep working.
      if (!onBox && target?.closest('.card-manage, .card-menu, .card-title-input')) return;
      event.preventDefault();
      event.stopPropagation();
      const key = card.dataset.selectKey!;
      if (event.shiftKey) {
        const onScreen = selectableOnScreen();
        const anchor = selectionAnchor && onScreen.includes(selectionAnchor) ? selectionAnchor : onScreen[0] || key;
        selectionAnchor = anchor;
        selectedKeys.value = selectRange(selectedKeys.value, onScreen, anchor, key);
      } else {
        toggleSelected(key);
      }
    };
    // Android's Back clears the selection before it leaves the folder.
    useBackHandler(() => {
      if (!selectedKeys.value.length) return false;
      clearSelection();
      return true;
    });

    const openBulkMoveModal = () => {
      if (activeSection.value.kind === 'space') {
        const { movable, skipped } = spaceMovable.value;
        if (!movable.length || !folderOptions.value.length) return;
        closeCardMenu();
        openControlMenu.value = '';
        draggingResourceFolderId.value = null;
        folderModal.value = {
          open: true,
          resourceId: '',
          resourceType: 'canvas',
          folderId: '',
          value: '',
          bulk: movable.map((item) => item.key),
          bulkSkipped: skipped,
        };
        return;
      }
      if (selectedYandexFiles.value.length) {
        openYandexMove(selectedYandexFiles.value.map((file) => file.path));
        return;
      }
      closeCardMenu();
      openControlMenu.value = '';
      draggingResourceFolderId.value = null;
      folderModal.value = {
        open: true,
        resourceId: '',
        resourceType: 'canvas',
        folderId: '',
        value: '',
        bulk: [...selectedKeys.value],
      };
    };
    /**
     * Download the selection as one zip. Each item is fetched in turn (the
     * status bar counts them), then packed; one that fails is left out and
     * counted, the rest still download.
     */
    const archiveFileOf = async (item: FolderItem, taken: Set<string>): Promise<ArchiveFile> => {
      const title = item.title || t('untitled');
      const base = safeFileName(title, t('untitled'));
      if (item.type === 'canvas') {
        const res = await canvas.get(item.id);
        return { name: uniqueFileName(base, 'canvas', taken), content: canvasFileContent(res.canvas?.data) };
      }
      if (item.type === 'html-document') {
        const res = await htmlDocuments.get(item.id);
        return { name: uniqueFileName(base, 'html', taken), content: res.document?.html || '' };
      }
      if (item.type === 'text-document') {
        const res = await textDocuments.get(item.id);
        return { name: uniqueFileName(base, 'html', taken), content: textDocumentFileContent(title, res.document?.snapshot?.html || '') };
      }
      const template = await interactiveTemplates.get(item.id);
      return {
        name: uniqueFileName(base, 'json', taken),
        content: JSON.stringify({ title: template.title, templateType: template.templateType, data: template.data }, null, 2),
      };
    };
    /** A Drive file goes into the zip as it is, fetched by its download link. */
    const archiveFileOfDrive = async (file: DriveItem, taken: Set<string>, signal?: AbortSignal): Promise<ArchiveFile> => {
      const { url } = await driveApi.getDownloadLink(file.id);
      const response = await fetch(resolveDownloadUrl(url), signal ? { signal } : undefined);
      if (!response.ok) throw new Error(`${response.status}`);
      const [base, extension] = splitFileName(file.name);
      return { name: uniqueFileName(safeFileName(base, t('untitled')), extension, taken), content: new Uint8Array(await response.arrayBuffer()) };
    };
    const archiveSpaceItem = async (item: SpaceFeedItem, taken: Set<string>, signal?: AbortSignal): Promise<ArchiveFile> => {
      if (item.origin === 'yandex') {
        if (!spaceId.value || !item.path || !item.sourceId) throw new Error('Missing Yandex item path');
        const { href } = await spacesApi.yandexDownload(spaceId.value, item.sourceId, item.path);
        const response = await fetch(href, signal ? { signal } : undefined);
        if (!response.ok) throw new Error(`${response.status}`);
        const [base, extension] = splitFileName(item.name);
        return { name: uniqueFileName(safeFileName(base, t('untitled')), extension, taken), content: new Uint8Array(await response.arrayBuffer()) };
      }
      if (!item.id) throw new Error('Missing item id');
      if (item.kind === 'file') {
        return archiveFileOfDrive({ id: item.id, name: item.name } as DriveItem, taken, signal);
      }
      return archiveFileOf({ type: toFolderResourceType(item.kind), id: item.id, title: item.name } as FolderItem, taken);
    };
    const { downloadStatus, bulkDownload } = useDashboardBulkDownload({
      selectedItems,
      selectedDriveFiles,
      selectedYandexFiles,
      selectedSpaceItems,
      archiveItem: archiveFileOf,
      archiveDriveFile: archiveFileOfDrive,
      archiveYandexFile: async (file: YandexItem, taken: Set<string>, signal?: AbortSignal) => {
        const [base, extension] = splitFileName(file.name);
        return { name: uniqueFileName(safeFileName(base, t('untitled')), extension, taken), content: await fetchYandexContent(file.path, signal) };
      },
      archiveSpaceItem,
      buildZip,
      saveBlob,
      clearSelection,
    });

    // ----- Spaces: the user's Yandex Disk as a dashboard section
    const yandexView = ref<InstanceType<typeof DashboardYandexDisk> | null>(null);
    const yandexPicker = ref<InstanceType<typeof YandexFolderPicker> | null>(null);
    const yandexPath = computed(() => (activeSection.value.kind === 'yandex' ? activeSection.value.path : null));
    const yandexMove = ref<{ sources: string[]; start: string } | null>(null);
    const yandexRootCount = ref<number | null>(null);
    let yandexRootCountRun = 0;
    const loadYandexRootCount = async () => {
      const run = ++yandexRootCountRun;
      if (!yandexStatus.value?.enabled || !yandexStatus.value.connected) {
        yandexRootCount.value = null;
        return;
      }
      try {
        const listing = await yandexDisk.list('/', { limit: 1 });
        if (run === yandexRootCountRun) {
          yandexRootCount.value = typeof listing?.total === 'number' ? listing.total : null;
        }
      } catch (err) {
        if (run === yandexRootCountRun) {
          noteYandexError(err);
          yandexRootCount.value = null;
        }
      }
    };
    watch(() => [yandexStatus.value?.enabled, yandexStatus.value?.connected, yandexRefreshKey.value] as const, () => {
      void loadYandexRootCount();
    }, { immediate: true });
    const openYandexPath = (path: string) => {
      selectDashboardSection({ kind: 'yandex', path });
    };
    const openYandexMove = (sources: string[]) => {
      closeCardMenu();
      const first = sources[0];
      if (!first) return;
      yandexMove.value = { sources, start: yandexParentPath(first) };
    };
    const confirmYandexMove = async (target: string) => {
      const move = yandexMove.value;
      if (!move) return;
      let moved = false;
      try {
        await runAction('yandex-move', async () => {
          for (const source of move.sources) {
            const name = source.slice(source.lastIndexOf('/') + 1);
            if (yandexParentPath(source) === target) continue;
            await settleYandexOutcome(await yandexDisk.move(source, joinYandexPath(target, name)));
          }
        }, t('bulkMovedTo')
          .replace('{folder}', target === '/' ? t('yandexDisk') : target.slice(target.lastIndexOf('/') + 1))
          .replace('{n}', String(move.sources.length)));
        moved = true;
      } catch {
        // runAction already showed why.
      }
      yandexPicker.value?.close();
      if (!moved) return;
      clearSelection();
      yandexRefreshKey.value += 1;
      // The open folder itself moved: follow it.
      const open = yandexPath.value;
      const followed = open && move.sources.find((source) => open === source || open.startsWith(`${source}/`));
      if (open && followed) openYandexPath(joinYandexPath(target, followed.slice(followed.lastIndexOf('/') + 1)) + open.slice(followed.length));
    };
    // ----- shared spaces: a section of their own
    const spaceView = ref<InstanceType<typeof DashboardSpace> | null>(null);
    const spaceId = computed(() => (activeSection.value.kind === 'space' ? activeSection.value.spaceId : null));
    const activeSpaceFolderId = computed(() => (
      activeSection.value.kind === 'space' ? (activeSection.value.folderId ?? null) : null
    ));
    const activeSpaceYandexSourceId = computed(() => (
      activeSection.value.kind === 'space' ? (activeSection.value.yandexSourceId ?? null) : null
    ));
    const activeSpaceYandexSubpath = computed(() => (
      activeSection.value.kind === 'space' ? (activeSection.value.yandexSubpath ?? null) : null
    ));
    const onNavigateSpaceFolder = (payload: {
      folderId?: string | null;
      yandexSourceId?: string | null;
      yandexSubpath?: string | null;
    }) => {
      if (activeSection.value.kind !== 'space') return;
      const next: DashboardSection = {
        kind: 'space',
        spaceId: activeSection.value.spaceId,
        ...(payload.folderId ? { folderId: payload.folderId } : {}),
        ...(payload.yandexSourceId
          ? { yandexSourceId: payload.yandexSourceId, yandexSubpath: payload.yandexSubpath ?? '' }
          : {}),
      };
      clearSelection();
      selectDashboardSection(next);
    };
    const { load: loadSpaces } = useSpaces();
    onMounted(() => {
      if (isLoggedIn) {
        void loadSpaces();
        void loadYandexStatus();
        if (typeof driveApi.listDevices === 'function') {
          void driveApi.listDevices().then((list) => {
            devicesPaired.value = Array.isArray(list) && list.length > 0;
            devicesOnlineCount.value = Array.isArray(list)
              ? list.filter((d) => Boolean((d as { online?: boolean; status?: string }).online || (d as { status?: string }).status === 'online')).length
              : 0;
          }).catch(() => {
            // Device status indicator stays quiet if endpoint is unavailable.
          });
        }
      }
    });
    const createSpace = async () => {
      // Asked first: no typing a name for a plan that will refuse it.
      const allowed = await plansApi.mine().then((info) => info.plan?.canCreateSpaces !== false).catch(() => true);
      if (!allowed) {
        setFeedback('error', t('planErrorSpaces'));
        return;
      }
      const name = (await promptDialog({
        title: t('spaceNew'),
        placeholder: t('spaceNamePlaceholder'),
        confirmLabel: t('create'),
        cancelLabel: t('cancel'),
      }))?.trim();
      if (!name) return;
      try {
        const space = await spacesApi.create(name);
        await loadSpaces(true);
        selectDashboardSection({ kind: 'space', spaceId: space.id });
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('spaceActionFailed'));
      }
    };
    /** A QCanva document of a space opens as any does. */
    const openSpaceResource = (kind: string, id: string) => {
      if (kind === 'canvas') openCanvas(id);
      else if (kind === 'text-document') openTextDocument(id);
      else if (kind === 'html-document') openHtmlDocument(id);
      else openInteractiveTemplate(id);
    };
    /**
     * A link into the dashboard: `?section=trash` opens the trash and
     * `?folder=<id>` a folder - the old Q Space pages (/drive/trash,
     * /drive/<folder>) land here. Read once, then dropped from the address.
     */
    const takeAddressSection = (): boolean => {
      if (!isLoggedIn) return false;
      const query = router.currentRoute?.value?.query ?? {};
      const section = typeof query.section === 'string' ? query.section : '';
      const activity = typeof query.activity === 'string' ? query.activity : '';
      const folder = typeof query.folder === 'string' ? query.folder : '';
      const querySpaceId = typeof query.spaceId === 'string' ? query.spaceId : '';
      if (!section && !activity && !folder && !querySpaceId) return false;
      if (section === 'trash') selectDashboardSection({ kind: 'trash' });
      else if (section === 'gallery' || activity === 'gallery') selectDashboardSection({ kind: 'gallery' });
      else if (querySpaceId) {
        selectDashboardSection({
          kind: 'space',
          spaceId: querySpaceId,
          ...(folder ? { folderId: folder } : {}),
        });
      } else if (folder) selectFolder(folder);
      const { section: _section, activity: _activity, folder: _folder, spaceId: _spaceId, ...rest } = query;
      void router.replace({ query: rest });
      return true;
    };

    /**
     * An admin takes a resource out of the Public directory: it leaves the
     * section at once, for its owner's lists too. The link still opens it.
     */
    const hideFromPublic = async (item: { type: string; id: string; title?: string | null }) => {
      closeCardMenu();
      const type = item.type as PublicResourceType;
      if (type !== 'canvas' && type !== 'text-document' && type !== 'html-document') return;
      const confirmed = await confirmDialog({
        title: t('hideFromPublicTitle').replace('{name}', item.title || t('untitled')),
        confirmLabel: t('hideFromPublicConfirm'),
        cancelLabel: t('cancel'),
        danger: true,
      });
      if (!confirmed) return;
      try {
        await adminApi.hideFromPublic(type, item.id);
        const drop = <T extends { id: string }>(list: { value: T[] }) => { list.value = list.value.filter((other) => other.id !== item.id); };
        const mark = <T extends { id: string }>(list: { value: T[] }) => {
          list.value = list.value.map((other) => (other.id === item.id ? { ...other, publicHidden: true } : other));
        };
        if (type === 'canvas') { drop(publicCanvases); mark(own); }
        else if (type === 'html-document') { drop(publicHtmlDocuments); mark(allHtmlDocumentsRaw); }
        else { drop(publicTextDocuments); mark(allTextDocumentsRaw); }
        setFeedback('success', t('hiddenFromPublic'));
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('hideFromPublicFailed'));
      }
    };

    /** A file back from the trash: its folder shows it again. */
    const onTrashRestored = () => {
      setFeedback('success', t('driveRestored'));
      void load({ showLoading: false });
      refreshFolderFileCounts();
    };

    /** The space is gone for this user (deleted, or they left): back home. */
    const leaveSpaceSection = () => {
      void loadSpaces(true);
      selectDashboardSection({ kind: 'recent' });
    };

    // ----- pictures and videos full screen: the folder's, from the one clicked
    const mediaViewer = ref<{ items: MediaViewerItem[]; start: number } | null>(null);
    const yandexViewerItem = (file: YandexItem): MediaViewerItem => ({
      key: `yandex:${file.path}`,
      name: file.name,
      kind: file.mediaType === 'video' ? 'video' : 'image',
      date: file.modifiedAt,
      preview: yandexPreviewUrl(file),
      loadFull: async () => (await yandexDisk.downloadLink(file.path)).href,
      download: () => downloadYandexFile(file),
    });
    /** Card pictures the folder's files found (hub-made for HEIC, RAW, videos): the viewer starts on them. */
    const folderDrivePreviews = ref<Readonly<Record<string, string>>>({});
    const driveViewerItem = (file: { id: string; name: string; updatedAt?: string | null; kind?: 'image' | 'video' }): MediaViewerItem => ({
      key: `drive-file:${file.id}`,
      name: file.name,
      kind: file.kind ?? 'image',
      date: file.updatedAt ?? null,
      preview: folderDrivePreviews.value[file.id] ?? null,
      loadFull: async () => resolveDownloadUrl((await driveApi.getDownloadLink(file.id)).url),
      download: async () => {
        try {
          await downloadDriveFile(file.id, file.name);
        } catch (error) {
          setFeedback('error', error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'));
        }
      },
    });
    const isDriveMedia = (file: DriveItem) => isPictureFile(file) || isVideoFile(file);
    const isYandexMedia = (item: YandexItem) => item.mediaType === 'image' || item.mediaType === 'video';
    /** A picture or a video of a Yandex folder: the folder's pictures and videos, from it. */
    const openYandexImage = (file: YandexItem) => {
      const media = yandexFiles.value.filter(isYandexMedia);
      const list = media.some((item) => item.path === file.path) ? media : [file];
      mediaViewer.value = { items: list.map(yandexViewerItem), start: list.findIndex((item) => item.path === file.path) };
    };
    /** A picture or a video of a QCanva folder: the folder's pictures and videos, from it. */
    const openDriveImage = (file: DriveItem) => {
      const media = activeDriveFiles.value.filter(isDriveMedia);
      const list = media.some((item) => item.id === file.id) ? media : [file];
      mediaViewer.value = {
        items: list.map((item) => driveViewerItem({ ...item, kind: isVideoFile(item) ? 'video' : 'image' })),
        start: list.findIndex((item) => item.id === file.id),
      };
    };
    /** A file of the sidebar's Yandex tree: a picture or a video opens, a Markdown file opens as a document, anything else downloads. */
    const openYandexSidebarFile = (item: YandexItem) => {
      mobileSidebarOpen.value = false;
      if (isYandexMedia(item)) mediaViewer.value = { items: [yandexViewerItem(item)], start: 0 };
      else if (isMarkdownFile(item)) openYandexMarkdown(item);
      else void downloadYandexFile(item);
    };
    const downloadYandexFile = async (item: YandexItem) => {
      try {
        const { href } = await yandexDisk.downloadLink(item.path);
        downloadYandexLink(href, item.name);
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'));
      }
    };

    // ----- Markdown files: opened as a document in the viewer instead of downloading
    const markdownViewer = ref<MarkdownViewerItem | null>(null);
    const openMarkdownAsTextDocument = async (content: string, title: string, targetFolderId?: string | null) => {
      const candidate = targetFolderId || (activeSection.value.kind === 'folder' ? activeFolder.value?.id : undefined);
      const ownedFolderId = candidate && ownResourceFolders.value.some((f) => f.id === candidate) ? candidate : undefined;
      const folderId = await resolveCreateFolderId(ownedFolderId);
      const created = await textDocuments.create({ title, folderId });
      await textDocuments.replaceContent(created.id, { html: marked.parse(content, { async: false }) as string });
      rememberCreatedResource('text-document', created);
      recordDashboardReturnOrigin();
      router.push(`/docs/${created.slug || created.id}`);
    };
    const openDriveMarkdown = (file: { id: string; name: string; updatedAt?: string | null; folderId?: string | null }) => {
      markdownViewer.value = {
        key: `drive-file:${file.id}`,
        name: file.name,
        date: file.updatedAt ?? null,
        loadText: async () => {
          const { url } = await driveApi.getDownloadLink(file.id);
          return fetchMarkdownTextFromUrl(resolveDownloadUrl(url));
        },
        download: async () => {
          try {
            await downloadDriveFile(file.id, file.name);
          } catch (error) {
            setFeedback('error', error instanceof Error && error.message ? error.message : t('driveDownloadLinkFailed'));
          }
        },
        ...(isLoggedIn
          ? { openAsDocument: (content: string, title: string) => openMarkdownAsTextDocument(content, title, file.folderId) }
          : {}),
      };
    };
    const openYandexMarkdown = (file: YandexItem) => {
      markdownViewer.value = {
        key: `yandex:${file.path}`,
        name: file.name,
        date: file.modifiedAt,
        loadText: async () => {
          try {
            const bytes = await fetchYandexContent(file.path);
            return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
          } catch {
            const { href } = await yandexDisk.downloadLink(file.path);
            return fetchMarkdownTextFromUrl(href, { referrerPolicy: 'no-referrer' });
          }
        },
        download: () => downloadYandexFile(file),
        save: async (content: string) => {
          const blob = new File([content], file.name, { type: 'text/markdown' });
          await uploadYandexFile(file.path, blob, { overwrite: true }).promise;
          yandexRefreshKey.value += 1;
          setFeedback('success', t('markdownSaved'));
        },
        ...(isLoggedIn
          ? { openAsDocument: (content: string, title: string) => openMarkdownAsTextDocument(content, title) }
          : {}),
      };
    };
    const openSpaceMarkdown = (item: MarkdownViewerItem) => {
      markdownViewer.value = {
        ...item,
        ...(isLoggedIn && !item.openAsDocument
          ? { openAsDocument: (content: string, title: string) => openMarkdownAsTextDocument(content, title) }
          : {}),
      };
    };
    const uploadTaskIds = new Map<string, string>();
    const uploadByteDetail = (size: number, percent: number) => {
      const loaded = Math.round(size * Math.min(100, Math.max(0, percent)) / 100);
      return `${formatFileSize(loaded)} / ${formatFileSize(size)}`;
    };
    const registerUploadBatch = (batch: Array<{ id: string; name: string; size: number }>) => {
      for (const item of batch) {
        const taskId = activityJournal.startTask({
          kind: 'upload',
          title: item.name,
          detail: uploadByteDetail(item.size, 0),
          progress: 0,
          weight: Math.max(1, item.size),
          cancellable: true,
          cancel: () => cancelUpload(item.id),
        });
        uploadTaskIds.set(item.id, taskId);
      }
    };

    /** Uploads to the Yandex folder go through the same panel as the Drive's. */
    const uploadToYandex = async (files: File[], path: string) => {
      const batch = files.map((file) => ({
        id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading' as const,
      }));
      uploads.value = [...batch.map(({ file: _file, ...row }) => row), ...uploads.value];
      registerUploadBatch(batch);
      uploadPanelOpen.value = true;
      await runDashboardUploads(batch.map(({ id, file }) => ({
        id,
        start: () => uploadYandexFile(joinYandexPath(path, file.name), file, (percent) => setUploadProgress(id, percent)),
      })));
      yandexRefreshKey.value += 1;
    };
    /** Back from Yandex's consent page: `?space=yandex&yandex=connected|error`. */
    const takeYandexReturn = (): boolean => {
      if (typeof window === 'undefined') return false;
      const url = new URL(window.location.href);
      const space = url.searchParams.get('space');
      const result = url.searchParams.get('yandex');
      if (space !== 'yandex' && !result) return false;
      if (isLoggedIn) activeSection.value = { kind: 'yandex', path: '/' };
      if (result === 'connected') setFeedback('success', t('yandexConnected'));
      else if (result === 'error') setFeedback('error', url.searchParams.get('reason') === 'denied' ? t('yandexConnectDenied') : t('yandexConnectFailed'));
      void loadYandexStatus(true);
      for (const key of ['space', 'yandex', 'reason']) url.searchParams.delete(key);
      const query = Object.fromEntries(url.searchParams.entries());
      if (typeof router?.replace === 'function') void router.replace({ query });
      else window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      return true;
    };

    /**
     * Upload files from the device into a folder's Drive (dashboard folders
     * and Drive folders are the same folders): the folder asked for (a
     * folder's own "+"), else the Add menu's "Create in", else Unsorted, as
     * for anything created. The status bar follows all of them by bytes.
     */
    const folderFilesRefreshKey = ref(0);
    /** Uploads, newest first: each file its own progress, cancel and outcome (DashboardUploadPanel). */
    const uploads = ref<Array<DashboardUpload & { abort?: () => void }>>([]);
    const uploadPanelOpen = ref(false);
    /** "n/m" and the ring of the panel and its badge, taken every half second while files run. */
    const uploadSummary = useUploadSummary(uploads);
    /** Nothing runs any more: the finished files go, and the badge with them. */
    const clearFinishedUploads = () => {
      for (const item of uploads.value) {
        if (item.status !== 'uploading') {
          const taskId = uploadTaskIds.get(item.id);
          if (taskId) {
            activityJournal.removeTask(taskId);
            uploadTaskIds.delete(item.id);
          }
        }
      }
      uploads.value = uploads.value.filter((item) => item.status === 'uploading');
      uploadPanelOpen.value = false;
    };
    const cancelUpload =(id: string) => {
      const upload = uploads.value.find((item) => item.id === id);
      if (!upload || upload.status !== 'uploading') return;
      upload.status = 'cancelled';
      upload.abort?.();
      const taskId = uploadTaskIds.get(id);
      if (taskId) activityJournal.cancelTask(taskId);
    };
    /**
     * Every upload of the panel (QCanva's and Yandex Disk's): three at a time,
     * a dropped one started again once the page is back (upload-queue.ts),
     * and the screen kept on while any runs - a dark phone freezes them.
     */
    const uploadRowOf = (id: string) => uploads.value.find((item) => item.id === id);
    const setUploadProgress = (id: string, percent: number) => {
      const row = uploadRowOf(id);
      if (row && row.status === 'uploading') {
        const rounded = Math.round(percent);
        row.progress = rounded;
        const taskId = uploadTaskIds.get(id);
        if (taskId) {
          activityJournal.updateTask(taskId, {
            progress: rounded,
            detail: uploadByteDetail(row.size, rounded),
          });
        }
      }
    };
    const uploadWakeLock = createUploadWakeLock(() => uploads.value.some((item) => item.status === 'uploading'));
    watch(() => uploads.value.some((item) => item.status === 'uploading'), () => { void uploadWakeLock.sync(); });
    onBeforeUnmount(() => uploadWakeLock.dispose());
    // In the Android app every file goes to the app's own queue at once (it runs
    // three at a time, in the background too); a page frozen in the background
    // could not hand over the rest later.
    const runDashboardUploads = (jobs: UploadJob[]) => runUploadQueue(jobs, {
      concurrency: nativeUploadAvailable() ? jobs.length : 3,
      isCancelled: (id) => uploadRowOf(id)?.status === 'cancelled',
      onAttempt: (id, attempt) => {
        const row = uploadRowOf(id);
        if (!row) return;
        row.abort = () => attempt.abort();
        row.progress = 0;
        const taskId = uploadTaskIds.get(id);
        if (taskId) {
          activityJournal.updateTask(taskId, {
            progress: 0,
            detail: uploadByteDetail(row.size, 0),
          });
        }
      },
      onDone: (id) => {
        const row = uploadRowOf(id);
        if (row && row.status === 'uploading') {
          row.progress = 100;
          row.status = 'done';
          const taskId = uploadTaskIds.get(id);
          if (taskId) activityJournal.completeTask(taskId, formatFileSize(row.size));
        }
      },
      onError: (id, error) => {
        const row = uploadRowOf(id);
        if (!row || row.status === 'cancelled') return;
        row.status = 'error';
        row.errorMessage = error instanceof Error && error.message ? error.message : t('driveUploadFailed');
        const taskId = uploadTaskIds.get(id);
        if (taskId) activityJournal.failTask(taskId, row.errorMessage);
      },
    });
    const uploadFiles = async (files: File[], explicitFolderId?: string) => {
      if (!files.length) return;
      const folderId = await resolveCreateFolderId(explicitFolderId);
      if (!folderId) return;
      if (folderId !== 'root' && !ownResourceFolders.value.some((folder) => folder.id === folderId)) {
        await refreshFoldersQuietly();
      }
      const batch = files.map((file) => ({
        id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading' as const,
      }));
      uploads.value = [...batch.map(({ file: _file, ...row }) => row), ...uploads.value];
      registerUploadBatch(batch);
      uploadPanelOpen.value = true;
      await runDashboardUploads(batch.map(({ id, file }) => ({
        id,
        start: () => {
          const handle = driveApi.uploadFile(folderId, file, (percent) => setUploadProgress(id, percent));
          return {
            abort: handle.abort,
            promise: handle.promise.then((res) => {
              void uploadClientPreviewForItems(file, res?.items);
              return res;
            }),
          };
        },
      })));
      folderFilesRefreshKey.value += 1;
      refreshFolderFileCounts();
      if (activeSection.value.kind === 'gallery') {
        refreshGalleryView();
      }
    };

    const transferStatusText = computed(() => {
      const status = downloadStatus.value;
      if (status.phase === 'collect') return t('downloadCollecting').replace('{done}', String(status.done)).replace('{total}', String(status.total));
      if (status.phase === 'pack') return t('downloadPacking');
      if (status.phase === 'done') return status.failed ? t('downloadDonePartly').replace('{n}', String(status.failed)) : t('downloadDone');
      return t('downloadFailed');
    });
    const transferStatusPercent = computed(() => {
      const status = downloadStatus.value;
      if (status.phase === 'done' || status.phase === 'error') return 100;
      return status.phase === 'pack' ? 95 : Math.round(status.done / Math.max(1, status.total) * 90);
    });

    const { bulkDelete } = useDashboardBulkDelete<FolderItem, DriveItem, YandexItem>({
      getItems: () => bulkDeletable.value,
      getDriveFiles: () => bulkDeletableDriveFiles.value,
      getYandexFiles: () => selectedYandexFiles.value,
      getSkippedCount: () => selectedItems.value.length + selectedDriveFiles.value.length + selectedSpaceItems.value.length - bulkDeletable.value.length - bulkDeletableDriveFiles.value.length,
      confirm: async ({ items, driveFiles, yandex, skipped }) => confirmDialog({
        title: t('bulkDeleteTitle').replace('{n}', String(items + driveFiles + yandex)),
        message: skipped ? t('bulkDeleteSkipped').replace('{n}', String(skipped)) : undefined,
        confirmLabel: t('delete'),
        danger: true,
      }),
      runAction: (task) => runAction('bulk-delete', task, t('bulkDeleted').replace('{n}', String(bulkDeleteCount.value))).then(() => undefined),
      deleteItem: async (item) => {
        if (item.type === 'canvas') {
          await canvas.delete(item.id);
          forgetResourceTab('canvas', item.id);
        } else if (item.type === 'html-document') {
          await htmlDocuments.delete(item.id);
          forgetResourceTab('html', item.id);
        } else if (item.type === 'text-document') {
          await textDocuments.delete(item.id);
          forgetResourceTab('doc', item.id);
        } else {
          await interactiveTemplates.delete(item.id);
          forgetResourceTab('template', item.id);
        }
      },
      trashDriveFile: (file) => driveApi.trashFile(file.id),
      removeYandexFile: (file) => yandexDisk.remove(file.path).then(settleYandexOutcome),
      afterSuccess: async ({ items, driveFiles, yandex }) => {
        if (yandex.length) yandexRefreshKey.value += 1;
        if (driveFiles.length) {
          folderFilesRefreshKey.value += 1;
          refreshFolderFileCounts();
        }
        const deleted = new Set(items.map(selectionKey));
        own.value = own.value.filter((item) => !deleted.has(selectionKey(item)));
        interactiveTemplateItems.value = interactiveTemplateItems.value.filter((item) => !deleted.has(selectionKey({ type: 'interactive-template', id: item.id })));
        clearSelection();
        if (activeSection.value.kind === 'space') {
          await Promise.all([load(), spaceView.value?.reload(), loadSpaces(true)]);
        } else {
          await load();
        }
      },
    });

    const togglePinned = async (item: FolderItem) => {
      closeCardMenu();
      const nextPinned = !item.pinned;
      const updated = item.type === 'canvas'
        ? await runAction(
          `pin-canvas-${item.id}`,
          () => canvas.update(item.id, { pinned: nextPinned }),
          nextPinned ? 'Canvas pinned' : 'Canvas unpinned',
        )
        : item.type === 'html-document'
          ? await runAction(
            `pin-html-document-${item.id}`,
            () => htmlDocuments.update(item.id, { pinned: nextPinned }),
            nextPinned ? 'HTML pinned' : 'HTML unpinned',
          )
          : await runAction(
            `pin-text-document-${item.id}`,
            () => textDocuments.update(item.id, { pinned: nextPinned }),
            nextPinned ? 'Document pinned' : 'Document unpinned',
          );
      if (!updated) return;
      if (item.type === 'canvas') {
        applyCanvasUpdate(updated);
        return;
      }
      await load();
    };

    const applyCanvasUpdate = (updatedRaw: any) => {
      const updated = normalizeCanvas(updatedRaw, false);
      const patch = (items: CanvasRecord[]) => {
        const target = items.find((item) => item.id === updated.id);
        if (!target) return;
        target.folder = updated.folder;
        target.tags = updated.tags;
        target.title = updated.title;
        target.pinned = updated.pinned;
        target.allowPublicEdit = updated.allowPublicEdit;
      };
      patch(own.value);
      patch(shared.value);
      patch(publicCanvases.value);
    };

    /**
     * The folder body scrolls (max-height + overflow-y), which clips an absolutely
     * positioned menu. On desktop the menu is therefore pinned to the viewport at
     * the trigger's position. Below 720px the stylesheet turns it into a bottom
     * sheet, so no inline position is applied there.
     */
    const cardMenuStyle = ref<Record<string, string> | null>(null);
    const CARD_MENU_WIDTH = 220;
    const CARD_MENU_GAP = 6;
    const CARD_MENU_MIN_SPACE = 200;

    // Above the dashboard's phone width a card menu floats by its trigger; below it is a sheet.
    const isFloatingMenuLayout = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !matchesMedia(LAYOUT.dashboardPhone);

    const computeCardMenuStyle = (trigger: EventTarget | null) => {
      if (!isFloatingMenuLayout()) return null;
      const element = trigger as HTMLElement | null;
      if (!element?.getBoundingClientRect) return null;
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // Right-align with the trigger, but keep the whole menu on screen.
      const left = Math.max(
        12,
        Math.min(rect.right - CARD_MENU_WIDTH, viewportWidth - CARD_MENU_WIDTH - 12),
      );
      const spaceBelow = viewportHeight - rect.bottom;
      const style: Record<string, string> = {
        position: 'fixed',
        left: `${Math.round(left)}px`,
        right: 'auto',
        width: `${CARD_MENU_WIDTH}px`,
        overflowY: 'auto',
      };
      if (spaceBelow < CARD_MENU_MIN_SPACE && rect.top > spaceBelow) {
        // Not enough room underneath, so hang the menu above the trigger.
        style.top = 'auto';
        style.bottom = `${Math.round(viewportHeight - rect.top + CARD_MENU_GAP)}px`;
        style.maxHeight = `${Math.max(120, Math.round(rect.top - CARD_MENU_GAP - 12))}px`;
      } else {
        style.top = `${Math.round(rect.bottom + CARD_MENU_GAP)}px`;
        style.bottom = 'auto';
        style.maxHeight = `${Math.max(120, Math.round(spaceBelow - CARD_MENU_GAP - 12))}px`;
      }
      return style;
    };

    const onFolderBodyScroll = () => {
      if (openMenuCanvasId.value) closeCardMenu();
    };

    const closeSidebarAccountMenu = () => {
      const root = dashboardMain.value?.closest('.app-layout');
      root?.querySelector<HTMLElement>('[data-account-menu-backdrop]')?.click();
    };

    const toggleCardMenu = (canvasId: string, event?: Event) => {
      closeSidebarAccountMenu();
      openControlMenu.value = '';
      const closing = openMenuCanvasId.value === canvasId;
      openMenuCanvasId.value = closing ? '' : canvasId;
      cardMenuStyle.value = closing ? null : computeCardMenuStyle(event?.currentTarget ?? null);
    };

    const closeCardMenu = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      cardMenuStyle.value = null;
    };

    type ResourceMenuContext = 'owned' | 'shared' | 'public' | 'interactive';

    const resourceActions = (item: FolderItem, context: ResourceMenuContext): DashboardResourceActionItem[] => {
      if (context === 'shared') {
        return [{ key: 'move-to-folder', label: t('moveToGroup') }];
      }
      if (context === 'public') {
        return [
          { key: 'move-to-folder', label: t('moveToGroup') },
          { key: 'hide-from-public', label: t('hideFromPublic'), visible: admin.value, danger: true },
        ];
      }
      if (context === 'interactive') {
        return [
          { key: 'move-to-folder', label: t('moveToGroup') },
          { key: 'delete', label: t('delete'), visible: item.role === 'owner', danger: true },
        ];
      }
      return [
        { key: 'move-to-folder', label: t('moveToGroup') },
        { key: 'duplicate', label: t('duplicate') },
        { key: 'description', label: t('description') },
        { key: 'tags', label: t('editTags') },
        { key: 'pin', label: item.pinned ? t('unpin') : t('pin') },
        { key: 'transfer', label: t('transferOwnership') },
        { key: 'delete', label: t('delete'), danger: true },
      ];
    };

    const handleResourceAction = async (item: FolderItem, action: DashboardResourceAction) => {
      switch (action) {
        case 'move-to-folder':
          if (item.type === 'canvas') openMoveFolderModal(item);
          else if (item.type === 'html-document') openMoveHtmlFolderModal(item);
          else if (item.type === 'text-document') openMoveTextDocumentFolderModal(item);
          else openMoveInteractiveTemplateFolderModal(item);
          return;
        case 'duplicate':
          if (item.type === 'canvas') await duplicateCanvas(item);
          else if (item.type === 'html-document') await duplicateHtmlDocument(item);
          else if (item.type === 'text-document') await duplicateTextDocument(item);
          return;
        case 'description':
          openDescriptionModal(item);
          return;
        case 'tags':
          openTagsModal(item);
          return;
        case 'pin':
          if (item.type !== 'interactive-template') await togglePinned(item);
          return;
        case 'transfer':
          openTransferModal(item);
          return;
        case 'delete':
          if (item.type === 'canvas') await deleteCanvas(item);
          else if (item.type === 'html-document') await deleteHtmlDocument(item);
          else if (item.type === 'text-document') await deleteTextDocument(item);
          else await deleteInteractiveTemplate(item);
          return;
        case 'hide-from-public':
          await hideFromPublic(item);
          return;
      }
    };

    /**
     * "+ Add" is a dialog: make something new, or bring files in - having
     * said what they are, so a wrong file is caught (DashboardAddDialog).
     * It opens on the folder you are in, or the one whose "+" was pressed.
     */
    const addDialog = ref<{ open: boolean; folderId: string; importKind?: ImportKind }>({ open: false, folderId: '' });
    const openAddDialog = (options: { folderId?: string; importKind?: ImportKind } = {}) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      const current = activeSection.value.kind === 'folder' ? activeFolder.value : null;
      const fallback = current && newItemFolderOptions.value.some((option) => option.id === current.id) ? current.id : '';
      addDialog.value = { open: true, folderId: options.folderId ?? fallback, importKind: options.importKind };
      // A folder made in the Drive (or elsewhere) since the dashboard loaded:
      // the folders alone, quietly - no "Updating list" for opening a dialog.
      if (isLoggedIn) void refreshFoldersQuietly();
    };
    const refreshFoldersQuietly = async () => {
      try {
        const folders = await resourceFolders.list();
        ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
        sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
      } catch {
        // The list already shown stays: the dialog still works with it.
      }
    };
    const closeAddDialog = () => {
      addDialog.value = { open: false, folderId: '' };
    };
    /** Made with the name given in the dialog. */
    const onAddCreate = (kind: AddCreateKind, folderId: string, title: string) => {
      closeAddDialog();
      newItemFolderId.value = folderId;
      const target = folderId || undefined;
      if (kind === 'canvas') return void createCanvas(target, title);
      if (kind === 'html-document') return void createHtmlDocument(target, title);
      return void createTextDocument(target, title);
    };
    /** A template of a kind chosen in the dialog's own Template step, into Where. */
    const onAddCreateTemplate = (templateType: InteractiveTemplate['templateType'], folderId: string) => {
      closeAddDialog();
      templateFolderId.value = folderId || null;
      void createInteractiveTemplate(templateType);
    };
    /** A character from a file: the template picker has the reading and the review of it. */
    const onAddImportCharacter = (folderId: string) => {
      closeAddDialog();
      openInteractiveTemplatePicker(folderId || undefined);
    };
    /** A folder named in the dialog's Folder step: inside Where, or at the top. */
    const onAddCreateFolder = async (name: string, folderId: string) => {
      closeAddDialog();
      const created = await runAction('create-folder', () => resourceFolders.create(name, folderId || null), `Folder ${name} created`);
      if (created) await load({ showLoading: false });
    };
    /** An album named in the dialog's 6th Album tile: creates a unified space and opens it. */
    const onAddCreateAlbum = async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      closeAddDialog();
      try {
        const space = await spacesApi.create(trimmed);
        await loadSpaces(true);
        selectDashboardSection({ kind: 'space', spaceId: space.id });
      } catch (error) {
        setFeedback('error', error instanceof Error && error.message ? error.message : t('spaceActionFailed'));
      }
    };
    /** Files the dialog checked: to the Drive, or each one a canvas / an HTML document. */
    const onAddImport = async (kind: ImportKind, files: File[], folderId: string) => {
      closeAddDialog();
      newItemFolderId.value = folderId;
      if (kind === 'file') return uploadFiles(files, folderId || undefined);
      const opened: string[] = [];
      try {
        const target = await resolveCreateFolderId(folderId || undefined);
        for (const file of files) {
          const title = importTitle(file.name);
          const text = await file.text();
          if (kind === 'html') {
            const doc = await runAction('import-html-document', () => htmlDocuments.create({ title, html: text, folderId: target }), `Imported ${title}`);
            if (doc) opened.push(`/edit/html/${doc.id}`);
          } else if (kind === 'markdown') {
            const doc = await runAction('import-text-document', async () => {
              const created = await textDocuments.create({ title, folderId: target });
              await textDocuments.replaceContent(created.id, { html: marked.parse(text, { async: false }) as string });
              return created;
            }, `Imported ${title}`);
            if (doc) opened.push(`/docs/${doc.slug || doc.id}`);
          } else {
            const created = await runAction('import-canvas', () => canvas.create(title, JSON.stringify(JSON.parse(text)), target), `Imported ${title}`);
            if (created) opened.push(`/canvas/${created.id}`);
          }
        }
      } catch (error) {
        console.error('Failed to import file:', error);
      }
      if (opened.length === 1) {
        recordDashboardReturnOrigin();
        router.push(opened[0]!);
      }
      else if (opened.length) await load({ showLoading: false });
    };

    const canDropToActiveFolder = computed(() => Boolean(
      activeSection.value.kind === 'folder'
      && activeFolder.value
      && activeFolder.value.role === 'owner'
      && ownResourceFolders.value.some((folder) => folder.id === activeFolder.value!.id),
    ));

    const canDropExternalFiles = computed(() => Boolean(
      isLoggedIn
      && !addDialog.value.open
      && !templatePickerOpen.value
      && !mediaViewer.value
      && !yandexMove.value
      && (
        isHomeFeed.value
        || activeSection.value.kind === 'home'
        || (activeSection.value.kind === 'gallery' && gallerySection.value !== 'trash')
        || canDropToActiveFolder.value
      ),
    ));

    const externalDropLabel = computed(() => {
      if (canDropToActiveFolder.value && activeFolder.value) {
        return t('dashboardDropFilesIntoFolder').replace('{folder}', activeFolder.value.name);
      }
      if (activeSection.value.kind === 'gallery' && galleryFolderId.value && galleryFolderId.value !== 'root') {
        const galleryFolder = allResourceFolders.value.find((f) => f.id === galleryFolderId.value);
        if (galleryFolder) {
          return t('dashboardDropFilesIntoFolder').replace('{folder}', galleryFolder.name);
        }
      }
      return t('driveDropFilesHere');
    });

    const isInternalDashboardDrag = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types || []);
      return Boolean(
        draggingResourceId.value
        || folderDragId.value
        || groupDnd.activeDrag.value
        || types.includes('application/x-qcanva-folder')
        || types.includes(GROUP_DND_MIME)
        || types.includes('application/x-qspace-group-drag'),
      );
    };

    const uploadDroppedFiles = async (files: File[]) => {
      if (!files.length || !canDropExternalFiles.value) return;
      if (canDropToActiveFolder.value && activeFolder.value) {
        await uploadFiles(files, activeFolder.value.id);
        return;
      }
      if (activeSection.value.kind === 'home') {
        await uploadFiles(files, 'root');
        return;
      }
      if (activeSection.value.kind === 'gallery') {
        const target = galleryFolderId.value && galleryFolderId.value !== 'root' ? galleryFolderId.value : 'root';
        await uploadFiles(files, target);
        return;
      }
      if (isHomeFeed.value) {
        const rootFolder = await ensureFolderByName('Unsorted');
        if (!rootFolder?.id) return;
        await uploadFiles(files, rootFolder.id);
      }
    };

    const {
      isDraggingOver: isExternalDraggingOver,
      onDragEnter: onExternalDragEnter,
      onDragOver: onExternalDragOver,
      onDragLeave: onExternalDragLeave,
      onDrop: onExternalDrop,
      reset: resetExternalDropzone,
    } = useDriveDropzone({
      enabled: canDropExternalFiles,
      ignoreEvent: isInternalDashboardDrag,
      handleFilesUpload: uploadDroppedFiles,
    });

    const onDropExternalFilesToFolder = async (folderId: string | null, files: File[]) => {
      resetExternalDropzone();
      if (!isLoggedIn || !files.length) return;
      if (folderId) {
        const target = allResourceFolders.value.find((f) => f.id === folderId);
        if (target && target.role !== 'owner') return;
      }
      await uploadFiles(files, folderId ?? 'root');
    };

    /** "+ Add" in an empty section: a folder for Folders, the template picker for Templates, else the Add dialog. */
    const openAddFromTile = (section: 'recent' | 'folders' | 'shared' | 'interactive' | 'public' | 'folder') => {
      if (section === 'folders') return openCreateGroupModal();
      if (section === 'interactive') return openInteractiveTemplatePicker();
      openAddDialog();
    };

    const toggleFolderMenu = (folderId: string) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      const key = `folder:${folderId}`;
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };

    const closeControlMenusForAccount = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      cardMenuStyle.value = null;
    };

    // One key per sort button: Recents and Public both sit on the feed, and a
    // shared key opened both popovers from either button.
    const toggleMobileSortMenu = (where: 'recent' | 'folder' | 'public') => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      const key = `mobile-sort:${where}`;
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };

    /** The toolbar's filter and sort menus, one open at a time like every control menu. */
    const toggleToolbarMenu = (key: string) => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = openControlMenu.value === key ? '' : key;
    };
    /** "Reset" in the filter menu: types and tags; the search stays as typed. */
    const clearTypeAndTagFilters = () => {
      contentTypes.value = [];
      selectedTags.value = [];
    };

    const selectSortMode = (mode: typeof sortMode.value) => {
      sortMode.value = mode;
      sortSyncSeq.value += 1;
      openControlMenu.value = '';
    };

    const onExplorerTableSort = (col: ExplorerSortCol, dir: ExplorerSortDir) => {
      if (col === 'name') {
        sortMode.value = dir === 'asc' ? 'title-asc' : 'title-desc';
      } else if (col === 'updatedAt') {
        sortMode.value = dir === 'asc' ? 'updated-asc' : 'updated-desc';
      }
    };

    /**
     * The sheet edits its own draft copy of selectedTags, committed only on
     * Apply - closing via the backdrop/X or reopening later must not leak an
     * in-progress, un-applied selection into the rest of the dashboard.
     */
    const tagSheetOpen = ref(false);
    const tagSheetDraft = ref<string[]>([]);

    const openTagSheet = () => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
      tagSheetDraft.value = [...selectedTags.value];
      tagSheetOpen.value = true;
    };

    const closeTagSheet = () => {
      tagSheetOpen.value = false;
    };

    const toggleDraftTag = (tag: string) => {
      tagSheetDraft.value = tagSheetDraft.value.includes(tag)
        ? tagSheetDraft.value.filter((t) => t !== tag)
        : [...tagSheetDraft.value, tag];
    };

    const resetTagSheetDraft = () => {
      tagSheetDraft.value = [];
    };

    const applyTagSheet = () => {
      selectedTags.value = [...tagSheetDraft.value];
      tagSheetOpen.value = false;
    };

    const resolveAccessRequest = async (id: string, status: 'approved' | 'declined') => {
      await runAction(
        `access-request-${id}`,
        () => accessRequests.resolve(id, status),
        status === 'approved' ? 'Access approved' : 'Access declined',
      );
      await load();
    };


    // ---- folder nesting ----
    const subfolderModal = ref<{ open: boolean; parentId: string; parentName: string; value: string }>({
      open: false,
      parentId: '',
      parentName: '',
      value: '',
    });

    /** Subfolders count as one item each in a folder's tile; the tile also shows its subtree's last change. */
    const subfolderCounts = computed(() => childFolderCounts(allResourceFolders.value.map(({ id, parentId }) => ({ id, parentId }))));
    const folderLatest = computed(() => folderLatestChange(allFolderSummaries.value));

    /** Direct children of the folder currently open (or global folders on global search), shown ahead of its items. */
    const activeSubfolders = computed(() => {
      const parentId = activeFolder.value?.id;
      if (!parentId) return [];
      if (s2TypeFilter.value !== 'all' && s2TypeFilter.value !== 'folder') return [];
      const needle = searchQuery.value.trim().toLocaleLowerCase();
      const isGlobalSearch = s2ScopeMode.value === 'global' && (Boolean(needle) || s2TypeFilter.value !== 'all');
      return allResourceFolders.value
        .filter((folder) => (isGlobalSearch ? true : (folder.parentId ?? null) === parentId))
        .filter((folder) => !needle || folder.name.toLocaleLowerCase().includes(needle))
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          count:
            (folder.canvasCount || 0) +
            (folder.htmlDocumentCount || 0) +
            (folder.textDocumentCount || 0) +
            (folder.interactiveTemplateCount || 0) +
            (folderFiles.counts[folder.id] ?? 0) +
            (subfolderCounts.value.get(folder.id) ?? 0),
          latest: folderLatest.value.get(folder.id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    /** True once any of search/type/tags actually narrows the result set. */
    const hasActiveFilter = computed(() => Boolean(searchQuery.value.trim() || s2TypeFilter.value !== 'all' || selectedTags.value.length || contentTypes.value.length));
    const resetFilters = () => {
      searchQuery.value = '';
      s2TypeFilter.value = 'all';
      selectedTags.value = [];
      contentTypes.value = [];
    };

    /**
     * Top-level folders shown as tiles below Recent. Unlike the sidebar tree,
     * this list is not filtered by isTechnicalFolder: "Unsorted" is where new
     * documents land by default and must stay reachable from Recent, not
     * sidebar-only. Sourced from allFolderSummaries (not allResourceFolders):
     * that's the copy with each folder's items already flattened into one
     * normalized FolderItem[] with real .type/.tags, which matchingCount below
     * needs - allResourceFolders only carries server-side aggregate counts.
     *
     * matchingCount resolves each item through dashboardItemsByKey rather
     * than matching folder.items directly: the /resource-folders response's
     * nested canvases/htmlDocuments carry no tags at all (unlike its
     * textDocuments), so a tag filter would silently zero out every canvas
     * and HTML doc in every folder without this - see dashboardItemsByKey.
     */
    /**
     * Whether files count in a folder tile: they have no tags, and their
     * names are not known until the folder opens, so a search or a tag
     * filter leaves them out; a type filter keeps them only with "Files".
     */
    const filesCounted = computed(() => !searchQuery.value.trim() && !selectedTags.value.length && typePasses(contentTypes.value, 'file'));
    // A top folder for this user: no parent, or one they cannot see - a folder
    // shared from inside someone else's has a parentId the user has no folder for.
    const visibleFolderIds = computed(() => new Set(allResourceFolders.value.map((folder) => folder.id)));
    const recentFolderTiles = computed(() => allFolderSummaries.value
      .filter((folder) => !folder.parentId || !visibleFolderIds.value.has(folder.parentId))
      .map((folder) => {
        const totalCount = folder.items.length;
        const matchingCount = folder.items.filter((item) => {
          const enriched = dashboardItemsByKey.value.get(`${item.type}:${item.id}`) || item;
          return matchesFolderItem(enriched, folder.name);
        }).length;
        const files = filesCounted.value ? (folderFiles.counts[folder.id] ?? 0) : 0;
        // A subfolder is one item; under a filter only one whose name matches the search counts.
        const needle = searchQuery.value.trim().toLocaleLowerCase();
        const subfolders = !hasActiveFilter.value
          ? (subfolderCounts.value.get(folder.id) ?? 0)
          : (needle && !selectedTags.value.length && !contentTypes.value.length
            ? allResourceFolders.value.filter((child) => child.parentId === folder.id && child.name.toLocaleLowerCase().includes(needle)).length
            : 0);
        const count = (hasActiveFilter.value ? matchingCount : totalCount) + files + subfolders;
        return {
          id: folder.id,
          name: folder.name,
          count,
          latest: folderLatest.value.get(folder.id) ?? null,
          // A folder that's genuinely empty reads as "Empty"; one that's
          // empty only because of the active filter shows a literal "0" -
          // "Empty" would wrongly suggest nothing was ever put in it.
          displayCount: count === 0 ? (hasActiveFilter.value ? '0' : t('emptyFolder')) : String(count),
          zeroMatch: hasActiveFilter.value && count === 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)));

    const countedFolderIds = computed(() => [
      ...allFolderSummaries.value.filter((folder) => !(folder.parentId ?? null)).map((folder) => folder.id),
      ...activeSubfolders.value.map((folder) => folder.id),
    ]);
    watch(countedFolderIds, (ids) => folderFiles.want(ids), { immediate: true });
    /** After a reload: files may have come or gone since. */
    const refreshFolderFileCounts = () => {
      folderFiles.forget();
      folderFiles.want([...countedFolderIds.value, ...sidebarServerFolderIds.value]);
      sidebarDriveFiles.forget();
      sidebarDriveFiles.want(sidebarServerFolderIds.value.filter(isTreeExpanded));
    };

    const openSubfolderModal = (folder: FolderSummary) => {
      openControlMenu.value = '';
      subfolderModal.value = {
        open: true,
        parentId: folder.id,
        parentName: folder.name,
        value: '',
      };
    };

    const closeSubfolderModal = () => {
      subfolderModal.value = { open: false, parentId: '', parentName: '', value: '' };
    };

    const saveSubfolderModal = async () => {
      const { parentId, value } = subfolderModal.value;
      const name = value.trim();
      if (!parentId || !name) return closeSubfolderModal();
      const created = await runAction(
        'create-subfolder',
        () => resourceFolders.create(name, parentId),
        t('folderCreated'),
      );
      closeSubfolderModal();
      if (!created) return;
      // Unfold the parent so the folder that was just created is actually visible.
      expandTree(parentId);
      await load();
    };

    // ---- moving a folder under another one ----
    // Any own folder (a root one included) can go under another own folder,
    // or back to the root. Never under itself or its own subtree, nor the
    // technical Unsorted - the backend enforces the same (plus depth and
    // name clashes, whose errors surface as the usual feedback toast).
    const folderParentModal = ref<{ open: boolean; folderId: string; name: string; currentParentId: string | null; targetId: string }>({
      open: false, folderId: '', name: '', currentParentId: null, targetId: '',
    });
    const folderParentOptions = computed(() => {
      const { open, folderId, currentParentId } = folderParentModal.value;
      if (!open || !folderId) return [];
      const blocked = descendantFolderIds(ownResourceFolders.value, folderId);
      blocked.add(folderId);
      const options = folderOptions.value
        .filter((option) => !blocked.has(option.id))
        .filter((option) => option.id !== currentParentId)
        .filter((option) => !isTechnicalFolder(option));
      return currentParentId ? [{ id: 'root', name: '', depth: 0, path: '' }, ...options] : options;
    });
    const openFolderParentModal = (folder: { id: string; name: string; parentId?: string | null }) => {
      closeCardMenu();
      openControlMenu.value = '';
      folderParentModal.value = {
        open: true,
        folderId: folder.id,
        name: folder.name,
        currentParentId: folder.parentId ?? null,
        targetId: '',
      };
    };
    const closeFolderParentModal = () => {
      folderParentModal.value = { open: false, folderId: '', name: '', currentParentId: null, targetId: '' };
    };
    const saveFolderParentModal = async () => {
      const { folderId, targetId } = folderParentModal.value;
      if (!folderId || !targetId) return;
      const parentId = targetId === 'root' ? null : targetId;
      try {
        await runAction('move-folder-parent', () => resourceFolders.moveFolder(folderId, parentId), t('folderMoved'));
      } catch {
        return; // runAction already showed the reason; the dialog stays open to pick another place.
      }
      closeFolderParentModal();
      if (parentId) expandTree(parentId);
      await load();
    };

    // ---- resource descriptions ----
    const descriptionModal = ref<{
      open: boolean;
      resourceId: string;
      resourceType: FolderItem['type'];
      title: string;
      value: string;
      canEdit: boolean;
    }>({ open: false, resourceId: '', resourceType: 'canvas', title: '', value: '', canEdit: false });

    /** True when the signed-in user owns this resource, so it may be edited here. */
    const isOwnResource = (item: FolderItem) => {
      const ownerId = (item as { ownerId?: string }).ownerId;
      if (ownerId) return ownerId === currentUser.value?.id;
      // Records without an ownerId come from the user's own listings.
      return (item as { isOwn?: boolean }).isOwn !== false;
    };

    const openDescriptionModal = (item: FolderItem) => {
      closeCardMenu();
      openControlMenu.value = '';
      descriptionModal.value = {
        open: true,
        resourceId: item.id,
        resourceType: item.type,
        title: item.title || 'Без названия',
        value: item.description || '',
        // Shared-in resources are read-only here; the owner edits their own.
        canEdit: isOwnResource(item),
      };
    };

    const closeDescriptionModal = () => {
      descriptionModal.value = {
        open: false,
        resourceId: '',
        resourceType: 'canvas',
        title: '',
        value: '',
        canEdit: false,
      };
    };

    const saveDescriptionModal = async () => {
      const { resourceId, resourceType, value, canEdit } = descriptionModal.value;
      if (!resourceId || !canEdit) return closeDescriptionModal();
      const description = value.trim() ? value.trim() : null;
      const save = () => {
        if (resourceType === 'canvas') return canvas.update(resourceId, { description });
        if (resourceType === 'html-document') return htmlDocuments.update(resourceId, { description });
        return textDocuments.update(resourceId, { description });
      };
      const done = await runAction('save-description', save, t('save'));
      closeDescriptionModal();
      if (done) await load();
    };

    const toggleFolderOpen = (folderId: string) => {
      collapsedFolderIds.value = collapsedFolderIds.value.includes(folderId)
        ? collapsedFolderIds.value.filter((id) => id !== folderId)
        : [...collapsedFolderIds.value, folderId];
    };

    const isFolderOpen = (folderId: string) => {
      return !collapsedFolderIds.value.includes(folderId);
    };

    /**
     * Subtrees start folded, so reveal the chain down to a folder before it is
     * opened; otherwise the selected folder would be invisible in the sidebar.
     */
    const expandAncestorsOf = (folderId: string) => {
      const byId = new Map(allResourceFolders.value.map((folder) => [folder.id, folder]));
      const ancestors: string[] = [];
      let parentId = byId.get(folderId)?.parentId ?? null;
      const guard = new Set<string>();
      while (parentId && !guard.has(parentId)) {
        guard.add(parentId);
        ancestors.push(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      if (ancestors.length) {
        expandedTreeIds.value = [...new Set([...expandedTreeIds.value, ...ancestors])];
      }
    };

    /**
     * Pick which folder is open after a load: keep the current one, else the one
     * remembered from last time, else the first in the tree. The remembered id is
     * checked against every known folder rather than the visible tree, since a
     * nested folder is hidden until its ancestors are expanded.
     */
    const restoreSelectedFolder = () => {
      const isKnown = (id: string) =>
        Boolean(id) && (
          allResourceFolders.value.some((folder) => folder.id === id)
          || (id === 'legacy-resource-inbox' && legacyInboxSourceItems.value.length > 0)
        );
      const syncActiveFolderSection = () => {
        if (activeSection.value.kind !== 'folder') return;
        activeSection.value = selectedFolderId.value
          ? { kind: 'folder', folderId: selectedFolderId.value }
          : { kind: 'recent' };
      };
      if (isKnown(selectedFolderId.value)) {
        expandAncestorsOf(selectedFolderId.value);
        syncActiveFolderSection();
        return;
      }

      const known = new Set(allResourceFolders.value.map((folder) => folder.id));
      const remembered = readLastFolderId();
      if (remembered && known.has(remembered)) {
        expandAncestorsOf(remembered);
        selectedFolderId.value = remembered;
        syncActiveFolderSection();
        return;
      }
      const fallback = allFolderSummaries.value[0]?.id || (legacyInboxSourceItems.value.length ? 'legacy-resource-inbox' : '');
      selectedFolderId.value = fallback;
      syncActiveFolderSection();
      // A stale pointer is cleared so it cannot keep losing the race with the
      // fallback on every load.
      if (remembered && !known.has(remembered)) writeLastFolderId('');
    };

    const selectFolder = (folderId: string) => {
      clearDashboardReturnOrigin();
      activeSection.value = { kind: 'folder', folderId };
      selectedFolderId.value = folderId;
      expandAncestorsOf(folderId);
      writeLastFolderId(folderId);
      layoutPrefs.setLastExplorerRoute({ kind: 'folder', folderId });
      closeCardMenu();
    };

    const isTechnicalFolder = (folder: { id: string; name: string }) =>
      folder.id === 'legacy-resource-inbox'
      || folder.name === 'Unsorted'
      || folder.name.toLowerCase() === 'default';

    const selectDashboardSection = (section: DashboardSection) => {
      clearDashboardReturnOrigin();
      activeSection.value = section;
      if (section.kind === 'folder') {
        selectFolder(section.folderId);
      } else {
        if (section.kind === 'home') {
          selectedFolderId.value = '';
        }
        if (section.kind !== 'recent' && section.kind !== 'gallery') {
          layoutPrefs.setLastExplorerRoute(section);
        }
        closeCardMenu();
      }
      mobileSidebarOpen.value = false;
    };

    /**
     * The sidebar's Home / Shared / Templates / Public scroll the home feed
     * to that section rather than swapping the dashboard for a page of its
     * own - the feed always shows them all, one under the other, empty or
     * not. A guest has no feed: their dashboard is Public itself.
     */
    const FEED_SIDEBAR_SECTIONS = ['recent', 'spaces', 'interactive'] as const;
    const onSidebarSelect = async (section: DashboardSection) => {
      if (section.kind === 'drive') {
        router.push('/drive');
        return;
      }
      const target = section.kind as FeedSection;
      if (!isLoggedIn || !(FEED_SIDEBAR_SECTIONS as readonly string[]).includes(section.kind)) {
        selectDashboardSection(section);
        return;
      }
      clearDashboardReturnOrigin();
      if (activeSection.value.kind !== 'recent') activeSection.value = { kind: 'recent' };
      closeCardMenu();
      mobileSidebarOpen.value = false;
      await nextTick();
      scrollToFeedSection(target);
    };

    /** One level up: parent folder, Q Space/home from a top-level folder, parent Yandex path, or Albums from a Space. */
    const goToParentFolder = (): boolean => {
      if (activeSection.value.kind === 'folder') {
        const folder = activeFolder.value;
        if (!folder) return false;
        if (folder.parentId) selectFolder(folder.parentId);
        else if (folder.role && folder.role !== 'owner') selectDashboardSection({ kind: 'shared' });
        else selectDashboardSection({ kind: 'home' });
        return true;
      }
      if (activeSection.value.kind === 'space') {
        if (spaceView.value?.navigateUp?.()) return true;
        void onSidebarSelect({ kind: 'spaces' });
        return true;
      }
      if (activeSection.value.kind === 'yandex') {
        const cur = activeSection.value.path || '/';
        if (cur !== '/') openYandexPath(yandexParentPath(cur));
        else selectDashboardSection({ kind: 'home' });
        return true;
      }
      return false;
    };
    // Android's system Back inside a folder does the same as the folder's
    // own back arrow, rather than main.ts offering to exit the app.
    useBackHandler(goToParentFolder);

    const toggleSidebarWidth = () => {
      const nextCollapsed = !sidebarCollapsed.value;
      onSidebarCollapsedChange(nextCollapsed);
    };

    // ----- T-021 / UX v2 Sidebar Mode Switcher, Inline S2 Search, Table, Favorites, Group DnD, Context Menu & Gallery -----
    const sidebarMode = computed<ExplorerSidebarMode>(() => (
      activeSection.value.kind === 'gallery' ? 'media' : 'files'
    ));

    const mobileTabActivity = computed<ExplorerMobileTabId>(() => {
      if (activeSection.value.kind === 'gallery') return 'gallery';
      if (activeSection.value.kind === 'recent') return 'home';
      return 'explorer';
    });

    const showSidebarExpand = computed(() => {
      if (!isLoggedIn || isAndroidApp.value) return false;
      if (isMobileHeadroom.value) return !mobileSidebarOpen.value;
      return sidebarCollapsed.value;
    });

    const onExpandSidebar = () => {
      if (isMobileHeadroom.value) {
        openMobileSidebar();
      } else {
        onSidebarCollapsedChange(false);
      }
    };

    const onSidebarCollapseButton = () => {
      if (isMobileHeadroom.value && mobileSidebarOpen.value) {
        closeMobileSidebar();
      } else {
        onSidebarCollapsedChange(true);
      }
    };

    const showFolderFab = computed(() => (
      !mediaViewer.value && (
        activeSection.value.kind === 'recent'
        || activeSection.value.kind === 'folder'
        || activeSection.value.kind === 'home'
      )
    ));

    const headroomSpaceMembersTotal = computed(() => (
      activeSpace.value ? activeSpace.value.members.length + 1 : 0
    ));
    const headroomSpaceCountLabel = computed(() => {
      if (!activeSpace.value) return '';
      return t('explorerMembersCount').replace('{n}', String(headroomSpaceMembersTotal.value));
    });
    const headroomSpaceCountPrefix = computed(() => {
      const label = headroomSpaceCountLabel.value;
      const num = String(headroomSpaceMembersTotal.value);
      return num && label.endsWith(num) ? label.slice(0, -num.length) : label;
    });

    const addDialogTargetFolderName = computed(() => {
      if (activeSection.value.kind === 'folder' && activeFolder.value) return activeFolder.value.name;
      const found = folderOptions.value.find((f) => f.id === addDialog.value.folderId);
      return found?.name || t('home');
    });

    const onToggleMobileDrawer = () => {
      if (mobileSidebarOpen.value) closeMobileSidebar();
      else openMobileSidebar();
    };

    const onSwitchSidebarMode = (mode: ExplorerSidebarMode) => {
      if (mode === 'media') {
        selectDashboardSection({ kind: 'gallery' });
        return;
      }
      if (activeSection.value.kind === 'gallery') {
        const view = galleryViewRef.value as { getActiveFocusTransfer?: () => GalleryFocusTransfer | null } | null;
        const transfer: GalleryFocusTransfer | null = typeof view?.getActiveFocusTransfer === 'function'
          ? view.getActiveFocusTransfer()
          : (galleryFocusedPhoto.value
            ? {
                fileId: galleryFocusedPhoto.value.fileId,
                folderId: galleryFocusedPhoto.value.folderId ?? null,
                shared: Boolean(galleryFocusedPhoto.value.share),
                selectedIds: [galleryFocusedPhoto.value.fileId],
              }
            : null);
        if (transfer) {
          const keys = transfer.selectedIds.map((id) => `drive-file:${id}`);
          const primaryKey = `drive-file:${transfer.fileId}`;
          pendingExplorerSelectionKeys.value = keys;
          transferredExplorerKeys.value = new Set(keys);
          pendingScrollToSelectKey.value = primaryKey;
          if (transfer.folderId) {
            selectFolder(transfer.folderId);
          } else if (!transfer.shared) {
            selectDashboardSection({ kind: 'home' });
          } else {
            selectDashboardSection({ kind: 'shared' });
          }
          mobileSidebarOpen.value = false;
          return;
        }
      }
      const remembered = layoutPrefs.lastExplorerRoute.value;
      if (remembered) {
        selectDashboardSection(remembered);
      } else {
        const firstOwn = ownResourceFolders.value.find((f) => !isTechnicalFolder(f)) || allFolderSummaries.value[0];
        if (firstOwn) selectFolder(firstOwn.id);
        else selectDashboardSection({ kind: 'recent' });
      }
    };

    const onSelectActivity = (activity: ExplorerMobileTabId) => {
      if (activity === 'home') {
        selectDashboardSection({ kind: 'recent' });
        return;
      }
      if (activity === 'gallery') {
        selectDashboardSection({ kind: 'gallery' });
        return;
      }
      onSwitchSidebarMode('files');
    };

    const headroomViewToggleMode = computed<HeadroomViewToggleMode>(() => {
      if (activeSection.value.kind === 'trash') return 'none';
      return 'explorer';
    });

    // Global shortcut: Ctrl/Cmd+K -> Unified S2 Inline Search in Files or Media
    const onExplorerShortcutKeydown = (event: KeyboardEvent) => {
      if (!isLoggedIn || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        if (activeSection.value.kind === 'gallery') {
          (galleryViewRef.value as { focusSearch?: () => void } | null)?.focusSearch?.();
        } else {
          headroomBarRef.value?.focusSearch?.();
        }
      }
    };
    onMounted(() => window.addEventListener('keydown', onExplorerShortcutKeydown));
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onExplorerShortcutKeydown);
    });

    // Unified S2 Inline Search scope & data (real folders, albums, resources & drive files)
    const s2ScopeLabel = computed<string | null>(() => {
      if (activeSection.value.kind === 'folder' && activeFolder.value) return activeFolder.value.name;
      if (activeSection.value.kind === 'home') return t('qSpace');
      if (activeSection.value.kind === 'space' && activeSpace.value) {
        const subName = spaceView.value?.currentFolderName
          || (activeSpaceFolderId.value
            ? (activeSpace.value.sources.find((s) => s.folderId === activeSpaceFolderId.value)?.title
              ?? allResourceFolders.value.find((f) => f.id === activeSpaceFolderId.value)?.name
              ?? '')
            : '');
        return subName ? `${activeSpace.value.name} / ${subName}` : activeSpace.value.name;
      }
      return null;
    });

    watch(
      () => activeSection.value,
      () => {
        if (!searchQuery.value.trim()) {
          s2ScopeMode.value = 'current';
        }
      },
    );

    const activeSubtreeFolderIds = computed<Set<string> | null>(() => {
      if (s2ScopeMode.value !== 'current') return null;
      if (activeSection.value.kind !== 'folder' || !activeFolder.value) return null;
      const set = new Set<string>([activeFolder.value.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of allResourceFolders.value) {
          if (f.parentId && set.has(f.parentId) && !set.has(f.id)) {
            set.add(f.id);
            grew = true;
          }
        }
      }
      return set;
    });

    const s2SearchFolders = computed<InlineSearchFolder[]>(() => {
      const subtree = activeSubtreeFolderIds.value;
      const list = subtree
        ? allResourceFolders.value.filter((f) => subtree.has(f.id) && f.id !== activeFolder.value?.id)
        : allResourceFolders.value;
      return list.map((f) => ({
        id: f.id,
        name: f.name,
        path: folderPathById.value.get(f.id) || f.name,
      }));
    });

    const s2SearchAlbums = computed<InlineSearchAlbum[]>(() => {
      const list = s2ScopeMode.value === 'current' && activeSection.value.kind === 'space' && spaceId.value
        ? allSpaces.value.filter((s) => s.id === spaceId.value)
        : allSpaces.value;
      return list.map((s) => ({
        id: s.id,
        name: s.name,
        count: s.sourceCount,
      }));
    });

    const s2SearchItems = computed<InlineSearchItem[]>(() => {
      const subtree = activeSubtreeFolderIds.value;
      const inFolderScope = (fid?: string | null) => {
        if (!subtree) return true;
        return Boolean(fid && subtree.has(fid));
      };
      const mapTags = (raw?: CanvasTag[]) => (raw || []).map((tg) => tg.name).filter(Boolean);
      const entries: InlineSearchItem[] = [];
      for (const item of own.value) {
        if (!inFolderScope(item.folderId)) continue;
        entries.push({
          id: `canvas:${item.id}`,
          title: item.title || t('untitled'),
          type: 'canvas',
          folderId: item.folderId,
          folderName: item.folderId ? folderPathById.value.get(item.folderId) || null : null,
          tags: mapTags(item.tags),
        });
      }
      for (const item of allHtmlDocumentsRaw.value) {
        if (!inFolderScope(item.folderId)) continue;
        entries.push({
          id: `html-document:${item.id}`,
          title: item.title || t('untitled'),
          type: 'html',
          folderId: item.folderId,
          folderName: item.folderId ? folderPathById.value.get(item.folderId) || null : null,
          tags: mapTags(item.tags),
        });
      }
      for (const item of allTextDocumentsRaw.value) {
        if (!inFolderScope(item.folderId)) continue;
        entries.push({
          id: `text-document:${item.id}`,
          title: item.title || t('untitled'),
          type: 'document',
          folderId: item.folderId,
          folderName: item.folderId ? folderPathById.value.get(item.folderId) || null : null,
          tags: mapTags(item.tags),
        });
      }
      for (const item of interactiveTemplateItems.value) {
        if (!inFolderScope(item.folderId)) continue;
        entries.push({
          id: `interactive-template:${item.id}`,
          title: item.title || t('untitled'),
          type: 'document',
          folderId: item.folderId,
          folderName: item.folderId ? folderPathById.value.get(item.folderId) || null : null,
        });
      }
      const combinedDriveFiles = [...folderDriveFiles.value, ...homeRootDriveFiles.value];
      const seenDrive = new Set<string>();
      for (const file of combinedDriveFiles) {
        if (seenDrive.has(file.id)) continue;
        seenDrive.add(file.id);
        if (!inFolderScope(file.folderId)) continue;
        const lower = file.name.toLowerCase();
        const isPdf = file.mime === 'application/pdf' || lower.endsWith('.pdf');
        const isMedia = isVideoFile(file) || isPictureFile(file);
        entries.push({
          id: `drive-file:${file.id}`,
          fileId: file.id,
          title: file.name,
          type: isPdf ? 'pdf' : isMedia ? 'media' : isMarkdownFile(file) ? 'document' : 'other',
          mimeType: file.mime,
          folderId: file.folderId,
          folderName: file.folderId ? folderPathById.value.get(file.folderId) || null : null,
        });
      }
      return entries;
    });

    const onSearchSelectFolder = (folderId: string) => {
      selectFolder(folderId);
    };

    const onSearchSelectAlbum = (albumId: string) => {
      selectDashboardSection({ kind: 'space', spaceId: albumId });
    };

    const onSearchOpenItem = (item: InlineSearchItem) => {
      const colonIdx = item.id.indexOf(':');
      const kind = colonIdx > 0 ? item.id.slice(0, colonIdx) : '';
      const rawId = colonIdx > 0 ? item.id.slice(colonIdx + 1) : item.id;
      if (kind === 'drive-file' || item.fileId) {
        const fid = item.fileId || rawId;
        const file = folderDriveFiles.value.find((f) => f.id === fid)
          || homeRootDriveFiles.value.find((f) => f.id === fid);
        if (file) {
          if (isDriveMedia(file)) openDriveImage(file);
          else if (isMarkdownFile(file)) openDriveMarkdown(file);
          else void downloadDriveFile(file.id, file.name);
        } else {
          void downloadDriveFile(fid, item.title);
        }
        return;
      }
      openSpaceResource(kind || 'canvas', rawId);
    };

    const onSearchSelectTag = (tag: string) => {
      searchQuery.value = tag;
    };

    // Home Favorites section (folders, albums/spaces, resources & drive files)
    type HomeFavoriteTile = {
      key: string;
      kind: 'folder' | 'space' | 'canvas' | 'html-document' | 'text-document' | 'interactive-template' | 'drive-file' | 'file';
      id: string;
      name: string;
      subtitle: string;
      routeId?: string;
    };
    const rememberedFavoriteMeta = reactive<Record<string, { name: string; kind: string; id: string }>>({});
    const favoriteTiles = computed<HomeFavoriteTile[]>(() => {
      const result: HomeFavoriteTile[] = [];
      for (const key of layoutPrefs.favorites.value) {
        if (key.startsWith('folder:')) {
          const id = key.slice('folder:'.length);
          const f = allFolderSummaries.value.find((item) => item.id === id);
          if (f) result.push({ key, kind: 'folder', id: f.id, name: f.name, subtitle: t('qSpace') });
        } else if (key.startsWith('space:') || key.startsWith('album:')) {
          const id = key.replace(/^(space:|album:)/, '');
          const s = allSpaces.value.find((item) => item.id === id);
          if (s) result.push({ key, kind: 'space', id: s.id, name: s.name, subtitle: t('spaces') });
        } else if (key.startsWith('drive-file:') || key.startsWith('file:')) {
          const id = key.replace(/^(drive-file:|file:)/, '');
          const file = folderDriveFiles.value.find((f) => f.id === id)
            || homeRootDriveFiles.value.find((f) => f.id === id);
          const meta = rememberedFavoriteMeta[key];
          if (file) {
            result.push({ key, kind: 'drive-file', id: file.id, name: file.name, subtitle: resourceTypeLabel('drive-file', t) });
          } else if (meta) {
            result.push({ key, kind: 'drive-file', id: meta.id, name: meta.name, subtitle: resourceTypeLabel('drive-file', t) });
          }
        } else {
          const item = (dashboardItemsByKey.value as ReadonlyMap<string, FolderItem>).get(key);
          if (item) {
            result.push({
              key,
              kind: item.type,
              id: item.id,
              routeId: ('slug' in item && item.slug) || item.id,
              name: item.title || t('untitled'),
              subtitle: resourceTypeLabel(item.type, t),
            });
          } else if (rememberedFavoriteMeta[key]) {
            const meta = rememberedFavoriteMeta[key]!;
            result.push({
              key,
              kind: (meta.kind as HomeFavoriteTile['kind']) || 'canvas',
              id: meta.id,
              name: meta.name,
              subtitle: resourceTypeLabel(meta.kind, t),
            });
          }
        }
      }
      return result;
    });
    const openFavoriteTile = (fav: HomeFavoriteTile) => {
      if (fav.kind === 'space') {
        selectDashboardSection({ kind: 'space', spaceId: fav.id });
      } else if (fav.kind === 'folder') {
        selectFolder(fav.id);
      } else if (fav.kind === 'drive-file' || fav.kind === 'file') {
        const file = activeDriveFiles.value.find((f) => f.id === fav.id)
          || folderDriveFiles.value.find((f) => f.id === fav.id)
          || homeRootDriveFiles.value.find((f) => f.id === fav.id);
        if (file) {
          if (isDriveMedia(file)) openDriveImage(file);
          else if (isMarkdownFile(file)) openDriveMarkdown(file);
          else void downloadDriveFile(file.id, file.name);
        } else if (isPictureFile({ name: fav.name }) || isVideoFile({ name: fav.name })) {
          mediaViewer.value = { items: [driveViewerItem({ id: fav.id, name: fav.name, kind: isVideoFile({ name: fav.name }) ? 'video' : 'image' })], start: 0 };
        } else if (isMarkdownFile({ name: fav.name })) {
          openDriveMarkdown({ id: fav.id, name: fav.name });
        } else {
          void downloadDriveFile(fav.id, fav.name);
        }
      } else {
        openSpaceResource(fav.kind, fav.routeId || fav.id);
      }
    };

    // Real Q Space/home root folder contents (with global search expansion when s2ScopeMode === 'global')
    const homeRootSubfolders = computed(() => {
      if (s2TypeFilter.value !== 'all' && s2TypeFilter.value !== 'folder') return [];
      const ownIds = new Set(ownResourceFolders.value.map((f) => f.id));
      const needle = searchQuery.value.trim().toLocaleLowerCase();
      const isGlobalSearch = s2ScopeMode.value === 'global' && (Boolean(needle) || s2TypeFilter.value !== 'all');
      return allFolderSummaries.value
        .filter((folder) => (
          isGlobalSearch
            ? true
            : folder.role === 'owner' && (folder.parentId ?? null) === null && ownIds.has(folder.id)
        ))
        .filter((folder) => isGlobalSearch || !isTechnicalFolder(folder) || folder.items.length > 0 || (folderFiles.counts[folder.id] ?? 0) > 0)
        .filter((folder) => !needle || folder.name.toLocaleLowerCase().includes(needle))
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          count:
            folder.items.length +
            (folderFiles.counts[folder.id] ?? 0) +
            (subfolderCounts.value.get(folder.id) ?? 0),
          latest: folderLatest.value.get(folder.id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
    const homeRootItems = computed<FolderItem[]>(() => {
      const isGlobalSearch = s2ScopeMode.value === 'global' && (Boolean(searchQuery.value.trim()) || s2TypeFilter.value !== 'all');
      if (isGlobalSearch) {
        const seen = new Set<string>();
        const globalItems: FolderItem[] = [];
        for (const summary of allFolderSummaries.value) {
          for (const item of summary.items) {
            const k = `${item.type}:${item.id}` as const;
            if (seen.has(k)) continue;
            const enriched = dashboardItemsByKey.value.get(k) || item;
            if (matchesFolderItem(enriched, summary.name) && matchesS2ItemType(enriched.type)) {
              seen.add(k);
              globalItems.push(enriched);
            }
          }
        }
        return sortFolderItems(globalItems);
      }
      return sortFolderItems(
        [
          ...unfiledCanvases.value,
          ...unfiledHtmlDocuments.value,
          ...unfiledTextDocuments.value,
          ...unfiledInteractiveTemplateItems.value,
        ].filter((item) => matchesFolderItem(item, t('home')) && matchesS2ItemType(item.type)),
      );
    });
    const homeRootEmpty = computed(() => Boolean(
      !homeRootSubfolders.value.length
      && !homeRootItems.value.length
      && !homeRootFileCount.value,
    ));
    const showScopedSearchEverywhereCta = computed(() => {
      if (s2ScopeMode.value !== 'current' || !s2ScopeLabel.value) return false;
      if (!searchQuery.value.trim() && s2TypeFilter.value === 'all') return false;
      if (activeSection.value.kind === 'home') return homeRootEmpty.value;
      if (activeSection.value.kind === 'folder') return activeFolderEmpty.value;
      return false;
    });
    const homeRootTableRows = computed<ExplorerTableRow[]>(() =>
      buildFolderExplorerTableRows(
        homeRootSubfolders.value,
        homeRootItems.value,
        homeRootDriveFiles.value,
        { sourceLabel: `${t('qSpace')}/home`, t, selectionKey },
      ),
    );

    // Windows Explorer table rows for active folder & Home Recents
    const activeFolderTableRows = computed<ExplorerTableRow[]>(() => {
      if (!activeFolder.value) return [];
      return buildFolderExplorerTableRows(
        activeSubfolders.value,
        activeFolder.value.items,
        folderDriveFiles.value,
        { sourceLabel: t('qSpace'), t, selectionKey },
      );
    });
    const recentTableRows = computed<ExplorerTableRow[]>(() =>
      buildFolderExplorerTableRows(
        [],
        visibleRecent.value.map((r) => ({
          type: r.type,
          id: r.id,
          title: r.title,
          openedAt: r.openedAt,
          folderId: null,
        })),
        [],
        { sourceLabel: t('qSpace'), t, selectionKey },
      ),
    );
    const sharedTableRows = computed<ExplorerTableRow[]>(() =>
      buildFolderExplorerTableRows(
        [],
        feedItems(sharedFiltered.value, 'shared'),
        [],
        { sourceLabel: 'Q Space/shared', t, selectionKey },
      ),
    );
    const interactiveTableRows = computed<ExplorerTableRow[]>(() =>
      buildFolderExplorerTableRows(
        [],
        feedItems(visibleInteractiveTemplateItems.value, 'interactive'),
        [],
        { sourceLabel: t('qSpace'), t, selectionKey },
      ),
    );
    const publicTableRows = computed<ExplorerTableRow[]>(() =>
      buildFolderExplorerTableRows(
        [],
        feedItems(publicFiltered.value, 'public'),
        [],
        { sourceLabel: 'Q Space/public', t, selectionKey },
      ),
    );
    const openExplorerTableRow = (row: ExplorerTableRow) => {
      if (row.isFolder || row.kind === 'folder') {
        selectFolder(row.id);
        return;
      }
      if (row.kind === 'file' || row.kind === 'drive-file') {
        const file = activeDriveFiles.value.find((f) => f.id === row.id);
        if (file) {
          if (isDriveMedia(file)) openDriveImage(file);
          else if (isMarkdownFile(file)) openDriveMarkdown(file);
          else void downloadDriveFile(file.id, file.name);
        }
        return;
      }
      openSpaceResource(row.kind, row.id);
    };

    // Album Share Modal (unified space entity)
    const sharingAlbum = ref<SpaceDetails | null>(null);
    const openAlbumShareById = async (targetId: string) => {
      try {
        sharingAlbum.value = await spacesApi.get(targetId);
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceLoadFailed'));
      }
    };
    const onSharingAlbumChanged = (next: SpaceDetails | null) => {
      const prevId = sharingAlbum.value?.id;
      const wasUnlisted = Boolean(sharingAlbum.value?.unlisted || next?.unlisted);
      sharingAlbum.value = next && wasUnlisted ? { ...next, unlisted: true } : next;
      if (next && activeSpace.value?.id === next.id) {
        activeSpace.value = next;
      } else if (!next && !wasUnlisted && prevId && spaceId.value === prevId) {
        leaveSpaceSection();
        return;
      }
      if (!wasUnlisted) {
        void loadSpaces(true);
      }
    };
    const onCloseSharingAlbum = () => {
      const current = sharingAlbum.value;
      sharingAlbum.value = null;
      if (current?.unlisted && current.members.length === 0) {
        void spacesApi.remove(current.id).catch(() => {});
      }
    };

    // Resource Share Panel (canvas / html-document / text-document / interactive-template)
    type ResourceShareKind = 'canvas' | 'html-document' | 'text-document' | 'interactive-template';
    const resourceShare = reactive<{
      open: boolean;
      kind: ResourceShareKind;
      id: string;
      title: string;
      slug: string;
      slugError: string;
      savingSlug: boolean;
      visibility: ShareVisibility;
      allowPublicEdit: boolean;
      listedInPublic: boolean;
      publicHidden: boolean;
      permissions: SharePermission[];
      shareEmail: string;
      shareRole: ShareRole;
      passwordAccessEnabled: boolean;
      passwordAccessPassword: string;
      passwordAccessRole: ShareRole;
    }>({
      open: false,
      kind: 'canvas',
      id: '',
      title: '',
      slug: '',
      slugError: '',
      savingSlug: false,
      visibility: 'private',
      allowPublicEdit: false,
      listedInPublic: false,
      publicHidden: false,
      permissions: [],
      shareEmail: '',
      shareRole: 'read',
      passwordAccessEnabled: false,
      passwordAccessPassword: '',
      passwordAccessRole: 'read',
    });

    const resourceShareSlugPrefix = computed(() => {
      if (resourceShare.kind === 'html-document') return '/html/';
      if (resourceShare.kind === 'text-document') return '/docs/';
      if (resourceShare.kind === 'interactive-template') return '/templates/';
      return '/canvas/';
    });
    const resourceShareUrl = computed(() => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `${origin}${resourceShareSlugPrefix.value}${resourceShare.slug || resourceShare.id}`;
    });

    const resourceShareApiOf = (kind: ResourceShareKind) => {
      if (kind === 'html-document') return htmlDocuments;
      if (kind === 'text-document') return textDocuments;
      if (kind === 'interactive-template') return interactiveTemplates;
      return canvas;
    };

    const loadResourceSharePermissions = async () => {
      if (!resourceShare.id) return;
      try {
        resourceShare.permissions = await resourceShareApiOf(resourceShare.kind).permissions(resourceShare.id);
      } catch {
        resourceShare.permissions = [];
      }
    };

    const openResourceShareModal = async (kind: ResourceShareKind, id: string) => {
      const known = dashboardItemsByKey.value.get(`${kind}:${id}`);
      resourceShare.open = true;
      resourceShare.kind = kind;
      resourceShare.id = id;
      resourceShare.title = known?.title || t('share');
      resourceShare.slug = (known && 'slug' in known && known.slug) || '';
      resourceShare.slugError = '';
      resourceShare.savingSlug = false;
      resourceShare.visibility = (known && 'visibility' in known && known.visibility) || 'private';
      resourceShare.allowPublicEdit = Boolean(known && 'allowPublicEdit' in known && known.allowPublicEdit);
      resourceShare.listedInPublic = false;
      resourceShare.publicHidden = false;
      resourceShare.permissions = [];
      resourceShare.shareEmail = '';
      resourceShare.shareRole = 'read';
      resourceShare.passwordAccessEnabled = false;
      resourceShare.passwordAccessPassword = '';
      resourceShare.passwordAccessRole = 'read';

      try {
        if (kind === 'canvas') {
          const res = await canvas.get(id);
          const rec = res?.canvas as any;
          if (rec) {
            resourceShare.title = rec.title || resourceShare.title;
            resourceShare.slug = rec.slug || '';
            resourceShare.visibility = rec.visibility || (rec.isPublic ? 'public' : 'private');
            resourceShare.allowPublicEdit = Boolean(rec.allowPublicEdit);
            resourceShare.listedInPublic = Boolean(rec.listedInPublic);
            resourceShare.publicHidden = Boolean(rec.publicHidden);
            resourceShare.passwordAccessEnabled = Boolean(rec.passwordAccessEnabled);
            resourceShare.passwordAccessRole = rec.passwordAccessRole === 'edit' ? 'edit' : 'read';
          }
        } else if (kind === 'html-document') {
          const res = await htmlDocuments.get(id);
          const doc = res?.document as any;
          if (doc) {
            resourceShare.title = doc.title || resourceShare.title;
            resourceShare.slug = doc.slug || '';
            resourceShare.visibility = doc.visibility || (doc.shared ? 'public' : 'private');
            resourceShare.allowPublicEdit = Boolean(doc.allowPublicEdit);
            resourceShare.listedInPublic = Boolean(doc.listedInPublic);
            resourceShare.publicHidden = Boolean(doc.publicHidden);
            resourceShare.passwordAccessEnabled = Boolean(doc.passwordAccessEnabled);
            resourceShare.passwordAccessRole = doc.passwordAccessRole === 'edit' ? 'edit' : 'read';
          }
        } else if (kind === 'text-document') {
          const res = await textDocuments.get(id);
          const doc = res?.document as any;
          if (doc) {
            resourceShare.title = doc.title || resourceShare.title;
            resourceShare.slug = doc.slug || '';
            resourceShare.visibility = doc.visibility || 'private';
            resourceShare.allowPublicEdit = Boolean(doc.allowPublicEdit);
            resourceShare.listedInPublic = Boolean(doc.listedInPublic);
            resourceShare.publicHidden = Boolean(doc.publicHidden);
            resourceShare.passwordAccessEnabled = Boolean(doc.passwordAccessEnabled);
            resourceShare.passwordAccessRole = doc.passwordAccessRole === 'edit' ? 'edit' : 'read';
          }
        } else {
          const tpl = await interactiveTemplates.get(id);
          if (tpl) resourceShare.title = tpl.title || resourceShare.title;
        }
      } catch {
        // Keep seeded item fields if fetch fails
      }
      await loadResourceSharePermissions();
    };

    const closeResourceShareModal = () => {
      resourceShare.open = false;
    };

    const copyResourceShareLink = async () => {
      try {
        await navigator.clipboard?.writeText(resourceShareUrl.value);
      } catch {
        // Clipboard may be unavailable in headless tests
      }
    };

    const updateResourceShareSettings = async (patch: Record<string, unknown>) => {
      if (resourceShare.kind === 'interactive-template') return;
      try {
        await (resourceShareApiOf(resourceShare.kind) as typeof canvas).update(resourceShare.id, patch as any);
        await load({ showLoading: false });
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
      }
    };

    const setResourceShareVisibility = (v: ShareVisibility) => {
      resourceShare.visibility = v;
      if (v === 'public') resourceShare.allowPublicEdit = false;
      void updateResourceShareSettings({ visibility: v, isPublic: v === 'public' });
    };
    const setResourceShareAllowPublicEdit = (v: boolean) => {
      resourceShare.allowPublicEdit = v;
      void updateResourceShareSettings({ allowPublicEdit: v });
    };
    const setResourceShareListedInPublic = (v: boolean) => {
      resourceShare.listedInPublic = v;
      void updateResourceShareSettings({ listedInPublic: v });
    };
    const saveResourceSharePassword = () => {
      void updateResourceShareSettings({
        passwordAccessEnabled: resourceShare.passwordAccessEnabled,
        passwordAccessPassword: resourceShare.passwordAccessPassword || undefined,
        passwordAccessRole: resourceShare.passwordAccessRole,
      });
      resourceShare.passwordAccessPassword = '';
    };
    const saveResourceShareSlug = async () => {
      if (resourceShare.kind === 'interactive-template') return;
      resourceShare.savingSlug = true;
      resourceShare.slugError = '';
      try {
        await (resourceShareApiOf(resourceShare.kind) as typeof canvas).update(resourceShare.id, { slug: resourceShare.slug.trim() || null } as any);
        await load({ showLoading: false });
      } catch (err) {
        resourceShare.slugError = err instanceof Error && err.message ? err.message : t('spaceActionFailed');
      } finally {
        resourceShare.savingSlug = false;
      }
    };
    const inviteResourceShare = async () => {
      const email = resourceShare.shareEmail.trim();
      if (!email || !resourceShare.id) return;
      try {
        await resourceShareApiOf(resourceShare.kind).share(resourceShare.id, email, resourceShare.shareRole);
        resourceShare.shareEmail = '';
        await loadResourceSharePermissions();
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
      }
    };
    const revokeResourceShare = async (userId: string) => {
      if (!resourceShare.id || !userId) return;
      try {
        await resourceShareApiOf(resourceShare.kind).revoke(resourceShare.id, userId);
        await loadResourceSharePermissions();
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
      }
    };

    const buildGroupDragEntriesForKeys = (keys: readonly string[]): GroupDragEntry[] => {
      const entries: GroupDragEntry[] = [];
      const seen = new Set<string>();
      for (const key of keys) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (key.startsWith('folder:')) {
          const id = key.slice('folder:'.length);
          const folder = allFolderSummaries.value.find((f) => f.id === id)
            || allResourceFolders.value.find((f) => f.id === id);
          if (folder) {
            entries.push({ key, id: folder.id, kind: 'folder', name: folder.name, folderId: folder.id });
            continue;
          }
        }
        const driveId = key.startsWith('drive-file:')
          ? key.slice('drive-file:'.length)
          : key.startsWith('drive:')
            ? key.slice('drive:'.length)
            : '';
        if (driveId) {
          const file = driveFilesByKey.value.get(`drive-file:${driveId}`)
            || folderDriveFiles.value.find((f) => f.id === driveId)
            || homeRootDriveFiles.value.find((f) => f.id === driveId);
          if (file) {
            entries.push({
              key: `drive-file:${file.id}`,
              id: file.id,
              kind: 'drive-file',
              name: file.name,
              folderId: file.folderId ?? null,
            });
            continue;
          }
        }
        const normalizedItemKey = key.startsWith('doc:')
          ? `text-document:${key.slice('doc:'.length)}`
          : key;
        const item = itemsBySelectionKey.value.get(normalizedItemKey);
        if (item) {
          entries.push({
            key: selectionKey(item),
            id: item.id,
            kind: item.type,
            name: item.title || t('untitled'),
            folderId: item.folderId ?? null,
          });
          continue;
        }
        const tableRow = allTableRowsByKey.value.get(key);
        if (tableRow) {
          entries.push({
            key: tableRow.key,
            id: tableRow.id,
            kind: tableRow.kind,
            name: tableRow.name,
            folderId: tableRow.folderId,
            path: tableRow.path,
          });
          continue;
        }
        const spaceItem = spaceItemsByKey.value.get(key);
        if (spaceItem && spaceItem.id) {
          entries.push({
            key,
            id: spaceItem.id,
            kind: spaceItem.kind,
            name: spaceItem.name,
            path: spaceItem.path,
          });
        }
      }
      return entries;
    };

    const isFolderAncestorOrSelf = (candidateAncestorId: string, targetFolderId: string | null): boolean => {
      if (!targetFolderId) return false;
      if (candidateAncestorId === targetFolderId) return true;
      return descendantFolderIds(allResourceFolders.value, candidateAncestorId).has(targetFolderId);
    };

    // Group Drag-and-Drop handlers (folders & albums)
    const onDropGroupToFolder = async (folderId: string | null, payload: GroupDragPayload) => {
      if (!payload?.items?.length) return;
      const target = folderId !== null ? allResourceFolders.value.find((f) => f.id === folderId) : null;
      if (folderId !== null && !target) return;
      if (target && target.role !== 'owner') return;
      const targetName = folderId === null ? `${t('qSpace')}/home` : target!.name;
      let moved = 0;
      let failed = 0;
      let lastError: unknown = null;
      for (const entry of payload.items) {
        try {
          if (entry.kind === 'drive-file' || entry.kind === 'file' || entry.key.startsWith('drive-file:')) {
            const fileId = entry.id || entry.key.replace(/^drive-file:/, '');
            if (!fileId) continue;
            await driveApi.moveFile(fileId, folderId);
            moved += 1;
          } else if (entry.kind === 'folder' || entry.key.startsWith('folder:')) {
            const fId = entry.id || entry.key.replace(/^folder:/, '');
            if (!fId || isFolderAncestorOrSelf(fId, folderId)) continue;
            await resourceFolders.moveFolder(fId, folderId);
            moved += 1;
          } else if (entry.kind === 'canvas') {
            await canvas.update(entry.id, { folderId });
            moved += 1;
          } else if (entry.kind === 'html-document') {
            await htmlDocuments.update(entry.id, { folderId });
            moved += 1;
          } else if (entry.kind === 'text-document') {
            await textDocuments.update(entry.id, { folderId });
            moved += 1;
          } else if (entry.kind === 'interactive-template' && folderId !== null) {
            await resourceFolders.move(folderId, 'interactive-template', entry.id);
            moved += 1;
          }
        } catch (err) {
          failed += 1;
          lastError = err;
        }
      }
      if (moved > 0) {
        if (folderId) expandTree(folderId);
        if (failed > 0) {
          const reason = lastError instanceof Error && lastError.message ? lastError.message : t('spaceActionFailed');
          setFeedback('error', reason);
        } else {
          setFeedback('success', t('bulkMovedTo').replace('{folder}', targetName).replace('{n}', String(moved)));
        }
        clearSelection();
        folderFilesRefreshKey.value += 1;
        refreshFolderFileCounts();
        await load({ showLoading: false });
      } else if (failed > 0) {
        const reason = lastError instanceof Error && lastError.message ? lastError.message : t('spaceActionFailed');
        setFeedback('error', reason);
      }
    };

    const onDropGroupToAlbum = async (targetSpaceId: string, payload: GroupDragPayload) => {
      if (!targetSpaceId || !payload.items.length) return;
      let added = 0;
      const folderIds = new Set<string>();
      const fileIds: string[] = [];
      for (const entry of payload.items) {
        if (entry.kind === 'folder' || entry.key.startsWith('folder:')) {
          const fId = entry.id || entry.key.replace(/^folder:/, '');
          if (fId) folderIds.add(fId);
        } else if (entry.kind === 'drive-file' || entry.kind === 'file' || entry.key.startsWith('drive-file:')) {
          const fileId = entry.id || entry.key.replace(/^drive-file:/, '');
          if (fileId && !entry.key.startsWith('y:')) fileIds.push(fileId);
        } else if (entry.folderId) {
          folderIds.add(entry.folderId);
        }
      }
      if (fileIds.length) {
        try {
          await spacesApi.addItems(targetSpaceId, fileIds);
          added += fileIds.length;
        } catch {
          // Ignore individual failures
        }
      }
      for (const fId of folderIds) {
        try {
          await spacesApi.addQspaceFolder(targetSpaceId, fId);
          added += 1;
        } catch {
          // Folder may already be attached or non-owned
        }
      }
      if (added > 0) {
        setFeedback('success', t('explorerAddToAlbum'));
        void loadSpaces(true);
        if (spaceId.value === targetSpaceId) {
          void spaceView.value?.reload();
        }
      }
    };

    // Multi-select Right-Click Context Menu
    const propertiesFile = ref<{ id: string; name?: string } | null>(null);
    const explorerCtxMenu = ref<{
      open: boolean;
      x: number;
      y: number;
      items: ExplorerContextMenuItem[];
      emptyArea: boolean;
      canMove: boolean;
      canDelete: boolean;
      canRename: boolean;
      canDownload: boolean;
      canProperties: boolean;
      deleteLabel: string;
      isFavorite: boolean;
    }>({
      open: false,
      x: 0,
      y: 0,
      items: [],
      emptyArea: false,
      canMove: false,
      canDelete: false,
      canRename: false,
      canDownload: true,
      canProperties: false,
      deleteLabel: '',
      isFavorite: false,
    });

    const isAlbumEligibleContextItem = (item: ExplorerContextMenuItem): boolean => {
      if (!item || item.key.startsWith('y:')) return false;
      if (
        item.kind === 'space'
        || item.kind === 'album'
        || item.key.startsWith('space:')
        || item.key.startsWith('album:')
      ) {
        return false;
      }
      if (item.kind === 'folder' || item.key.startsWith('folder:')) {
        return Boolean(item.id || item.key.replace(/^folder:/, ''));
      }
      if (item.kind === 'drive-file' || item.kind === 'file' || item.key.startsWith('drive-file:')) {
        return Boolean(item.id || item.key.replace(/^drive-file:/, ''));
      }
      return false;
    };

    const contextMenuCanAlbum = computed(() =>
      !explorerCtxMenu.value.emptyArea
      && explorerCtxMenu.value.items.some(isAlbumEligibleContextItem),
    );

    const contextMenuAlbums = computed(() => {
      const single = explorerCtxMenu.value.items.length === 1 ? explorerCtxMenu.value.items[0] : null;
      const activeIds = new Set<string>(single?.albumIds ?? single?.albums ?? []);
      return allSpaces.value
        .filter((s) => !s.unlisted && (!s.role || s.role === 'owner' || s.role === 'editor'))
        .map((s) => ({
          id: s.id,
          name: s.name,
          active: activeIds.size > 0 ? activeIds.has(s.id) : false,
        }));
    });

    const isSpaceContextItem = (item: ExplorerContextMenuItem): boolean => (
      item.kind === 'space'
      || item.kind === 'album'
      || item.key.startsWith('space:')
      || item.key.startsWith('album:')
    );

    const findSpaceForContextItem = (item: ExplorerContextMenuItem) => {
      const id = item.id || item.key.replace(/^(space:|album:)/, '');
      if (!id) return null;
      const listed = allSpaces.value.find((s) => s.id === id);
      if (listed) return listed;
      if (activeSpace.value && activeSpace.value.id === id) return activeSpace.value;
      return null;
    };

    const openContextMenuForItems = (x: number, y: number, items: ExplorerContextMenuItem[]) => {
      if (!items.length) return;
      const first = items[0]!;
      const renamableKinds = new Set([
        'folder',
        'space',
        'album',
        'canvas',
        'text-document',
        'html-document',
        'drive-file',
        'file',
        'interactive-template',
      ]);
      const singleIsSpace = items.length === 1 && isSpaceContextItem(first);
      const singleSpace = singleIsSpace ? findSpaceForContextItem(first) : null;
      const allSpacesOnly = items.every(isSpaceContextItem);
      const canRename = singleIsSpace
        ? singleSpace?.role === 'owner'
        : items.length === 1 && renamableKinds.has(first.kind || '');
      const deleteLabel = singleIsSpace && singleSpace && singleSpace.role !== 'owner'
        ? t('spaceLeave')
        : '';
      explorerCtxMenu.value = {
        open: true,
        x,
        y,
        items,
        emptyArea: false,
        canMove: items.some((i) => !isSpaceContextItem(i)),
        canDelete: true,
        canRename,
        canDownload: !allSpacesOnly,
        canProperties: items.length === 1 && (first.kind === 'drive-file' || first.kind === 'file') && Boolean(first.id),
        deleteLabel,
        isFavorite: items.every((i) => layoutPrefs.isFavorite(i.key)),
      };
    };

    const allTableRowsByKey = computed(() => {
      const map = new Map<string, ExplorerTableRow>();
      for (const list of [
        activeFolderTableRows.value,
        homeRootTableRows.value,
        recentTableRows.value,
        sharedTableRows.value,
        interactiveTableRows.value,
        publicTableRows.value,
      ]) {
        for (const row of list) map.set(row.key, row);
      }
      return map;
    });

    const resolveContextMenuItem = (key: string, fallback?: ExplorerContextMenuItem): ExplorerContextMenuItem | null => {
      const row = allTableRowsByKey.value.get(key);
      if (row) {
        return { key: row.key, id: row.id, kind: row.kind, name: row.name };
      }
      if (key.startsWith('folder:')) {
        const id = key.slice('folder:'.length);
        const f = allFolderSummaries.value.find((item) => item.id === id);
        if (f) return { key, id: f.id, kind: 'folder', name: f.name };
      }
      if (key.startsWith('space:') || key.startsWith('album:')) {
        const id = key.replace(/^(space:|album:)/, '');
        const s = allSpaces.value.find((item) => item.id === id);
        if (s) return { key, id: s.id, kind: 'space', name: s.name };
      }
      const res = (dashboardItemsByKey.value as ReadonlyMap<string, FolderItem>).get(key);
      if (res) {
        return { key, id: res.id, kind: res.type, name: res.title || t('untitled') };
      }
      const driveFile = driveFilesByKey.value.get(key)
        || folderDriveFiles.value.find((f) => `drive-file:${f.id}` === key)
        || homeRootDriveFiles.value.find((f) => `drive-file:${f.id}` === key);
      if (driveFile) {
        return { key, id: driveFile.id, kind: 'drive-file', name: driveFile.name };
      }
      const spaceItem = spaceItemsByKey.value.get(key);
      if (spaceItem) {
        return { key, id: spaceItem.id || spaceItem.key, kind: spaceItem.kind, name: spaceItem.name };
      }
      if (fallback && fallback.key === key) return fallback;
      return null;
    };

    const openContextMenuForKeys = (x: number, y: number, clickedItem: ExplorerContextMenuItem) => {
      if (!selectedKeys.value.includes(clickedItem.key)) {
        selectedKeys.value = [clickedItem.key];
        selectionAnchor = clickedItem.key;
      }
      const keys = selectedKeys.value.length ? selectedKeys.value : [clickedItem.key];
      const items = keys
        .map((k) => resolveContextMenuItem(k, clickedItem))
        .filter((item): item is ExplorerContextMenuItem => Boolean(item));
      openContextMenuForItems(x, y, items.length ? items : [clickedItem]);
    };

    const onTableRowContextMenu = (event: MouseEvent, row: ExplorerTableRow) => {
      openContextMenuForKeys(event.clientX, event.clientY, {
        key: row.key,
        id: row.id,
        kind: row.kind,
        name: row.name,
      });
    };

    const onGridItemContextMenu = (event: MouseEvent, item: { type: string; id: string; title?: string | null; name?: string | null }) => {
      const key = selectionKey(item);
      openContextMenuForKeys(event.clientX, event.clientY, {
        key,
        id: item.id,
        kind: item.type,
        name: item.title || item.name || t('untitled'),
      });
    };

    const onGridDriveFileContextMenu = (event: MouseEvent, file: DriveItem) => {
      openContextMenuForKeys(event.clientX, event.clientY, {
        key: `drive-file:${file.id}`,
        id: file.id,
        kind: 'drive-file',
        name: file.name || t('untitled'),
      });
    };

    const onGridFolderContextMenu = (event: MouseEvent, folder: { id: string; name: string }) => {
      openContextMenuForKeys(event.clientX, event.clientY, {
        key: `folder:${folder.id}`,
        id: folder.id,
        kind: 'folder',
        name: folder.name,
      });
    };

    const onSpaceTileContextMenu = (event: MouseEvent, space: { id: string; name: string }) => {
      openContextMenuForKeys(event.clientX, event.clientY, {
        key: `space:${space.id}`,
        id: space.id,
        kind: 'space',
        name: space.name,
      });
    };

    const onFavoriteTileContextMenu = (event: MouseEvent, fav: HomeFavoriteTile) => {
      openContextMenuForKeys(event.clientX, event.clientY, {
        key: fav.key,
        id: fav.id,
        kind: fav.kind,
        name: fav.name,
      });
    };

    const onEmptyAreaContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-select-key], .subfolder-card, .canvas-card, .exp-row, button, a, input, textarea, [data-explorer-context-menu]')) return;
      explorerCtxMenu.value = {
        open: true,
        x: event.clientX,
        y: event.clientY,
        items: [],
        emptyArea: true,
        canMove: false,
        canDelete: false,
        canRename: false,
        canDownload: false,
        canProperties: false,
        deleteLabel: '',
        isFavorite: false,
      };
    };

    const onDashboardMainContextMenu = (event: MouseEvent) => {
      if (!isLoggedIn) return;
      if (activeSection.value.kind !== 'home' && activeSection.value.kind !== 'folder') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-select-key], .subfolder-card, .canvas-card, .exp-row, button, a, input, textarea, [data-explorer-context-menu]')) return;
      event.preventDefault();
      onEmptyAreaContextMenu(event);
    };

    const onCtxMenuEmptyCreateFolder = () => {
      if (activeSection.value.kind === 'folder' && activeFolder.value) {
        openSubfolderModal(activeFolder.value);
      } else {
        openCreateGroupModal();
      }
    };

    const onCtxMenuEmptyAdd = () => {
      openAddDialog({ folderId: activeSection.value.kind === 'folder' ? activeFolder.value?.id : undefined });
    };

    const onCtxMenuEmptyRefresh = () => {
      void load({ showLoading: false });
      folderFilesRefreshKey.value += 1;
      refreshFolderFileCounts();
    };

    const onTreeContextMenu = (payload: TreeContextMenuPayload) => {
      const keys = payload.selectedKeys.length ? payload.selectedKeys : [payload.nodeKey];
      const items: ExplorerContextMenuItem[] = keys.map((key) => {
        const treeFileMatch = key.match(/^file:[^/]+\/([^:]+):(.+)$/);
        if (treeFileMatch) {
          const fileType = treeFileMatch[1]!;
          const fileId = treeFileMatch[2]!;
          const canonicalKey = `${fileType}:${fileId}`;
          const resolved = resolveContextMenuItem(canonicalKey);
          return resolved || {
            key: canonicalKey,
            id: fileId,
            kind: fileType,
            name: (dashboardItemsByKey.value as ReadonlyMap<string, FolderItem>).get(canonicalKey)?.title || fileId,
          };
        }
        const isSpace = key.startsWith('album:') || payload.kind === 'album';
        const isFolder = key.startsWith('folder:') || payload.kind === 'folder';
        const id = key === payload.nodeKey
          ? payload.targetId
          : key.replace(/^(folder:|album:|file:)/, '');
        return {
          key,
          id,
          kind: isSpace ? 'space' : isFolder ? 'folder' : payload.kind,
          name: allFolderSummaries.value.find((f) => f.id === id)?.name
            || allSpaces.value.find((s) => s.id === id)?.name
            || id,
        };
      });
      openContextMenuForItems(payload.event.clientX, payload.event.clientY, items);
    };

    const onCtxMenuOpen = (item: ExplorerContextMenuItem) => {
      if (item.kind === 'folder' && item.id) {
        selectFolder(item.id);
      } else if ((item.kind === 'space' || item.kind === 'album') && item.id) {
        selectDashboardSection({ kind: 'space', spaceId: item.id });
      } else if ((item.kind === 'drive-file' || item.kind === 'file') && item.id) {
        const file = activeDriveFiles.value.find((f) => f.id === item.id)
          || folderDriveFiles.value.find((f) => f.id === item.id)
          || homeRootDriveFiles.value.find((f) => f.id === item.id);
        if (file) {
          if (isDriveMedia(file)) openDriveImage(file);
          else if (isMarkdownFile(file)) openDriveMarkdown(file);
          else void downloadDriveFile(file.id, file.name);
        } else {
          void downloadDriveFile(item.id, item.name);
        }
      } else if (item.id && item.kind) {
        openSpaceResource(item.kind, item.id);
      }
    };

    const onCtxMenuShare = (items: readonly ExplorerContextMenuItem[]) => {
      const first = items[0];
      if (!first) return;
      if ((first.kind === 'space' || first.kind === 'album') && first.id) {
        void openAlbumShareById(first.id);
      } else if (first.kind === 'folder' && first.id) {
        const f = allFolderSummaries.value.find((x) => x.id === first.id);
        if (f) void openFolderShareModal(f);
      } else if ((first.kind === 'drive-file' || first.kind === 'file') && first.id) {
        const file = activeDriveFiles.value.find((f) => f.id === first.id);
        const folderId = file?.folderId || (activeSection.value.kind === 'folder' ? activeFolder.value?.id : undefined);
        const folder = folderId ? allFolderSummaries.value.find((x) => x.id === folderId) : null;
        if (folder) {
          void openFolderShareModal(folder);
        } else if (spaceId.value) {
          void openAlbumShareById(spaceId.value);
        }
      } else if (first.id && (
        first.kind === 'canvas'
        || first.kind === 'html-document'
        || first.kind === 'text-document'
        || first.kind === 'interactive-template'
      )) {
        void openResourceShareModal(first.kind, first.id);
      }
    };

    const onCtxMenuAddToAlbum = async (albumId: string | undefined, items: readonly ExplorerContextMenuItem[]) => {
      const eligible = items.filter(isAlbumEligibleContextItem);
      if (!eligible.length) return;
      let targetAlbumId = albumId;
      if (!targetAlbumId) {
        const allowed = await plansApi.mine().then((info) => info.plan?.canCreateSpaces !== false).catch(() => true);
        if (!allowed) {
          setFeedback('error', t('planErrorSpaces'));
          return;
        }
        const name = (await promptDialog({
          title: t('spaceNew'),
          placeholder: t('spaceNamePlaceholder'),
          confirmLabel: t('create'),
          cancelLabel: t('cancel'),
        }))?.trim();
        if (!name) return;
        try {
          const space = await spacesApi.create(name);
          targetAlbumId = space.id;
          await loadSpaces(true);
        } catch (error) {
          setFeedback('error', error instanceof Error && error.message ? error.message : t('spaceActionFailed'));
          return;
        }
      }
      await onDropGroupToAlbum(targetAlbumId, {
        source: 'explorer',
        items: eligible.map((i) => ({
          key: i.key,
          id: i.id || '',
          kind: i.kind || 'file',
          folderId: (i.kind === 'folder' || i.key.startsWith('folder:'))
            ? (i.id || i.key.replace(/^folder:/, ''))
            : null,
        })),
        keys: eligible.map((i) => i.key),
        count: eligible.length,
      });
    };

    const onCtxMenuToggleFavorite = (items: readonly ExplorerContextMenuItem[]) => {
      for (const item of items) {
        if (item.id && item.name && item.kind) {
          rememberedFavoriteMeta[item.key] = { id: item.id, name: item.name, kind: item.kind };
        }
        layoutPrefs.toggleFavorite(item.key);
      }
    };

    const onCtxMenuMove = (items: readonly ExplorerContextMenuItem[]) => {
      const keys = items.map((i) => i.key).filter((k) => !k.startsWith('folder:') && !k.startsWith('space:') && !k.startsWith('album:'));
      if (keys.length) {
        selectedKeys.value = keys;
        openBulkMoveModal();
      } else if (items[0]?.kind === 'folder' && items[0].id) {
        const f = allFolderSummaries.value.find((x) => x.id === items[0]!.id);
        if (f) openFolderParentModal(f);
      }
    };

    const onCtxMenuRename = async (item: ExplorerContextMenuItem) => {
      if (!item.id) return;
      if (item.kind === 'folder') {
        const f = allFolderSummaries.value.find((x) => x.id === item.id);
        if (f) openRenameFolderModal(f);
        return;
      }
      const currentName = item.name || '';
      const nextName = (await promptDialog({
        title: t('rename'),
        value: currentName,
        confirmLabel: t('save'),
        cancelLabel: t('cancel'),
      }))?.trim();
      if (!nextName || nextName === currentName) return;

      if (item.kind === 'space' || item.kind === 'album') {
        try {
          const updated = await spacesApi.rename(item.id, nextName);
          if (updated && activeSpace.value?.id === item.id) {
            activeSpace.value = updated;
          }
          await loadSpaces(true);
        } catch (err) {
          setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
        }
        return;
      }
      if (item.kind === 'canvas') {
        const updated = await runAction('rename-canvas', () => canvas.update(item.id!, { title: nextName }), 'Canvas renamed');
        if (updated) applyCanvasUpdate(updated);
        return;
      }
      if (item.kind === 'text-document') {
        await runAction('rename-text-document', () => textDocuments.update(item.id!, { title: nextName }), t('save'));
        await load({ showLoading: false });
        return;
      }
      if (item.kind === 'html-document') {
        await runAction('rename-html-document', () => htmlDocuments.update(item.id!, { title: nextName }), t('save'));
        await load({ showLoading: false });
        return;
      }
      if (item.kind === 'drive-file' || item.kind === 'file') {
        await runAction('rename-drive-file', () => driveApi.renameFile(item.id!, nextName), t('save'));
        folderFilesRefreshKey.value += 1;
        return;
      }
      if (item.kind === 'interactive-template') {
        await runAction('rename-interactive-template', () => interactiveTemplates.update(item.id!, { title: nextName }), t('save'));
        await load({ showLoading: false });
      }
    };

    const onCtxMenuDownload = (items: readonly ExplorerContextMenuItem[]) => {
      selectedKeys.value = items.map((i) => i.key);
      void bulkDownload();
    };

    const onCtxMenuProperties = (item: ExplorerContextMenuItem) => {
      if ((item.kind === 'drive-file' || item.kind === 'file') && item.id) {
        propertiesFile.value = { id: item.id, name: item.name };
      }
    };

    const onCtxMenuDelete = async (items: readonly ExplorerContextMenuItem[]) => {
      if (items.length === 1 && items[0]!.kind === 'folder' && items[0]!.id) {
        const f = allFolderSummaries.value.find((x) => x.id === items[0]!.id);
        if (f) void deleteFolder(f);
        return;
      }
      if (items.length === 1 && isSpaceContextItem(items[0]!)) {
        const targetId = items[0]!.id || items[0]!.key.replace(/^(space:|album:)/, '');
        if (!targetId) return;
        const space = findSpaceForContextItem(items[0]!);
        const spaceName = space?.name || items[0]!.name || '';
        const isOwner = !space || space.role === 'owner';
        if (isOwner) {
          const confirmed = await confirmDialog({
            title: t('spaceDeleteTitle').replace('{name}', spaceName),
            confirmLabel: t('delete'),
            cancelLabel: t('cancel'),
            danger: true,
          });
          if (!confirmed) return;
          try {
            await spacesApi.remove(targetId);
            await loadSpaces(true);
            if (spaceId.value === targetId) selectDashboardSection({ kind: 'recent' });
          } catch (err) {
            setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
          }
        } else {
          const meId = currentUser.value?.id;
          if (!meId) return;
          const confirmed = await confirmDialog({
            title: t('spaceLeaveTitle').replace('{name}', spaceName),
            confirmLabel: t('spaceLeave'),
            cancelLabel: t('cancel'),
            danger: true,
          });
          if (!confirmed) return;
          try {
            await spacesApi.removeMember(targetId, meId);
            await loadSpaces(true);
            if (spaceId.value === targetId) selectDashboardSection({ kind: 'recent' });
          } catch (err) {
            setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
          }
        }
        return;
      }
      selectedKeys.value = items.map((i) => i.key);
      void bulkDelete();
    };

    const shareSelectedGroup = () => {
      if (spaceId.value) {
        void openAlbumShareById(spaceId.value);
      } else if (activeFolder.value && selectedKeys.value.length > 0) {
        openFolderShareModal(activeFolder.value);
      }
    };

    const openAddSelectionToAlbum = () => {
      const firstAlbum = allSpaces.value[0];
      if (!firstAlbum) return;
      if (activeFolder.value) {
        void onDropGroupToAlbum(firstAlbum.id, {
          source: 'explorer',
          items: [{ key: `folder:${activeFolder.value.id}`, id: activeFolder.value.id, kind: 'folder', folderId: activeFolder.value.id }],
          keys: [`folder:${activeFolder.value.id}`],
          count: 1,
        });
      }
    };

    // Global Escape hierarchy in Files mode (DrivePhotos owns Gallery Escape)
    const onExplorerEscapeKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (activeSection.value.kind === 'gallery') return;
      if (folderModal.value.open) {
        closeFolderModal();
        event.preventDefault();
        return;
      }
      if (subfolderModal.value.open) {
        closeSubfolderModal();
        event.preventDefault();
        return;
      }
      if (explorerCtxMenu.value.open) return;
      if (
        mediaViewer.value
        || markdownViewer.value
        || yandexMove.value
        || propertiesFile.value
        || templatePickerOpen.value
        || addDialog.value.open
        || sharingAlbum.value
        || renameFolderModal.value.open
        || folderParentModal.value.open
        || descriptionModal.value.open
        || folderShareModal.value.open
        || tagsModal.value.open
        || transferModal.value.open
        || tagSheetOpen.value
        || resourceShare.open
        || (typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"], .modal-backdrop, .drive-properties-backdrop, [data-explorer-context-menu]')))
      ) {
        return;
      }
      if (openControlMenu.value) {
        openControlMenu.value = '';
        event.preventDefault();
        return;
      }
      if (openMenuCanvasId.value) {
        openMenuCanvasId.value = '';
        event.preventDefault();
        return;
      }
      if (
        typeof document !== 'undefined'
        && Boolean(document.querySelector('.card-menu, [data-space-add-menu], [data-yandex-add-menu], [data-yandex-space-menu]'))
      ) {
        return;
      }
      if (headroomBarRef.value?.handleSearchEscape?.()) {
        event.preventDefault();
        return;
      }
      if (searchQuery.value.trim() !== '' || s2TypeFilter.value !== 'all') {
        searchQuery.value = '';
        s2TypeFilter.value = 'all';
        event.preventDefault();
        return;
      }
      if (selectedKeys.value.length > 0 || sidebarRef.value?.hasTreeSelection?.()) {
        clearSelection();
        sidebarRef.value?.clearTreeSelection?.();
        event.preventDefault();
      }
    };
    onMounted(() => window.addEventListener('keydown', onExplorerEscapeKeydown));
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onExplorerEscapeKeydown);
    });

    // Gallery mode state & handlers
    const galleryViewRef = ref<InstanceType<typeof DrivePhotos> | null>(null);
    const galleryRefreshKey = ref(0);
    const refreshGalleryView = () => {
      const view = galleryViewRef.value as { refresh?: () => void } | null;
      if (typeof view?.refresh === 'function') {
        view.refresh();
      } else if (activeSection.value.kind === 'gallery') {
        galleryRefreshKey.value += 1;
      }
    };
    const galleryHighlightFolderId = ref<string | null>(null);
    const galleryHighlightFileId = ref<string | null>(null);
    const gallerySidebarCounts = ref<GallerySidebarCounts>({});

    const galleryAlbumMembersCount = computed<number | null>(() => {
      if (!galleryAlbumId.value) return null;
      const found = allSpaces.value.find((s) => s.id === galleryAlbumId.value);
      return found ? found.memberCount + 1 : null;
    });

    const galleryStorageFolders = computed<GalleryStorageFolder[]>(() =>
      allResourceFolders.value.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId ?? null,
        role: f.role,
      })),
    );

    const onGallerySelectSection = (section: GallerySection | 'trash') => {
      gallerySection.value = section;
      galleryAlbumId.value = null;
      galleryFolderId.value = null;
      galleryFocusedPhoto.value = null;
    };

    const onGalleryOpenTrash = () => {
      gallerySection.value = 'trash';
      galleryAlbumId.value = null;
      galleryFolderId.value = null;
      galleryFocusedPhoto.value = null;
    };

    const onGallerySelectAlbum = (albumId: string) => {
      galleryAlbumId.value = albumId;
      galleryFolderId.value = null;
      gallerySection.value = 'library';
      galleryFocusedPhoto.value = null;
    };

    const onGalleryClearAlbum = () => {
      galleryAlbumId.value = null;
    };

    const onGallerySharePhotos = async (fileIds: string[]) => {
      if (!fileIds.length) return;
      try {
        const dateLabel = new Date().toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
          day: 'numeric',
          month: 'short',
        });
        const prefix = locale.value === 'ru' ? 'Общие фото' : 'Shared photos';
        const created = await spacesApi.create(`${prefix} (${dateLabel})`, { unlisted: true });
        await spacesApi.addItems(created.id, fileIds);
        const details = await spacesApi.get(created.id).catch(() => created);
        sharingAlbum.value = { ...details, unlisted: true };
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
      }
    };

    const onGallerySelectFolder = (folderId: string) => {
      galleryFolderId.value = folderId;
      galleryAlbumId.value = null;
      gallerySection.value = 'library';
      galleryFocusedPhoto.value = null;
    };

    const onGalleryShowFolder = (folderId: string, fileId: string) => {
      gallerySection.value = 'library';
      galleryAlbumId.value = null;
      galleryFolderId.value = folderId;
      galleryHighlightFolderId.value = folderId === 'root' ? null : folderId;
      galleryHighlightFileId.value = fileId || null;
      if (fileId) {
        void nextTick(() => {
          (galleryViewRef.value as { focusFile?: (id: string) => void } | null)?.focusFile?.(fileId);
        });
      }
    };

    const onGallerySelectFile = (fileId: string, folderId: string | null) => {
      if (folderId) galleryFolderId.value = folderId;
      galleryHighlightFolderId.value = folderId;
      galleryHighlightFileId.value = fileId;
      void nextTick(() => {
        (galleryViewRef.value as { focusFile?: (id: string) => void } | null)?.focusFile?.(fileId);
      });
    };

    const onGalleryFocusPhoto = (item: PhotoFeedItem) => {
      galleryFocusedPhoto.value = item;
      galleryHighlightFolderId.value = item.folderId ?? null;
      galleryHighlightFileId.value = item.fileId;
    };

    const onGalleryDropFavorites = async (fileIds: string[]) => {
      for (const fileId of fileIds) {
        try { await photosApi.edit(fileId, { favorite: true }); } catch { /* continue */ }
      }
      if (fileIds.length) setFeedback('success', `${t('explorerAddToFavorites')} (${fileIds.length})`);
    };

    const onGalleryDropAlbum = async (albumId: string, fileIds: string[]) => {
      if (!fileIds.length) return;
      try {
        await spacesApi.addItems(albumId, fileIds);
        setFeedback('success', `${t('explorerAddToAlbum')} (${fileIds.length})`);
        void loadSpaces(true);
      } catch (err) {
        setFeedback('error', err instanceof Error && err.message ? err.message : t('spaceActionFailed'));
      }
    };

    const onGalleryDropFolder = async (folderId: string, fileIds: string[]) => {
      if (!fileIds.length) return;
      let moved = 0;
      for (const fileId of fileIds) {
        try { await driveApi.moveFile(fileId, folderId); moved += 1; } catch { /* continue */ }
      }
      if (moved > 0) setFeedback('success', t('bulkMovedTo').replace('{folder}', '').replace('{n}', String(moved)));
    };

    const onAppClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-account-menu-trigger]')) closeControlMenusForAccount();
    };

    const onAppKeydownCapture = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'ArrowDown' && target?.closest('[data-account-menu-trigger]')) {
        closeControlMenusForAccount();
      }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    // The compact mobile list row uses a relative timestamp ("12 min ago",
    // "Yesterday · 18:42") instead of formatDate's always-absolute one.
    const formatCardDateMobile = (d: string) => formatRelativeDate(d, locale.value);


    const folderSearchPlaceholder = computed(() => {
      const kind = activeSection.value.kind;
      if (kind === 'folder' && activeFolder.value) {
        return `${t('searchInFolder')} ${activeFolder.value.name}…`;
      }
      if (kind === 'home') {
        return `${t('searchInFolder')} home…`;
      }
      if (kind === 'space' && activeSpace.value) {
        return `${t('searchInFolder')} ${activeSpace.value.name}…`;
      }
      if (kind === 'yandex') {
        return `${t('searchInFolder')} ${locale.value === 'ru' ? 'Яндекс Диске' : 'Yandex Disk'}…`;
      }
      if (kind === 'shared') {
        return `${t('searchInFolder')} shared…`;
      }
      if (kind === 'public') {
        return `${t('searchInFolder')} public…`;
      }
      if (kind === 'recent') {
        return locale.value === 'ru' ? 'Поиск на Главной…' : 'Search Home…';
      }
      return locale.value === 'ru' ? 'Поиск…' : 'Search…';
    });

    const renamingId = ref('');

    const startRename = (id: string) => {
      renamingId.value = id;
    };

    const finishRename = async (e: Event, c: CanvasRecord) => {
      const newTitle = (e.target as HTMLInputElement).value.trim();
      renamingId.value = '';
      if (newTitle && newTitle !== c.title) {
        const updated = await runAction('rename-canvas', () => canvas.update(c.id, { title: newTitle }), 'Canvas renamed');
        if (!updated) return;
        applyCanvasUpdate(updated);
      }
    };

    /**
     * Recents follow you between devices: a resource opened on the web shows
     * up here as soon as this dashboard is looked at again - the tab regains
     * focus, or the Android app comes back to the foreground (the dashboard
     * stays mounted in the background, so mounting alone is not enough).
     */
    const onDashboardVisible = () => {
      if (document.visibilityState === 'visible') void loadRecentResources();
    };
    let appStateListener: PluginListenerHandle | null = null;
    let dashboardUnmounted = false;

    const restoreDashboardReturnOrigin = () => {
      if (!isLoggedIn) return;
      const origin = consumeDashboardReturnOrigin();
      if (!origin) return;
      if (origin.mode === 'media' || origin.section.kind === 'gallery') {
        if (origin.gallerySection) {
          gallerySection.value = origin.gallerySection as GallerySection | 'trash';
        }
        galleryAlbumId.value = origin.galleryAlbumId ?? null;
        galleryFolderId.value = origin.galleryFolderId ?? null;
        selectDashboardSection({ kind: 'gallery' });
        return;
      }
      selectDashboardSection(origin.section);
    };

    onMounted(() => {
      void loadRecentResources();
      // The role is stored at sign-in; one given or taken since shows now.
      void refreshCurrentUserRole().then((changed) => { if (changed) admin.value = isAdmin(); });
      document.addEventListener('visibilitychange', onDashboardVisible);
      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void loadRecentResources();
        }).then((handle) => {
          if (dashboardUnmounted) void handle.remove();
          else appStateListener = handle;
        });
      }
      const cached = restoreDashboardCache();
      // Even a fresh native snapshot is refreshed quietly, so moving a
      // document between a dashboard visit and a return can never hide it.
      void load({ showLoading: !cached.found });
      const handledYandexReturn = takeYandexReturn();
      const handledAddressSection = takeAddressSection();
      if (handledYandexReturn || handledAddressSection) {
        clearDashboardReturnOrigin();
      } else {
        restoreDashboardReturnOrigin();
      }
      window.addEventListener('resize', refreshOverflowIndicators);
      refreshOverflowIndicators();
    });
    onBeforeUnmount(() => {
      dashboardUnmounted = true;
      document.removeEventListener('visibilitychange', onDashboardVisible);
      void appStateListener?.remove();
      appStateListener = null;
      window.removeEventListener('resize', refreshOverflowIndicators);
    });

    const modalContext = {
      t,
      isBusy,
      actionLabel,
      MAX_DESCRIPTION_LENGTH,
      tagSheetOpen,
      closeTagSheet,
      allTagNames,
      tagSheetDraft,
      toggleDraftTag,
      resetTagSheetDraft,
      applyTagSheet,
      folderModal,
      closeFolderModal,
      folderModalMoves,
      folderOptions,
      canSaveFolderModal,
      saveFolderModal,
      subfolderModal,
      closeSubfolderModal,
      saveSubfolderModal,
      folderParentModal,
      folderParentOptions,
      closeFolderParentModal,
      saveFolderParentModal,
      descriptionModal,
      closeDescriptionModal,
      saveDescriptionModal,
      renameFolderModal,
      closeRenameFolderModal,
      saveRenameFolderModal,
      folderShareModal,
      closeFolderShareModal,
      shareFolder,
      revokeFolderAccess,
      tagsModal,
      tagSuggestions,
      addSuggestedTag,
      tagColors,
      removeTag,
      addTag,
      closeTagsModal,
      saveTagsModal,
      transferModal,
      closeTransferModal,
      saveTransferModal,
    };

    return {
      modalContext,
      yandexView,
      yandexPicker,
      yandexRefreshKey,
      yandexPath,
      yandexMove,
      yandexFiles,
      openYandexPath,
      openYandexMove,
      confirmYandexMove,
      downloadYandexFile,
      openYandexSidebarFile,
      openYandexImage,
      openDriveImage,
      openYandexMarkdown,
      openDriveMarkdown,
      openSpaceMarkdown,
      mediaViewer,
      markdownViewer,
      folderDrivePreviews,
      spaceView,
      spaceId,
      spaceFeedItems,
      activeSpace,
      canBulkMove,
      createSpace,
      openSpaceResource,
      leaveSpaceSection,
      onTrashRestored,
      hideFromPublic,
      currentUser,
      uploadToYandex,
      setFeedback,
      selectedSize,
      formatFileSize,
      admin,
      t,
      isLoggedIn,
      loading,
      isRefreshing,
      recentResources,
      visibleRecent,
      recentTotal,
      recentShowAllAvailable,
      recentExpanded,
      toggleRecentExpanded,
      recentViewMode,
      setRecentViewMode,
      openRecentResource,
      openSidebarFile,
      rememberRecentResource,
      formatRecentOpenedAt,
      tagFilterList,
      activeFolderBody,
      hasTagOverflow,
      dashboardMain,
      isAndroidApp,
      isNativeDashboard,
      dashboardPullDistance,
      DASHBOARD_PULL_THRESHOLD,
      onDashboardPullStart,
      onDashboardPullMove,
      onDashboardPullEnd,
      resetDashboardPull,
      sharedFiltered,
      publicFiltered,
      publicAnyOwner,
      publicOwnerFilter,
      PUBLIC_OWNER_FILTERS,
      PUBLIC_OWNER_FILTER_LABELS,
      allTagNames,
      isTagSelected,
      toggleSelectedTag,
      clearSelectedTags,
      tagFilterMobileEl,
      tagMeasureEl,
      tagMeasureAllEl,
      tagMeasureMoreEl,
      tagMeasureClearEl,
      tagsInPriorityOrder,
      visibleMobileTags,
      mobileTagOverflowCount,
      recomputeMobileTagFit,
      tagSheetOpen,
      tagSheetDraft,
      openTagSheet,
      closeTagSheet,
      toggleDraftTag,
      resetTagSheetDraft,
      applyTagSheet,
      toggleMobileSortMenu,
      selectSortMode,
      onExplorerTableSort,
      folderSearchPlaceholder,
      formatCardDateMobile,
      folderOptions,
      folderNames,
      searchQuery,
      selectedTags,
      contentFilter,
      contentTypes,
      typePasses,
      toggleToolbarMenu,
      clearTypeAndTagFilters,
      sortMode,
      sortSyncSeq,
      isMobileHeadroom,
      feedback,
      isBusy,
      canSaveFolderModal,
      actionLabel,
      openMenuCanvasId,
      openControlMenu,
      closeControlMenusForAccount,
      activeSection,
      locale,
      sidebarWidthState,
      sidebarCollapsed,
      sidebarMode,
      mobileTabActivity,
      showSidebarExpand,
      onExpandSidebar,
      onSidebarCollapseButton,
      onSwitchSidebarMode,
      devicesOnlineCount,
      devicesPaired,
      s2ScopeMode,
      s2TypeFilter,
      s2ScopeLabel,
      s2SearchFolders,
      s2SearchAlbums,
      s2SearchItems,
      onSearchSelectFolder,
      onSearchSelectAlbum,
      onSearchOpenItem,
      onSearchSelectTag,
      showScopedSearchEverywhereCta,
      showFolderFab,
      addDialogTargetFolderName,
      explorerViewMode,
      setExplorerViewMode,
      albumViewMode,
      setAlbumViewMode,
      sidebarRef,
      headroomBarRef,
      headroomHidden,
      headroomElevated,
      onDashboardMainScroll,
      headroomViewToggleMode,
      headroomSpaceMembersTotal,
      headroomSpaceCountLabel,
      headroomSpaceCountPrefix,
      activeSpaceFolderId,
      activeSpaceYandexSourceId,
      activeSpaceYandexSubpath,
      onNavigateSpaceFolder,
      onSelectActivity,
      onToggleMobileDrawer,
      onSidebarCollapsedChange,
      favoriteTiles,
      openFavoriteTile,
      homeRootSubfolders,
      homeRootItems,
      homeRootDriveFiles,
      homeRootFileCount,
      homeRootEmpty,
      homeRootTableRows,
      activeFolderTableRows,
      recentTableRows,
      sharedTableRows,
      interactiveTableRows,
      publicTableRows,
      openExplorerTableRow,
      sharingAlbum,
      openAlbumShareById,
      onSharingAlbumChanged,
      onCloseSharingAlbum,
      resourceShare,
      resourceShareSlugPrefix,
      resourceShareUrl,
      openResourceShareModal,
      closeResourceShareModal,
      copyResourceShareLink,
      setResourceShareVisibility,
      setResourceShareAllowPublicEdit,
      setResourceShareListedInPublic,
      saveResourceSharePassword,
      saveResourceShareSlug,
      inviteResourceShare,
      revokeResourceShare,
      onDropGroupToFolder,
      onDropGroupToAlbum,
      onDropExternalFilesToFolder,
      buildGroupDragEntriesForKeys,
      propertiesFile,
      explorerCtxMenu,
      contextMenuAlbums,
      contextMenuCanAlbum,
      onTableRowContextMenu,
      onGridItemContextMenu,
      onGridDriveFileContextMenu,
      onGridFolderContextMenu,
      onSpaceTileContextMenu,
      onFavoriteTileContextMenu,
      onEmptyAreaContextMenu,
      onDashboardMainContextMenu,
      onCtxMenuEmptyCreateFolder,
      onCtxMenuEmptyAdd,
      onCtxMenuEmptyRefresh,
      onTreeContextMenu,
      onCtxMenuOpen,
      onCtxMenuShare,
      onCtxMenuAddToAlbum,
      onCtxMenuToggleFavorite,
      onCtxMenuMove,
      onCtxMenuRename,
      onCtxMenuDownload,
      onCtxMenuProperties,
      onCtxMenuDelete,
      shareSelectedGroup,
      openAddSelectionToAlbum,
      galleryViewRef,
      galleryRefreshKey,
      gallerySection,
      galleryAlbumId,
      galleryAlbumMembersCount,
      gallerySidebarCounts,
      galleryFolderId,
      galleryHighlightFolderId,
      galleryHighlightFileId,
      galleryStorageFolders,
      onGallerySelectSection,
      onGalleryOpenTrash,
      onGallerySelectAlbum,
      onGalleryClearAlbum,
      onGallerySharePhotos,
      onGallerySelectFolder,
      onGalleryShowFolder,
      onGallerySelectFile,
      onGalleryFocusPhoto,
      onGalleryDropFavorites,
      onGalleryDropAlbum,
      onGalleryDropFolder,
      onDashboardMainPointerDown,
      mobileSidebarOpen,
      sidebarFolders,
      sidebarAllFolders,
      selectDashboardSection,
      onSidebarSelect,
      toggleSidebarWidth,
      openMobileSidebar,
      closeMobileSidebar,
      onAppClickCapture,
      onAppKeydownCapture,
      draggingResourceId,
      draggingResourceType,
      dragTargetFolder,
      draggingResourceFolderId,
      folderDragId,
      folderDragOverId,
      tagColors,
      tagSuggestions,
      isOwnedResource,
      folderModal,
      renameFolderModal,
      folderShareModal,
      tagsModal,
      transferModal,
      folderSummaries,
      activeFolder,
      selectedFolderId,
      activeFolderFileCount,
      incomingRequests,
      createCanvas,
      createHtmlDocument,
      createTextDocument,
      createInteractiveTemplate,
      importCharacter,
      interactiveTemplateTypeLabel,
      templatePickerOpen,
      openInteractiveTemplatePicker,
      closeInteractiveTemplatePicker,
      interactiveTemplateItems,
      visibleInteractiveTemplateItems,
      openInteractiveTemplate,
      deleteInteractiveTemplate,
      load,
      openCreateGroupModal,
      openMoveFolderModal,
      isHomeFeed,
      feedItems,
      feedLimit,
      feedColumns,
      dashboardShell,
      navDirection,
      uploads,
      uploadPanelOpen,
      uploadSummary,
      clearFinishedUploads,
      cancelUpload,
      isExternalDraggingOver,
      externalDropLabel,
      onExternalDragEnter,
      onExternalDragOver,
      onExternalDragLeave,
      onExternalDrop,
      folderDriveFiles,
      bulkDeleteCount,
      addDialog,
      openAddDialog,
      closeAddDialog,
      onAddCreate,
      onAddCreateTemplate,
      onAddImportCharacter,
      onAddCreateFolder,
      onAddCreateAlbum,
      onAddImport,
      folderFilesRefreshKey,
      journalActive,
      transferStatusText,
      transferStatusPercent,
      marquee,
      startMarquee,
      recentRefreshFailed,
      recentResourceHistory,
      retryRecent,
      folderModalMoves,
      selectedKeys,
      isSelected,
      selectionKey,
      bulkDeletable,
      allOnScreenSelected,
      clearSelection,
      toggleSelected,
      selectAllOnScreen,
      onSelectionPointerDown,
      onSelectionPointerMove,
      cancelLongPress,
      onSelectionClickCapture,
      onSelectionContextMenu,
      openBulkMoveModal,
      bulkDownload,
      downloadStatus,
      bulkDelete,
      publicOwnerFilterEl,
      openAddFromTile,
      activeFolderEmpty,
      isFeedSectionExpanded,
      toggleFeedSectionExpanded,
      resetFilters,
      hasActiveFilter,
      feedNavSections,
      allSpaces,
      spaceTiles,
      yandexStatus,
      yandexRootCount,
      yandexAccountLabel,
      showYandexSpaceTile,
      activeFeedSection,
      scrollToFeedSection,
      newItemFolderId,
      newItemFolderOptions,
      folderParentModal,
      folderParentOptions,
      openFolderParentModal,
      closeFolderParentModal,
      saveFolderParentModal,
      recentFolderPath,
      cardFolderPath,
      folderPathById,
      goToParentFolder,
      openMoveHtmlFolderModal,
      openMoveInteractiveTemplateFolderModal,
      openMoveResourceFolderModal,
      expandedTreeIds,
      isTreeExpanded,
      toggleTreeExpanded,
      activeSubfolders,
      recentFolderTiles,
      restoreSelectedFolder,
      subfolderModal,
      openSubfolderModal,
      closeSubfolderModal,
      saveSubfolderModal,
      descriptionModal,
      cardMenuStyle,
      onFolderBodyScroll,
      openDescriptionModal,
      closeDescriptionModal,
      saveDescriptionModal,
      MAX_DESCRIPTION_LENGTH,
      openMoveTextDocumentFolderModal,
      saveFolderModal,
      closeFolderModal,
      startCanvasDrag,
      startResourceMouseDrag,
      startResourceTouchDrag,
      endResourceDrag,
      onFolderDragLeave,
      onFolderDragStart,
      onFolderDragEnd,
      onFolderDragEnter,
      onFolderDragOverEvent,
      onFolderDrop,
      onSidebarFolderDragStart,
      onSidebarFolderDragEnter,
      onSidebarFolderDragOver,
      onSidebarFolderDragLeave,
      onSidebarFolderDrop,
      dropResourceToFolder,
      canDropToFolder,
      openRenameFolderModal,
      closeRenameFolderModal,
      saveRenameFolderModal,
      deleteFolder,
      openFolderShareModal,
      closeFolderShareModal,
      shareFolder,
      revokeFolderAccess,
      deleteHtmlDocument,
      deleteTextDocument,
      openHtmlDocument,
      openHtmlDocumentFromCard,
      openTextDocument,
      openTextDocumentFromCard,
      openTagsModal,
      closeTagsModal,
      addTag,
      addSuggestedTag,
      removeTag,
      saveTagsModal,
      openTransferModal,
      closeTransferModal,
      saveTransferModal,
      toggleFolderOpen,
      isFolderOpen,
      selectFolder,
      isTechnicalFolder,
      toggleCardMenu,
      resourceActions,
      handleResourceAction,
      closeCardMenu,
      toggleFolderMenu,
      openCanvas,
      openCanvasFromCard,
      duplicateCanvas,
      duplicateHtmlDocument,
      duplicateTextDocument,
      deleteCanvas,
      togglePinned,
      formatDate,
      renamingId,
      startRename,
      finishRename,
      resolveAccessRequest,
    };
  },
});
</script>

<style scoped>
.explorer-sel-badge {
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
  flex: none;
}

.headroom-space-filter-btn {
  position: relative;
}
.headroom-space-filter-btn.active {
  border-color: var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
}

.headroom-members-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
  color: var(--ui-text-secondary, var(--ui-text));
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.headroom-members-pill:hover,
.headroom-members-pill:focus-visible {
  background: var(--ui-glass-btn-hover, var(--ui-surface-subtle));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  color: var(--ui-glass-accent-text, var(--color-brands));
  outline: none;
}

.headroom-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
}

.headroom-actions-trigger {
  font-size: 16px;
  line-height: 1;
}

.headroom-action-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 196px;
}

@media (max-width: 960px) {
  .headroom-members-pill {
    padding: 0 8px;
  }
  .headroom-members-pill .headroom-members-prefix {
    display: none;
  }
}

@media (max-width: 768px) {
  .headroom-share-btn span {
    display: none;
  }
}
</style>
