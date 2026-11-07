<template>
<section
  class="dashboard-folder-content"
  data-dashboard-view="folder"
>
    <div
      v-if="activeFolder"
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
            @click.stop="goToParentFolder"
          ><ArrowLeft :size="16" aria-hidden="true" /></button>
          <span class="folder-manager-title">
            <span class="folder-manager-name">{{ activeFolder.name }}</span>
            <span class="folder-manager-count">{{ activeFolder.canvasCount }} {{ t('canvas').toLowerCase() }} / {{ activeFolder.htmlDocumentCount }} HTML / {{ activeFolder.textDocumentCount || 0 }} {{ t('docs').toLowerCase() }}<template v-if="activeFolderFileCount"> / {{ activeFolderFileCount }} {{ t('folderFilesTitle').toLowerCase() }}</template></span>
          </span>
        </div>
        <DashboardViewToggle class="folder-view-toggle" :mode="recentViewMode" @update:mode="setRecentViewMode" />
        <!-- Веб: «+» слева от «⋯» — окно «Добавить» с этой папкой. На мобильном скрыт:
             там добавляет плавающая «+», она сама подставляет открытую папку. -->
        <div v-if="activeFolder.role === 'owner'" class="folder-manager-menu folder-create-menu">
          <button
            class="folder-manager-trigger folder-create-trigger"
            data-folder-create-menu
            @click.stop="openAddDialog({ folderId: activeFolder.id })"
            :title="t('add')"
            :aria-label="t('add')"
            :disabled="isBusy"
          ><Plus :size="17" aria-hidden="true" /></button>
        </div>
        <div v-if="activeFolder.role === 'owner'" class="folder-manager-menu">
          <button
            class="folder-manager-trigger"
            @click.stop="toggleFolderMenu(activeFolder.id)"
            :title="t('groupActions')"
            :disabled="isBusy"
          >⋯</button>
          <div v-if="openControlMenu === 'folder:' + activeFolder.id" class="mobile-action-popover" @click.stop>
            <button class="card-menu-item" data-folder-import @click="openAddDialog({ folderId: activeFolder.id, importKind: 'file' })" :disabled="isBusy">{{ t('import') }}</button>
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
              class="card-menu-item"
              data-action="move-folder-parent"
              @click="openFolderParentModal(activeFolder)"
              :disabled="isBusy"
            >{{ t('moveFolderInto') }}</button>
            <button
              v-if="activeFolder.name !== 'Unsorted'"
              class="card-menu-item danger"
              @click="deleteFolder(activeFolder)"
              :disabled="isBusy"
            >{{ t('delete') }}</button>
          </div>
        </div>
        </div>
        <div :ref="setActiveFolderBody" class="folder-manager-body" @scroll="onFolderBodyScroll">
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
              <span v-if="child.latest" class="subfolder-card-date" data-folder-tile-date>{{ formatDate(child.latest) }}</span>
            </button>
          </div>
          <div v-if="activeFolderEmpty && (hasActiveFilter || activeFolder.role !== 'owner')" class="dash-empty" data-folder-empty>
            {{ hasActiveFilter ? t('noFilterMatches') : t('noFolderItems') }}
            <button v-if="hasActiveFilter" type="button" class="dash-empty-reset" data-reset-filters @click.stop="resetFilters">{{ t('resetFilters') }}</button>
          </div>
          <div class="dash-grid">
            <button
              v-if="activeFolderEmpty && !hasActiveFilter && activeFolder.role === 'owner'"
              type="button"
              class="dashboard-add-tile"
              data-feed-add="folder" data-folder-empty
              @click.stop="openAddFromTile('folder')"
            >
              <span class="dashboard-add-tile-label"><Plus :size="18" aria-hidden="true" />{{ t('add') }}</span>
            </button>
            <template v-for="item in activeFolder.items" :key="`${item.type}-${item.id}`">
            <div
              v-if="item.type === 'canvas'"
              :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card"
              :class="{ dragging: draggingResourceId === item.id }"
              draggable="false"
              @click="openCanvasFromCard(item.slug || item.id)"
            >
              <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
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
              <div v-else class="card-title card-title-with-icon" @dblclick.stop="startRename(item.id)"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="canvas" data-resource-icon="canvas" :aria-label="t('canvas')" /><span class="card-title-text">{{ item.title || t('untitled') }}</span><span v-if="!isOwnedResource(item)" class="badge badge-shared card-title-badge">{{ item.role || t('externalResource') }}</span></div>
              <div class="card-meta">
                <div v-if="item.tags?.length" class="card-tags">
                  <span
                    v-for="tag in item.tags"
                    :key="tag.name"
                    class="card-tag color-tag"
                    :style="{ '--tag-color': tag.color }"
                  >#{{ tag.name }}</span>
                </div>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <div class="card-meta-mobile">
                <span class="card-date">{{ formatCardDateMobile(item.updatedAt) }}</span>
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
              :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
              :class="{ dragging: draggingResourceId === item.id }"
              draggable="false"
              @click="openHtmlDocumentFromCard(item.slug || item.id)"
            >
              <ResourceThumb :kind="item.type" :id="item.id" :version="item.updatedAt" />
              <a
                class="card-open-link"
                :href="`/edit/html/${item.slug || item.id}`"
                :aria-label="`Open HTML document ${item.title || 'Untitled HTML'}`"
                @click.stop="rememberRecentResource('html-document', item.slug || item.id)"
              ></a>
              <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="html-document" data-resource-icon="html-document" aria-label="HTML document" /><span class="card-title-text">{{ item.title || 'Untitled HTML' }}</span><span v-if="!isOwnedResource(item)" class="badge badge-shared card-title-badge">{{ item.role || t('externalResource') }}</span></div>
              <div class="card-meta">
                <div v-if="item.tags?.length" class="card-tags">
                  <span
                    v-for="tag in item.tags"
                    :key="tag.name"
                    class="card-tag color-tag"
                    :style="{ '--tag-color': tag.color }"
                  >#{{ tag.name }}</span>
                </div>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <div class="card-meta-mobile">
                <span class="card-date">{{ formatCardDateMobile(item.updatedAt) }}</span>
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
              :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card interactive-template-card"
              :data-folder-resource="`interactive-template:${item.id}`"
              @click="openInteractiveTemplate(item.id)"
            >
              <ResourceThumb :kind="'interactive-template'" :id="item.id" :version="item.updatedAt" />
              <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="interactive-template" :template-type="item.templateType" data-resource-icon="interactive-template" :data-template-type="item.templateType" role="img" :aria-label="interactiveTemplateTypeLabel(item.templateType)" /><span class="card-title-text">{{ item.title }}</span><span v-if="item.role && item.role !== 'owner'" class="badge badge-shared card-title-badge">{{ item.role }}</span></div>
              <div class="card-meta">
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <div class="card-meta-mobile">
                <span class="card-date">{{ formatCardDateMobile(item.updatedAt) }}</span>
              </div>
              <button class="card-manage" @click.stop="toggleCardMenu(`folder:interactive-template:${item.id}`, $event)" title="Действия с шаблоном" :disabled="isBusy">⋯</button>
              <div v-if="openMenuCanvasId === `folder:interactive-template:${item.id}`" class="card-menu" :style="cardMenuStyle" @click.stop>
                <button class="card-menu-item" @click="openMoveInteractiveTemplateFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                <button v-if="item.role === 'owner'" class="card-menu-item danger" @click="deleteInteractiveTemplate(item)" :disabled="isBusy">{{ t('delete') }}</button>
              </div>
            </article>
            <article
              v-else
              :data-select-key="isLoggedIn ? selectionKey(item) : undefined" :data-selected="isSelected(item) || undefined" class="canvas-card html-doc-card"
              :class="{ dragging: draggingResourceId === item.id }"
              draggable="false"
              @click="openTextDocumentFromCard(item.slug || item.id)"
            >
              <ResourceThumb :kind="item.type || 'text-document'" :id="item.id" :version="item.updatedAt" />
              <a
                class="card-open-link"
                :href="`/docs/${item.slug || item.id}`"
                :aria-label="`Open document ${item.title || 'Untitled document'}`"
                @click.stop="rememberRecentResource('text-document', item.slug || item.id)"
              ></a>
              <div class="card-title card-title-with-icon"><span v-if="isLoggedIn" class="card-select" data-select-box role="checkbox" tabindex="0" :aria-checked="isSelected(item)" :aria-label="t('selectItem')" @keydown.enter.prevent.stop="toggleSelected(selectionKey(item))" @keydown.space.prevent.stop="toggleSelected(selectionKey(item))"><Check :size="12" aria-hidden="true" /></span><ResourceIcon kind="text-document" data-resource-icon="text-document" aria-label="Document" /><span class="card-title-text">{{ item.title || 'Untitled document' }}</span><span v-if="!isOwnedResource(item)" class="badge badge-shared card-title-badge">{{ item.role || t('externalResource') }}</span></div>
              <div class="card-meta">
                <div v-if="item.tags?.length" class="card-tags">
                  <span
                    v-for="tag in item.tags"
                    :key="tag.name"
                    class="card-tag color-tag"
                    :style="{ '--tag-color': tag.color }"
                  >#{{ tag.name }}</span>
                </div>
                <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
              </div>
              <div class="card-meta-mobile">
                <span class="card-date">{{ formatCardDateMobile(item.updatedAt) }}</span>
              </div>
              <button v-if="isOwnedResource(item)" class="card-pin" :class="{ active: item.pinned }" @click.stop="togglePinned(item)" title="Pin document" :disabled="isBusy">{{ item.pinned ? '★' : '☆' }}</button>
              <button class="card-manage" @click.stop="toggleCardMenu(item.id, $event)" title="Document actions" :disabled="isBusy">⋯</button>
              <div v-if="openMenuCanvasId === item.id" class="card-menu" :style="cardMenuStyle" @click.stop>
                <button class="card-menu-item" @click="openMoveTextDocumentFolderModal(item)" :disabled="isBusy">{{ t('moveToGroup') }}</button>
                <template v-if="isOwnedResource(item)"><button class="card-menu-item" @click="duplicateTextDocument(item)" :disabled="isBusy">{{ t('duplicate') }}</button><button class="card-menu-item" @click="openDescriptionModal(item)" :disabled="isBusy">{{ t('description') }}</button><button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">{{ t('editTags') }}</button><button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? t('unpin') : t('pin') }}</button><button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">{{ t('transferOwnership') }}</button><button class="card-menu-item danger" @click="deleteTextDocument(item)" :disabled="isBusy">{{ t('delete') }}</button></template>
              </div>
            </article>
            </template>
            <DashboardFolderFiles
              :folder-id="activeFolder.id"
              :query="searchQuery"
              :filtered-out="!typePasses(contentTypes, 'file') || selectedTags.length > 0"
              :sort-mode="sortMode"
              :refresh-key="folderFilesRefreshKey"
              :selectable="isLoggedIn"
              :selected-keys="selectedKeys"
              @count="setActiveFolderFileCount"
              @files="setFolderDriveFiles"
              @previews="setFolderDrivePreviews"
              @toggle-select="toggleSelected"
              @open-image="openDriveImage"
            />
          </div>
        </div>
    </div>
  </section>

