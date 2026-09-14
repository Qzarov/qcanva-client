<template>
  <div
    class="app-layout"
    @click.capture="onAppClickCapture"
    @keydown.capture="onAppKeydownCapture"
    @click="closeCardMenu"
  >
    <div
      class="dashboard-app-shell"
      :class="{
        'sidebar-collapsed': isLoggedIn && sidebarWidthState === 'collapsed',
        'dashboard-app-shell-public': !isLoggedIn,
      }"
    >
      <DashboardSidebar
        v-if="isLoggedIn"
        :active-section="activeSection"
        :width-state="sidebarWidthState"
        :mobile-open="mobileSidebarOpen"
        :folders="sidebarFolders"
        @select="selectDashboardSection"
        @toggle-width="toggleSidebarWidth"
        @close-mobile="closeMobileSidebar"
        @create-folder="openCreateGroupModal"
        @toggle-folder="toggleTreeExpanded"
        @folder-drag-start="onSidebarFolderDragStart"
        @folder-drag-end="onFolderDragEnd"
        @folder-drag-enter="onSidebarFolderDragEnter"
        @folder-drag-over="onSidebarFolderDragOver"
        @folder-drag-leave="onSidebarFolderDragLeave"
        @folder-drop="onSidebarFolderDrop"
      />
      <div class="dashboard-central-shell">
    <header v-if="!isLoggedIn" class="app-header">
      <div class="app-header-inner">
        <div class="dashboard-brand">
          <img src="/qcanva-logo.png" alt="QCanva" />
          <div>
            <h1>QCanva</h1>
            <p v-if="!isLoggedIn" class="dash-subtitle">{{ t('publicResources') }}</p>
          </div>
        </div>
        <div class="header-user-slot">
          <template v-if="!isLoggedIn">
            <LanguageToggle />
            <router-link to="/login" class="btn-ghost">{{ t('login') }}</router-link>
            <router-link to="/register" class="btn-primary">{{ t('register') }}</router-link>
          </template>
        </div>
      </div>
    </header>
    <header v-else class="app-header dashboard-auth-header">
      <div class="app-header-inner">
        <button
          type="button"
          class="btn-ghost btn-sm dashboard-mobile-sidebar-open"
          :aria-label="t('openNavigation')"
          data-mobile-sidebar-open
          @click.stop="openMobileSidebar"
        ><Menu :size="20" aria-hidden="true" /></button>
      </div>
    </header>

    <main
      ref="dashboardMain"
      class="app-main dashboard"
      @touchstart.passive="onDashboardPullStart"
      @touchmove="onDashboardPullMove"
      @touchend="onDashboardPullEnd"
      @touchcancel="resetDashboardPull"
    >
    <div class="dashboard-shell">
    <section
      v-if="isLoggedIn && activeSection.kind === 'recent'"
      class="resource-control-panel"
    >
      <div class="dash-actions-secondary">
        <button class="btn-ghost" @click.stop="openTagManager">
          <Tags class="menu-icon" :size="17" aria-hidden="true" />
          <span>{{ t('manageTags') }}</span>
        </button>
        <button class="btn-ghost" @click.stop="importFile()">
          <Upload class="menu-icon" :size="17" aria-hidden="true" />
          <span>{{ t('import') }}</span>
        </button>
        <router-link v-if="admin" to="/admin" class="btn-ghost">
          <ShieldCheck class="menu-icon" :size="17" aria-hidden="true" />
          <span>{{ t('admin') }}</span>
        </router-link>
      </div>
    </section>
    <input type="file" ref="fileInput" accept=".canvas,.json,.html,.htm,text/html" style="display:none" @change="onFileSelected" />
    <div class="dash-toolbar">
      <div class="control-menu dashboard-new-menu">
            <button class="btn-primary" @click.stop="toggleNewMenu">
              <Plus class="menu-icon" :size="17" aria-hidden="true" />
              <span>{{ t('new') }}</span>
            </button>
            <div v-if="openControlMenu === 'new'" class="mobile-action-popover control-popover" @click.stop>
              <button class="card-menu-item" @click="createCanvas">
                <FilePlus2 class="menu-icon" :size="17" aria-hidden="true" />
                <span>{{ t('newCanvas') }}</span>
              </button>
              <button class="card-menu-item" @click="createHtmlDocument">
                <FileCode2 class="menu-icon" :size="17" aria-hidden="true" />
                <span>{{ t('htmlDocument') }}</span>
              </button>
              <button class="card-menu-item" @click="createTextDocument">
                <FileText class="menu-icon" :size="17" aria-hidden="true" />
                <span>{{ t('document') }}</span>
              </button>
              <button class="card-menu-item" @click="openInteractiveTemplatePicker">
                <LayoutTemplate class="menu-icon" :size="17" aria-hidden="true" />
                <span>{{ t('interactiveTemplate') }}</span>
              </button>
              <button class="card-menu-item" @click="openCreateGroupModal">
                <FolderPlus class="menu-icon" :size="17" aria-hidden="true" />
                <span>{{ t('group') }}</span>
              </button>
            </div>
          </div>
      <input v-model.trim="searchQuery" class="dash-search" :placeholder="t('search')" />
      <select v-model="sortMode" class="dash-sort-select">
        <option value="updated-desc">{{ t('newest') }}</option>
        <option value="updated-asc">{{ t('oldest') }}</option>
        <option value="title-asc">{{ t('titleAsc') }}</option>
        <option value="title-desc">{{ t('titleDesc') }}</option>
      </select>
      <div class="content-type-tabs">
        <button :class="{ active: contentFilter === 'all' }" @click.stop="contentFilter = 'all'">{{ t('all') }}</button>
        <button :class="{ active: contentFilter === 'canvas' }" @click.stop="contentFilter = 'canvas'">{{ t('canvas') }}</button>
        <button :class="{ active: contentFilter === 'html-document' }" @click.stop="contentFilter = 'html-document'">HTML</button>
        <button :class="{ active: contentFilter === 'text-document' }" @click.stop="contentFilter = 'text-document'">{{ t('docs') }}</button>
      </div>
      <div v-if="allTagNames.length" ref="tagFilterList" class="tag-filter-list">
        <button class="tag-filter" :class="{ active: selectedTag === '' }" @click.stop="selectedTag = ''">{{ t('all') }}</button>
        <button
          v-for="tag in allTagNames"
          :key="tag"
          class="tag-filter"
          :class="{ active: selectedTag === tag }"
          @click.stop="selectedTag = tag"
        >#{{ tag }}</button>
        <span v-if="hasTagOverflow" class="tag-filter-scroll-hint" aria-hidden="true">›</span>
      </div>
    </div>

    <div v-if="isRefreshing && !loading" class="dashboard-refresh-status" role="status" aria-live="polite">
      <span class="dashboard-refresh-spinner" aria-hidden="true"></span>
      <span>{{ t('updatingList') }}</span>
    </div>
    <section
      v-if="isLoggedIn && activeSection.kind === 'recent'"
      class="dash-section dashboard-recents"
      data-dashboard-view="recent"
    >
      <div class="dash-section-head">
        <h2>{{ t('recents') }}</h2>
        <div class="dashboard-recent-view-toggle" role="group" :aria-label="t('recentResources')">
          <button
            type="button"
            :class="{ active: recentViewMode === 'grid' }"
            :aria-label="t('gridView')"
            :title="t('gridView')"
            :aria-pressed="recentViewMode === 'grid'"
            data-recent-view="grid"
            @click="setRecentViewMode('grid')"
          ><LayoutGridIcon :size="17" aria-hidden="true" /></button>
          <button
            type="button"
            :class="{ active: recentViewMode === 'list' }"
            :aria-label="t('listView')"
            :title="t('listView')"
            :aria-pressed="recentViewMode === 'list'"
            data-recent-view="list"
            @click="setRecentViewMode('list')"
          ><ListIcon :size="17" aria-hidden="true" /></button>
        </div>
      </div>
      <div
        v-if="recentResources.length"
        class="dashboard-recents-layout"
        :class="recentViewMode === 'grid' ? 'dashboard-recents-grid' : 'dashboard-recents-list'"
        :aria-label="t('recentResources')"
        data-recent-layout
      >
        <button v-for="item in recentResources" :key="`${item.type}-${item.id}`" class="dashboard-recent-card" type="button" @click="openRecentResource(item)">
          <span class="resource-title-icon" :class="recentResourceIconClass(item.type)" :data-resource-icon="item.type" aria-hidden="true"></span>
          <span class="dashboard-recent-title">{{ item.title || t('untitled') }}</span>
          <span class="dashboard-recent-meta">{{ recentResourceTypeLabel(item.type) }} · {{ formatRecentOpenedAt(item.openedAt) }}</span>
        </button>
      </div>
      <div v-else class="dash-empty dashboard-recents-empty">{{ t('noRecentResources') }}</div>

      <div v-if="recentFolderTiles.length" class="dash-section-head dashboard-recent-folders-head">
        <h2>{{ t('folders') }}</h2>
      </div>
      <div v-if="recentFolderTiles.length" class="dash-grid subfolder-grid" data-recent-folders>
        <button
          v-for="folder in recentFolderTiles"
          :key="'recent-folder-' + folder.id"
          type="button"
          class="subfolder-card"
          :data-recent-folder-tile="folder.id"
          @click="selectFolder(folder.id)"
        >
          <span class="subfolder-card-icon" aria-hidden="true">▤</span>
          <span class="subfolder-card-name">{{ folder.name }}</span>
          <span class="subfolder-card-count">{{ folder.count || t('emptyFolder') }}</span>
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
      <span>{{ isRefreshing ? t('updatingList') : dashboardPullDistance >= DASHBOARD_PULL_THRESHOLD ? 'Отпустите, чтобы обновить' : 'Потяните, чтобы обновить' }}</span>
    </div>

    <div v-if="feedback.message" class="dashboard-toast" :class="`dashboard-toast-${feedback.type}`">
      {{ feedback.message }}
    </div>

    <div v-if="loading" class="dash-loading">{{ t('loading') }}</div>

    <template v-else>
      <div v-if="isLoggedIn && activeSection.kind === 'recent' && incomingRequests.length" class="dash-section access-requests-section">
        <div class="dash-section-head">
          <h2>{{ t('accessRequests') }}</h2>
          <button class="btn-ghost btn-sm" @click.stop="load()" :disabled="isBusy">{{ t('refresh') }}</button>
        </div>
        <div class="access-request-list">
          <div v-for="request in incomingRequests" :key="request.id" class="access-request-row">
            <div>
              <div class="access-request-title">{{ request.resourceTitle || request.resourceId }}</div>
              <div class="access-request-meta">
                {{ request.requesterEmail || request.requesterName || request.requesterId }} asks for {{ request.requestedRole }} on {{ request.resourceType === 'canvas' ? 'canvas' : request.resourceType === 'text-document' ? 'document' : 'HTML' }}
              </div>
            </div>
            <div class="access-request-actions">
              <button class="btn-ghost btn-sm" :disabled="isBusy" @click.stop="resolveAccessRequest(request.id, 'declined')">{{ t('decline') }}</button>
              <button class="btn-primary btn-sm" :disabled="isBusy" @click.stop="resolveAccessRequest(request.id, 'approved')">{{ t('approve') }}</button>
            </div>
          </div>
        </div>
      </div>

      <section
        v-if="isLoggedIn && activeSection.kind === 'folder' && activeFolder"
        class="dashboard-folder-content"
        data-dashboard-view="folder"
      >
          <div
            :key="activeFolder.id"
            class="folder-manager-row"
          >
              <div class="folder-manager-top">
              <div class="folder-manager-main">
                <button
                  type="button"
                  class="folder-back-button"
                  :title="t('back')"
                  :aria-label="t('back')"
                  data-folder-back-button
                  @click.stop="activeFolder.parentId ? selectFolder(activeFolder.parentId) : selectDashboardSection({ kind: 'recent' })"
                ><ArrowLeft :size="16" aria-hidden="true" /></button>
                <span class="folder-manager-title">
                  <span class="folder-manager-name">{{ activeFolder.name }}</span>
                  <span class="folder-manager-count">{{ activeFolder.canvasCount }} {{ t('canvas').toLowerCase() }} / {{ activeFolder.htmlDocumentCount }} HTML / {{ activeFolder.textDocumentCount || 0 }} {{ t('docs').toLowerCase() }}</span>
                </span>
              </div>
              <div v-if="activeFolder.role === 'owner'" class="folder-manager-menu">
                <button
                  class="folder-manager-trigger"
                  @click.stop="toggleFolderMenu(activeFolder.id)"
                  :title="t('groupActions')"
                  :disabled="isBusy"
                >⋯</button>
                <div v-if="openControlMenu === 'folder:' + activeFolder.id" class="mobile-action-popover" @click.stop>
                  <button class="card-menu-item" @click="importToFolder(activeFolder)" :disabled="isBusy">{{ t('import') }}</button>
                  <button class="card-menu-item" @click="openFolderShareModal(activeFolder)" :disabled="isBusy">{{ t('share') }}</button>
                  <button
                    v-if="activeFolder.name !== 'Unsorted'"
                    class="card-menu-item"
                    @click="openRenameFolderModal(activeFolder)"
                    :disabled="isBusy"
                  >{{ t('rename') }}</button>
                  <button
                    class="card-menu-item"
                    @click="openSubfolderModal(activeFolder)"
                    :disabled="isBusy"
                  >{{ t('addFolder') }}</button>
                  <button
                    v-if="activeFolder.name !== 'Unsorted'"
                    class="card-menu-item danger"
                    @click="deleteFolder(activeFolder)"
                    :disabled="isBusy"
                  >{{ t('delete') }}</button>
                </div>
              </div>
              </div>
              <div v-if="canScrollFolderUp || canScrollFolderDown" class="folder-scroll-controls" aria-label="Прокрутка элементов группы">
                <button v-if="canScrollFolderUp" type="button" class="btn-ghost btn-sm" title="Прокрутить вверх" aria-label="Прокрутить вверх" @click.stop="scrollActiveFolder(-1)">↑</button>
                <button v-if="canScrollFolderDown" type="button" class="btn-ghost btn-sm" title="Прокрутить вниз" aria-label="Прокрутить вниз" @click.stop="scrollActiveFolder(1)">↓</button>
              </div>
              <div ref="activeFolderBody" class="folder-manager-body" @scroll="onFolderBodyScroll">
                <div v-if="activeSubfolders.length" class="dash-grid subfolder-grid">
                  <button
                    v-for="child in activeSubfolders"
                    :key="'subfolder-' + child.id"
                    type="button"
                    class="subfolder-card"
                    @click="selectFolder(child.id)"
                  >
                    <span class="subfolder-card-icon" aria-hidden="true">▤</span>
                    <span class="subfolder-card-name">{{ child.name }}</span>
                    <span class="subfolder-card-count">{{ child.count || t('emptyFolder') }}</span>
                  </button>
                </div>
                <div class="dash-grid">
                  <template v-for="item in activeFolder.items" :key="`${item.type}-${item.id}`">
                  <div
                    v-if="item.type === 'canvas'"
                    class="canvas-card"
                    :class="{ dragging: draggingResourceId === item.id }"
                    draggable="false"
                    @click="openCanvasFromCard(item.slug || item.id)"
                  >
                    <input
                      v-if="renamingId === item.id"
                      class="card-title-input"
                      :value="item.title"
                      @blur="finishRename($event, item)"
                      @keydown.enter="($event.target as HTMLInputElement).blur()"
                      @keydown.escape="renamingId = ''"
                      @click.stop
                      ref="renameInput"
                    />
                    <div v-else class="card-title card-title-with-icon" @dblclick.stop="startRename(item.id)"><span class="resource-title-icon icon-canvas" data-resource-icon="canvas" :aria-label="t('canvas')"></span>{{ item.title || t('untitled') }}</div>
                    <div class="card-meta">
                      <span class="badge" :class="isOwnedResource(item) ? 'badge-owner' : 'badge-shared'">{{ isOwnedResource(item) ? t('owner') : (item.role || t('sharedWithMe')) }}</span>
                      <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
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
                    <button v-if="isOwnedResource(item)" class="card-pin" :class="{ active: item.pinned }" @click.stop="togglePinned(item)" title="Pin canvas" :disabled="isBusy">{{ item.pinned ? '★' : '☆' }}</button>
                    <button class="card-manage" @click.stop="toggleCardMenu(item.id, $event)" title="Canvas actions" :disabled="isBusy">⋯</button>
                    <div v-if="openMenuCanvasId === item.id" class="card-menu" :style="cardMenuStyle" @click.stop>
                      <button class="card-menu-item" @click="openMoveFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                      <template v-if="isOwnedResource(item)"><button class="card-menu-item" @click="duplicateCanvas(item)" :disabled="isBusy">{{ t('duplicate') }}</button><button class="card-menu-item" @click="openDescriptionModal(item)" :disabled="isBusy">{{ t('description') }}</button><button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">{{ t('editTags') }}</button><button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? t('unpin') : t('pin') }}</button><button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">{{ t('transferOwnership') }}</button><button class="card-menu-item danger" @click="deleteCanvas(item)" :disabled="isBusy">{{ t('delete') }}</button></template>
                    </div>
                  </div>
                  <article
                    v-else-if="item.type === 'html-document'"
                    class="canvas-card html-doc-card"
                    :class="{ dragging: draggingResourceId === item.id }"
                    draggable="false"
                    @click="openHtmlDocumentFromCard(item.slug || item.id)"
                  >
                    <a
                      class="card-open-link"
                      :href="`/edit/html/${item.slug || item.id}`"
                      :aria-label="`Open HTML document ${item.title || 'Untitled HTML'}`"
                      @click.stop="rememberRecentResource('html-document', item.slug || item.id)"
                    ></a>
                    <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-html" data-resource-icon="html-document" aria-label="HTML document"></span>{{ item.title || 'Untitled HTML' }}</div>
                    <div class="card-meta">
                      <span v-if="item.pinned" class="badge badge-pinned">Pinned</span>
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
                    <button v-if="isOwnedResource(item)" class="card-pin" :class="{ active: item.pinned }" @click.stop="togglePinned(item)" title="Pin HTML" :disabled="isBusy">{{ item.pinned ? '★' : '☆' }}</button>
                    <button class="card-manage" @click.stop="toggleCardMenu(item.id, $event)" title="HTML actions" :disabled="isBusy">⋯</button>
                    <div v-if="openMenuCanvasId === item.id" class="card-menu" :style="cardMenuStyle" @click.stop>
                      <button class="card-menu-item" @click="openMoveHtmlFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                      <template v-if="isOwnedResource(item)"><button class="card-menu-item" @click="duplicateHtmlDocument(item)" :disabled="isBusy">{{ t('duplicate') }}</button><button class="card-menu-item" @click="openDescriptionModal(item)" :disabled="isBusy">{{ t('description') }}</button><button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">{{ t('editTags') }}</button><button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? t('unpin') : t('pin') }}</button><button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">{{ t('transferOwnership') }}</button><button class="card-menu-item danger" @click="deleteHtmlDocument(item)" :disabled="isBusy">{{ t('delete') }}</button></template>
                    </div>
                  </article>
                  <article
                    v-else-if="item.type === 'interactive-template'"
                    class="canvas-card html-doc-card interactive-template-card"
                    :data-folder-resource="`interactive-template:${item.id}`"
                    @click="openInteractiveTemplate(item.id)"
                  >
                    <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-template" data-resource-icon="interactive-template" aria-label="Интерактивный шаблон"></span>{{ item.title }}</div>
                    <div class="card-meta">
                      <span class="badge" :class="item.role === 'owner' ? 'badge-owner' : 'badge-shared'">{{ interactiveTemplateTypeLabel(item.templateType) }}</span>
                      <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
                    </div>
                    <button class="card-manage" @click.stop="toggleCardMenu(`folder:interactive-template:${item.id}`, $event)" title="Действия с шаблоном" :disabled="isBusy">⋯</button>
                    <div v-if="openMenuCanvasId === `folder:interactive-template:${item.id}`" class="card-menu" :style="cardMenuStyle" @click.stop>
                      <button class="card-menu-item" @click="openMoveInteractiveTemplateFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                      <button v-if="item.role === 'owner'" class="card-menu-item danger" @click="deleteInteractiveTemplate(item)" :disabled="isBusy">{{ t('delete') }}</button>
                    </div>
                  </article>
                  <article
                    v-else
                    class="canvas-card html-doc-card"
                    :class="{ dragging: draggingResourceId === item.id }"
                    draggable="false"
                    @click="openTextDocumentFromCard(item.slug || item.id)"
                  >
                    <a
                      class="card-open-link"
                      :href="`/docs/${item.slug || item.id}`"
                      :aria-label="`Open document ${item.title || 'Untitled document'}`"
                      @click.stop="rememberRecentResource('text-document', item.slug || item.id)"
                    ></a>
                    <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-text-doc" data-resource-icon="text-document" aria-label="Document"></span>{{ item.title || 'Untitled document' }}</div>
                    <div class="card-meta">
                      <span v-if="item.pinned" class="badge badge-pinned">Pinned</span>
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
                    <button v-if="isOwnedResource(item)" class="card-pin" :class="{ active: item.pinned }" @click.stop="togglePinned(item)" title="Pin document" :disabled="isBusy">{{ item.pinned ? '★' : '☆' }}</button>
                    <button class="card-manage" @click.stop="toggleCardMenu(item.id, $event)" title="Document actions" :disabled="isBusy">⋯</button>
                    <div v-if="openMenuCanvasId === item.id" class="card-menu" :style="cardMenuStyle" @click.stop>
                      <button class="card-menu-item" @click="openMoveTextDocumentFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                      <template v-if="isOwnedResource(item)"><button class="card-menu-item" @click="duplicateTextDocument(item)" :disabled="isBusy">{{ t('duplicate') }}</button><button class="card-menu-item" @click="openDescriptionModal(item)" :disabled="isBusy">{{ t('description') }}</button><button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">{{ t('editTags') }}</button><button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? t('unpin') : t('pin') }}</button><button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">{{ t('transferOwnership') }}</button><button class="card-menu-item danger" @click="deleteTextDocument(item)" :disabled="isBusy">{{ t('delete') }}</button></template>
                    </div>
                  </article>
                  </template>
                </div>
              </div>
          </div>
        </section>

      <section
        v-if="isLoggedIn && activeSection.kind === 'interactive'"
        class="dash-section"
        data-dashboard-view="interactive"
        data-section="interactive-templates"
      >
        <div class="dash-section-head"><h2>{{ t('interactiveTemplate') }}</h2></div>
        <div class="dash-grid">
          <article v-for="item in visibleInteractiveTemplateItems" :key="item.id" class="canvas-card html-doc-card interactive-template-card" :data-template-resource="item.id" @click="openInteractiveTemplate(item.id)">
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-template" data-resource-icon="interactive-template" aria-label="Интерактивный шаблон"></span>{{ item.title }}</div>
            <div class="card-meta"><span class="badge badge-owner">{{ interactiveTemplateTypeLabel(item.templateType) }}</span><span class="card-date">{{ formatDate(item.updatedAt) }}</span></div>
            <button class="card-manage" :data-menu-trigger="`interactive-template:${item.id}`" @click.stop="toggleCardMenu(`interactive-template:${item.id}`, $event)" title="Действия с шаблоном" :disabled="isBusy">⋯</button>
            <div v-if="openMenuCanvasId === `interactive-template:${item.id}`" class="card-menu" :data-card-menu="`interactive-template:${item.id}`" :style="cardMenuStyle" @click.stop>
              <button class="card-menu-item" data-action="move-to-folder" @click="openMoveInteractiveTemplateFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
              <button v-if="item.role === 'owner'" class="card-menu-item danger" data-action="delete" @click="deleteInteractiveTemplate(item)" :disabled="isBusy">{{ t('delete') }}</button>
            </div>
          </article>
        </div>
        <div v-if="!visibleInteractiveTemplateItems.length" class="dash-empty">No interactive templates yet.</div>
      </section>

      <div
        v-if="isLoggedIn && activeSection.kind === 'shared'"
        class="dash-section"
        data-dashboard-view="shared"
        data-section="shared"
      >
        <h2>{{ t('sharedWithMe') }}</h2>
        <div class="dash-grid">
          <template v-for="item in sharedFiltered" :key="'shared-' + item.type + '-' + item.id">
          <div
            v-if="item.type === 'canvas'"
            class="canvas-card"
            @click="openCanvas(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-canvas" data-resource-icon="canvas" aria-label="Canvas"></span>{{ item.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-shared">{{ item.role }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">Pinned</span>
              <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
            </div>
            <div v-if="item.folder" class="card-folder">{{ item.folder }}</div>
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
            class="canvas-card html-doc-card"
            @click="openHtmlDocument(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-html" data-resource-icon="html-document" aria-label="HTML document"></span>{{ item.title || 'Untitled HTML' }}</div>
            <div class="card-meta">
              <span class="badge badge-shared">{{ item.role || t('sharedWithMe') }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
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
            class="canvas-card html-doc-card"
            @click="openTextDocument(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-text-doc" data-resource-icon="text-document" aria-label="Document"></span>{{ item.title || 'Untitled document' }}</div>
            <div class="card-meta">
              <span class="badge badge-shared">{{ item.role || t('sharedWithMe') }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
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
        </div>
        <div v-if="!sharedFiltered.length" class="dash-empty">No shared resources yet.</div>
      </div>

      <div
        v-if="activeSection.kind === 'public'"
        class="dash-section"
        data-dashboard-view="public"
        data-section="public"
      >
        <h2>{{ t('public') }}</h2>
        <div class="dash-grid">
          <template v-for="item in publicFiltered" :key="'public-' + item.type + '-' + item.id">
          <div
            v-if="item.type === 'canvas'"
            class="canvas-card"
            @click="openCanvas(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-canvas" data-resource-icon="canvas" aria-label="Canvas"></span>{{ item.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-public">{{ item.allowPublicEdit ? t('publicEdit') : t('public') }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
              <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
            </div>
            <div class="card-owner">{{ item.ownerName || item.ownerEmail || t('unknownOwner') }}</div>
            <div v-if="item.folder" class="card-folder">{{ item.folder }}</div>
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
            class="canvas-card html-doc-card"
            @click="openHtmlDocument(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-html" data-resource-icon="html-document" aria-label="HTML document"></span>{{ item.title || 'Untitled HTML' }}</div>
            <div class="card-meta">
              <span class="badge badge-public">{{ t('public') }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
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
            class="canvas-card html-doc-card"
            @click="openTextDocument(item.slug || item.id)"
          >
            <div class="card-title card-title-with-icon"><span class="resource-title-icon icon-text-doc" data-resource-icon="text-document" aria-label="Document"></span>{{ item.title || 'Untitled document' }}</div>
            <div class="card-meta">
              <span class="badge badge-public">{{ t('public') }}</span>
              <span v-if="item.pinned" class="badge badge-pinned">{{ t('pinned') }}</span>
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
        </div>
        <div v-if="!publicFiltered.length" class="dash-empty">No public resources yet.</div>
      </div>

      <div v-if="isLoggedIn && activeSection.kind === 'home' && !folderSummaries.length && !sharedFiltered.length" class="dash-empty">
        No resources yet. Create your first one!
      </div>
    </template>
    </div>
    </main>
      </div>
    </div>

    <div v-if="folderModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ folderModal.resourceId ? 'Move to group' : 'Create group' }}</h3>
          <button class="dashboard-modal-close" @click="closeFolderModal">x</button>
        </div>
        <input
          v-if="!folderModal.resourceId"
          v-model.trim="folderModal.value"
          class="dashboard-modal-input"
          :placeholder="t('groupName')"
          @input="folderModal.folderId = ''"
          @keydown.enter.prevent="saveFolderModal"
        />
        <div v-if="folderModal.resourceId" class="dashboard-modal-note">{{ t('chooseFolder') }}</div>
        <div v-if="folderModal.resourceId && folderOptions.length" class="folder-parent-list">
          <button
            v-for="folder in folderOptions"
            :key="folder.id"
            class="folder-parent-option folder-destination"
            :class="{ active: folderModal.folderId === folder.id }"
            :style="{ paddingLeft: 12 + folder.depth * 16 + 'px' }"
            @click="folderModal.folderId = folder.id; folderModal.value = folder.name"
          >
            <span class="folder-destination-name">
              <span v-if="folder.depth" class="folder-destination-branch" aria-hidden="true">└</span>
              {{ folder.name }}
            </span>
            <span class="folder-destination-path">{{ folder.path || t('inRoot') }}</span>
          </button>
        </div>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeFolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
          <button class="btn-primary" @click="saveFolderModal" :disabled="isBusy || !canSaveFolderModal">
            {{ actionLabel(folderModal.resourceId ? 'move-folder' : 'create-folder', folderModal.resourceId ? t('move') : t('create')) }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="templatePickerOpen" class="dashboard-modal-backdrop" @click.self="closeInteractiveTemplatePicker">
      <div class="dashboard-modal template-picker-modal">
        <div class="dashboard-modal-head">
          <h3>Выберите интерактивный шаблон</h3>
          <button class="dashboard-modal-close" @click="closeInteractiveTemplatePicker">×</button>
        </div>
        <div class="template-picker-grid">
          <button class="template-picker-tile" data-template-type="dnd-character" @click="createInteractiveTemplate('dnd-character')" :disabled="isBusy">
            <span class="template-picker-icon">⚄</span>
            <strong>Карточка персонажа D&amp;D</strong>
            <small>Характеристики, HP, AC и броски d20 на канвасе</small>
          </button>
          <button class="template-picker-tile" data-template-type="trello-board" @click="createInteractiveTemplate('trello-board')" :disabled="isBusy">
            <span class="template-picker-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 8v8M16 8v5" /></svg>
            </span>
            <strong>Канбан-доска</strong>
            <small>Списки и карточки задач в стиле Trello</small>
          </button>
        </div>
      </div>
    </div>


    <div v-if="subfolderModal.open" class="dashboard-modal-backdrop" @click.self="closeSubfolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ t('addFolderTitle') }}: {{ subfolderModal.parentName }}</h3>
          <button class="dashboard-modal-close" @click="closeSubfolderModal">x</button>
        </div>
        <input
          v-model.trim="subfolderModal.value"
          class="dashboard-modal-input"
          :placeholder="t('folderName')"
          @keydown.enter.prevent="saveSubfolderModal"
        />
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeSubfolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
          <button
            class="btn-primary"
            @click="saveSubfolderModal"
            :disabled="isBusy || !subfolderModal.value.trim()"
          >{{ actionLabel('create-subfolder', t('createFolder')) }}</button>
        </div>
      </div>
    </div>

    <div v-if="descriptionModal.open" class="dashboard-modal-backdrop" @click.self="closeDescriptionModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ descriptionModal.title || t('description') }}</h3>
          <button class="dashboard-modal-close" @click="closeDescriptionModal">x</button>
        </div>
        <textarea
          v-if="descriptionModal.canEdit"
          v-model="descriptionModal.value"
          class="dashboard-modal-textarea"
          :maxlength="MAX_DESCRIPTION_LENGTH"
          :placeholder="t('descriptionPlaceholder')"
        ></textarea>
        <p v-else-if="descriptionModal.value" class="description-readonly">{{ descriptionModal.value }}</p>
        <p v-else class="dashboard-modal-note">{{ t('descriptionEmpty') }}</p>
        <p v-if="descriptionModal.canEdit" class="dashboard-modal-note">
          {{ descriptionModal.value.length }} / {{ MAX_DESCRIPTION_LENGTH }}
        </p>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeDescriptionModal" :disabled="isBusy">
            {{ descriptionModal.canEdit ? t('cancel') : t('close') }}
          </button>
          <button
            v-if="descriptionModal.canEdit"
            class="btn-primary"
            @click="saveDescriptionModal"
            :disabled="isBusy"
          >{{ actionLabel('save-description', t('save')) }}</button>
        </div>
      </div>
    </div>

    <div v-if="renameFolderModal.open" class="dashboard-modal-backdrop" @click.self="closeRenameFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ t('editGroup') }}</h3>
          <button class="dashboard-modal-close" @click="closeRenameFolderModal">x</button>
        </div>
        <input
          v-model.trim="renameFolderModal.value"
          class="dashboard-modal-input"
          :placeholder="t('groupName')"
          @keydown.enter.prevent="saveRenameFolderModal"
        />
        <p class="dashboard-modal-note">{{ t('renameGroupNote') }}</p>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeRenameFolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
          <button class="btn-primary" @click="saveRenameFolderModal" :disabled="isBusy || !renameFolderModal.value.trim()">
            {{ actionLabel('rename-folder', t('save')) }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="folderShareModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderShareModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Share group</h3>
          <button class="dashboard-modal-close" @click="closeFolderShareModal">x</button>
        </div>
        <p class="dashboard-modal-note">Sharing "{{ folderShareModal.name }}" grants access to all resources in this Group.</p>
        <div class="share-section">
          <div class="share-section-title">Invite people</div>
          <div class="share-form">
            <input v-model.trim="folderShareModal.email" placeholder="Email" type="email" />
            <select v-model="folderShareModal.role">
              <option value="read">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button @click="shareFolder" :disabled="isBusy || !folderShareModal.email.trim()">
              {{ actionLabel('share-folder', 'Invite') }}
            </button>
          </div>
          <div v-if="folderShareModal.loading" class="dashboard-modal-note">Loading access...</div>
          <div v-else-if="!folderShareModal.permissions.length" class="dashboard-modal-note">No invited people yet.</div>
          <div v-else class="share-list">
            <div v-for="permission in folderShareModal.permissions" :key="permission.id || permission.userId" class="share-item">
              <span>{{ permission.user?.email || permission.userId }}</span>
              <span class="share-item-role">{{ permission.role === 'edit' ? 'Can edit' : 'Can view' }}</span>
              <button @click="revokeFolderAccess(permission.userId)" :disabled="isBusy">x</button>
            </div>
          </div>
        </div>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeFolderShareModal" :disabled="isBusy">Close</button>
        </div>
      </div>
    </div>

    <div v-if="tagsModal.open" class="dashboard-modal-backdrop" @click.self="closeTagsModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Edit tags</h3>
          <button class="dashboard-modal-close" @click="closeTagsModal">x</button>
        </div>
        <div v-if="tagSuggestions.length" class="tag-filter-list">
          <button
            v-for="tag in tagSuggestions"
            :key="tag.name"
            class="tag-filter color-tag"
            :style="{ '--tag-color': tag.color }"
            @click="addSuggestedTag(tag)"
          >#{{ tag.name }}</button>
        </div>
        <div class="tag-editor-list">
          <div v-for="(tag, index) in tagsModal.tags" :key="tag.id" class="tag-editor-row">
            <input v-model.trim="tag.name" class="dashboard-modal-input tag-name-input" placeholder="Tag" />
            <div class="tag-color-palette">
              <button
                v-for="color in tagColors"
                :key="color"
                class="tag-color-option"
                :class="{ active: tag.color === color }"
                :style="{ background: color }"
                @click="tag.color = color"
                :disabled="isBusy"
              ></button>
            </div>
            <button class="tag-remove-btn" @click="removeTag(index)" :disabled="isBusy">x</button>
          </div>
        </div>
        <button class="btn-ghost tag-add-btn" @click="addTag" :disabled="isBusy">+ Add tag</button>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeTagsModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveTagsModal" :disabled="isBusy">
            {{ actionLabel('save-tags', 'Save tags') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="tagManager.open" class="dashboard-modal-backdrop" @click.self="closeTagManager">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Manage tags</h3>
          <button class="dashboard-modal-close" @click="closeTagManager">x</button>
        </div>
        <div v-if="!tagManager.items.length" class="dashboard-modal-note">No tags yet.</div>
        <div v-else class="tag-manager-list">
          <div v-for="tag in tagManager.items" :key="tag.originalName" class="tag-manager-row">
            <input v-model.trim="tag.name" class="dashboard-modal-input tag-name-input" placeholder="Tag" />
            <div class="tag-color-palette">
              <button
                v-for="color in tagColors"
                :key="color"
                class="tag-color-option"
                :class="{ active: tag.color === color }"
                :style="{ background: color }"
                @click="tag.color = color"
                :disabled="isBusy"
              ></button>
            </div>
            <span class="tag-manager-count">{{ tag.totalCount }} refs</span>
            <button class="btn-ghost btn-sm" @click="saveManagedTag(tag)" :disabled="isBusy || !tag.name.trim()">Save</button>
            <button class="btn-ghost btn-sm danger" @click="deleteManagedTag(tag)" :disabled="isBusy">{{ t('delete') }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="transferModal.open" class="dashboard-modal-backdrop" @click.self="closeTransferModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Transfer ownership</h3>
          <button class="dashboard-modal-close" @click="closeTransferModal">x</button>
        </div>
        <input
          v-model.trim="transferModal.email"
          class="dashboard-modal-input"
          placeholder="User email"
          type="email"
          @keydown.enter.prevent="saveTransferModal"
        />
        <p class="dashboard-modal-note">The current owner will become an editor.</p>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeTransferModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveTransferModal" :disabled="isBusy || !transferModal.email.trim()">
            {{ actionLabel('transfer-ownership', 'Transfer') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ArrowLeft, FileCode2, FilePlus2, FileText, FolderPlus, LayoutGrid as LayoutGridIcon, LayoutTemplate, List as ListIcon, Menu, Plus, ShieldCheck, Tags, Upload } from '@lucide/vue';
import { defineComponent, ref, onBeforeUnmount, onMounted, computed, nextTick, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useRouter } from 'vue-router';
import { accessRequests, canvas, getCurrentUser, htmlDocuments, interactiveTemplates, isAdmin, isAuthenticated, MAX_DESCRIPTION_LENGTH, recentResources as recentResourcesApi, resourceFolders, tags, textDocuments, type InteractiveTemplate, type ResourceFolderSummary, type ResourceTag, type ResourceTagSummary } from '../api/client';
import { useI18n } from '../composables/useI18n';
import DashboardSidebar from '../components/dashboard/DashboardSidebar.vue';
import LanguageToggle from '../components/LanguageToggle.vue';
import {
  readSidebarWidthState,
  writeSidebarWidthState,
  type DashboardFolderNavItem,
  type DashboardSection,
  type SidebarWidthState,
} from '../dashboard/navigation';
import { readRecentViewMode, writeRecentViewMode, type RecentViewMode } from '../dashboard/recent-view';

type CanvasTag = { id: string; name: string; color: string };
type FeedbackState = { type: 'success' | 'error'; message: string };
type ManagedTag = ResourceTagSummary & { originalName: string };
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
type RecentResource = { id: string; routeId: string; type: RecentResourceType; title: string; openedAt: number };
type RecentResourceItem = FolderItem;

const DEFAULT_TAG_COLOR = '#50d1b2';
const DASHBOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_PULL_THRESHOLD = 72;
const RECENT_RESOURCES_LIMIT = 12;
const genTagId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  components: {
    DashboardSidebar,
    LanguageToggle,
    ArrowLeft,
    FileCode2,
    FilePlus2,
    FileText,
    FolderPlus,
    LayoutGridIcon,
    LayoutTemplate,
    ListIcon,
    Menu,
    Plus,
    ShieldCheck,
    Tags,
    Upload,
  },
  setup() {
    const router = useRouter();
    const { t, locale } = useI18n();
    const admin = isAdmin();
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
    const interactiveTemplateItems = ref<InteractiveTemplate[]>([]);
    const templatePickerOpen = ref(false);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const isRefreshing = ref(false);
    const dashboardMain = ref<HTMLElement | null>(null);
    const dashboardPullDistance = ref(0);
    const isNativeDashboard = Capacitor.isNativePlatform();
    let dashboardPullStartY: number | null = null;
    const searchQuery = ref('');
    const selectedTag = ref('');
    const contentFilter = ref<'all' | FolderItem['type']>('all');
    const sortMode = ref<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
    const openMenuCanvasId = ref('');
    const openControlMenu = ref('');
    const activeSection = ref<DashboardSection>({ kind: isLoggedIn ? 'recent' : 'public' });
    const storage = () => {
      try {
        return typeof window === 'undefined' ? null : window.localStorage;
      } catch {
        return null;
      }
    };
    const sidebarWidthState = ref<SidebarWidthState>(readSidebarWidthState(storage()));
    const recentViewMode = ref<RecentViewMode>(readRecentViewMode(storage()));
    const setRecentViewMode = (mode: RecentViewMode) => {
      recentViewMode.value = mode;
      writeRecentViewMode(storage(), mode);
    };
    const mobileSidebarOpen = ref(false);
    const mobileSidebarOpener = ref<HTMLElement | null>(null);
    let previousBodyOverflow: string | null = null;
    const SIDEBAR_DESKTOP_QUERY = '(min-width: 769px)';
    let sidebarDesktopMedia: MediaQueryList | null = null;
    // Folders are expanded by default and act as lightweight organizational
    // headers. We track only the folders the user has explicitly collapsed, so
    // any new/unseen folder shows open without a click.
    const collapsedFolderIds = ref<string[]>([]);
    const selectedFolderId = ref('');
    const draggingResourceId = ref('');
    const draggingResourceType = ref<FolderItem['type']>('canvas');
    const draggingResourceFolderId = ref<string | null>(null);
    const dragTargetFolder = ref('');
    const folderDragId = ref('');
    const folderDragOverId = ref('');
    const resourceDrag = ref<{
      active: boolean;
      startX: number;
      startY: number;
      item: FolderItem;
      targetFolderId: string;
    } | null>(null);
    const suppressNextCardClick = ref(false);
    const pendingAction = ref('');
    const incomingRequests = ref<any[]>([]);
    const feedback = ref<FeedbackState>({ type: 'success', message: '' });
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    const tagColors = ['#50d1b2', '#44cf6e', '#53dfdd', '#e0de71', '#e9973f', '#fb464c', '#f472b6', '#94a3b8'];
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
    const recentResourceHistory = ref<RecentResource[]>([]);
    const tagFilterList = ref<HTMLElement | null>(null);
    const activeFolderBody = ref<HTMLElement | null>(null);
    const hasTagOverflow = ref(false);
    const canScrollFolderUp = ref(false);
    const canScrollFolderDown = ref(false);
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
      } catch {
        recentResourceHistory.value = [];
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

    const folderModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; folderId: string; value: string }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      folderId: '',
      value: '',
    });
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
    const tagManager = ref<{ open: boolean; items: ManagedTag[] }>({
      open: false,
      items: [],
    });
    const transferModal = ref<{ open: boolean; resourceId: string; resourceType: FolderItem['type']; email: string }>({
      open: false,
      resourceId: '',
      resourceType: 'canvas',
      email: '',
    });

    const normalizeTags = (tags: unknown): CanvasTag[] => {
      if (!Array.isArray(tags)) return [];
      return tags
        .map((tag) => {
          if (typeof tag === 'string') return { id: genTagId(), name: tag, color: DEFAULT_TAG_COLOR };
          if (tag && typeof tag === 'object' && typeof (tag as any).name === 'string') {
            return {
              id: genTagId(),
              name: (tag as any).name,
              color: typeof (tag as any).color === 'string' ? (tag as any).color : DEFAULT_TAG_COLOR,
            };
          }
          return null;
        })
        .filter((tag): tag is CanvasTag => Boolean(tag));
    };

    const normalizeCanvas = (c: any, isOwn = false): CanvasRecord => ({
      ...c,
      type: 'canvas',
      isOwn,
      folder: c.folder || '',
      folderId: c.folderId || null,
      tags: normalizeTags(c.tags),
    });

    const normalizeHtmlDocument = (doc: any): HtmlDocumentRecord => ({
      ...doc,
      type: 'html-document',
      folderId: doc.folderId || null,
      pinned: Boolean(doc.pinned),
      tags: normalizeTags(doc.tags),
    });

    const normalizeTextDocument = (doc: any): TextDocumentRecord => ({
      ...doc,
      type: 'text-document',
      folderId: doc.folderId || null,
      pinned: Boolean(doc.pinned),
      tags: normalizeTags(doc.tags),
    });

    const normalizeInteractiveTemplate = (template: any): InteractiveTemplateRecord => ({
      ...template,
      type: 'interactive-template',
      folderId: template.folderId || null,
      tags: normalizeTags(template.tags),
      pinned: false,
    });

    const normalizeResourceFolder = (folder: ResourceFolderSummary): ResourceFolderSummary => {
      const canvases = folder.items?.canvases || folder.canvases || [];
      const htmlDocuments = folder.items?.htmlDocuments || folder.htmlDocuments || [];
      const docs = folder.items?.textDocuments || folder.textDocuments || [];
      const templates = folder.items?.interactiveTemplates || folder.interactiveTemplates || [];
      return {
        ...folder,
        canvasCount: folder.canvasCount ?? canvases.length,
        htmlDocumentCount: folder.htmlDocumentCount ?? htmlDocuments.length,
        textDocumentCount: folder.textDocumentCount ?? docs.length,
        interactiveTemplateCount: folder.interactiveTemplateCount ?? templates.length,
        items: {
          canvases,
          htmlDocuments,
          textDocuments: docs,
          interactiveTemplates: templates,
        },
      };
    };

    const matchesCanvas = (c: CanvasRecord) => {
      if (contentFilter.value !== 'all' && contentFilter.value !== 'canvas') return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${c.title || ''} ${c.folder || ''} ${c.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || c.tags.some((tag) => tag.name === selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const matchesFolderItem = (item: FolderItem, folderName: string) => {
      if (contentFilter.value !== 'all' && item.type !== contentFilter.value) return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${item.title || ''} ${folderName} ${item.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || item.tags.some((tag) => tag.name === selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const matchesPublicItem = (item: FolderItem) => {
      if (contentFilter.value !== 'all' && item.type !== contentFilter.value) return false;
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${item.title || ''} Public ${item.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || item.tags.some((tag) => tag.name === selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const sortFolderItems = (items: FolderItem[]) => [...items].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      const result = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      return sortMode.value === 'updated-asc' ? result : -result;
    });

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
    const visibleInteractiveTemplateItems = computed(() => sortFolderItems(
      unfiledInteractiveTemplateItems.value.filter((item) => matchesFolderItem(item, t('interactiveTemplate'))),
    ) as InteractiveTemplateRecord[]);

    const sharedFiltered = computed(() => sortFolderItems(
      [...shared.value, ...sharedHtmlDocuments.value, ...sharedTextDocuments.value]
        .filter((item) => !placedResourceKeys.value.has(`${item.type}:${item.id}`))
        .filter((item) => item.type === 'canvas' ? matchesCanvas(item) : matchesPublicItem(item)),
    ));
    const publicFiltered = computed(() => sortFolderItems(
      [...publicCanvases.value, ...publicHtmlDocuments.value, ...publicTextDocuments.value]
        .filter((item) => !placedResourceKeys.value.has(`${item.type}:${item.id}`))
        .filter(matchesPublicItem),
    ));

    const allTagNames = computed(() => {
      const names = new Set<string>();
      const addTags = (tags: CanvasTag[], type: FolderItem['type']) => {
        if (contentFilter.value !== 'all' && contentFilter.value !== type) return;
        for (const tag of tags) names.add(tag.name);
      };
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvas of list) {
          addTags(canvas.tags, 'canvas');
        }
      }
      for (const document of unfiledHtmlDocuments.value) {
        addTags(document.tags, 'html-document');
      }
      for (const document of sharedHtmlDocuments.value) {
        addTags(document.tags, 'html-document');
      }
      for (const document of publicHtmlDocuments.value) {
        addTags(document.tags, 'html-document');
      }
      for (const document of unfiledTextDocuments.value) {
        addTags(document.tags, 'text-document');
      }
      for (const document of sharedTextDocuments.value) {
        addTags(document.tags, 'text-document');
      }
      for (const document of publicTextDocuments.value) {
        addTags(document.tags, 'text-document');
      }
      for (const template of interactiveTemplateRecords.value) {
        addTags(template.tags, 'interactive-template');
      }
      for (const folder of allResourceFolders.value) {
        for (const canvas of folder.items?.canvases || []) {
          addTags(normalizeTags(canvas.tags), 'canvas');
        }
        for (const document of folder.items?.htmlDocuments || []) {
          addTags(normalizeTags(document.tags), 'html-document');
        }
        for (const document of folder.items?.textDocuments || []) {
          addTags(normalizeTags(document.tags), 'text-document');
        }
        for (const template of folder.items?.interactiveTemplates || []) {
          addTags(normalizeTags(template.tags), 'interactive-template');
        }
      }
      return Array.from(names).sort();
    });

    watch(contentFilter, () => {
      if (selectedTag.value && !allTagNames.value.includes(selectedTag.value)) selectedTag.value = '';
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
    /**
     * Destinations for the move dialog, in tree order. Each carries its depth and
     * the path to its parent, so picking a nested folder is unambiguous.
     */
    const folderOptions = computed(() => {
      const byParent = new Map<string | null, ResourceFolderSummary[]>();
      for (const folder of ownResourceFolders.value) {
        const key = folder.parentId ?? null;
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

    const folderSummaries = computed<FolderSummary[]>(() => {
      const folders = allFolderSummaries.value
      .map((folder) => ({
        ...folder,
        items: sortFolderItems(folder.items.filter((item) => matchesFolderItem(item, folder.name))),
      }))
      .filter((folder) => {
        const hasActiveFilter = Boolean(searchQuery.value.trim() || selectedTag.value);
        const isDefaultFolder = folder.name.toLowerCase() === 'default';
        return folder.items.length
          || (!hasActiveFilter && folder.role === 'owner' && (isDefaultFolder || !isTechnicalFolder(folder as FolderSummary)));
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

      const fallbackSourceItems = legacyInboxSourceItems.value;
      const fallbackItems = sortFolderItems(fallbackSourceItems.filter((item) => matchesFolderItem(item, 'Inbox')));
      if (fallbackItems.length || (contentFilter.value === 'all' && fallbackSourceItems.length)) {
        folders.push(buildLegacyInboxFolder(fallbackItems));
      }
      return buildFolderTree(folders);
    });
    const activeFolder = computed(() => {
      const folder = allFolderSummaries.value.find((item) => item.id === selectedFolderId.value);
      if (selectedFolderId.value === 'legacy-resource-inbox' && legacyInboxSourceItems.value.length) {
        return buildLegacyInboxFolder(
          sortFolderItems(legacyInboxSourceItems.value.filter((item) => matchesFolderItem(item, 'Inbox'))),
        );
      }
      if (!folder) return null;
      return {
        ...folder,
        items: sortFolderItems(folder.items.filter((item) => matchesFolderItem(item, folder.name))),
      };
    });
    const sidebarFolders = computed<DashboardFolderNavItem[]>(() => folderSummaries.value.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId || null,
      depth: folder.depth || 0,
      role: folder.role,
      technical: isTechnicalFolder(folder),
      expanded: isTreeExpanded(folder.id),
      hasChildren: Boolean(folder.hasChildren),
      draggable: canReorderFolder(folder),
      dropActive: canDropToFolder(folder) && dragTargetFolder.value === folder.id,
      reorderTarget: folderDragOverId.value === folder.id,
    })));
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
    const recentResources = computed<RecentResource[]>(() => {
      const available = new Map(allRecentResourceItems.value.map((item) => [`${item.type}:${item.id}`, item]));
      return [...recentResourceHistory.value].sort((a, b) => b.openedAt - a.openedAt).flatMap((recent) => {
        const item = available.get(`${recent.type}:${recent.id}`);
        return item ? [{ ...recent, title: item.title || recent.title, routeId: ('slug' in item && item.slug) || item.id }] : [];
      });
    });

    const setFeedback = (type: FeedbackState['type'], message: string) => {
      feedback.value = { type, message };
      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedback.value.message = '';
      }, 2800);
    };

    const actionLabel = (action: string, idleLabel: string) =>
      pendingAction.value === action ? 'Saving...' : idleLabel;

    const runAction = async <T>(action: string, task: () => Promise<T>, successMessage?: string) => {
      pendingAction.value = action;
      try {
        const result = await task();
        if (successMessage) setFeedback('success', successMessage);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed';
        setFeedback('error', message);
        throw error;
      } finally {
        pendingAction.value = '';
      }
    };

    const load = async ({ showLoading = !own.value.length && !publicCanvases.value.length && !ownResourceFolders.value.length } = {}) => {
      if (showLoading) loading.value = true;
      isRefreshing.value = true;
      try {
        const res = await canvas.list();
        if (isLoggedIn) {
          const folders = await resourceFolders.list();
          ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
          sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
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
          unfiledHtmlDocuments.value = (legacyState.documents || [])
            .filter((document: any) => document.ownerId === currentUser.value?.id)
            .filter((document: any) => !folderDocumentIds.has(document.id))
            .map((document: any) => normalizeHtmlDocument(document));
          sharedHtmlDocuments.value = (legacyState.documents || [])
            .filter((document: any) => document.ownerId !== currentUser.value?.id)
            .filter((document: any) => document.visibility !== 'public')
            .filter((document: any) => !folderDocumentIds.has(document.id))
            .map((document: any) => normalizeHtmlDocument(document));
          const textState = await textDocuments.list();
          unfiledTextDocuments.value = (textState.documents || [])
            .filter((document: any) => document.ownerId === currentUser.value?.id)
            .filter((document: any) => !folderTextDocumentIds.has(document.id))
            .map((document: any) => normalizeTextDocument(document));
          sharedTextDocuments.value = (textState.documents || [])
            .filter((document: any) => document.ownerId !== currentUser.value?.id)
            .filter((document: any) => document.visibility !== 'public')
            .filter((document: any) => !folderTextDocumentIds.has(document.id))
            .map((document: any) => normalizeTextDocument(document));
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
      } catch (error) {
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
      dashboardPullDistance.value = Math.min(distance, DASHBOARD_PULL_THRESHOLD + 36);
      // Prevent the native elastic overscroll only while this dashboard gesture
      // is active, leaving ordinary scrolling and card dragging unchanged.
      event.preventDefault();
    };

    const onDashboardPullEnd = () => {
      const shouldRefresh = dashboardPullDistance.value >= DASHBOARD_PULL_THRESHOLD && !isRefreshing.value;
      resetDashboardPull();
      if (shouldRefresh) void load({ showLoading: false });
    };

    const rememberRecentResource = (type: RecentResourceType, routeId: string) => {
      const item = allRecentResourceItems.value.find((resource) => resource.type === type && (resource.id === routeId || ('slug' in resource && resource.slug === routeId)));
      if (!item) return;
      const recent: RecentResource = { id: item.id, routeId: ('slug' in item && item.slug) || item.id, type, title: item.title || '', openedAt: Date.now() };
      recentResourceHistory.value = [recent, ...recentResourceHistory.value.filter((entry) => !(entry.type === recent.type && entry.id === recent.id))].slice(0, RECENT_RESOURCES_LIMIT);
      void recentResourcesApi.markOpened(type, item.id).catch(() => {
        // Opening a resource must remain available if saving its recent entry fails.
      });
    };

    const openCanvas = (id: string) => {
      rememberRecentResource('canvas', id);
      router.push(`/canvas/${id}`);
    };

    const openInteractiveTemplate = (id: string) => {
      rememberRecentResource('interactive-template', id);
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
      router.push({ name: 'text-document', params: { id } });
    };

    const openRecentResource = (item: RecentResource) => {
      if (item.type === 'canvas') openCanvas(item.routeId);
      else if (item.type === 'html-document') openHtmlDocument(item.routeId);
      else if (item.type === 'text-document') openTextDocument(item.routeId);
      else openInteractiveTemplate(item.routeId);
    };
    const recentResourceTypeLabel = (type: RecentResourceType) => type === 'canvas' ? t('canvas') : type === 'html-document' ? 'HTML' : type === 'text-document' ? t('document') : t('interactiveTemplate');
    const recentResourceIconClass = (type: RecentResourceType) => type === 'canvas' ? 'icon-canvas' : type === 'html-document' ? 'icon-html' : type === 'text-document' ? 'icon-text-doc' : 'icon-template';
    const formatRecentOpenedAt = (openedAt: number) => new Intl.DateTimeFormat(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(openedAt);
    const scrollActiveFolder = (direction: -1 | 1) => {
      activeFolderBody.value?.scrollBy({ top: direction * 250, behavior: 'smooth' });
    };

    const updateFolderScrollControls = () => {
      const body = activeFolderBody.value;
      if (!body) {
        canScrollFolderUp.value = false;
        canScrollFolderDown.value = false;
        return;
      }
      canScrollFolderUp.value = body.scrollTop > 2;
      canScrollFolderDown.value = body.scrollTop + body.clientHeight < body.scrollHeight - 2;
    };

    const refreshOverflowIndicators = () => {
      void nextTick(() => {
        const tagsList = tagFilterList.value;
        hasTagOverflow.value = Boolean(tagsList && tagsList.scrollWidth > tagsList.clientWidth + 2);
        updateFolderScrollControls();
      });
    };
    watch([allTagNames, activeFolder], refreshOverflowIndicators, { flush: 'post' });

    const openTextDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openTextDocument(id);
    };

    const createCanvas = async () => {
      openControlMenu.value = '';
      const targetFolder = await ensureFolderByName('Unsorted');
      const c = await runAction('create-canvas', () => canvas.create('Untitled', undefined, targetFolder?.id), 'Canvas created');
      if (!c) return;
      router.push(`/canvas/${c.id}`);
    };

    const createHtmlDocument = async () => {
      openControlMenu.value = '';
      const targetFolder = await ensureFolderByName('Unsorted');
      const doc = await runAction(
        'create-html-document',
        () => htmlDocuments.create({ title: 'Untitled HTML', html: '<main><h1>Untitled HTML</h1></main>', folderId: targetFolder?.id }),
        'HTML document created',
      );
      if (!doc) return;
      router.push(`/edit/html/${doc.id}`);
    };

    const createTextDocument = async () => {
      openControlMenu.value = '';
      const targetFolder = await ensureFolderByName('Unsorted');
      const doc = await runAction(
        'create-text-document',
        () => textDocuments.create({ title: 'Untitled document', folderId: targetFolder?.id }),
        'Document created',
      );
      if (!doc) return;
      openTextDocument(doc.id);
    };

    const interactiveTemplateTypeLabel = (templateType: InteractiveTemplate['templateType']) =>
      templateType === 'trello-board' ? 'Канбан-доска' : 'D&D персонаж';

    const createInteractiveTemplate = async (templateType: InteractiveTemplate['templateType'] = 'dnd-character') => {
      openControlMenu.value = '';
      templatePickerOpen.value = false;
      const isBoard = templateType === 'trello-board';
      const template = await runAction(
        'create-interactive-template',
        () => interactiveTemplates.create({ templateType, title: isBoard ? '' : 'Новый персонаж' }),
        isBoard ? 'Канбан-доска создана' : 'Шаблон персонажа создан',
      );
      if (!template) return;
      interactiveTemplateItems.value = [{ ...template, role: 'owner' }, ...interactiveTemplateItems.value];
      openInteractiveTemplate(template.id);
    };

    const openInteractiveTemplatePicker = () => {
      openControlMenu.value = '';
      templatePickerOpen.value = true;
    };
    const closeInteractiveTemplatePicker = () => { templatePickerOpen.value = false; };

    const deleteInteractiveTemplate = async (template: InteractiveTemplate) => {
      if (!window.confirm(`Удалить шаблон «${template.title}»?`)) return;
      await runAction('delete-interactive-template', () => interactiveTemplates.delete(template.id), 'Шаблон удалён');
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
      return runAction('create-folder', () => resourceFolders.create(normalizedName), `Group ${normalizedName} created`);
    };

    const saveFolderModal = async () => {
      const folderName = folderModal.value.value.trim();
      const targetFolder = folderModal.value.folderId
        ? ownResourceFolders.value.find((folder) => folder.id === folderModal.value.folderId)
        : await ensureFolderByName(folderName);
      if (!targetFolder) return;
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

    const onFolderDragOver = (folder: FolderSummary) => {
      if (!canDropToFolder(folder)) return;
      dragTargetFolder.value = folder.id;
      // Expand the drop target if the user had folded its subtree.
      if (folder.hasChildren) expandTree(folder.id);
    };

    const onFolderDragLeave = (folder: FolderSummary) => {
      if (dragTargetFolder.value === folder.id) dragTargetFolder.value = '';
      if (folderDragOverId.value === folder.id) folderDragOverId.value = '';
    };

    const canReorderFolder = (folder: FolderSummary) =>
      !isBusy.value
      && folder.role === 'owner'
      && !isTechnicalFolder(folder)
      && ownResourceFolders.value.some((ownedFolder) => ownedFolder.id === folder.id);

    const onFolderDragStart = (event: DragEvent, folder: FolderSummary) => {
      if (!canReorderFolder(folder)) {
        event.preventDefault();
        return;
      }
      folderDragId.value = folder.id;
      event.dataTransfer?.setData('application/x-qcanva-folder', folder.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    const onFolderDragEnd = () => {
      folderDragId.value = '';
      folderDragOverId.value = '';
    };

    const isFolderReorderDrag = (event: DragEvent) =>
      Boolean(folderDragId.value || Array.from(event.dataTransfer?.types || []).includes('application/x-qcanva-folder'));

    const onFolderDragEnter = (event: DragEvent, folder: FolderSummary) => {
      if (isFolderReorderDrag(event)) {
        if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
        return;
      }
      onFolderDragOver(folder);
    };

    const onFolderDragOverEvent = (event: DragEvent, folder: FolderSummary) => {
      if (isFolderReorderDrag(event)) {
        if (canReorderFolder(folder) && folder.id !== folderDragId.value) folderDragOverId.value = folder.id;
        return;
      }
      onFolderDragOver(folder);
    };

    const reorderFolders = async (sourceId: string, targetId: string) => {
      if (!sourceId || sourceId === targetId) return;
      const previousFolders = ownResourceFolders.value.map((folder) => ({ ...folder }));
      const ids = ownResourceFolders.value
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((folder) => folder.id);
      const sourceIndex = ids.indexOf(sourceId);
      const targetIndex = ids.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      ids.splice(sourceIndex, 1);
      ids.splice(ids.indexOf(targetId), 0, sourceId);
      ownResourceFolders.value = ownResourceFolders.value.map((folder) => ({
        ...folder,
        sortOrder: ids.indexOf(folder.id),
      }));
      try {
        await resourceFolders.reorder(ids);
      } catch (error) {
        ownResourceFolders.value = previousFolders;
        setFeedback('error', error instanceof Error ? error.message : 'Could not save folder order');
      }
    };

    const onFolderDrop = async (event: DragEvent, folder: FolderSummary) => {
      const sourceId = folderDragId.value || event.dataTransfer?.getData('application/x-qcanva-folder') || '';
      if (sourceId) {
        onFolderDragEnd();
        if (canReorderFolder(folder)) await reorderFolders(sourceId, folder.id);
        return;
      }
      await dropResourceToFolder(folder);
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

    const removeResourceDragListeners = () => {
      window.removeEventListener('mousemove', onResourceMouseMove);
      window.removeEventListener('mouseup', onResourceMouseUp);
      window.removeEventListener('touchmove', onResourceTouchMove);
      window.removeEventListener('touchend', onResourceTouchEnd);
      window.removeEventListener('touchcancel', onResourceTouchCancel);
    };

    const finishResourceDrag = async () => {
      const state = resourceDrag.value;
      resourceDrag.value = null;
      removeResourceDragListeners();
      if (!state?.active) {
        endResourceDrag();
        return;
      }
      suppressNextCardClick.value = true;
      window.setTimeout(() => {
        suppressNextCardClick.value = false;
      }, 0);
      const targetFolder = findDropFolder(state.targetFolderId);
      if (targetFolder) {
        await dropResourceToFolder(targetFolder);
      } else {
        endResourceDrag();
      }
    };

    const updateResourceDrag = (clientX: number, clientY: number, event?: Event) => {
      const state = resourceDrag.value;
      if (!state) return;
      const distance = Math.hypot(clientX - state.startX, clientY - state.startY);
      if (!state.active && distance < 8) return;
      if (!state.active) {
        state.active = true;
        closeCardMenu();
        draggingResourceId.value = state.item.id;
        draggingResourceType.value = state.item.type;
        draggingResourceFolderId.value = state.item.folderId || null;
      }
      event?.preventDefault();
      const target = document.elementsFromPoint(clientX, clientY)
        .map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>('[data-dashboard-folder]') : null)
        .find((element): element is HTMLElement => Boolean(element));
      const folderId = target?.dataset.dashboardFolder || '';
      const folder = findDropFolder(folderId);
      state.targetFolderId = folder?.id || '';
      dragTargetFolder.value = folder?.id || '';
      // Expand the drop target if the user had folded its subtree.
      if (folder?.hasChildren) expandTree(folder.id);
    };

    function onResourceMouseMove(event: MouseEvent) {
      updateResourceDrag(event.clientX, event.clientY, event);
    }

    function onResourceMouseUp() {
      void finishResourceDrag();
    }

    function onResourceTouchMove(event: TouchEvent) {
      const point = event.touches[0];
      if (!point) return;
      updateResourceDrag(point.clientX, point.clientY, event);
    }

    function onResourceTouchEnd(event: TouchEvent) {
      const point = event.changedTouches[0];
      if (point) updateResourceDrag(point.clientX, point.clientY, event);
      void finishResourceDrag();
    }

    function onResourceTouchCancel() {
      resourceDrag.value = null;
      removeResourceDragListeners();
      endResourceDrag();
    }

    const startResourceDrag = (clientX: number, clientY: number, item: FolderItem, sourceFolder: FolderSummary, target: HTMLElement | null) => {
      if (isBusy.value) return;
      if (sourceFolder.role !== 'owner' || !ownResourceFolders.value.some((folder) => folder.id === sourceFolder.id)) return;
      if (target?.closest('button,input,a,textarea,select,[contenteditable="true"]')) return;
      resourceDrag.value = {
        active: false,
        startX: clientX,
        startY: clientY,
        item,
        targetFolderId: '',
      };
    };

    const startResourceMouseDrag = (event: MouseEvent, item: FolderItem, sourceFolder: FolderSummary) => {
      if (event.button !== 0) return;
      startResourceDrag(event.clientX, event.clientY, item, sourceFolder, event.target as HTMLElement | null);
      if (!resourceDrag.value) return;
      window.addEventListener('mousemove', onResourceMouseMove);
      window.addEventListener('mouseup', onResourceMouseUp);
    };

    const startResourceTouchDrag = (event: TouchEvent, item: FolderItem, sourceFolder: FolderSummary) => {
      const point = event.touches[0];
      if (!point) return;
      startResourceDrag(point.clientX, point.clientY, item, sourceFolder, event.target as HTMLElement | null);
      if (!resourceDrag.value) return;
      window.addEventListener('touchmove', onResourceTouchMove, { passive: false });
      window.addEventListener('touchend', onResourceTouchEnd);
      window.addEventListener('touchcancel', onResourceTouchCancel);
    };

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
        `Group renamed to ${nextFolder}`,
      );
      closeRenameFolderModal();
      await load();
    };

    const deleteFolder = async (folder: FolderSummary) => {
      closeCardMenu();
      const confirmed = window.confirm(`Delete group "${folder.name}"? Resources will move to Unsorted.`);
      if (!confirmed) return;
      await runAction(
        'delete-folder',
        () => resourceFolders.delete(folder.id),
        `Group ${folder.name} removed`,
      );
      await load();
    };

    const loadFolderPermissions = async () => {
      if (!folderShareModal.value.folderId) return;
      folderShareModal.value.loading = true;
      try {
        folderShareModal.value.permissions = await resourceFolders.permissions(folderShareModal.value.folderId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load group permissions';
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
        `Shared group with ${email}`,
      );
      folderShareModal.value.email = '';
      await loadFolderPermissions();
    };

    const revokeFolderAccess = async (userId: string) => {
      if (!folderShareModal.value.folderId || !userId) return;
      await runAction(
        'revoke-folder',
        () => resourceFolders.revoke(folderShareModal.value.folderId, userId),
        'Group access revoked',
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

    const openTagManager = async () => {
      closeCardMenu();
      const state = await runAction('load-tags', () => tags.list());
      tagManager.value = {
        open: true,
        items: (state?.tags || []).map((tag) => ({ ...tag, originalName: tag.name })),
      };
    };

    const closeTagManager = () => {
      tagManager.value = { open: false, items: [] };
    };

    const refreshTagManager = async () => {
      const state = await tags.list();
      tagManager.value.items = state.tags.map((tag) => ({ ...tag, originalName: tag.name }));
      sharedResourceTags.value = state.tags.map(({ name, color }) => ({ name, color }));
    };

    const saveManagedTag = async (tag: ManagedTag) => {
      await runAction(
        `save-tag-${tag.originalName}`,
        () => tags.update(tag.originalName, { name: tag.name, color: tag.color }),
        'Tag updated',
      );
      await refreshTagManager();
      await load();
    };

    const deleteManagedTag = async (tag: ManagedTag) => {
      const confirmed = window.confirm(`Delete tag "${tag.originalName}" from all owned canvas and HTML documents?`);
      if (!confirmed) return;
      await runAction(`delete-tag-${tag.originalName}`, () => tags.delete(tag.originalName), 'Tag deleted');
      await refreshTagManager();
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
      const confirmed = window.confirm(`Delete canvas "${title}"?`);
      if (!confirmed) return;
      await runAction('delete-canvas', () => canvas.delete(canvasRecord.id), `Deleted ${title}`);
      own.value = own.value.filter((c) => c.id !== canvasRecord.id);
      await load();
    };

    const deleteHtmlDocument = async (doc: HtmlDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled HTML';
      const confirmed = window.confirm(`Delete HTML document "${title}"?`);
      if (!confirmed) return;
      await runAction('delete-html-document', () => htmlDocuments.delete(doc.id), `Deleted ${title}`);
      await load();
    };

    const deleteTextDocument = async (doc: TextDocumentRecord) => {
      const title = doc.title?.trim() || 'Untitled document';
      const confirmed = window.confirm(`Delete document "${title}"?`);
      if (!confirmed) return;
      await runAction('delete-text-document', () => textDocuments.delete(doc.id), `Deleted ${title}`);
      await load();
    };

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

    const isFloatingMenuLayout = () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 721px)').matches;

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
      updateFolderScrollControls();
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

    const toggleNewMenu = () => {
      closeSidebarAccountMenu();
      openMenuCanvasId.value = '';
      openControlMenu.value = openControlMenu.value === 'new' ? '' : 'new';
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

    /** Direct children of the folder currently open, shown ahead of its items. */
    const activeSubfolders = computed(() => {
      const parentId = activeFolder.value?.id;
      if (!parentId) return [];
      return allResourceFolders.value
        .filter((folder) => (folder.parentId ?? null) === parentId)
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          count:
            (folder.canvasCount || 0) +
            (folder.htmlDocumentCount || 0) +
            (folder.textDocumentCount || 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    /**
     * Top-level folders shown as tiles below Recent. Unlike the sidebar tree,
     * this list is not filtered by isTechnicalFolder: "Unsorted" is where new
     * documents land by default and must stay reachable from Recent, not
     * sidebar-only.
     */
    const recentFolderTiles = computed(() => allResourceFolders.value
      .filter((folder) => !(folder.parentId ?? null))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        count:
          (folder.canvasCount || 0) +
          (folder.htmlDocumentCount || 0) +
          (folder.textDocumentCount || 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)));

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
      activeSection.value = { kind: 'folder', folderId };
      selectedFolderId.value = folderId;
      expandAncestorsOf(folderId);
      writeLastFolderId(folderId);
      closeCardMenu();
    };

    const isTechnicalFolder = (folder: { id: string; name: string }) =>
      folder.id === 'legacy-resource-inbox'
      || folder.name === 'Unsorted'
      || folder.name.toLowerCase() === 'default';

    const selectDashboardSection = (section: DashboardSection) => {
      activeSection.value = section;
      if (section.kind === 'folder') selectFolder(section.folderId);
      else closeCardMenu();
      mobileSidebarOpen.value = false;
    };

    const toggleSidebarWidth = () => {
      sidebarWidthState.value = sidebarWidthState.value === 'expanded' ? 'collapsed' : 'expanded';
      writeSidebarWidthState(storage(), sidebarWidthState.value);
    };

    const openMobileSidebar = (event?: Event) => {
      const eventTarget = event?.currentTarget;
      mobileSidebarOpener.value = eventTarget instanceof HTMLElement
        ? eventTarget
        : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      mobileSidebarOpen.value = true;
    };

    const closeMobileSidebar = () => {
      mobileSidebarOpen.value = false;
    };

    const focusWithoutScroll = (element: HTMLElement) => {
      try {
        element.focus({ preventScroll: true });
      } catch {
        element.focus();
      }
    };

    const isVisibleFocusTarget = (element: HTMLElement | null): element is HTMLElement => {
      if (!element?.isConnected || element.tabIndex < 0 || element.getAttribute('aria-hidden') === 'true') return false;
      let current: HTMLElement | null = element;
      while (current) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        current = current.parentElement;
      }
      return true;
    };

    const restoreSidebarCloseFocus = () => {
      const opener = mobileSidebarOpener.value;
      if (isVisibleFocusTarget(opener)) {
        focusWithoutScroll(opener);
        return;
      }
      const fallback = [
        document.querySelector<HTMLElement>('.dashboard-sidebar [aria-current="page"]'),
        document.querySelector<HTMLElement>('.dashboard-sidebar [data-home-disclosure]'),
        document.querySelector<HTMLElement>('.dashboard-sidebar [data-sidebar-width-toggle]'),
        document.querySelector<HTMLElement>('.dashboard [data-dashboard-view]'),
      ].find(isVisibleFocusTarget) ?? null;
      if (isVisibleFocusTarget(fallback)) focusWithoutScroll(fallback);
    };

    const restoreBodyOverflow = () => {
      if (typeof document === 'undefined' || previousBodyOverflow === null) return;
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    };

    const getSidebarDesktopMedia = () => {
      try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia(SIDEBAR_DESKTOP_QUERY)
          : null;
      } catch {
        return null;
      }
    };

    const closeMobileSidebarOnDesktop = () => {
      if (sidebarDesktopMedia?.matches) closeMobileSidebar();
    };

    const addSidebarDesktopListener = (media: MediaQueryList) => {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', closeMobileSidebarOnDesktop);
      } else if (typeof media.addListener === 'function') {
        media.addListener(closeMobileSidebarOnDesktop);
      }
    };

    const removeSidebarDesktopListener = () => {
      if (!sidebarDesktopMedia) return;
      if (typeof sidebarDesktopMedia.removeEventListener === 'function') {
        sidebarDesktopMedia.removeEventListener('change', closeMobileSidebarOnDesktop);
      } else if (typeof sidebarDesktopMedia.removeListener === 'function') {
        sidebarDesktopMedia.removeListener(closeMobileSidebarOnDesktop);
      }
      sidebarDesktopMedia = null;
    };

    watch(mobileSidebarOpen, async (open, _previous, onCleanup) => {
      if (typeof document === 'undefined') return;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      if (open) {
        if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        await nextTick();
        if (!cancelled && mobileSidebarOpen.value) {
          const closeButton = document.querySelector<HTMLElement>('.dashboard-sidebar.mobile-open [data-sidebar-close]');
          if (closeButton) focusWithoutScroll(closeButton);
        }
        return;
      }

      restoreBodyOverflow();
      await nextTick();
      if (!cancelled && !mobileSidebarOpen.value) restoreSidebarCloseFocus();
    });

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

    const fileInput = ref<HTMLInputElement | null>(null);
    const importFolderId = ref<string | null>(null);

    const importFile = (folderId: string | null = null) => {
      importFolderId.value = folderId;
      openControlMenu.value = '';
      fileInput.value?.click();
    };
    const importToFolder = (folder: FolderSummary) => importFile(folder.id);

    const onFileSelected = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
        const title = file.name.replace(/\.(canvas|json|html?|htm)$/i, '') || 'Imported';
        const targetFolderId = importFolderId.value || (await ensureFolderByName('Unsorted'))?.id;
        if (isHtml) {
          const doc = await runAction(
            'import-html-document',
            () => htmlDocuments.create({ title, html: text, folderId: targetFolderId }),
            `Imported ${title}`,
          );
          if (!doc) return;
          router.push(`/edit/html/${doc.id}`);
          return;
        }

        const data = JSON.parse(text);
        const c = await runAction(
          'import-canvas',
          () => canvas.create(title, JSON.stringify(data), targetFolderId),
          `Imported ${title}`,
        );
        if (!c) return;
        router.push(`/canvas/${c.id}`);
      } catch (err) {
        setFeedback('error', err instanceof Error ? err.message : 'Failed to import file');
        console.error('Failed to import file:', err);
      } finally {
        importFolderId.value = null;
        (e.target as HTMLInputElement).value = '';
      }
    };

    const renamingId = ref('');
    const renameInput = ref<HTMLInputElement[]>([]);

    const startRename = (id: string) => {
      renamingId.value = id;
      nextTick(() => {
        renameInput.value?.[0]?.focus();
        renameInput.value?.[0]?.select();
      });
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

    onMounted(() => {
      void loadRecentResources();
      const cached = restoreDashboardCache();
      // Even a fresh native snapshot is refreshed quietly, so moving a
      // document between a dashboard visit and a return can never hide it.
      void load({ showLoading: !cached.found });
      sidebarDesktopMedia = getSidebarDesktopMedia();
      if (sidebarDesktopMedia) {
        addSidebarDesktopListener(sidebarDesktopMedia);
        closeMobileSidebarOnDesktop();
      }
      window.addEventListener('resize', refreshOverflowIndicators);
      refreshOverflowIndicators();
    });
    onBeforeUnmount(() => {
      removeSidebarDesktopListener();
      window.removeEventListener('resize', refreshOverflowIndicators);
      restoreBodyOverflow();
    });

    return {
      admin,
      t,
      isLoggedIn,
      loading,
      isRefreshing,
      recentResources,
      recentViewMode,
      setRecentViewMode,
      openRecentResource,
      rememberRecentResource,
      recentResourceTypeLabel,
      recentResourceIconClass,
      formatRecentOpenedAt,
      tagFilterList,
      activeFolderBody,
      scrollActiveFolder,
      updateFolderScrollControls,
      hasTagOverflow,
      canScrollFolderUp,
      canScrollFolderDown,
      dashboardMain,
      isNativeDashboard,
      dashboardPullDistance,
      DASHBOARD_PULL_THRESHOLD,
      onDashboardPullStart,
      onDashboardPullMove,
      onDashboardPullEnd,
      resetDashboardPull,
      sharedFiltered,
      publicFiltered,
      allTagNames,
      folderOptions,
      folderNames,
      searchQuery,
      selectedTag,
      contentFilter,
      sortMode,
      feedback,
      isBusy,
      canSaveFolderModal,
      actionLabel,
      openMenuCanvasId,
      openControlMenu,
      closeControlMenusForAccount,
      activeSection,
      sidebarWidthState,
      mobileSidebarOpen,
      sidebarFolders,
      selectDashboardSection,
      toggleSidebarWidth,
      openMobileSidebar,
      closeMobileSidebar,
      onAppClickCapture,
      onAppKeydownCapture,
      draggingResourceId,
      draggingResourceType,
      dragTargetFolder,
      draggingResourceFolderId,
      folderDragOverId,
      tagColors,
      tagSuggestions,
      isOwnedResource,
      folderModal,
      renameFolderModal,
      folderShareModal,
      tagsModal,
      tagManager,
      transferModal,
      folderSummaries,
      activeFolder,
      selectedFolderId,
      incomingRequests,
      createCanvas,
      createHtmlDocument,
      createTextDocument,
      createInteractiveTemplate,
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
      onFolderDragOver,
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
      openTagManager,
      closeTagManager,
      saveManagedTag,
      deleteManagedTag,
      openTransferModal,
      closeTransferModal,
      saveTransferModal,
      toggleFolderOpen,
      isFolderOpen,
      selectFolder,
      isTechnicalFolder,
      toggleCardMenu,
      closeCardMenu,
      toggleNewMenu,
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
      renameInput,
      startRename,
      finishRename,
      fileInput,
      importFile,
      importToFolder,
      onFileSelected,
      resolveAccessRequest,
    };
  },
});
</script>

<style scoped>
.template-picker-modal { width: min(620px, calc(100vw - 32px)); }
.template-picker-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; padding-top: 6px; }
.template-picker-tile { display: grid; gap: 8px; min-height: 172px; padding: 18px; text-align: left; color: inherit; background: rgba(124,138,255,.08); border: 1px solid rgba(124,138,255,.4); border-radius: 12px; cursor: pointer; }
.template-picker-tile:hover { background: rgba(124,138,255,.16); border-color: rgba(143,154,255,.75); }.template-picker-tile:disabled { opacity: .6; cursor: wait; }
.template-picker-icon { font-size: 30px; color: #9ca8ff; }.template-picker-tile strong { font-size: 15px; }.template-picker-tile small { color: var(--muted, #a8a8b6); line-height: 1.35; }
</style>
