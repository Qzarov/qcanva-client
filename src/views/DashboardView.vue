<template>
  <div class="dashboard" @click="closeCardMenu">
    <header class="dash-header">
      <div>
        <h1>{{ isLoggedIn ? 'My Canvases' : 'QCanva' }}</h1>
        <p v-if="!isLoggedIn" class="dash-subtitle">Public canvases available without registration.</p>
      </div>
      <div class="dash-actions">
        <template v-if="isLoggedIn">
          <button class="btn-primary" @click.stop="createCanvas">+ New Canvas</button>
          <button class="btn-ghost" @click.stop="openFolderModal()">+ Folder Canvas</button>
          <button class="btn-ghost" @click.stop="importFile">Open .canvas</button>
        </template>
        <input type="file" ref="fileInput" accept=".canvas,.json" style="display:none" @change="onFileSelected" />
        <router-link v-if="admin" to="/admin" class="btn-ghost">Admin</router-link>
        <template v-if="isLoggedIn">
          <button class="btn-ghost" @click.stop="logout">Logout</button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-ghost">Login</router-link>
          <router-link to="/register" class="btn-primary">Register</router-link>
        </template>
      </div>
    </header>

    <div class="dash-toolbar">
      <input v-model.trim="searchQuery" class="dash-search" placeholder="Search by title, folder or tag" />
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
      <div v-if="isLoggedIn && folderSummaries.length" class="dash-section">
        <div class="dash-section-head">
          <button class="section-toggle" @click.stop="toggleFoldersExpanded">
            <span>Folders</span>
            <span class="section-toggle-icon" :class="{ expanded: foldersExpanded }">⌄</span>
          </button>
          <div class="dash-section-actions">
            <button class="btn-ghost btn-sm" @click.stop="openFolderModal()" :disabled="isBusy">+ Folder canvas</button>
          </div>
        </div>
        <transition name="folder-collapse">
        <div v-if="foldersExpanded" class="folder-manager-list">
          <div v-for="folder in folderSummaries" :key="folder.name" class="folder-manager-row">
            <button class="folder-manager-main" @click.stop="searchQuery = folder.name">
              <span class="folder-manager-name">{{ folder.name }}</span>
              <span class="folder-manager-count">{{ folder.count }} canvas{{ folder.count === 1 ? '' : 'es' }}</span>
            </button>
            <div class="folder-manager-actions">
              <button class="folder-manager-btn" @click.stop="openFolderModal(folder.name)" :disabled="isBusy">Add canvas</button>
              <button class="folder-manager-btn" @click.stop="openRenameFolderModal(folder.name)" :disabled="isBusy">Rename</button>
              <button class="folder-manager-btn danger" @click.stop="deleteFolder(folder.name)" :disabled="isBusy">Delete</button>
            </div>
          </div>
        </div>
        </transition>
      </div>

      <div v-if="isLoggedIn && groupedOwnCanvases.length" class="dash-section">
        <div class="dash-section-head">
          <h2>My folders</h2>
          <button class="btn-ghost btn-sm" @click.stop="load" :disabled="isBusy">Refresh</button>
        </div>
        <div v-for="group in groupedOwnCanvases" :key="'own-' + group.name" class="folder-section">
          <div class="folder-title-row">
            <div class="folder-title">{{ group.name }}</div>
            <div class="folder-inline-actions">
              <button class="folder-action" @click.stop="openFolderModal(group.name)" :disabled="isBusy">Add canvas</button>
              <button
                v-if="group.name !== 'Unsorted'"
                class="folder-action"
                @click.stop="openRenameFolderModal(group.name)"
                :disabled="isBusy"
              >Rename</button>
            </div>
          </div>
          <div class="dash-grid">
            <div
              v-for="c in group.items"
              :key="c.id"
              class="canvas-card"
              @click="openCanvas(c.id)"
            >
              <input
                v-if="renamingId === c.id"
                class="card-title-input"
                :value="c.title"
                @blur="finishRename($event, c)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
                @keydown.escape="renamingId = ''"
                @click.stop
                ref="renameInput"
              />
              <div v-else class="card-title" @dblclick.stop="startRename(c.id)">{{ c.title || 'Untitled' }}</div>
              <div class="card-meta">
                <span class="badge badge-owner">Owner</span>
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
              <button class="card-manage" @click.stop="toggleCardMenu(c.id)" title="Canvas actions" :disabled="isBusy">⋯</button>
              <button class="card-delete" @click.stop="deleteCanvas(c)" title="Delete" :disabled="isBusy">x</button>
              <div v-if="openMenuCanvasId === c.id" class="card-menu" @click.stop>
                <button class="card-menu-item" @click="openMoveFolderModal(c)" :disabled="isBusy">Move to folder</button>
                <button class="card-menu-item" @click="openTagsModal(c)" :disabled="isBusy">Edit tags</button>
                <button class="card-menu-item" @click="openTransferModal(c)" :disabled="isBusy">Transfer ownership</button>
              </div>
            </div>
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

      <div v-if="isLoggedIn && !groupedOwnCanvases.length && !sharedFiltered.length" class="dash-empty">
        No canvases yet. Create your first one!
      </div>
      <div v-else-if="!isLoggedIn && !publicFiltered.length && !welcomeCanvas" class="dash-empty">
        No public canvases yet.
      </div>
    </template>

    <div v-if="folderModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderModal">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ folderModal.canvasId ? 'Move to folder' : 'Create canvas in folder' }}</h3>
          <button class="dashboard-modal-close" @click="closeFolderModal">x</button>
        </div>
        <input
          v-model.trim="folderModal.value"
          class="dashboard-modal-input"
          placeholder="Folder name"
          @keydown.enter.prevent="saveFolderModal"
        />
        <div v-if="folderNames.length" class="folder-chip-list">
          <button
            v-for="folderName in folderNames"
            :key="folderName"
            class="folder-chip"
            @click="folderModal.value = folderName"
          >{{ folderName }}</button>
        </div>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeFolderModal" :disabled="isBusy">Cancel</button>
          <button class="btn-primary" @click="saveFolderModal" :disabled="isBusy || !folderModal.value.trim()">
            {{ actionLabel(folderModal.canvasId ? 'move-folder' : 'create-folder-canvas', folderModal.canvasId ? 'Move' : 'Create') }}
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
import { canvas, clearToken, isAdmin, isAuthenticated } from '../api/client';