</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Check, Plus } from '@lucide/vue';
import DashboardFolderFiles from './DashboardFolderFiles.vue';
import DashboardViewToggle from './DashboardViewToggle.vue';
import ResourceIcon from '../ResourceIcon.vue';
import ResourceThumb from './ResourceThumb.vue';
const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const t = computed(() => context.value.t);
const activeFolder = computed(() => context.value.activeFolder);
const goToParentFolder = computed(() => context.value.goToParentFolder);
const activeSubfolders = computed(() => context.value.activeSubfolders);
const isLoggedIn = computed(() => context.value.isLoggedIn);
const searchQuery = computed(() => context.value.searchQuery);
const selectedTags = computed(() => context.value.selectedTags);
const contentTypes = computed(() => context.value.contentTypes);
const sortMode = computed(() => context.value.sortMode);
const recentViewMode = computed(() => context.value.recentViewMode);
const setRecentViewMode = computed(() => context.value.setRecentViewMode);
const activeFolderEmpty = computed(() => context.value.activeFolderEmpty);
const hasActiveFilter = computed(() => context.value.hasActiveFilter);
const resetFilters = computed(() => context.value.resetFilters);
const openAddFromTile = computed(() => context.value.openAddFromTile);
const openControlMenu = computed(() => context.value.openControlMenu);
const openAddDialog = computed(() => context.value.openAddDialog);
const activeFolderFileCount = computed(() => context.value.activeFolderFileCount);
const folderFilesRefreshKey = computed(() => context.value.folderFilesRefreshKey);
const selectedKeys = computed(() => context.value.selectedKeys);
const toggleSelected = computed(() => context.value.toggleSelected);
const openFolderShareModal = computed(() => context.value.openFolderShareModal);
const openFolderParentModal = computed(() => context.value.openFolderParentModal);
const openRenameFolderModal = computed(() => context.value.openRenameFolderModal);
const openSubfolderModal = computed(() => context.value.openSubfolderModal);
const toggleFolderMenu = computed(() => context.value.toggleFolderMenu);
const openMoveFolderModal = computed(() => context.value.openMoveFolderModal);
const openCanvasFromCard = computed(() => context.value.openCanvasFromCard);
const openHtmlDocumentFromCard = computed(() => context.value.openHtmlDocumentFromCard);
const openTextDocumentFromCard = computed(() => context.value.openTextDocumentFromCard);
const openInteractiveTemplate = computed(() => context.value.openInteractiveTemplate);
const toggleCardMenu = computed(() => context.value.toggleCardMenu);
const openMenuCanvasId = computed(() => context.value.openMenuCanvasId);
const cardMenuStyle = computed(() => context.value.cardMenuStyle);
const isBusy = computed(() => context.value.isBusy);
const selectionKey = computed(() => context.value.selectionKey);
const isSelected = computed(() => context.value.isSelected);
const formatDate = computed(() => context.value.formatDate);
const formatCardDateMobile = computed(() => context.value.formatCardDateMobile);
const interactiveTemplateTypeLabel = computed(() => context.value.interactiveTemplateTypeLabel);
const isOwnedResource = computed(() => context.value.isOwnedResource);
const rememberRecentResource = computed(() => context.value.rememberRecentResource);
const togglePinned = computed(() => context.value.togglePinned);
const openDescriptionModal = computed(() => context.value.openDescriptionModal);
const openTagsModal = computed(() => context.value.openTagsModal);
const openTransferModal = computed(() => context.value.openTransferModal);
const deleteCanvas = computed(() => context.value.deleteCanvas);
const deleteHtmlDocument = computed(() => context.value.deleteHtmlDocument);
const deleteTextDocument = computed(() => context.value.deleteTextDocument);
const deleteInteractiveTemplate = computed(() => context.value.deleteInteractiveTemplate);
const duplicateCanvas = computed(() => context.value.duplicateCanvas);
const duplicateHtmlDocument = computed(() => context.value.duplicateHtmlDocument);
const duplicateTextDocument = computed(() => context.value.duplicateTextDocument);
const openMoveHtmlFolderModal = computed(() => context.value.openMoveHtmlFolderModal);
const openMoveTextDocumentFolderModal = computed(() => context.value.openMoveTextDocumentFolderModal);
const openMoveInteractiveTemplateFolderModal = computed(() => context.value.openMoveInteractiveTemplateFolderModal);
const deleteFolder = computed(() => context.value.deleteFolder);
const startRename = computed(() => context.value.startRename);
const finishRename = computed(() => context.value.finishRename);
const renamingId = computed(() => context.value.renamingId);
const renameInput = computed(() => context.value.renameInput);
const typePasses = computed(() => context.value.typePasses);
const onFolderBodyScroll = computed(() => context.value.onFolderBodyScroll);
const selectFolder = computed(() => context.value.selectFolder);
const setActiveFolderFileCount = computed(() => context.value.setActiveFolderFileCount);
const setFolderDriveFiles = computed(() => context.value.setFolderDriveFiles);
const setFolderDrivePreviews = computed(() => context.value.setFolderDrivePreviews);
const openDriveImage = computed(() => context.value.openDriveImage);
const draggingResourceId = computed(() => context.value.draggingResourceId);
const setActiveFolderBody = computed(() => context.value.setActiveFolderBody);
</script>
