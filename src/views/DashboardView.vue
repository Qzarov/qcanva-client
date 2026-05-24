<template>
  <div class="app-layout" @click="closeCardMenu">
    <header class="app-header">
      <div class="app-header-inner">
        <div>
          <h1>{{ isLoggedIn ? 'Resources' : 'QCanva' }}</h1>
          <p v-if="!isLoggedIn" class="dash-subtitle">Public canvases available without registration.</p>
        </div>
        <div class="header-user-slot">
          <template v-if="isLoggedIn">
          <div class="user-menu">
            <button class="current-user-badge" :title="currentUserLabel" @click.stop="toggleUserMenu">
              <span class="current-user-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span>{{ currentUserLabel }}</span>
            </button>
            <div v-if="openControlMenu === 'user'" class="mobile-action-popover user-popover" @click.stop>
              <router-link to="/html-settings" class="card-menu-item">
                <span class="menu-icon">⚙</span>
                <span>Settings</span>
              </router-link>
              <button class="card-menu-item" @click="logout">
                <span class="menu-icon">↪</span>
                <span>Sign out</span>
              </button>
            </div>
          </div>
          </template>
          <template v-else>
            <router-link to="/login" class="btn-ghost">Login</router-link>
            <router-link to="/register" class="btn-primary">Register</router-link>
          </template>
        </div>
      </div>
    </header>

    <main class="app-main dashboard">
    <div class="dashboard-shell">
    <section v-if="isLoggedIn" class="resource-control-panel">
      <div class="resource-control-actions">
          <div class="control-menu">
            <button class="btn-primary" @click.stop="toggleNewMenu">
              <span class="menu-icon">+</span>
              <span>New</span>
            </button>
            <div v-if="openControlMenu === 'new'" class="mobile-action-popover control-popover" @click.stop>
              <button class="card-menu-item" @click="createCanvas">
                <span class="menu-icon">▦</span>
                <span>New canvas</span>
              </button>
              <button class="card-menu-item" @click="createHtmlDocument">
                <span class="menu-icon">▤</span>
                <span>HTML document</span>
              </button>
              <button class="card-menu-item" @click="openCreateGroupModal">
                <span class="menu-icon">□</span>
                <span>Group</span>
              </button>
            </div>
          </div>
          <div class="dash-actions-secondary">
            <button class="btn-ghost" @click.stop="openTagManager">
              <span class="menu-icon">#</span>
              <span>Manage tags</span>
            </button>
            <button class="btn-ghost" @click.stop="importFile">
              <span class="menu-icon">⇧</span>
              <span>Import</span>
            </button>
            <router-link v-if="admin" to="/admin" class="btn-ghost">
              <span class="menu-icon">◎</span>
              <span>Admin</span>
            </router-link>
          </div>
      </div>
    </section>
    <input type="file" ref="fileInput" accept=".canvas,.json,.html,.htm,text/html" style="display:none" @change="onFileSelected" />
    <div class="dash-toolbar">
      <input v-model.trim="searchQuery" class="dash-search" placeholder="Search by title, group or tag" />
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
          <h2>Groups</h2>
          <div class="dash-section-actions">
            <button class="btn-ghost btn-sm" @click.stop="load" :disabled="isBusy">Refresh</button>
          </div>
        </div>
        <div class="folder-manager-list">
          <div
            v-for="folder in folderSummaries"
            :key="folder.id"
            class="folder-manager-row"
            :data-folder-id="folder.id"
            :class="{ 'folder-drop-active': canDropToFolder(folder) && dragTargetFolder === folder.id }"
            @dragenter.prevent="onFolderDragOver(folder)"
            @dragover.prevent="onFolderDragOver(folder)"
            @dragleave="onFolderDragLeave(folder)"
            @drop.prevent="dropResourceToFolder(folder)"
          >
            <div class="folder-manager-top">
              <button class="folder-manager-main" @click.stop="toggleFolderOpen(folder.id)">
                <span class="folder-manager-title">
                  <span class="section-toggle-icon folder-row-toggle" :class="{ expanded: isFolderOpen(folder.id) }">⌄</span>
                  <span class="folder-manager-name">{{ folder.name }}</span>
                  <span class="folder-manager-count">{{ folder.canvasCount }} canvas / {{ folder.htmlDocumentCount }} HTML</span>
                </span>
              </button>
              <div class="folder-manager-actions">
                <button
                  v-if="folder.role === 'owner'"
                  class="folder-manager-btn"
                  @click.stop="openFolderShareModal(folder)"
                  :disabled="isBusy"
                >Share</button>
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
                    class="canvas-card resource-drag-card"
                    :class="{ dragging: draggingResourceId === item.id }"
                    draggable="false"
                    @mousedown="startResourceMouseDrag($event, item, folder)"
                    @touchstart="startResourceTouchDrag($event, item, folder)"
                    @click="openCanvasFromCard(item.id)"
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
                      <button class="card-menu-item" @click="openMoveFolderModal(item)" :disabled="isBusy">Move to group</button>
                      <button class="card-menu-item" @click="openTagsModal(item)" :disabled="isBusy">Edit tags</button>
                      <button class="card-menu-item" @click="togglePinned(item)" :disabled="isBusy">{{ item.pinned ? 'Unpin' : 'Pin' }}</button>
                      <button class="card-menu-item" @click="openTransferModal(item)" :disabled="isBusy">Transfer ownership</button>
                      <button class="card-menu-item danger" @click="deleteCanvas(item)" :disabled="isBusy">Delete</button>
                    </div>
                  </div>
                  <article
                    v-else
                    class="canvas-card html-doc-card resource-drag-card"
                    :class="{ dragging: draggingResourceId === item.id }"
                    draggable="false"
                    @mousedown="startResourceMouseDrag($event, item, folder)"
                    @touchstart="startResourceTouchDrag($event, item, folder)"
                    @click="openHtmlDocumentFromCard(item.id)"
                  >
                    <div class="card-title">{{ item.title || 'Untitled HTML' }}</div>
                    <div class="card-meta">
                      <span class="badge badge-public">HTML</span>
                      <span class="card-date">{{ formatDate(item.updatedAt) }}</span>
                    </div>
                    <button class="card-manage" @click.stop="toggleCardMenu(item.id)" title="HTML actions" :disabled="isBusy">⋯</button>
                    <button class="card-delete" @click.stop="deleteHtmlDocument(item)" title="Delete" :disabled="isBusy">x</button>
                    <div v-if="openMenuCanvasId === item.id" class="card-menu" @click.stop>
                      <button class="card-menu-item" @click="openMoveHtmlFolderModal(item)" :disabled="isBusy">Move to group</button>
                      <button class="card-menu-item danger" @click="deleteHtmlDocument(item)" :disabled="isBusy">Delete</button>
                    </div>
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
              <button class="card-menu-item" @click="openMoveFolderModal(c)" :disabled="isBusy">Move to group</button>
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
    </div>
    </main>

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
          placeholder="Group name"
          @input="folderModal.folderId = ''"
          @keydown.enter.prevent="saveFolderModal"
        />
        <div v-if="folderModal.resourceId" class="dashboard-modal-note">Choose an existing Group for this resource.</div>
        <div v-if="folderModal.resourceId && folderOptions.length" class="folder-chip-list">
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
          <button class="btn-primary" @click="saveFolderModal" :disabled="isBusy || !canSaveFolderModal">
            {{ actionLabel(folderModal.resourceId ? 'move-folder' : 'create-folder', folderModal.resourceId ? 'Move' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="renameFolderModal.open" class="dashboard-modal-backdrop" @click.self="closeRenameFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>Rename group</h3>
          <button class="dashboard-modal-close" @click="closeRenameFolderModal">x</button>
        </div>
        <input
          v-model.trim="renameFolderModal.value"
          class="dashboard-modal-input"
          placeholder="Group name"
          @keydown.enter.prevent="saveRenameFolderModal"
        />
        <p class="dashboard-modal-note">All resources in this group will move to the new group name.</p>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeRenameFolderModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveRenameFolderModal" :disabled="isBusy || !renameFolderModal.value.trim()">
            {{ actionLabel('rename-folder', 'Save') }}
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
import { useRoute, useRouter } from 'vue-router';
import { accessRequests, canvas, clearToken, getCurrentUser, htmlDocuments, isAdmin, isAuthenticated, resourceFolders, tags, type ResourceFolderSummary, type ResourceTag, type ResourceTagSummary } from '../api/client';

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

const DEFAULT_TAG_COLOR = '#50d1b2';
const genTagId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  setup() {
    const router = useRouter();
    const route = useRoute();
    const admin = isAdmin();
    const isLoggedIn = isAuthenticated();
    const own = ref<CanvasRecord[]>([]);
    const shared = ref<CanvasRecord[]>([]);
    const publicCanvases = ref<CanvasRecord[]>([]);
    const ownResourceFolders = ref<ResourceFolderSummary[]>([]);
    const sharedResourceFolders = ref<ResourceFolderSummary[]>([]);
    const unfiledCanvases = ref<CanvasRecord[]>([]);
    const unfiledHtmlDocuments = ref<HtmlDocumentRecord[]>([]);
    const welcomeCanvas = ref<CanvasRecord | null>(null);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const searchQuery = ref('');
    const selectedTag = ref('');
    const contentFilter = ref<'all' | 'canvas' | 'html-document'>(route.query.type === 'html' ? 'html-document' : 'all');
    const sortMode = ref<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
    const openMenuCanvasId = ref('');
    const openControlMenu = ref('');
    const openFolderNames = ref<string[]>(['Unsorted']);
    const draggingResourceId = ref('');
    const draggingResourceType = ref<FolderItem['type']>('canvas');
    const draggingResourceFolderId = ref<string | null>(null);
    const dragTargetFolder = ref('');
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
    const currentUserLabel = computed(() => currentUser.value?.name || currentUser.value?.email || 'Signed in');

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
    const folderShareModal = ref<{ open: boolean; folderId: string; name: string; email: string; role: 'read' | 'edit'; permissions: any[]; loading: boolean }>({
      open: false,
      folderId: '',
      name: '',
      email: '',
      role: 'read',
      permissions: [],
      loading: false,
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

    const normalizeResourceFolder = (folder: ResourceFolderSummary): ResourceFolderSummary => {
      const canvases = folder.items?.canvases || folder.canvases || [];
      const htmlDocuments = folder.items?.htmlDocuments || folder.htmlDocuments || [];
      return {
        ...folder,
        canvasCount: folder.canvasCount ?? canvases.length,
        htmlDocumentCount: folder.htmlDocumentCount ?? htmlDocuments.length,
        items: {
          canvases,
          htmlDocuments,
        },
      };
    };

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
      for (const document of unfiledHtmlDocuments.value) {
        for (const tag of document.tags) names.add(tag.name);
      }
      for (const folder of allResourceFolders.value) {
        for (const document of folder.items?.htmlDocuments || []) {
          for (const tag of normalizeTags(document.tags)) names.add(tag.name);
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
      for (const document of unfiledHtmlDocuments.value) {
        for (const tag of document.tags) byName.set(tag.name, tag);
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    });

    const allResourceFolders = computed(() => [...ownResourceFolders.value, ...sharedResourceFolders.value]);
    const folderOptions = computed(() => ownResourceFolders.value.slice().sort((a, b) => a.name.localeCompare(b.name)));
    const folderNames = computed(() => folderOptions.value.map((folder) => folder.name));
    const canSaveFolderModal = computed(() => {
      if (!folderModal.value.open) return false;
      if (!folderModal.value.resourceId) return Boolean(folderModal.value.value.trim());
      return Boolean(folderModal.value.folderId && folderModal.value.folderId !== draggingResourceFolderId.value);
    });
    const folderSummaries = computed<FolderSummary[]>(() => {
      const folders = allResourceFolders.value
      .map((folder) => {
        const canvases = (folder.items?.canvases || folder.canvases || []).map((item) => normalizeCanvas({ ...item, folder: folder.name, folderId: folder.id }, true));
        const htmlDocs = (folder.items?.htmlDocuments || folder.htmlDocuments || []).map((item) => normalizeHtmlDocument({ ...item, folderId: folder.id }));
        const items = sortFolderItems([...canvases, ...htmlDocs].filter((item) => matchesFolderItem(item, folder.name)));
        return {
          ...folder,
          items,
          canvasCount: canvases.length,
          htmlDocumentCount: htmlDocs.length,
        };
      })
      .filter((folder) => {
        const hasActiveFilter = Boolean(searchQuery.value.trim() || selectedTag.value);
        return folder.items.length || (!hasActiveFilter && folder.role === 'owner');
      });

      const fallbackSourceItems = [...unfiledCanvases.value, ...unfiledHtmlDocuments.value];
      const fallbackItems = sortFolderItems(fallbackSourceItems.filter((item) => matchesFolderItem(item, 'Inbox')));
      if (fallbackItems.length || (contentFilter.value === 'all' && fallbackSourceItems.length)) {
        folders.push({
          id: 'legacy-resource-inbox',
          name: 'Inbox',
          role: 'owner',
          canvasCount: unfiledCanvases.value.length,
          htmlDocumentCount: unfiledHtmlDocuments.value.length,
          items: fallbackItems,
        });
      }
      return folders;
    });
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
          ownResourceFolders.value = folders.own.map(normalizeResourceFolder);
          sharedResourceFolders.value = folders.shared.map(normalizeResourceFolder);
          const folderDocumentIds = new Set(
            [...ownResourceFolders.value, ...sharedResourceFolders.value].flatMap((folder) =>
              (folder.items?.htmlDocuments || []).map((document: any) => document.id),
            ),
          );
          const legacyState = await htmlDocuments.list();
          unfiledHtmlDocuments.value = (legacyState.documents || [])
            .filter((document: any) => !folderDocumentIds.has(document.id))
            .map((document: any) => normalizeHtmlDocument(document));
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

    const openCanvasFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openCanvas(id);
    };

    const openHtmlDocument = (id: string) => {
      router.push(`/html/${id}`);
    };

    const openHtmlDocumentFromCard = (id: string) => {
      if (suppressNextCardClick.value) {
        suppressNextCardClick.value = false;
        return;
      }
      openHtmlDocument(id);
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
      router.push(`/html/${doc.id}`);
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
        const list = resourceType === 'canvas' ? folder.items?.canvases || [] : folder.items?.htmlDocuments || [];
        const index = list.findIndex((item) => item.id === resourceId);
        if (index >= 0) {
          [movedItem] = list.splice(index, 1);
          if (resourceType === 'canvas') {
            folder.canvasCount = list.length;
          } else {
            folder.htmlDocumentCount = list.length;
          }
          break;
        }
      }
      if (!movedItem) {
        const fallbackItems = resourceType === 'canvas' ? unfiledCanvases.value : unfiledHtmlDocuments.value;
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
      } else {
        destination.items.htmlDocuments = [nextItem, ...(destination.items.htmlDocuments || [])];
        destination.htmlDocumentCount = destination.items.htmlDocuments.length;
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
      if (!openFolderNames.value.includes(folder.id)) {
        openFolderNames.value = [...openFolderNames.value, folder.id];
      }
    };

    const onFolderDragLeave = (folder: FolderSummary) => {
      if (dragTargetFolder.value === folder.id) dragTargetFolder.value = '';
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
        },
      }));
      const previousSharedFolders = sharedResourceFolders.value.map((folder) => ({
        ...folder,
        items: {
          canvases: [...(folder.items?.canvases || [])],
          htmlDocuments: [...(folder.items?.htmlDocuments || [])],
        },
      }));
      const previousUnfiledCanvases = [...unfiledCanvases.value];
      const previousUnfiledHtmlDocuments = [...unfiledHtmlDocuments.value];
      const previousOwn = own.value.map((item) => ({ ...item }));
      moveResourceLocally(resourceId, resourceType, folder);
      try {
        await runAction('move-folder', () => resourceFolders.move(folder.id, resourceType, resourceId), `Moved to ${folder.name}`);
      } catch (error) {
        ownResourceFolders.value = previousOwnFolders;
        sharedResourceFolders.value = previousSharedFolders;
        unfiledCanvases.value = previousUnfiledCanvases;
        unfiledHtmlDocuments.value = previousUnfiledHtmlDocuments;
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
        .map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>('[data-folder-id]') : null)
        .find((element): element is HTMLElement => Boolean(element));
      const folderId = target?.dataset.folderId || '';
      const folder = findDropFolder(folderId);
      state.targetFolderId = folder?.id || '';
      dragTargetFolder.value = folder?.id || '';
      if (folder && !openFolderNames.value.includes(folder.id)) {
        openFolderNames.value = [...openFolderNames.value, folder.id];
      }
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
      openControlMenu.value = '';
      openMenuCanvasId.value = openMenuCanvasId.value === canvasId ? '' : canvasId;
    };

    const closeCardMenu = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = '';
    };

    const toggleNewMenu = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = openControlMenu.value === 'new' ? '' : 'new';
    };

    const toggleUserMenu = () => {
      openMenuCanvasId.value = '';
      openControlMenu.value = openControlMenu.value === 'user' ? '' : 'user';
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
      openControlMenu.value = '';
      fileInput.value?.click();
    };

    const onFileSelected = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
        const title = file.name.replace(/\.(canvas|json|html?|htm)$/i, '') || 'Imported';
        if (isHtml) {
          const targetFolder = await ensureFolderByName('Unsorted');
          const doc = await runAction(
            'import-html-document',
            () => htmlDocuments.create({ title, html: text, folderId: targetFolder?.id }),
            `Imported ${title}`,
          );
          if (!doc) return;
          router.push(`/html/${doc.id}`);
          return;
        }

        const data = JSON.parse(text);
        const targetFolder = await ensureFolderByName('Unsorted');
        const c = await runAction(
          'import-canvas',
          () => canvas.create(title, JSON.stringify(data), targetFolder?.id),
          `Imported ${title}`,
        );
        if (!c) return;
        router.push(`/canvas/${c.id}`);
      } catch (err) {
        setFeedback('error', err instanceof Error ? err.message : 'Failed to import file');
        console.error('Failed to import file:', err);
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
      canSaveFolderModal,
      actionLabel,
      openMenuCanvasId,
      openControlMenu,
      draggingResourceId,
      draggingResourceType,
      dragTargetFolder,
      draggingResourceFolderId,
      tagColors,
      tagSuggestions,
      currentUserLabel,
      folderModal,
      renameFolderModal,
      folderShareModal,
      tagsModal,
      tagManager,
      transferModal,
      folderSummaries,
      incomingRequests,
      createCanvas,
      createHtmlDocument,
      load,
      openCreateGroupModal,
      openMoveFolderModal,
      openMoveHtmlFolderModal,
      saveFolderModal,
      closeFolderModal,
      startCanvasDrag,
      startResourceMouseDrag,
      startResourceTouchDrag,
      endResourceDrag,
      onFolderDragOver,
      onFolderDragLeave,
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
      openHtmlDocument,
      openHtmlDocumentFromCard,
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
      toggleNewMenu,
      toggleUserMenu,
      openCanvas,
      openCanvasFromCard,
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