type CanvasTag = { id: string; name: string; color: string };
type FeedbackState = { type: 'success' | 'error'; message: string };
type CanvasRecord = {
  id: string;
  title: string;
  updatedAt: string;
  role?: string;
  isOwn?: boolean;
  folder: string;
  tags: CanvasTag[];
  allowPublicEdit?: boolean;
  ownerName?: string;
  ownerEmail?: string;
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
    const welcomeCanvas = ref<CanvasRecord | null>(null);
    const loading = ref(true);
    const searchQuery = ref('');
    const selectedTag = ref('');
    const openMenuCanvasId = ref('');
    const foldersExpanded = ref(false);
    const pendingAction = ref('');
    const feedback = ref<FeedbackState>({ type: 'success', message: '' });
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    const tagColors = ['#7c8aff', '#53dfdd', '#44cf6e', '#e0de71', '#e9973f', '#fb464c', '#f472b6', '#94a3b8'];

    const folderModal = ref<{ open: boolean; canvasId: string; value: string }>({
      open: false,
      canvasId: '',
      value: '',
    });
    const renameFolderModal = ref<{ open: boolean; sourceName: string; value: string }>({
      open: false,
      sourceName: '',
      value: '',
    });
    const tagsModal = ref<{ open: boolean; canvasId: string; tags: CanvasTag[] }>({
      open: false,
      canvasId: '',
      tags: [],
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
      isOwn,
      folder: c.folder || '',
      tags: normalizeTags(c.tags),
    });

    const matchesCanvas = (c: CanvasRecord) => {
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${c.title || ''} ${c.folder || ''} ${c.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || c.tags.some((tag) => tag.name === selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const ownFiltered = computed(() => own.value.filter(matchesCanvas));
    const sharedFiltered = computed(() => shared.value.filter(matchesCanvas));
    const publicFiltered = computed(() => publicCanvases.value.filter(matchesCanvas));

    const groupedOwnCanvases = computed(() => {
      const map = new Map<string, CanvasRecord[]>();
      for (const c of ownFiltered.value) {
        const folder = c.folder || 'Unsorted';
        if (!map.has(folder)) map.set(folder, []);
        map.get(folder)!.push(c);
      }
      return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
    });

    const allTagNames = computed(() => {
      const names = new Set<string>();
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvas of list) {
          for (const tag of canvas.tags) names.add(tag.name);
        }
      }
      return Array.from(names).sort();
    });

    const folderNames = computed(() => {
      const names = new Set<string>();
      for (const c of own.value) {
        if (c.folder) names.add(c.folder);
      }
      return Array.from(names).sort();
    });
    const folderSummaries = computed(() =>
      folderNames.value.map((name) => ({
        name,
        count: own.value.filter((canvasRecord) => canvasRecord.folder === name).length,
      })),
    );
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
        own.value = res.own.map((c: any) => normalizeCanvas(c, true));
        shared.value = res.shared.map((c: any) => normalizeCanvas(c, false));
        publicCanvases.value = (res.public || []).map((c: any) => normalizeCanvas(c, false));
        welcomeCanvas.value = res.welcome ? normalizeCanvas(res.welcome, false) : null;
      } finally {
        loading.value = false;
      }
    };

    const openCanvas = (id: string) => {
      router.push(`/canvas/${id}`);
    };

    const createCanvas = async () => {
      const c = await runAction('create-canvas', () => canvas.create('Untitled'), 'Canvas created');
      if (!c) return;
      router.push(`/canvas/${c.id}`);
    };

    const openFolderModal = (folder = '') => {
      closeCardMenu();
      folderModal.value = { open: true, canvasId: '', value: folder };
    };

    const openMoveFolderModal = (c: CanvasRecord) => {
      closeCardMenu();
      folderModal.value = { open: true, canvasId: c.id, value: c.folder || '' };
    };

    const closeFolderModal = () => {
      folderModal.value = { open: false, canvasId: '', value: '' };
    };

    const saveFolderModal = async () => {
      const folder = folderModal.value.value.trim();
      if (!folderModal.value.canvasId) {
        const c = await runAction('create-folder-canvas', () => canvas.create('Untitled', undefined, folder), `Canvas created in ${folder}`);
        if (!c) return;
        closeFolderModal();
        router.push(`/canvas/${c.id}`);
        return;
      }
      await runAction('move-folder', () => canvas.update(folderModal.value.canvasId, { folder }), `Moved to ${folder}`);
      closeFolderModal();
      await load();
    };

    const openRenameFolderModal = (folderName: string) => {
      closeCardMenu();
      renameFolderModal.value = { open: true, sourceName: folderName, value: folderName };
    };

    const closeRenameFolderModal = () => {
      renameFolderModal.value = { open: false, sourceName: '', value: '' };
    };

    const saveRenameFolderModal = async () => {
      const nextFolder = renameFolderModal.value.value.trim();
      const currentFolder = renameFolderModal.value.sourceName;
      if (!nextFolder || nextFolder === currentFolder) {
        closeRenameFolderModal();
        return;
      }
      const affected = own.value.filter((canvasRecord) => canvasRecord.folder === currentFolder);
      await runAction(
        'rename-folder',
        () => Promise.all(affected.map((canvasRecord) => canvas.update(canvasRecord.id, { folder: nextFolder }))),
        `Folder renamed to ${nextFolder}`,
      );
      closeRenameFolderModal();
      await load();
    };

    const deleteFolder = async (folderName: string) => {
      const affected = own.value.filter((canvasRecord) => canvasRecord.folder === folderName);
      const confirmed = window.confirm(`Delete folder "${folderName}"? Canvases will move to Unsorted.`);
      if (!confirmed || !affected.length) return;
      await runAction(
        'delete-folder',
        () => Promise.all(affected.map((canvasRecord) => canvas.update(canvasRecord.id, { folder: '' }))),
        `Folder ${folderName} removed`,
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

    const deleteCanvas = async (canvasRecord: CanvasRecord) => {
      const title = canvasRecord.title?.trim() || 'Untitled';
      const confirmed = window.confirm(`Delete canvas "${title}"?`);
      if (!confirmed) return;
      await runAction('delete-canvas', () => canvas.delete(canvasRecord.id), `Deleted ${title}`);
      own.value = own.value.filter((c) => c.id !== canvasRecord.id);
    };

    const applyCanvasUpdate = (updatedRaw: any) => {
      const updated = normalizeCanvas(updatedRaw, false);
      const patch = (items: CanvasRecord[]) => {
        const target = items.find((item) => item.id === updated.id);
        if (!target) return;
        target.folder = updated.folder;
        target.tags = updated.tags;
        target.title = updated.title;
        target.allowPublicEdit = updated.allowPublicEdit;
      };
      patch(own.value);
      patch(shared.value);
      patch(publicCanvases.value);
    };

    const toggleCardMenu = (canvasId: string) => {
      openMenuCanvasId.value = openMenuCanvasId.value === canvasId ? '' : canvasId;
    };

    const closeCardMenu = () => {
      openMenuCanvasId.value = '';
    };

    const logout = () => {
      clearToken();
      router.push('/login');
    };

    const toggleFoldersExpanded = () => {
      foldersExpanded.value = !foldersExpanded.value;
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
      groupedOwnCanvases,
      sharedFiltered,
      publicFiltered,
      allTagNames,
      folderNames,
      searchQuery,
      selectedTag,
      feedback,
      isBusy,
      actionLabel,
      foldersExpanded,
      openMenuCanvasId,
      tagColors,
      folderModal,
      renameFolderModal,
      tagsModal,
      transferModal,
      folderSummaries,
      createCanvas,
      load,
      openFolderModal,
      openMoveFolderModal,
      saveFolderModal,
      closeFolderModal,
      openRenameFolderModal,
      closeRenameFolderModal,
      saveRenameFolderModal,
      deleteFolder,
      openTagsModal,
      closeTagsModal,
      addTag,
      removeTag,
      saveTagsModal,
      openTransferModal,
      closeTransferModal,
      saveTransferModal,
      toggleFoldersExpanded,
      toggleCardMenu,
      closeCardMenu,
      openCanvas,
      deleteCanvas,
      logout,
      formatDate,
      renamingId,
      renameInput,
      startRename,
      finishRename,
      fileInput,
      importFile,
      onFileSelected,
    };
  },
});
</script>
