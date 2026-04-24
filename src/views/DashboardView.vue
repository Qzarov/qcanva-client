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

    <div v-if="loading" class="dash-loading">Loading...</div>

    <template v-else>
      <div v-if="isLoggedIn && groupedOwnCanvases.length" class="dash-section">
        <h2>My folders</h2>
        <div v-for="group in groupedOwnCanvases" :key="'own-' + group.name" class="folder-section">
          <div class="folder-title-row">
            <div class="folder-title">{{ group.name }}</div>
            <button class="folder-action" @click.stop="openFolderModal(group.name)">Add canvas</button>
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
              <button class="card-manage" @click.stop="toggleCardMenu(c.id)" title="Canvas actions">⋯</button>
              <button class="card-delete" @click.stop="deleteCanvas(c.id)" title="Delete">x</button>
              <div v-if="openMenuCanvasId === c.id" class="card-menu" @click.stop>
                <button class="card-menu-item" @click="openMoveFolderModal(c)">Move to folder</button>
                <button class="card-menu-item" @click="openTagsModal(c)">Edit tags</button>
                <button class="card-menu-item" @click="openTransferModal(c)">Transfer ownership</button>
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
            >⋯</button>
            <div v-if="openMenuCanvasId === c.id" class="card-menu" @click.stop>
              <button class="card-menu-item" @click="openMoveFolderModal(c)">Move to folder</button>
              <button class="card-menu-item" @click="openTagsModal(c)">Edit tags</button>
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
          <button class="btn-ghost" @click="closeFolderModal">Cancel</button>
          <button class="btn-primary" @click="saveFolderModal">{{ folderModal.canvasId ? 'Move' : 'Create' }}</button>
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
              ></button>
            </div>
            <button class="tag-remove-btn" @click="removeTag(index)">x</button>
          </div>
        </div>
        <button class="btn-ghost tag-add-btn" @click="addTag">+ Add tag</button>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeTagsModal">Cancel</button>
          <button class="btn-primary" @click="saveTagsModal">Save tags</button>
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
          <button class="btn-ghost" @click="closeTransferModal">Cancel</button>
          <button class="btn-primary" @click="saveTransferModal">Transfer</button>
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
    const tagColors = ['#7c8aff', '#53dfdd', '#44cf6e', '#e0de71', '#e9973f', '#fb464c', '#f472b6', '#94a3b8'];

    const folderModal = ref<{ open: boolean; canvasId: string; value: string }>({
      open: false,
      canvasId: '',
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
      const c = await canvas.create('Untitled');
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
        const c = await canvas.create('Untitled', undefined, folder);
        closeFolderModal();
        router.push(`/canvas/${c.id}`);
        return;
      }
      const updated = await canvas.update(folderModal.value.canvasId, { folder });
      applyCanvasUpdate(updated);
      closeFolderModal();
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
      const updated = await canvas.update(tagsModal.value.canvasId, { tags });
      applyCanvasUpdate(updated);
      closeTagsModal();
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
      await canvas.transferOwnership(transferModal.value.canvasId, email);
      closeTransferModal();
      await load();
    };

    const deleteCanvas = async (id: string) => {
      await canvas.delete(id);
      own.value = own.value.filter((c) => c.id !== id);
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
        const c = await canvas.create(title, JSON.stringify(data));
        router.push(`/canvas/${c.id}`);
      } catch (err) {
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
        const updated = await canvas.update(c.id, { title: newTitle });
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
      openMenuCanvasId,
      tagColors,
      folderModal,
      tagsModal,
      transferModal,
      createCanvas,
      openFolderModal,
      openMoveFolderModal,
      saveFolderModal,
      closeFolderModal,
      openTagsModal,
      closeTagsModal,
      addTag,
      removeTag,
      saveTagsModal,
      openTransferModal,
      closeTransferModal,
      saveTransferModal,
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
