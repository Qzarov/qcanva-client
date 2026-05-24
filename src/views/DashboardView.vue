<template>
  <div class="app-layout" @click="closeCardMenu">
    <aside class="app-sidebar">
      <div class="sidebar-logo">Canvas<span>.</span></div>
      <nav class="sidebar-nav">
        <router-link to="/" class="sidebar-item active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Canvases
        </router-link>
        <router-link to="/html-docs" class="sidebar-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          HTML Docs
        </router-link>
        <router-link v-if="isLoggedIn" to="/html-settings" class="sidebar-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
          Settings
        </router-link>
        <template v-if="admin">
          <div class="sidebar-section-label">Admin</div>
          <router-link to="/admin" class="sidebar-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
            </svg>
            Admin
          </router-link>
        </template>
      </nav>
      <div v-if="isLoggedIn" class="sidebar-footer">
        <button class="sidebar-item" @click.stop="logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>

    <header class="app-header">
      <div>
        <h1>{{ isLoggedIn ? 'My Canvases' : 'QCanva' }}</h1>
        <p v-if="!isLoggedIn" class="dash-subtitle">Public canvases available without registration.</p>
      </div>
      <div class="dash-actions">
        <template v-if="isLoggedIn">
          <button class="btn-primary" @click.stop="createCanvas">+ New Canvas</button>
          <div class="mobile-action-menu">
            <button class="btn-ghost dash-more-btn" @click.stop="toggleMobileActions">More</button>
            <div v-if="showMobileActions" class="mobile-action-popover" @click.stop>
              <button class="card-menu-item" @click="openFolderModal()">+ Folder Canvas</button>
              <button class="card-menu-item" @click="openTagManager">Manage tags</button>
              <button class="card-menu-item" @click="importFile">Open .canvas</button>
            </div>
          </div>
          <div class="dash-actions-secondary">
            <button class="btn-ghost" @click.stop="openFolderModal()">+ Folder Canvas</button>
            <button class="btn-ghost" @click.stop="openTagManager">Manage tags</button>
            <button class="btn-ghost" @click.stop="importFile">Open .canvas</button>
          </div>
        </template>
        <input type="file" ref="fileInput" accept=".canvas,.json" style="display:none" @change="onFileSelected" />
        <template v-if="!isLoggedIn">
          <router-link to="/login" class="btn-ghost">Login</router-link>
          <router-link to="/register" class="btn-primary">Register</router-link>
        </template>
      </div>
    </header>

    <main class="app-main dashboard">
    <div class="dash-toolbar">
      <input v-model.trim="searchQuery" class="dash-search" placeholder="Search by title, folder or tag" />
      <select v-model="sortMode" class="dash-sort-select">
        <option value="updated-desc">Newest first</option>
        <option value="updated-asc">Oldest first</option>
        <option value="title-asc">Title A-Z</option>
        <option value="title-desc">Title Z-A</option>
      </select>
      <div class="content-type-tabs">
        <button :class="{ active: contentFilter === 'all' }" @click.stop="contentFilter = 'all'">All</button>
        <button :class="{ active: contentFilter === 'canvas' }" @click.stop="contentFilter = 'canvas'">Canvas</button>
        <button :class="{ active: contentFilter === 'html-document' }" @click.stop="contentFilter = 'html-document'">HTML</button>
      </div>
      <div v-if="allTagNames.length" class="tag-filter-list">
        <button class="tag-filter" :class="{ active: selectedTag === '' }" @click.stop="selectedTag = ''">All</button>
        <button
          v-for="tag in allTagNames"
          :key="tag"
          class="tag-filter"
          :class="{ active: selectedTag === tag }"
          @click.stop="selectedTag = tag"
        >#{{ tag }}</button>
      </div>
    </div>

    <div v-if="feedback.message" class="dashboard-toast" :class="`dashboard-toast-${feedback.type}`">
      {{ feedback.message }}
    </div>

    <div v-if="loading" class="dash-loading">Loading...</div>

    <template v-else>
      <div v-if="isLoggedIn && incomingRequests.length" class="dash-section access-requests-section">
        <div class="dash-section-head">
          <h2>Access requests</h2>
          <button class="btn-ghost btn-sm" @click.stop="load" :disabled="isBusy">Refresh</button>
        </div>
        <div class="access-request-list">
          <div v-for="request in incomingRequests" :key="request.id" class="access-request-row">
            <div>
              <div class="access-request-title">{{ request.resourceTitle || request.resourceId }}</div>
              <div class="access-request-meta">
                {{ request.requesterEmail || request.requesterName || request.requesterId }} asks for {{ request.requestedRole }} on {{ request.resourceType === 'canvas' ? 'canvas' : 'HTML' }}
              </div>
            </div>
            <div class="access-request-actions">
              <button class="btn-ghost btn-sm" :disabled="isBusy" @click.stop="resolveAccessRequest(request.id, 'declined')">Decline</button>
              <button class="btn-primary btn-sm" :disabled="isBusy" @click.stop="resolveAccessRequest(request.id, 'approved')">Approve</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isLoggedIn && folderSummaries.length" class="dash-section">
        <div class="dash-section-head">
          <h2>Folders</h2>
          <div class="dash-section-actions">
            <button class="btn-ghost btn-sm" @click.stop="load" :disabled="isBusy">Refresh</button>
          </div>
        </div>
        <div class="folder-manager-list">
          <div
            v-for="folder in folderSummaries"
            :key="folder.id"
            class="folder-manager-row"
            :class="{ 'folder-drop-active': draggingCanvasId && dragTargetFolder === folder.id }"
            @dragover.prevent="onFolderDragOver(folder)"
            @dragleave="onFolderDragLeave(folder)"
            @drop.prevent="dropCanvasToFolder(folder)"
          >
            <div class="folder-manager-top">
              <button class="folder-manager-main" @click.stop="toggleFolderOpen(folder.id)">
                <span class="folder-manager-title">
                  <span class="section-toggle-icon folder-row-toggle" :class="{ expanded: isFolderOpen(folder.id) }">⌄</span>
                  <span class="folder-manager-name">{{ folder.name }}</span>
                </span>
                <span class="folder-manager-count">{{ folder.canvasCount }} canvas / {{ folder.htmlDocumentCount }} HTML</span>
              </button>
              <div class="folder-manager-actions">
                <button class="folder-manager-btn" @click.stop="openFolderModal(folder)" :disabled="isBusy || folder.role !== 'owner'">Add canvas</button>
                <button
                  v-if="folder.name !== 'Unsorted' && folder.role === 'owner'"
                  class="folder-manager-btn"
                  @click.stop="openRenameFolderModal(folder)"
                  :disabled="isBusy"
                >Rename</button>
                <button
                  v-if="folder.name !== 'Unsorted' && folder.role === 'owner'"
                  class="folder-manager-btn danger"
                  @click.stop="deleteFolder(folder)"
                  :disabled="isBusy"
                >Delete</button>
              </div>
            </div>
            <transition name="folder-collapse">
              <div v-if="isFolderOpen(folder.id)" class="folder-manager-body">
                <div class="dash-grid">
                  <template v-for="item in folder.items" :key="`${item.type}-${item.id}`">
                  <div
                    v-if="item.type === 'canvas'"
                    class="canvas-card"
                    :class="{ dragging: draggingCanvasId === item.id }"
                    draggable="true"
                    @dragstart="startCanvasDrag($event, item)"
                    @dragend="endCanvasDrag"
                    @click="openCanvas(item.id)"
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
                    <div v-else class="card-title" @dblclick.stop="startRename(item.id)">{{ item.title || 'Untitled' }}</div>
                    <div class="card-meta">
                      <span class="badge badge-owner">Owner</span>
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
                    <button class="card-pin" :class="{ active: item.pinned }" @click.stop="togglePinned(item)" title="Pin canvas" :disabled="isBusy">{{ item.pinned ? '★' : '☆' }}</button>
                    <button class="card-manage" @click.stop="toggleCardMenu(item.id)" title="Canvas actions" :disabled="isBusy">⋯</button>
                    <button class="card-delete" @click.stop="deleteCanvas(item)" title="Delete" :disabled="isBusy">x</button>
                    <div v-if="openMenuCanvasId === item.id" class="card-menu" @click.stop>
                      <button class="card-menu-item" @click="duplicateCanvas(item)" :disabled="isBusy">Duplicate</button>
                      <button class="card-menu-item" @click="openMoveFolderModal(item)" :disabled="isBusy">Move to folder</button>
                      <button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">Edit tags</button>
                      <button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? 'Unpin' : 'Pin' }}</button>
                      <button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">Transfer ownership</button>
                      <button class="card-menu-item danger" @click="deleteCanvas(item)" :disabled="isBusy">Delete</button>
                    </div>
                  </div>
                  <article
                    v-else
                    class="canvas-card html-doc-card"
                    @click="openHtmlDocument(item.id)"
                  >
                    <div class="card-title">{{ item.title || 'Untitled HTML' }}</div>
                    <div class="card-meta">
                      <span class="badge badge-public">HTML</span>
                      <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
                    </div>
                    <button class="card-manage" @click.stop="openMoveHtmlFolderModal(item)" title="Move document" :disabled="isBusy">⋯</button>
                    <button class="card-delete" @click.stop="deleteHtmlDocument(item)" title="Delete" :disabled="isBusy">x</button>
                  </article>
                  </template>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <div v-if="sharedFiltered.length" class="dash-section">
        <h2>Shared with me</h2>
        <div class="dash-grid">
          <div
            v-for="c in sharedFiltered"
            :key="'shared-' + c.id"
            class="canvas-card"
            @click="openCanvas(c.id)"
          >
            <div class="card-title">{{ c.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-shared">{{ c.role }}</span>
              <span v-if="c.pinned" class="badge badge-pinned">Pinned</span>
              <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
            </div>
            <div v-if="c.folder" class="card-folder">{{ c.folder }}</div>
            <div v-if="c.tags?.length" class="card-tags">
              <span
                v-for="tag in c.tags"
                :key="tag.name"
                class="card-tag color-tag"
                :style="{ '--tag-color': tag.color }"
              >#{{ tag.name }}</span>
            </div>
            <button
              v-if="c.role === 'edit'"
              class="card-manage"
              @click.stop="toggleCardMenu(c.id)"
              title="Canvas actions"
              :disabled="isBusy"
            >⋯</button>
            <div v-if="openMenuCanvasId === c.id" class="card-menu" @click.stop>
              <button class="card-menu-item" @click="openMoveFolderModal(c)" :disabled="isBusy">Move to folder</button>
              <button class="card-menu-item" @click="togglePinned(c)" :disabled="isBusy">{{ c.pinned ? 'Unpin' : 'Pin' }}</button>
              <button class="card-menu-item" @click="openTagsModal(c)" :disabled="isBusy">Edit tags</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="publicFiltered.length" class="dash-section">
        <h2>Public canvases</h2>
        <div class="dash-grid">
          <div
            v-for="c in publicFiltered"
            :key="'public-' + c.id"
            class="canvas-card"
            @click="openCanvas(c.id)"
          >
            <div class="card-title">{{ c.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-public">{{ c.allowPublicEdit ? 'Public edit' : 'Public' }}</span>
              <span v-if="c.pinned" class="badge badge-pinned">Pinned</span>
              <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
            </div>
            <div class="card-owner">{{ c.ownerName || c.ownerEmail || 'Unknown owner' }}</div>
            <div v-if="c.folder" class="card-folder">{{ c.folder }}</div>
            <div v-if="c.tags?.length" class="card-tags">
              <span
                v-for="tag in c.tags"
                :key="tag.name"
                class="card-tag color-tag"
                :style="{ '--tag-color': tag.color }"
              >#{{ tag.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="welcomeCanvas" class="dash-section">
        <h2>Welcome</h2>
        <div class="dash-grid">
          <div class="canvas-card canvas-card-welcome" @click="openCanvas(welcomeCanvas.id)">
            <div class="card-title">{{ welcomeCanvas.title }}</div>
            <div class="card-meta">
              <span class="badge badge-public">Public</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isLoggedIn && !folderSummaries.length && !sharedFiltered.length" class="dash-empty">
        No canvases yet. Create your first one!
      </div>
      <div v-else-if="!isLoggedIn && !publicFiltered.length && !welcomeCanvas" class="dash-empty">
        No public canvases yet.
      </div>
    </template>
    </main>

    <div v-if="folderModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ folderModal.resourceId ? 'Move to folder' : 'Create canvas in folder' }}</h3>
          <button class="dashboard-modal-close" @click="closeFolderModal">x</button>
        </div>
        <input
          v-model.trim="folderModal.value"
          class="dashboard-modal-input"
          placeholder="Folder name"
          @input="folderModal.folderId = ''"
          @keydown.enter.prevent="saveFolderModal"
        />
        <div v-if="folderOptions.length" class="folder-chip-list">
          <button
            v-for="folder in folderOptions"
            :key="folder.id"
            class="folder-chip"
            :class="{ active: folderModal.folderId === folder.id }"
            @click="folderModal.folderId = folder.id; folderModal.value = folder.name"
          >{{ folder.name }}</button>
        </div>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeFolderModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveFolderModal" :disabled="isBusy || !folderModal.value.trim()">
            {{ actionLabel(folderModal.resourceId ? 'move-folder' : 'create-folder-canvas', folderModal.resourceId ? 'Move' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="renameFolderModal.open" class="dashboard-modal-backdrop" @click.self="closeRenameFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Rename folder</h3>
          <button class="dashboard-modal-close" @click="closeRenameFolderModal">x</button>
        </div>
        <input
          v-model.trim="renameFolderModal.value"
          class="dashboard-modal-input"
          placeholder="Folder name"
          @keydown.enter.prevent="saveRenameFolderModal"
        />
        <p class="dashboard-modal-note">All canvases from this folder will move to the new folder name.</p>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeRenameFolderModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveRenameFolderModal" :disabled="isBusy || !renameFolderModal.value.trim()">
            {{ actionLabel('rename-folder', 'Save') }}
          </button>
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
            <button class="btn-ghost btn-sm danger" @click="deleteManagedTag(tag)" :disabled="isBusy">Delete</button>
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
import { defineComponent, ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { accessRequests, canvas, clearToken, htmlDocuments, isAdmin, isAuthenticated, resourceFolders, tags, type ResourceFolderSummary, type ResourceTag, type ResourceTagSummary } from '../api/client';

type CanvasTag = { id: string; name: string; color: string };
type FeedbackState = { type: 'success' | 'error'; message: string };
type ManagedTag = ResourceTagSummary & { originalName: string };
type CanvasRecord = {
  type: 'canvas';
  id: string;
  title: string;
  updatedAt: string;
  role?: string;
  isOwn?: boolean;
  folder: string;
  folderId?: string | null;
  pinned?: boolean;
  tags: CanvasTag[];
  allowPublicEdit?: boolean;
  ownerName?: string;
  ownerEmail?: string;
};
type HtmlDocumentRecord = {
  type: 'html-document';
  id: string;
  title: string;
  updatedAt: string;
  folderId?: string | null;
  tags: CanvasTag[];
};
type FolderItem = CanvasRecord | HtmlDocumentRecord;
type FolderSummary = Omit<ResourceFolderSummary, 'items'> & {
  items: FolderItem[];
};

const DEFAULT_TAG_COLOR = '#7c8aff';
const genTagId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  setup() {
    const router = useRouter();
    const admin = isAdmin();
    const isLoggedIn = isAuthenticated();
    const own = ref<CanvasRecord[]>([]);
    const shared = ref<CanvasRecord[]>([]);
    const publicCanvases = ref<CanvasRecord[]>([]);
    const ownResourceFolders = ref<ResourceFolderSummary[]>([]);
    const sharedResourceFolders = ref<ResourceFolderSummary[]>([]);
    const welcomeCanvas = ref<CanvasRecord | null>(null);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const searchQuery = ref('');
    const selectedTag = ref('');
    const contentFilter = ref<'all' | 'canvas' | 'html-document'>('all');
    const sortMode = ref<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
    const openMenuCanvasId = ref('');
    const showMobileActions = ref(false);
    const openFolderNames = ref<string[]>(['Unsorted']);
    const draggingCanvasId = ref('');
    const dragTargetFolder = ref('');
    const pendingAction = ref('');
    const incomingRequests = ref<any[]>([]);
    const feedback = ref<FeedbackState>({ type: 'success', message: '' });
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    const tagColors = ['#7c8aff', '#53dfdd', '#44cf6e', '#e0de71', '#e9973f', '#fb464c', '#f472b6', '#94a3b8'];

    const folderModal = ref<{ open: boolean; resourceId: string; resourceType: 'canvas' | 'html-document'; folderId: string; value: string }>({
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
    const tagsModal = ref<{ open: boolean; canvasId: string; tags: CanvasTag[] }>({
      open: false,
      canvasId: '',
      tags: [],
    });
    const tagManager = ref<{ open: boolean; items: ManagedTag[] }>({
      open: false,
      items: [],
    });
    const transferModal = ref<{ open: boolean; canvasId: string; email: string }>({
      open: false,
      canvasId: '',
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
      tags: normalizeTags(doc.tags),
    });

    const matchesCanvas = (c: CanvasRecord) => {
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

    const sortCanvases = (items: CanvasRecord[]) => [...items].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      const result = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      return sortMode.value === 'updated-asc' ? result : -result;
    });

    const sortFolderItems = (items: FolderItem[]) => [...items].sort((a, b) => {
      if (a.type === 'canvas' && b.type === 'canvas' && Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (sortMode.value === 'title-asc' || sortMode.value === 'title-desc') {
        const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        return sortMode.value === 'title-asc' ? result : -result;
      }
      const result = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
      return sortMode.value === 'updated-asc' ? result : -result;
    });

    const sharedFiltered = computed(() => sortCanvases(shared.value.filter(matchesCanvas)));
    const publicFiltered = computed(() => sortCanvases(publicCanvases.value.filter(matchesCanvas)));

    const allTagNames = computed(() => {
      const names = new Set<string>();
      for (const tag of sharedResourceTags.value) names.add(tag.name);
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvas of list) {
          for (const tag of canvas.tags) names.add(tag.name);
        }
      }
      return Array.from(names).sort();
    });

    const tagSuggestions = computed(() => {
      const byName = new Map<string, ResourceTag>();
      for (const tag of sharedResourceTags.value) byName.set(tag.name, tag);
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvasRecord of list) {
          for (const tag of canvasRecord.tags) byName.set(tag.name, tag);
        }
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    });

    const allResourceFolders = computed(() => [...ownResourceFolders.value, ...sharedResourceFolders.value]);
    const folderOptions = computed(() => ownResourceFolders.value.slice().sort((a, b) => a.name.localeCompare(b.name)));
    const folderNames = computed(() => folderOptions.value.map((folder) => folder.name));
    const folderSummaries = computed<FolderSummary[]>(() => allResourceFolders.value
      .map((folder) => {
        const canvases = (folder.items?.canvases || []).map((item) => normalizeCanvas({ ...item, folder: folder.name, folderId: folder.id }, true));
        const htmlDocs = (folder.items?.htmlDocuments || []).map((item) => normalizeHtmlDocument({ ...item, folderId: folder.id }));
        const items = sortFolderItems([...canvases, ...htmlDocs].filter((item) => matchesFolderItem(item, folder.name)));
        return {
          ...folder,
          items,
          canvasCount: canvases.length,
          htmlDocumentCount: htmlDocs.length,
        };
      })
      .filter((folder) => folder.items.length || contentFilter.value === 'all'));
    const isBusy = computed(() => pendingAction.value.length > 0);

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

    const load = async () => {
      loading.value = true;
      try {
        const res = await canvas.list();
        if (isLoggedIn) {
          const folders = await resourceFolders.list();
          ownResourceFolders.value = folders.own;
          sharedResourceFolders.value = folders.shared;
        }
        own.value = res.own.map((c: any) => normalizeCanvas(c, true));
        shared.value = res.shared.map((c: any) => normalizeCanvas(c, false));
        publicCanvases.value = (res.public || []).map((c: any) => normalizeCanvas(c, false));
        welcomeCanvas.value = res.welcome ? normalizeCanvas(res.welcome, false) : null;
        incomingRequests.value = isLoggedIn ? await accessRequests.incoming() : [];
        if (isLoggedIn) {
          sharedResourceTags.value = (await tags.list()).tags.map(({ name, color }) => ({ name, color }));
        }
        const availableFolders = new Set(ownResourceFolders.value.map((folder) => folder.id));
        openFolderNames.value = openFolderNames.value.filter((name) => availableFolders.has(name));
        const unsorted = ownResourceFolders.value.find((folder) => folder.name === 'Unsorted') || ownResourceFolders.value[0];
        if (unsorted && !openFolderNames.value.includes(unsorted.id)) {
          openFolderNames.value.unshift(unsorted.id);
        }
      } finally {
        loading.value = false;
      }
    };

    const openCanvas = (id: string) => {
      router.push(`/canvas/${id}`);
    };

    const openHtmlDocument = (id: string) => {
      router.push(`/html/${id}`);
    };

    const createCanvas = async () => {
      const targetFolder = await ensureFolderByName('Unsorted');
      const c = await runAction('create-canvas', () => canvas.create('Untitled', undefined, targetFolder?.id), 'Canvas created');
      if (!c) return;
      router.push(`/canvas/${c.id}`);
    };

    const openFolderModal = (folder?: FolderSummary | ResourceFolderSummary) => {
      closeCardMenu();
      folderModal.value = {
        open: true,
        resourceId: '',
        resourceType: 'canvas',
        folderId: folder?.id || '',
        value: folder?.name || 'Unsorted',
      };
    };

    const openMoveFolderModal = (c: CanvasRecord) => {
      closeCardMenu();
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
      folderModal.value = {
        open: true,
        resourceId: doc.id,
        resourceType: 'html-document',
        folderId: doc.folderId || '',
        value: currentFolder?.name || '',
      };
    };

    const closeFolderModal = () => {
      folderModal.value = { open: false, resourceId: '', resourceType: 'canvas', folderId: '', value: '' };
    };

    const ensureFolderByName = async (name: string) => {
      const normalizedName = name.trim() || 'Unsorted';
      const existing = ownResourceFolders.value.find((folder) => folder.name.toLowerCase() === normalizedName.toLowerCase());
      if (existing) return existing;
      return runAction('create-folder', () => resourceFolders.create(normalizedName), `Folder ${normalizedName} created`);
    };

    const saveFolderModal = async () => {
      const folderName = folderModal.value.value.trim();
      const targetFolder = folderModal.value.folderId
        ? ownResourceFolders.value.find((folder) => folder.id === folderModal.value.folderId)
        : await ensureFolderByName(folderName);
      if (!targetFolder) return;
      if (!folderModal.value.resourceId) {
        const c = await runAction('create-folder-canvas', () => canvas.create('Untitled', undefined, targetFolder.id), `Canvas created in ${targetFolder.name}`);
        if (!c) return;
        closeFolderModal();
        router.push(`/canvas/${c.id}`);
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

    const startCanvasDrag = (event: DragEvent, c: CanvasRecord) => {
      if (isBusy.value) {
        event.preventDefault();
        return;
      }
      closeCardMenu();
      draggingCanvasId.value = c.id;
      event.dataTransfer?.setData('text/plain', c.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    const endCanvasDrag = () => {
      draggingCanvasId.value = '';
      dragTargetFolder.value = '';
    };

    const onFolderDragOver = (folder: FolderSummary) => {
      if (!draggingCanvasId.value || isBusy.value || folder.role !== 'owner') return;
      dragTargetFolder.value = folder.id;
      if (!openFolderNames.value.includes(folder.id)) {
        openFolderNames.value = [...openFolderNames.value, folder.id];
      }
    };

    const onFolderDragLeave = (folder: FolderSummary) => {
      if (dragTargetFolder.value === folder.id) dragTargetFolder.value = '';
    };

    const dropCanvasToFolder = async (folder: FolderSummary) => {
      const canvasId = draggingCanvasId.value;
      endCanvasDrag();
      if (!canvasId || isBusy.value || folder.role !== 'owner') return;
      const current = own.value.find((item) => item.id === canvasId);
      if (!current || current.folderId === folder.id) return;
      await runAction('move-folder', () => resourceFolders.move(folder.id, 'canvas', canvasId), `Moved to ${folder.name}`);
      await load();
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
        `Folder renamed to ${nextFolder}`,
      );
      closeRenameFolderModal();
      await load();
    };

    const deleteFolder = async (folder: FolderSummary) => {
      const confirmed = window.confirm(`Delete folder "${folder.name}"? Resources will move to Unsorted.`);
      if (!confirmed) return;
      await runAction(
        'delete-folder',
        () => resourceFolders.delete(folder.id),
        `Folder ${folder.name} removed`,
      );
      await load();
    };

    const openTagsModal = (c: CanvasRecord) => {
      closeCardMenu();
      tagsModal.value = {
        open: true,
        canvasId: c.id,
        tags: c.tags.length ? c.tags.map((tag) => ({ ...tag })) : [{ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR }],
      };
    };

    const closeTagsModal = () => {
      tagsModal.value = { open: false, canvasId: '', tags: [] };
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
      await runAction('save-tags', () => canvas.update(tagsModal.value.canvasId, { tags }), 'Tags saved');
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

    const openTransferModal = (c: CanvasRecord) => {
      closeCardMenu();
      transferModal.value = { open: true, canvasId: c.id, email: '' };
    };

    const closeTransferModal = () => {
      transferModal.value = { open: false, canvasId: '', email: '' };
    };

    const saveTransferModal = async () => {
      const email = transferModal.value.email.trim();
      if (!email) return;
      await runAction('transfer-ownership', () => canvas.transferOwnership(transferModal.value.canvasId, email), 'Ownership transferred');
      closeTransferModal();
      await load();
    };

    const duplicateCanvas = async (canvasRecord: CanvasRecord) => {
      closeCardMenu();
      const title = canvasRecord.title?.trim() || 'Untitled';
      await runAction('duplicate-canvas', () => canvas.duplicate(canvasRecord.id), `Duplicated "${title}"`);
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

    const togglePinned = async (canvasRecord: CanvasRecord) => {
      closeCardMenu();
      const nextPinned = !canvasRecord.pinned;
      const updated = await runAction(
        `pin-canvas-${canvasRecord.id}`,
        () => canvas.update(canvasRecord.id, { pinned: nextPinned }),
        nextPinned ? 'Canvas pinned' : 'Canvas unpinned',
      );
      if (!updated) return;
      applyCanvasUpdate(updated);
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

    const toggleCardMenu = (canvasId: string) => {
      showMobileActions.value = false;
      openMenuCanvasId.value = openMenuCanvasId.value === canvasId ? '' : canvasId;
    };

    const closeCardMenu = () => {
      openMenuCanvasId.value = '';
      showMobileActions.value = false;
    };

    const toggleMobileActions = () => {
      openMenuCanvasId.value = '';
      showMobileActions.value = !showMobileActions.value;
    };

    const logout = () => {
      clearToken();
      router.push('/login');
    };

    const resolveAccessRequest = async (id: string, status: 'approved' | 'declined') => {
      await runAction(
        `access-request-${id}`,
        () => accessRequests.resolve(id, status),
        status === 'approved' ? 'Access approved' : 'Access declined',
      );
      await load();
    };

    const toggleFolderOpen = (folderName: string) => {
      openFolderNames.value = openFolderNames.value.includes(folderName)
        ? openFolderNames.value.filter((name) => name !== folderName)
        : [...openFolderNames.value, folderName];
    };

    const isFolderOpen = (folderName: string) => {
      return openFolderNames.value.includes(folderName);
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    const fileInput = ref<HTMLInputElement | null>(null);

    const importFile = () => {
      fileInput.value?.click();
    };

    const onFileSelected = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const title = file.name.replace(/\.(canvas|json)$/, '') || 'Imported';
        const c = await runAction('import-canvas', () => canvas.create(title, JSON.stringify(data)), `Imported ${title}`);
        if (!c) return;
        router.push(`/canvas/${c.id}`);
      } catch (err) {
        setFeedback('error', err instanceof Error ? err.message : 'Failed to import canvas file');
        console.error('Failed to import canvas file:', err);
      }
      (e.target as HTMLInputElement).value = '';
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

    onMounted(load);

    return {
      admin,
      isLoggedIn,
      loading,
      welcomeCanvas,
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
      actionLabel,
      openMenuCanvasId,
      showMobileActions,
      draggingCanvasId,
      dragTargetFolder,
      tagColors,
      tagSuggestions,
      folderModal,
      renameFolderModal,
      tagsModal,
      tagManager,
      transferModal,
      folderSummaries,
      incomingRequests,
      createCanvas,
      load,
      openFolderModal,
      openMoveFolderModal,
      openMoveHtmlFolderModal,
      saveFolderModal,
      closeFolderModal,
      startCanvasDrag,
      endCanvasDrag,
      onFolderDragOver,
      onFolderDragLeave,
      dropCanvasToFolder,
      openRenameFolderModal,
      closeRenameFolderModal,
      saveRenameFolderModal,
      deleteFolder,
      deleteHtmlDocument,
      openHtmlDocument,
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
      toggleCardMenu,
      closeCardMenu,
      toggleMobileActions,
      openCanvas,
      duplicateCanvas,
      deleteCanvas,
      togglePinned,
      logout,
      formatDate,
      renamingId,
      renameInput,
      startRename,
      finishRename,
      fileInput,
      importFile,
      onFileSelected,
      resolveAccessRequest,
    };
  },
});
</script>
