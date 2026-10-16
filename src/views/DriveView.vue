<template>
  <div
    class="drive-page"
    data-drive-view
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drag & Drop Overlay -->
    <div
      v-if="isDraggingOver && activeTab !== 'photos'"
      class="drive-drop-overlay"
      data-drop-overlay
      aria-hidden="true"
    >
      <div class="drive-drop-overlay-content">
        <Upload :size="48" class="drive-drop-icon" />
        <span class="drive-drop-text">Перетащите файлы сюда для загрузки</span>
      </div>
    </div>

    <!-- Hidden Multi-file Input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      data-file-input
      @change="onFilesSelected"
    />

    <!-- Left Sidebar (Desktop) -->
    <aside class="drive-sidebar" aria-label="Разделы диска">
      <div class="drive-sidebar-brand-row">
        <router-link to="/dashboard" class="drive-brand-link" title="Назад в дашборд">
          <div class="drive-brand-badge">Q</div>
          <span class="drive-brand-name">Q Space</span>
        </router-link>
      </div>

      <!-- Top Tabs: Файлы / Фото -->
      <div role="tablist" aria-label="Вкладки" class="drive-sidebar-tabs">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'files'"
          class="drive-tab-btn"
          :class="{ active: activeTab === 'files' }"
          data-tab="files"
          @click="activeTab = 'files'"
        >
          Файлы
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'photos'"
          class="drive-tab-btn"
          :class="{ active: activeTab === 'photos' }"
          data-tab="photos"
          @click="activeTab = 'photos'"
        >
          Фото
        </button>
      </div>

      <!-- Root "Диск" Link -->
      <router-link
        to="/drive"
        class="drive-sidebar-root-item"
        :class="{ active: currentFolderId === 'root' && route.path === '/drive' }"
        :aria-current="currentFolderId === 'root' && route.path === '/drive' ? 'page' : undefined"
        data-sidebar-root
      >
        <HardDrive :size="18" aria-hidden="true" />
        <span>Диск</span>
      </router-link>

      <!-- Trash Link -->
      <router-link
        to="/drive/trash"
        class="drive-sidebar-root-item drive-sidebar-trash-item"
        :class="{ active: route.path === '/drive/trash' }"
        data-sidebar-trash
        aria-label="Корзина"
      >
        <Trash2 :size="18" aria-hidden="true" />
        <span>Корзина</span>
      </router-link>

      <!-- Q CUP: devices, keepers, storage rules -->
      <router-link
        to="/drive/devices"
        class="drive-sidebar-root-item"
        data-sidebar-devices
      >
        <MonitorSmartphone :size="18" aria-hidden="true" />
        <span>{{ t('cupTitle') }}</span>
      </router-link>

      <!-- Lazy Folder Tree -->
      <div class="drive-tree" role="tree" aria-label="Папки">
        <div
          v-for="node in treeFolders"
          :key="node.id"
          class="drive-tree-node-group"
        >
          <div
            class="drive-tree-item"
            :class="{ active: currentFolderId === node.id }"
            :style="{ paddingLeft: `${node.depth * 14 + 10}px` }"
          >
            <button
              type="button"
              class="drive-tree-expand-btn"
              :aria-label="node.expanded ? 'Свернуть' : 'Развернуть'"
              :aria-expanded="node.expanded"
              :data-folder-expand="node.id"
              @click.stop="toggleTreeNode(node)"
            >
              <ChevronDown
                :size="15"
                class="drive-tree-chevron"
                :class="{ collapsed: !node.expanded }"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="drive-tree-label-btn"
              :title="node.name"
              :data-tree-folder="node.id"
              @click="navigateToFolder(node.id)"
            >
              <Folder :size="16" class="drive-tree-folder-icon" aria-hidden="true" />
              <span class="drive-tree-name">{{ node.name }}</span>
            </button>
          </div>

          <!-- Children -->
          <div v-if="node.expanded && node.children && node.children.length > 0" class="drive-tree-children">
            <div
              v-for="child in node.children"
              :key="child.id"
              class="drive-tree-item"
              :class="{ active: currentFolderId === child.id }"
              :style="{ paddingLeft: `${(node.depth + 1) * 14 + 10}px` }"
            >
              <button
                type="button"
                class="drive-tree-expand-btn"
                :aria-label="child.expanded ? 'Свернуть' : 'Развернуть'"
                :aria-expanded="child.expanded"
                :data-folder-expand="child.id"
                @click.stop="toggleTreeNode(child)"
              >
                <ChevronDown
                  :size="15"
                  class="drive-tree-chevron"
                  :class="{ collapsed: !child.expanded }"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="drive-tree-label-btn"
                :title="child.name"
                :data-tree-folder="child.id"
                @click="navigateToFolder(child.id)"
              >
                <Folder :size="16" class="drive-tree-folder-icon" aria-hidden="true" />
                <span class="drive-tree-name">{{ child.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="drive-main">
      <!-- Mobile Header (≤ 640px) -->
      <header class="drive-mobile-header">
        <div class="drive-mobile-top-bar">
          <button
            type="button"
            class="drive-mobile-back-btn"
            aria-label="Назад"
            data-mobile-back
            @click="goBack"
          >
            <ArrowLeft :size="20" aria-hidden="true" />
          </button>
          <h1 class="drive-mobile-title">{{ folderTitle }}</h1>
          <button
            v-if="activeTab !== 'photos'"
            type="button"
            class="drive-mobile-header-btn"
            aria-label="Загрузить файлы"
            data-mobile-upload-button
            title="Загрузить файлы"
            @click="triggerFileInput"
          >
            <Upload :size="18" aria-hidden="true" />
          </button>
          <router-link
            to="/drive/devices"
            class="drive-mobile-header-btn"
            :aria-label="t('cupTitle')"
            :title="t('cupTitle')"
            data-mobile-devices-link
          >
            <MonitorSmartphone :size="18" aria-hidden="true" />
          </router-link>
          <button
            type="button"
            class="drive-mobile-search-toggle"
            aria-label="Поиск"
            data-mobile-search-toggle
            @click="mobileSearchOpen = !mobileSearchOpen"
          >
            <Search :size="20" aria-hidden="true" />
          </button>
        </div>

        <!-- Mobile Expandable Search -->
        <div v-if="mobileSearchOpen" class="drive-mobile-search-row">
          <div class="drive-search-input-wrapper">
            <Search :size="16" class="drive-search-icon" aria-hidden="true" />
            <input
              v-model="searchQuery"
              type="search"
              class="drive-search-input"
              :placeholder="searchAllDrive ? 'Поиск по всему диску' : 'Поиск в этой папке'"
              data-drive-search-mobile
            />
            <button
              v-if="searchQuery"
              type="button"
              class="drive-search-clear"
              aria-label="Очистить"
              @click="clearSearch"
            >
              <X :size="14" aria-hidden="true" />
            </button>
          </div>
          <label class="drive-scope-checkbox-label">
            <input
              v-model="searchAllDrive"
              type="checkbox"
              data-search-scope-toggle-mobile
            />
            <span>во всём диске</span>
          </label>
        </div>
      </header>

      <!-- Desktop Header -->
      <header class="drive-desktop-header">
        <!-- Breadcrumbs -->
        <nav aria-label="Путь" class="drive-breadcrumbs">
          <router-link to="/drive" class="drive-breadcrumb-link" data-breadcrumb="root">Диск</router-link>
          <template v-for="(crumb, idx) in breadcrumbTrail" :key="crumb.id">
            <span class="drive-breadcrumb-sep" aria-hidden="true">›</span>
            <router-link
              v-if="idx < breadcrumbTrail.length - 1"
              :to="`/drive/${crumb.id}`"
              class="drive-breadcrumb-link"
              :data-breadcrumb="crumb.id"
            >
              {{ crumb.name }}
            </router-link>
            <span v-else class="drive-breadcrumb-current" :data-breadcrumb="crumb.id">
              {{ crumb.name }}
            </span>
          </template>
        </nav>

        <div class="drive-header-actions">
          <!-- Desktop Search -->
          <div class="drive-search-container">
            <div class="drive-search-input-wrapper">
              <Search :size="16" class="drive-search-icon" aria-hidden="true" />
              <input
                v-model="searchQuery"
                type="search"
                class="drive-search-input"
                :placeholder="searchAllDrive ? 'Поиск по всему диску' : 'Поиск в этой папке'"
                data-drive-search
              />
              <button
                v-if="searchQuery"
                type="button"
                class="drive-search-clear"
                aria-label="Очистить"
                @click="clearSearch"
              >
                <X :size="14" aria-hidden="true" />
              </button>
            </div>
            <label class="drive-scope-checkbox-label" title="Искать по всему диску">
              <input
                v-model="searchAllDrive"
                type="checkbox"
                data-search-scope-toggle
              />
              <span>во всём диске</span>
            </label>
          </div>

          <!-- Upload Button (Hidden on Photos tab) -->
          <button
            v-if="activeTab !== 'photos'"
            type="button"
            class="drive-btn drive-btn-primary"
            data-upload-button
            aria-label="Загрузить файлы"
            @click="triggerFileInput"
          >
            <Upload :size="16" aria-hidden="true" />
            <span>Загрузить</span>
          </button>

          <!-- Create Button + Menu -->
          <div class="drive-create-dropdown-container">
            <button
              type="button"
              class="drive-btn drive-btn-secondary"
              aria-haspopup="menu"
              :aria-expanded="createMenuOpen"
              data-create-button
              @click="createMenuOpen = !createMenuOpen"
            >
              <Plus :size="16" aria-hidden="true" />
              <span>Создать</span>
            </button>

            <div
              v-if="createMenuOpen"
              class="drive-create-menu"
              role="menu"
              aria-label="Создать новый элемент"
              data-create-menu
            >
              <button
                type="button"
                role="menuitem"
                class="drive-create-menu-item"
                data-create-folder
                aria-label="Создать папку"
                @click="onCreateFolder"
              >
                <FolderPlus :size="16" aria-hidden="true" />
                <span>Папка</span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="drive-create-menu-item"
                data-create-canvas
                aria-label="Создать канвас"
                @click="onCreateCanvas"
              >
                <span class="resource-title-icon icon-canvas" aria-hidden="true"></span>
                <span>Канвас</span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="drive-create-menu-item"
                data-create-doc
                aria-label="Создать документ"
                @click="onCreateDocument"
              >
                <span class="resource-title-icon icon-text-doc" aria-hidden="true"></span>
                <span>Документ</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Photos Tab View (Stage 3 Stub) -->
      <section v-if="activeTab === 'photos'" class="drive-photos-tab" data-photos-tab>
        <div class="drive-empty-placeholder">
          <Image :size="48" class="drive-empty-icon" aria-hidden="true" />
          <p class="drive-empty-text">Своя лента фото появится на этапе 3</p>
        </div>
      </section>

      <!-- Files Tab View -->
      <section v-else class="drive-files-tab" data-files-tab>
        <!-- Folder Title & Slice Bar -->
        <div class="drive-title-bar">
          <div class="drive-title-meta">
            <h1 class="drive-heading" data-folder-title>{{ folderTitle }}</h1>
            <div v-if="folderRoleLabel" class="drive-role-badge">
              <span>{{ folderRoleLabel }}</span>
            </div>
          </div>

          <!-- Slices (Всё / Фото и видео / Файлы / Канвасы и документы) -->
          <div role="group" aria-label="Срез" class="drive-slice-group">
            <button
              v-for="s in sliceDefs"
              :key="s.id"
              type="button"
              class="drive-slice-chip"
              :class="{ active: activeSlice === s.id }"
              :aria-pressed="activeSlice === s.id"
              :data-slice="s.id"
              @click="setSlice(s.id)"
            >
              <span>{{ s.label }}</span>
              <span v-if="getSliceCount(s.id) !== undefined" class="drive-slice-count">
                {{ getSliceCount(s.id) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Toolbar (Sort & Grid/List Toggle) -->
        <div class="drive-toolbar">
          <div class="drive-sort-controls">
            <label class="drive-sort-label">Сортировка:</label>
            <button
              type="button"
              class="drive-sort-btn"
              :class="{ active: activeSort === 'name' }"
              data-sort="name"
              @click="setSort('name')"
            >
              Имя
            </button>
            <button
              type="button"
              class="drive-sort-btn"
              :class="{ active: activeSort === 'date' }"
              data-sort="date"
              @click="setSort('date')"
            >
              Дата
            </button>
            <button
              type="button"
              class="drive-order-toggle"
              :aria-label="activeOrder === 'asc' ? 'По возрастанию' : 'По убыванию'"
              data-order-toggle
              @click="toggleOrder"
            >
              <ArrowUp v-if="activeOrder === 'asc'" :size="15" aria-hidden="true" />
              <ArrowDown v-else :size="15" aria-hidden="true" />
            </button>
          </div>

          <div class="drive-view-controls">
            <button
              type="button"
              class="drive-view-toggle"
              :class="{ active: viewMode === 'grid' }"
              aria-label="Плитка"
              title="Плитка"
              data-view-mode="grid"
              @click="viewMode = 'grid'"
            >
              <Grid :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="drive-view-toggle"
              :class="{ active: viewMode === 'list' }"
              aria-label="Список"
              title="Список"
              data-view-mode="list"
              @click="viewMode = 'list'"
            >
              <List :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Main Body: Loading / Error / Empty / Grid / List -->
        <div v-if="loading" class="drive-loading-state" data-loading>
          <div class="drive-spinner" aria-hidden="true"></div>
          <span>Загрузка…</span>
        </div>

        <div v-else-if="error" class="drive-error-state" data-error>
          <p class="drive-error-message">{{ error }}</p>
          <button type="button" class="drive-btn drive-btn-secondary" @click="loadCurrentFolder">
            Попробовать снова
          </button>
        </div>

        <!-- Search with 0 results -->
        <div
          v-else-if="isSearching && searchResults.length === 0"
          class="drive-empty-placeholder"
          data-empty="search"
        >
          <Search :size="40" class="drive-empty-icon" aria-hidden="true" />
          <p class="drive-empty-text">Ничего не найдено</p>
        </div>

        <!-- Slices empty placeholders -->
        <div
          v-else-if="!isSearching && displayedItems.length === 0"
          class="drive-empty-placeholder"
          :data-empty="activeSlice"
        >
          <template v-if="activeSlice === 'media'">
            <Image :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">Фото и видео появятся на этапе 3</p>
          </template>
          <template v-else-if="activeSlice === 'files'">
            <File :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">Загрузка обычных файлов появится на этапе 2</p>
          </template>
          <template v-else-if="activeSlice === 'docs'">
            <FileText :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">В этой папке пока нет канвасов и документов</p>
          </template>
          <template v-else>
            <Folder :size="40" class="drive-empty-icon" aria-hidden="true" />
            <p class="drive-empty-text">В этой папке пока ничего нет</p>
          </template>
        </div>

        <!-- Items View (Grid or List, Folders first) -->
        <div v-else>
          <!-- Grid View -->
          <div
            v-if="viewMode === 'grid'"
            class="drive-grid"
            data-view-grid
          >
            <div
              v-for="item in displayedItems"
              :key="`${item.kind}-${item.id}`"
              class="drive-card"
              :class="`drive-card-${item.kind}`"
              :data-drive-item="item.id"
              :data-item-kind="item.kind"
              tabindex="0"
              role="button"
              @click="onItemClick(item)"
              @keydown.enter="onItemClick(item)"
            >
              <!-- Card Preview Header -->
              <div class="drive-card-preview" :class="`preview-${item.kind}`">
                <Folder v-if="item.kind === 'folder'" :size="44" class="drive-folder-svg" aria-hidden="true" />
                <div v-else-if="item.kind === 'canvas'" class="drive-card-canvas-mock" aria-hidden="true">
                  <div class="canvas-node n1"></div>
                  <div class="canvas-node n2"></div>
                  <div class="canvas-line"></div>
                </div>
                <div v-else-if="item.kind === 'text-document'" class="drive-card-doc-mock" aria-hidden="true">
                  <div class="doc-line l-head"></div>
                  <div class="doc-line l1"></div>
                  <div class="doc-line l2"></div>
                  <div class="doc-line l3"></div>
                </div>
                <div v-else-if="item.kind === 'html-document'" class="drive-card-html-mock" aria-hidden="true">
                  <Code :size="32" aria-hidden="true" />
                </div>
                <div v-else-if="item.kind === 'board' || item.kind === 'sheet'" class="drive-card-board-mock" aria-hidden="true">
                  <div class="board-col"><div class="board-card"></div></div>
                  <div class="board-col"><div class="board-card"></div><div class="board-card"></div></div>
                </div>
                <div v-else-if="isMediaItem(item)" class="drive-card-file-mock" aria-hidden="true">
                  <Video v-if="isVideoItem(item)" :size="38" class="drive-media-icon" />
                  <Image v-else :size="38" class="drive-media-icon" />
                </div>
                <div v-else class="drive-card-file-mock" aria-hidden="true">
                  <File :size="36" aria-hidden="true" />
                  <span class="drive-ext-badge drive-ext-badge-preview">{{ getFileExtension(item.name) }}</span>
                </div>
              </div>

              <!-- Card Body -->
              <div class="drive-card-body">
                <div class="drive-card-title-row">
                  <Folder v-if="item.kind === 'folder'" :size="16" class="drive-folder-inline-icon" aria-hidden="true" />
                  <Video v-else-if="isVideoItem(item)" :size="16" class="drive-file-inline-icon" aria-hidden="true" />
                  <Image v-else-if="isImageItem(item)" :size="16" class="drive-file-inline-icon" aria-hidden="true" />
                  <span
                    v-else-if="item.kind !== 'file'"
                    class="resource-title-icon"
                    :class="getItemIconClass(item.kind)"
                    aria-hidden="true"
                  ></span>
                  <span v-else class="drive-ext-badge drive-ext-badge-sm">{{ getFileExtension(item.name) }}</span>
                  <span class="drive-card-name" :title="item.name">{{ item.name }}</span>

                  <!-- File Context Menu Button -->
                  <div v-if="isFileKind(item)" class="drive-item-menu-container">
                    <button
                      type="button"
                      class="drive-item-menu-btn"
                      :data-file-menu-btn="item.id"
                      aria-haspopup="menu"
                      :aria-expanded="activeFileMenuId === item.id"
                      aria-label="Действия с файлом"
                      title="Действия"
                      @click.stop="toggleFileMenu(item.id)"
                    >
                      <MoreVertical :size="16" aria-hidden="true" />
                    </button>

                    <div
                      v-if="activeFileMenuId === item.id"
                      class="drive-item-dropdown-menu"
                      role="menu"
                      aria-label="Меню файла"
                      data-file-menu
                      @click.stop
                    >
                      <button
                        type="button"
                        role="menuitem"
                        class="drive-item-menu-action"
                        data-action="download"
                        aria-label="Скачать файл"
                        @click="onDownloadFile(item)"
                      >
                        <Download :size="15" aria-hidden="true" />
                        <span>Скачать</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        class="drive-item-menu-action"
                        data-action="rename"
                        aria-label="Переименовать файл"
                        @click="onRenameFile(item)"
                      >
                        <Edit2 :size="15" aria-hidden="true" />
                        <span>Переименовать</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        class="drive-item-menu-action"
                        data-action="properties"
                        :aria-label="t('fileProperties')"
                        @click="onShowProperties(item)"
                      >
                        <Info :size="15" aria-hidden="true" />
                        <span>{{ t('fileProperties') }}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        class="drive-item-menu-action drive-menu-danger"
                        data-action="trash"
                        aria-label="Переместить в корзину"
                        @click="onTrashFile(item)"
                      >
                        <Trash2 :size="15" aria-hidden="true" />
                        <span>В корзину</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="drive-card-meta">
                  <span v-if="item.sizeBytes !== null && item.sizeBytes !== undefined" class="drive-size-meta">
                    {{ formatFileSize(item.sizeBytes) }}
                  </span>
                  <span v-else class="drive-kind-pill">{{ getKindLabel(item.kind) }}</span>
                  <span class="drive-date">{{ formatDate(item.updatedAt || item.sortDate) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- List View -->
          <div
            v-else
            class="drive-list"
            data-view-list
          >
            <div
              v-for="item in displayedItems"
              :key="`${item.kind}-${item.id}`"
              class="drive-list-row"
              :class="`drive-row-${item.kind}`"
              :data-drive-item="item.id"
              :data-item-kind="item.kind"
              tabindex="0"
              role="button"
              @click="onItemClick(item)"
              @keydown.enter="onItemClick(item)"
            >
              <div class="drive-row-icon-col">
                <Folder v-if="item.kind === 'folder'" :size="20" class="drive-folder-inline-icon" aria-hidden="true" />
                <Video v-else-if="isVideoItem(item)" :size="20" class="drive-file-inline-icon" aria-hidden="true" />
                <Image v-else-if="isImageItem(item)" :size="20" class="drive-file-inline-icon" aria-hidden="true" />
                <span
                  v-else-if="item.kind !== 'file'"
                  class="resource-title-icon"
                  :class="getItemIconClass(item.kind)"
                  aria-hidden="true"
                ></span>
                <span v-else class="drive-ext-badge">{{ getFileExtension(item.name) }}</span>
              </div>
              <div class="drive-row-name-col">
                <span class="drive-row-name">{{ item.name }}</span>
              </div>
              <div class="drive-row-size-col">
                <span v-if="item.sizeBytes !== null && item.sizeBytes !== undefined" class="drive-size">
                  {{ formatFileSize(item.sizeBytes) }}
                </span>
                <span v-else class="drive-kind-pill">{{ getKindLabel(item.kind) }}</span>
              </div>
              <div class="drive-row-date-col">
                <span class="drive-date">{{ formatDate(item.updatedAt || item.sortDate) }}</span>
              </div>
              <div v-if="isFileKind(item)" class="drive-row-menu-col" @click.stop>
                <div class="drive-item-menu-container">
                  <button
                    type="button"
                    class="drive-item-menu-btn"
                    :data-file-menu-btn="item.id"
                    aria-haspopup="menu"
                    :aria-expanded="activeFileMenuId === item.id"
                    aria-label="Действия с файлом"
                    title="Действия"
                    @click.stop="toggleFileMenu(item.id)"
                  >
                    <MoreVertical :size="16" aria-hidden="true" />
                  </button>

                  <div
                    v-if="activeFileMenuId === item.id"
                    class="drive-item-dropdown-menu"
                    role="menu"
                    aria-label="Меню файла"
                    data-file-menu
                    @click.stop
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="drive-item-menu-action"
                      data-action="download"
                      aria-label="Скачать файл"
                      @click="onDownloadFile(item)"
                    >
                      <Download :size="15" aria-hidden="true" />
                      <span>Скачать</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="drive-item-menu-action"
                      data-action="rename"
                      aria-label="Переименовать файл"
                      @click="onRenameFile(item)"
                    >
                      <Edit2 :size="15" aria-hidden="true" />
                      <span>Переименовать</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="drive-item-menu-action"
                      data-action="properties"
                      :aria-label="t('fileProperties')"
                      @click="onShowProperties(item)"
                    >
                      <Info :size="15" aria-hidden="true" />
                      <span>{{ t('fileProperties') }}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="drive-item-menu-action drive-menu-danger"
                      data-action="trash"
                      aria-label="Переместить в корзину"
                      @click="onTrashFile(item)"
                    >
                      <Trash2 :size="15" aria-hidden="true" />
                      <span>В корзину</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Load More / Next Page -->
          <div v-if="activeNextCursor" class="drive-pagination">
            <button
              type="button"
              class="drive-btn drive-btn-secondary"
              :disabled="loadingMore"
              data-load-more
              @click="onLoadMore"
            >
              <span v-if="loadingMore">Загрузка…</span>
              <span v-else>Показать ещё</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Upload Panel (Bottom-right desktop, bottom-sheet mobile) -->
      <aside
        v-if="uploadPanelVisible && uploads.length > 0"
        class="drive-upload-panel"
        data-upload-panel
        aria-label="Панель загрузок"
      >
        <div class="drive-upload-panel-header">
          <div class="drive-upload-panel-title">
            <Upload :size="16" aria-hidden="true" />
            <span>Загрузка файлов</span>
            <span class="drive-upload-panel-count">({{ uploads.length }})</span>
          </div>
          <button
            v-if="allUploadsFinished"
            type="button"
            class="drive-upload-hide-btn"
            data-upload-hide
            aria-label="Скрыть панель загрузки"
            @click="uploadPanelVisible = false"
          >
            Скрыть
          </button>
        </div>

        <div class="drive-upload-list" data-upload-list>
          <div
            v-for="u in uploads"
            :key="u.id"
            class="drive-upload-item"
            :class="`status-${u.status}`"
            :data-upload-item="u.id"
          >
            <div class="drive-upload-item-top">
              <span class="drive-upload-item-name" :title="u.name">{{ u.name }}</span>
              <span class="drive-upload-item-size">{{ formatFileSize(u.size) }}</span>
            </div>

            <!-- Progress / Status Row -->
            <div class="drive-upload-item-bottom">
              <template v-if="u.status === 'uploading'">
                <div class="drive-upload-progressbar">
                  <div class="drive-upload-progressfill" :style="{ width: `${u.progress}%` }"></div>
                </div>
                <span class="drive-upload-percent">{{ u.progress }}%</span>
                <button
                  type="button"
                  class="drive-upload-cancel-btn"
                  :data-upload-cancel="u.id"
                  aria-label="Отменить загрузку"
                  title="Отменить"
                  @click="cancelUpload(u)"
                >
                  <X :size="14" aria-hidden="true" />
                </button>
              </template>

              <template v-else-if="u.status === 'done'">
                <span class="drive-upload-status-done">
                  <Check :size="14" aria-hidden="true" />
                  Готово
                </span>
              </template>

              <template v-else-if="u.status === 'error'">
                <span class="drive-upload-status-error" :title="u.errorMessage">
                  {{ u.errorMessage }}
                </span>
              </template>

              <template v-else-if="u.status === 'cancelled'">
                <span class="drive-upload-status-cancelled">Отменено</span>
              </template>
            </div>
          </div>
        </div>
      </aside>

      <DriveFileProperties
        v-if="propertiesItem"
        :file-id="propertiesItem.id"
        :file-name="propertiesItem.name"
        @close="propertiesItem = null"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Code,
  Download,
  Edit2,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid,
  HardDrive,
  Image,
  Info,
  List,
  MonitorSmartphone,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  driveApi,
  formatFileSize,
  getFileExtension,
  resolveDownloadUrl,
  type DriveFolderResponse,
  type DriveItem,
  type DriveItemKind,
  type DriveOrder,
  type DriveSlice,
  type DriveSort,
} from '../api/drive';
import { canvas, resourceFolders, textDocuments } from '../api/client';
import { alertDialog, confirmDialog, promptDialog } from '../composables/appDialog';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import DriveFileProperties from '../components/DriveFileProperties.vue';

interface TreeNode {
  id: string;
  name: string;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  children: TreeNode[] | null;
}

interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  errorMessage?: string;
  abort?: () => void;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const currentFolderId = computed<string>(() => {
  const raw = route.params.folderId;
  if (!raw || Array.isArray(raw)) return 'root';
  return String(raw);
});

// State
const activeTab = ref<'files' | 'photos'>('files');
const activeSlice = ref<DriveSlice>('all');
const activeSort = ref<DriveSort>('name');
const activeOrder = ref<DriveOrder>('asc');
const viewMode = ref<'grid' | 'list'>('grid');
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const folderInfo = ref<DriveFolderResponse | null>(null);
const items = ref<DriveItem[]>([]);
const nextCursor = ref<string | null>(null);

// Search
const searchQuery = ref('');
const debouncedQuery = ref('');
const searchAllDrive = ref(false);
const searchResults = ref<DriveItem[]>([]);
const searchNextCursor = ref<string | null>(null);
const mobileSearchOpen = ref(false);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Menus
const createMenuOpen = ref(false);
const activeFileMenuId = ref<string | null>(null);
const propertiesItem = ref<DriveItem | null>(null);

// File input & Uploads
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploads = ref<UploadItem[]>([]);
const uploadPanelVisible = ref(false);
const isDraggingOver = ref(false);
let dragCounter = 0;

// Sidebar Tree
const treeFolders = ref<TreeNode[]>([]);

const isSearching = computed(() => debouncedQuery.value.length > 0);

const allUploadsFinished = computed(() => (
  uploads.value.length > 0 && uploads.value.every((u) => u.status !== 'uploading')
));

const activeNextCursor = computed(() => (
  isSearching.value ? searchNextCursor.value : nextCursor.value
));

const folderTitle = computed(() => {
  if (currentFolderId.value === 'root') {
    return 'Диск';
  }
  return folderInfo.value?.folder.name || 'Папка';
});

useDocumentTitle(computed(() => `${folderTitle.value} — ${t('drive')}`));

const folderRoleLabel = computed(() => {
  const role = folderInfo.value?.folder.role;
  if (!role || role === 'owner') return null;
  if (role === 'editor') return 'Редактор';
  if (role === 'viewer') return 'Просмотр';
  return null;
});

const breadcrumbTrail = computed(() => (
  folderInfo.value?.path || []
));

const sliceDefs: Array<{ id: DriveSlice; label: string }> = [
  { id: 'all', label: 'Всё' },
  { id: 'media', label: 'Фото и видео' },
  { id: 'files', label: 'Файлы' },
  { id: 'docs', label: 'Канвасы и документы' },
];

function getSliceCount(sliceId: DriveSlice): number | undefined {
  const counts = folderInfo.value?.counts;
  if (!counts) return undefined;
  if (sliceId === 'all') {
    return (counts.folders || 0) + (counts.docs || 0) + (counts.files || 0) + (counts.media || 0);
  }
  if (sliceId === 'media') return counts.media || 0;
  if (sliceId === 'files') return counts.files || 0;
  if (sliceId === 'docs') return counts.docs || 0;
  return undefined;
}

const displayedItems = computed(() => {
  const source = isSearching.value ? searchResults.value : items.value;
  return [...source].sort((a, b) => {
    // Folders always first
    if (a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (a.kind !== 'folder' && b.kind === 'folder') return 1;
    return 0;
  });
});

function getKindLabel(kind: DriveItemKind): string {
  switch (kind) {
    case 'folder': return 'Папка';
    case 'canvas': return 'Канвас';
    case 'text-document': return 'Документ';
    case 'html-document': return 'HTML';
    case 'board': return 'Доска';
    case 'sheet': return 'Лист';
    case 'file': return 'Файл';
    case 'photo': return 'Фото';
    case 'video': return 'Видео';
    default: return 'Файл';
  }
}

function getItemIconClass(kind: DriveItemKind): string {
  switch (kind) {
    case 'canvas': return 'icon-canvas';
    case 'html-document': return 'icon-html';
    case 'text-document': return 'icon-text-doc';
    case 'board':
    case 'sheet': return 'icon-template';
    default: return '';
  }
}

function isFileKind(item: DriveItem): boolean {
  return item.kind === 'file' || item.kind === 'photo' || item.kind === 'video';
}

function isImageItem(item: DriveItem): boolean {
  return item.kind === 'photo' || (item.kind === 'file' && !!item.mime?.startsWith('image/'));
}

function isVideoItem(item: DriveItem): boolean {
  return item.kind === 'video' || (item.kind === 'file' && !!item.mime?.startsWith('video/'));
}

function isMediaItem(item: DriveItem): boolean {
  return isImageItem(item) || isVideoItem(item);
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

// Navigation or Download on click
async function onItemClick(item: DriveItem) {
  switch (item.kind) {
    case 'folder':
      router.push(`/drive/${item.id}`);
      break;
    case 'canvas':
      router.push(`/canvas/${item.id}`);
      break;
    case 'text-document':
      router.push(`/docs/${item.id}`);
      break;
    case 'html-document':
      router.push(`/edit/html/${item.id}`);
      break;
    case 'board':
    case 'sheet':
      router.push(`/templates/${item.id}`);
      break;
    case 'file':
    case 'photo':
    case 'video':
      await onDownloadFile(item);
      break;
    default:
      break;
  }
}

function navigateToFolder(id: string) {
  router.push(`/drive/${id}`);
}

function goBack() {
  const path = folderInfo.value?.path;
  if (path && path.length > 1) {
    const parent = path[path.length - 2];
    if (parent) {
      router.push(`/drive/${parent.id}`);
    } else {
      router.push('/drive');
    }
  } else if (path && path.length === 1) {
    router.push('/drive');
  } else {
    router.push('/dashboard');
  }
}

// Load folder data
async function loadCurrentFolder() {
  loading.value = true;
  error.value = null;
  try {
    const [infoRes, itemsRes] = await Promise.all([
      driveApi.getFolder(currentFolderId.value),
      driveApi.getFolderItems(currentFolderId.value, {
        slice: activeSlice.value,
        sort: activeSort.value,
        order: activeOrder.value,
      }),
    ]);
    folderInfo.value = infoRes;
    items.value = itemsRes.items;
    nextCursor.value = itemsRes.nextCursor;
  } catch (e: any) {
    error.value = e.message || 'Ошибка загрузки папки';
  } finally {
    loading.value = false;
  }
}

async function refetchItemsOnly() {
  if (isSearching.value) {
    await performSearch();
    return;
  }
  try {
    const res = await driveApi.getFolderItems(currentFolderId.value, {
      slice: activeSlice.value,
      sort: activeSort.value,
      order: activeOrder.value,
    });
    items.value = res.items;
    nextCursor.value = res.nextCursor;
  } catch (e: any) {
    error.value = e.message || 'Ошибка обновления списка';
  }
}

function setSlice(slice: DriveSlice) {
  if (activeSlice.value === slice) return;
  activeSlice.value = slice;
  refetchItemsOnly();
}

function setSort(sort: DriveSort) {
  if (activeSort.value === sort) return;
  activeSort.value = sort;
  refetchItemsOnly();
}

function toggleOrder() {
  activeOrder.value = activeOrder.value === 'asc' ? 'desc' : 'asc';
  refetchItemsOnly();
}

async function onLoadMore() {
  if (loadingMore.value || !activeNextCursor.value) return;
  loadingMore.value = true;
  try {
    if (isSearching.value) {
      const scopeFolder = searchAllDrive.value || currentFolderId.value === 'root'
        ? undefined
        : currentFolderId.value;
      const res = await driveApi.search({
        q: debouncedQuery.value,
        slice: activeSlice.value,
        folderId: scopeFolder,
        cursor: searchNextCursor.value,
      });
      searchResults.value = [...searchResults.value, ...res.items];
      searchNextCursor.value = res.nextCursor;
    } else {
      const res = await driveApi.getFolderItems(currentFolderId.value, {
        slice: activeSlice.value,
        sort: activeSort.value,
        order: activeOrder.value,
        cursor: nextCursor.value,
      });
      items.value = [...items.value, ...res.items];
      nextCursor.value = res.nextCursor;
    }
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить следующие элементы';
  } finally {
    loadingMore.value = false;
  }
}

// Search
async function performSearch() {
  if (!debouncedQuery.value) {
    searchResults.value = [];
    searchNextCursor.value = null;
    return;
  }
  loading.value = true;
  try {
    const scopeFolder = searchAllDrive.value || currentFolderId.value === 'root'
      ? undefined
      : currentFolderId.value;
    const res = await driveApi.search({
      q: debouncedQuery.value,
      slice: activeSlice.value,
      folderId: scopeFolder,
    });
    searchResults.value = res.items;
    searchNextCursor.value = res.nextCursor;
  } catch (e: any) {
    error.value = e.message || 'Ошибка поиска';
  } finally {
    loading.value = false;
  }
}

function clearSearch() {
  searchQuery.value = '';
  debouncedQuery.value = '';
  searchResults.value = [];
  searchNextCursor.value = null;
}

watch(searchQuery, (val) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    debouncedQuery.value = val.trim();
  }, 300);
});

watch([debouncedQuery, searchAllDrive], () => {
  if (debouncedQuery.value) {
    performSearch();
  } else {
    searchResults.value = [];
    searchNextCursor.value = null;
  }
});

// Sidebar Lazy Folder Tree
async function initSidebarTree() {
  try {
    const res = await driveApi.getFolderItems('root', { slice: 'all' });
    const rootFolders = res.items.filter((it) => it.kind === 'folder');
    treeFolders.value = rootFolders.map((f) => ({
      id: f.id,
      name: f.name,
      depth: 0,
      expanded: false,
      loaded: false,
      children: null,
    }));
  } catch {
    // Non-fatal if tree fails
  }
}

async function toggleTreeNode(node: TreeNode) {
  node.expanded = !node.expanded;
  if (node.expanded && !node.loaded) {
    try {
      const res = await driveApi.getFolderItems(node.id, { slice: 'all' });
      const childFolders = res.items.filter((it) => it.kind === 'folder');
      node.children = childFolders.map((cf) => ({
        id: cf.id,
        name: cf.name,
        depth: node.depth + 1,
        expanded: false,
        loaded: false,
        children: null,
      }));
      node.loaded = true;
    } catch {
      node.children = [];
    }
  }
}

// Create Actions
async function onCreateFolder() {
  createMenuOpen.value = false;
  const name = await promptDialog({
    title: 'Новая папка',
    placeholder: 'Название папки',
    confirmLabel: 'Создать',
    cancelLabel: 'Отмена',
  });
  if (name && name.trim()) {
    const parentId = currentFolderId.value === 'root' ? null : currentFolderId.value;
    await resourceFolders.create(name.trim(), parentId);
    await loadCurrentFolder();
    await initSidebarTree();
  }
}

async function onCreateCanvas() {
  createMenuOpen.value = false;
  const targetFolder = currentFolderId.value === 'root' ? null : currentFolderId.value;
  await canvas.create('Untitled', undefined, targetFolder);
  await loadCurrentFolder();
}

async function onCreateDocument() {
  createMenuOpen.value = false;
  const targetFolder = currentFolderId.value === 'root' ? null : currentFolderId.value;
  await textDocuments.create({ title: 'Untitled document', folderId: targetFolder });
  await loadCurrentFolder();
}

// File actions: Download, Rename, Trash
async function onDownloadFile(item: DriveItem) {
  activeFileMenuId.value = null;
  try {
    const res = await driveApi.getDownloadLink(item.id);
    const absoluteUrl = resolveDownloadUrl(res.url);
    const link = document.createElement('a');
    link.href = absoluteUrl;
    link.style.display = 'none';
    if (item.name) {
      link.download = item.name;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err: any) {
    await alertDialog({
      title: 'Не удалось скачать файл',
      message: err.message || 'Ошибка получения ссылки на скачивание',
    });
  }
}

async function onRenameFile(item: DriveItem) {
  activeFileMenuId.value = null;
  const newName = await promptDialog({
    title: 'Переименовать файл',
    placeholder: 'Новое имя файла',
    value: item.name,
    confirmLabel: 'Сохранить',
    cancelLabel: 'Отмена',
  });
  if (newName && newName.trim() && newName.trim() !== item.name) {
    try {
      await driveApi.renameFile(item.id, newName.trim());
      await loadCurrentFolder();
    } catch (err: any) {
      await alertDialog({
        title: 'Не удалось переименовать файл',
        message: err.message || 'Ошибка переименования',
      });
    }
  }
}

async function onTrashFile(item: DriveItem) {
  activeFileMenuId.value = null;
  const confirmed = await confirmDialog({
    title: `Переместить «${item.name}» в корзину?`,
    confirmLabel: 'В корзину',
    cancelLabel: 'Отмена',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await driveApi.trashFile(item.id);
    await loadCurrentFolder();
  } catch (err: any) {
    await alertDialog({
      title: 'Не удалось переместить файл в корзину',
      message: err.message || 'Ошибка перемещения в корзину',
    });
  }
}

function onShowProperties(item: DriveItem) {
  activeFileMenuId.value = null;
  propertiesItem.value = item;
}

function toggleFileMenu(id: string) {
  activeFileMenuId.value = activeFileMenuId.value === id ? null : id;
}

// Upload Handling
function triggerFileInput() {
  fileInputRef.value?.click();
}

function onFilesSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length > 0) {
    handleFilesUpload(files);
  }
  target.value = '';
}

async function handleFilesUpload(files: File[]) {
  if (files.length === 0) return;
  uploadPanelVisible.value = true;

  const targetFolder = currentFolderId.value;
  const newItems: UploadItem[] = files.map((file) => ({
    id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    name: file.name,
    size: file.size,
    progress: 0,
    status: 'uploading',
  }));

  uploads.value = [...newItems, ...uploads.value];

  await Promise.all(
    newItems.map(async (item) => {
      try {
        const handle = driveApi.uploadFile(targetFolder, item.file, (percent) => {
          const found = uploads.value.find((u) => u.id === item.id);
          if (found) {
            found.progress = percent;
          }
        });
        item.abort = () => handle.abort();
        await handle.promise;
        const found = uploads.value.find((u) => u.id === item.id);
        if (found) {
          found.progress = 100;
          found.status = 'done';
        }
      } catch (err: any) {
        const found = uploads.value.find((u) => u.id === item.id);
        if (!found || found.status === 'cancelled') return;
        found.status = 'error';
        if (err.status === 413 || err.message?.includes('413') || err.message === 'Файл больше 2 ГБ') {
          found.errorMessage = 'Файл больше 2 ГБ';
        } else {
          found.errorMessage = err.message || 'Ошибка загрузки';
        }
      }
    }),
  );

  await loadCurrentFolder();
}

function cancelUpload(item: UploadItem) {
  if (item.status === 'uploading') {
    item.status = 'cancelled';
    item.errorMessage = 'Загрузка отменена';
    item.abort?.();
  }
}

// Drag & Drop
function onDragEnter(e: DragEvent) {
  if (activeTab.value === 'photos') return;
  if (e.dataTransfer?.types?.includes('Files')) {
    dragCounter++;
    isDraggingOver.value = true;
  }
}

function onDragOver(e: DragEvent) {
  if (activeTab.value === 'photos') return;
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
  }
}

function onDragLeave() {
  if (activeTab.value === 'photos') return;
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDraggingOver.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragCounter = 0;
  isDraggingOver.value = false;
  if (activeTab.value === 'photos') return;
  const droppedFiles = e.dataTransfer?.files;
  if (droppedFiles && droppedFiles.length > 0) {
    handleFilesUpload(Array.from(droppedFiles));
  }
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target?.closest('.drive-create-dropdown-container')) {
    createMenuOpen.value = false;
  }
  if (!target?.closest('.drive-item-menu-container')) {
    activeFileMenuId.value = null;
  }
}

// Watch folderId parameter changes
watch(
  () => route.params.folderId,
  () => {
    searchQuery.value = '';
    debouncedQuery.value = '';
    searchResults.value = [];
    loadCurrentFolder();
  },
);

onMounted(() => {
  loadCurrentFolder();
  initSidebarTree();
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<style scoped>
.drive-page {
  position: relative;
  display: flex;
  height: 100%;
  background: var(--ui-page, #17181f);
  color: var(--ui-text, #f8fff8);
  font-family: 'Noto Sans', sans-serif;
  font-size: 14px;
}

/* Drop Overlay */
.drive-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(13, 23, 16, 0.75);
  backdrop-filter: blur(4px);
  border: 2px dashed var(--ui-accent-strong, #8cff8c);
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drive-drop-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-drop-text {
  font-size: 18px;
  font-weight: 600;
}

/* Sidebar */
.drive-sidebar {
  flex: 0 0 260px;
  max-width: 280px;
  box-sizing: border-box;
  padding: 20px 14px;
  border-right: 1px solid var(--ui-border, #2a3a2e);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ui-surface-sidebar, #131714);
}

.drive-sidebar-brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 14px;
}

.drive-brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}

.drive-brand-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

.drive-brand-name {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.2px;
}

.drive-sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin: 0 4px 10px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
}

.drive-tab-btn {
  height: 34px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary, #d6f2d6);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.drive-tab-btn.active {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.drive-sidebar-root-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  color: var(--ui-text-secondary, #d6f2d6);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.15s;
}

.drive-sidebar-root-item.active {
  color: var(--ui-accent-strong, #8cff8c);
  background: rgba(0, 255, 0, 0.1);
  font-weight: 600;
}

.drive-sidebar-trash-item {
  margin-top: 2px;
}

.drive-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  overflow-y: auto;
}

.drive-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.drive-tree-item.active {
  background: rgba(255, 255, 255, 0.06);
}

.drive-tree-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
}

.drive-tree-chevron {
  transition: transform 0.2s ease;
}

.drive-tree-chevron.collapsed {
  transform: rotate(-90deg);
}

.drive-tree-label-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  padding: 4px 0;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.drive-tree-folder-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-tree-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Main */
.drive-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.drive-main > * {
  flex-shrink: 0;
}

/* Mobile Header (Hidden on Desktop) */
.drive-mobile-header {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.drive-mobile-top-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drive-mobile-back-btn,
.drive-mobile-search-toggle,
.drive-mobile-header-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-mobile-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drive-mobile-search-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

/* Desktop Header */
.drive-desktop-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.drive-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-text-muted, #a8c6a8);
  flex-wrap: wrap;
}

.drive-breadcrumb-link {
  color: var(--ui-text-muted, #a8c6a8);
  text-decoration: none;
  transition: color 0.15s;
}

.drive-breadcrumb-link:hover {
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-breadcrumb-sep {
  color: var(--ui-text-muted, #a8c6a8);
  user-select: none;
}

.drive-breadcrumb-current {
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Search */
.drive-search-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drive-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text-muted, #a8c6a8);
  width: 260px;
}

.drive-search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--ui-text, #f8fff8);
  font: inherit;
  font-size: 13px;
}

.drive-search-clear {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.drive-scope-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  user-select: none;
}

/* Buttons */
.drive-create-dropdown-container {
  position: relative;
}

.drive-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.drive-btn-primary {
  border: 0;
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
}

.drive-btn-primary:hover {
  opacity: 0.9;
}

.drive-btn-secondary {
  border: 1px solid var(--ui-border, #2a3a2e);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--ui-text, #f8fff8);
}

.drive-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.drive-create-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 170px;
  border-radius: 12px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}

.drive-create-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-create-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* Title & Slice Bar */
.drive-title-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.drive-title-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-heading {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.drive-role-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 255, 0, 0.1);
  color: var(--ui-accent-strong, #8cff8c);
  font-size: 12px;
  width: fit-content;
}

/* Slices */
.drive-slice-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  flex-wrap: wrap;
}

.drive-slice-chip {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text-secondary, #d6f2d6);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s, color 0.15s;
}

.drive-slice-chip.active {
  background: var(--ui-brand, #00ff00);
  color: var(--color-brand-contrast, #06220c);
  font-weight: 600;
}

.drive-slice-count {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  opacity: 0.8;
}

/* Toolbar */
.drive-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.drive-sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drive-sort-label {
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-sort-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
  cursor: pointer;
}

.drive-sort-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
  font-weight: 600;
}

.drive-order-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.drive-view-toggle {
  height: 28px;
  width: 28px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #2a3a2e);
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drive-view-toggle.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text, #f8fff8);
}

/* States */
.drive-loading-state,
.drive-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--ui-brand, #00ff00);
  border-radius: 50%;
  animation: drive-spin 0.8s linear infinite;
}

@keyframes drive-spin {
  to { transform: rotate(360deg); }
}

.drive-empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 80px 20px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-empty-icon {
  opacity: 0.4;
}

.drive-empty-text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}

/* Badges & Icons */
.drive-ext-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-accent-strong, #8cff8c);
  letter-spacing: 0.5px;
}

.drive-ext-badge-sm {
  font-size: 10px;
  padding: 1px 4px;
}

.drive-ext-badge-preview {
  margin-top: 6px;
  font-size: 12px;
  padding: 2px 8px;
}

.drive-file-inline-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-media-icon {
  color: var(--ui-accent-strong, #8cff8c);
  opacity: 0.85;
}

/* Items Grid */
.drive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.drive-card {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text, #f8fff8);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.drive-card:hover,
.drive-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(140, 255, 140, 0.4);
  outline: none;
}

.drive-card-preview {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  position: relative;
}

.drive-folder-svg {
  color: var(--ui-accent-strong, #8cff8c);
}

.drive-card-canvas-mock {
  position: relative;
  width: 100%;
  height: 100%;
}

.drive-card-canvas-mock .canvas-node {
  position: absolute;
  border-radius: 4px;
}

.drive-card-canvas-mock .n1 {
  left: 20px;
  top: 24px;
  width: 48px;
  height: 28px;
  border: 1.5px solid #53dfdd;
}

.drive-card-canvas-mock .n2 {
  right: 24px;
  bottom: 24px;
  width: 54px;
  height: 32px;
  border: 1.5px solid #e0de71;
}

.drive-card-canvas-mock .canvas-line {
  position: absolute;
  left: 68px;
  top: 40px;
  width: 35px;
  height: 1.5px;
  background: #6b7f70;
  transform: rotate(25deg);
}

.drive-card-doc-mock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
  width: 100%;
  box-sizing: border-box;
}

.drive-card-doc-mock .doc-line {
  border-radius: 3px;
  height: 5px;
  background: rgba(255, 255, 255, 0.12);
}

.drive-card-doc-mock .l-head {
  width: 55%;
  height: 8px;
  background: rgba(176, 196, 255, 0.6);
}

.drive-card-doc-mock .l1 { width: 85%; }
.drive-card-doc-mock .l2 { width: 75%; }
.drive-card-doc-mock .l3 { width: 65%; }

.drive-card-html-mock {
  color: #ffa760;
  opacity: 0.8;
}

.drive-card-board-mock {
  display: flex;
  gap: 6px;
  width: 80%;
  height: 60%;
}

.drive-card-board-mock .board-col {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-card-board-mock .board-card {
  height: 12px;
  border-radius: 3px;
  background: rgba(119, 238, 154, 0.4);
}

.drive-card-file-mock {
  color: var(--ui-text-muted, #a8c6a8);
  opacity: 0.9;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.drive-card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drive-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.drive-folder-inline-icon {
  color: var(--ui-accent-strong, #8cff8c);
  flex-shrink: 0;
}

.drive-card-name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.drive-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-size-meta {
  font-size: 12px;
  color: var(--ui-text-secondary, #d6f2d6);
  font-variant-numeric: tabular-nums;
}

.drive-kind-pill {
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: var(--ui-text-secondary, #d6f2d6);
}

.drive-date {
  font-size: 11px;
}

/* List View */
.drive-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drive-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.drive-list-row:hover,
.drive-list-row:focus-visible {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--ui-border, #2a3a2e);
  outline: none;
}

.drive-row-icon-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.drive-row-name-col {
  flex: 1;
  min-width: 0;
}

.drive-row-name {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.drive-row-size-col {
  flex-shrink: 0;
  min-width: 70px;
  text-align: right;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-row-date-col {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-row-menu-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* File Context Menu */
.drive-item-menu-container {
  position: relative;
}

.drive-item-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.drive-item-menu-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

.drive-item-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 160px;
  border-radius: 10px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 120;
}

.drive-item-menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-item-menu-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.drive-item-menu-action.drive-menu-danger {
  color: var(--ui-danger, #fb464c);
}

.drive-item-menu-action.drive-menu-danger:hover {
  background: rgba(251, 70, 76, 0.15);
}

/* Upload Panel */
.drive-upload-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 340px;
  max-height: 400px;
  border-radius: 14px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 200;
}

.drive-upload-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border, #2a3a2e);
  background: rgba(255, 255, 255, 0.02);
}

.drive-upload-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.drive-upload-panel-count {
  color: var(--ui-text-muted, #a8c6a8);
  font-size: 12px;
}

.drive-upload-hide-btn {
  border: 0;
  background: transparent;
  color: var(--ui-accent-strong, #8cff8c);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.drive-upload-hide-btn:hover {
  background: rgba(0, 255, 0, 0.1);
}

.drive-upload-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 330px;
  padding: 4px 0;
}

.drive-upload-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.drive-upload-item:last-child {
  border-bottom: 0;
}

.drive-upload-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.drive-upload-item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.drive-upload-item-size {
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
}

.drive-upload-item-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.drive-upload-progressbar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.drive-upload-progressfill {
  height: 100%;
  background: var(--ui-brand, #00ff00);
  transition: width 0.2s ease;
}

.drive-upload-percent {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--ui-text-muted, #a8c6a8);
  width: 32px;
  text-align: right;
}

.drive-upload-cancel-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drive-upload-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ui-text, #f8fff8);
}

.drive-upload-status-done {
  color: var(--ui-success, #44cf6e);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.drive-upload-status-error {
  color: var(--ui-danger, #fb464c);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drive-upload-status-cancelled {
  color: var(--ui-text-muted, #a8c6a8);
  font-style: italic;
  font-size: 12px;
}

/* Pagination */
.drive-pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0 10px;
}

/* Responsive: Mobile View (≤ 640px) */
@media (max-width: 640px) {
  .drive-sidebar {
    display: none;
  }

  .drive-desktop-header {
    display: none;
  }

  .drive-mobile-header {
    display: flex;
  }

  .drive-main {
    padding: 16px 14px 28px;
    gap: 16px;
  }

  .drive-slice-group {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    box-sizing: border-box;
    padding: 4px;
  }

  .drive-slice-chip {
    flex-shrink: 0;
  }

  /* Mobile items list instead of cards */
  .drive-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .drive-card {
    flex-direction: row;
    align-items: center;
    border-radius: 10px;
    padding: 8px 10px;
  }

  .drive-card-preview {
    display: none;
  }

  .drive-card-body {
    padding: 0;
    flex: 1;
    min-width: 0;
  }

  .drive-upload-panel {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    border-bottom: 0;
  }
}
</style>
