<template>
  <div class="dashboard">
    <header class="dash-header">
      <div>
        <h1>{{ isLoggedIn ? 'My Canvases' : 'QCanva' }}</h1>
        <p v-if="!isLoggedIn" class="dash-subtitle">Public canvases available without registration.</p>
      </div>
      <div class="dash-actions">
        <template v-if="isLoggedIn">
          <button class="btn-primary" @click="createCanvas">+ New Canvas</button>
          <button class="btn-ghost" @click="createCanvasInFolder">+ Folder Canvas</button>
          <button class="btn-ghost" @click="importFile">Open .canvas</button>
        </template>
        <input type="file" ref="fileInput" accept=".canvas,.json" style="display:none" @change="onFileSelected" />
        <router-link v-if="admin" to="/admin" class="btn-ghost">Admin</router-link>
        <template v-if="isLoggedIn">
          <button class="btn-ghost" @click="logout">Logout</button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-ghost">Login</router-link>
          <router-link to="/register" class="btn-primary">Register</router-link>
        </template>
      </div>
    </header>

    <div class="dash-toolbar">
      <input v-model.trim="searchQuery" class="dash-search" placeholder="Search by title or tag" />
      <div v-if="allTags.length" class="tag-filter-list">
        <button
          class="tag-filter"
          :class="{ active: selectedTag === '' }"
          @click="selectedTag = ''"
        >All</button>
        <button
          v-for="tag in allTags"
          :key="tag"
          class="tag-filter"
          :class="{ active: selectedTag === tag }"
          @click="selectedTag = tag"
        >#{{ tag }}</button>
      </div>
    </div>

    <div v-if="loading" class="dash-loading">Loading...</div>

    <template v-else>
      <div v-if="isLoggedIn && groupedOwnCanvases.length" class="dash-section">
        <h2>My folders</h2>
        <div
          v-for="group in groupedOwnCanvases"
          :key="'own-' + group.name"
          class="folder-section"
        >
          <div class="folder-title">{{ group.name }}</div>
          <div class="dash-grid">
            <div
              v-for="c in group.items"
              :key="c.id"
              class="canvas-card"
              @click="$router.push(`/canvas/${c.id}`)"
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
                <span v-if="c.isOwn" class="badge badge-owner">Owner</span>
                <span v-else class="badge badge-shared">{{ c.role }}</span>
                <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
              </div>
              <div v-if="c.folder" class="card-folder">{{ c.folder }}</div>
              <div v-if="c.tags?.length" class="card-tags">
                <span v-for="tag in c.tags" :key="tag" class="card-tag">#{{ tag }}</span>
              </div>
              <button
                v-if="c.isOwn"
                class="card-manage"
                @click.stop="manageCanvasMeta(c)"
                title="Folder & tags"
              >⋯</button>
              <button
                v-if="c.isOwn"
                class="card-delete"
                @click.stop="deleteCanvas(c.id)"
                title="Delete"
              >x</button>
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
            @click="$router.push(`/canvas/${c.id}`)"
          >
            <div class="card-title">{{ c.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-shared">{{ c.role }}</span>
              <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
            </div>
            <div v-if="c.folder" class="card-folder">{{ c.folder }}</div>
            <div v-if="c.tags?.length" class="card-tags">
              <span v-for="tag in c.tags" :key="tag" class="card-tag">#{{ tag }}</span>
            </div>
            <button
              v-if="c.role === 'edit'"
              class="card-manage"
              @click.stop="manageCanvasMeta(c)"
              title="Folder & tags"
            >⋯</button>
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
            @click="$router.push(`/canvas/${c.id}`)"
          >
            <div class="card-title">{{ c.title || 'Untitled' }}</div>
            <div class="card-meta">
              <span class="badge badge-public">{{ c.allowPublicEdit ? 'Public edit' : 'Public' }}</span>
              <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
            </div>
            <div class="card-owner">{{ c.ownerName || c.ownerEmail || 'Unknown owner' }}</div>
            <div v-if="c.folder" class="card-folder">{{ c.folder }}</div>
            <div v-if="c.tags?.length" class="card-tags">
              <span v-for="tag in c.tags" :key="tag" class="card-tag">#{{ tag }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="welcomeCanvas" class="dash-section">
        <h2>Welcome</h2>
        <div class="dash-grid">
          <div class="canvas-card canvas-card-welcome" @click="$router.push(`/canvas/${welcomeCanvas.id}`)">
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
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { canvas, clearToken, isAdmin, isAuthenticated } from '../api/client';

export default defineComponent({
  setup() {
    const router = useRouter();
    const admin = isAdmin();
    const isLoggedIn = isAuthenticated();
    const own = ref<any[]>([]);
    const shared = ref<any[]>([]);
    const publicCanvases = ref<any[]>([]);
    const welcomeCanvas = ref<any>(null);
    const loading = ref(true);
    const searchQuery = ref('');
    const selectedTag = ref('');

    const normalizeCanvas = (c: any, isOwn = false) => ({
      ...c,
      isOwn,
      folder: c.folder || '',
      tags: Array.isArray(c.tags) ? c.tags : [],
    });

    const matchesCanvas = (c: any) => {
      const q = searchQuery.value.trim().toLowerCase();
      const matchesQuery = !q || `${c.title || ''} ${c.folder || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || (c.tags || []).includes(selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const ownFiltered = computed(() => own.value.map((c) => normalizeCanvas(c, true)).filter(matchesCanvas));
    const sharedFiltered = computed(() => shared.value.map((c) => normalizeCanvas(c)).filter(matchesCanvas));
    const publicFiltered = computed(() => publicCanvases.value.map((c) => normalizeCanvas(c)).filter(matchesCanvas));

    const groupedOwnCanvases = computed(() => {
      const map = new Map<string, any[]>();
      for (const canvas of ownFiltered.value) {
        const folder = canvas.folder || 'Unsorted';
        if (!map.has(folder)) map.set(folder, []);
        map.get(folder)!.push(canvas);
      }
      return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
    });

    const allTags = computed(() => {
      const tags = new Set<string>();
      for (const list of [own.value, shared.value, publicCanvases.value]) {
        for (const canvas of list) {
          for (const tag of Array.isArray(canvas.tags) ? canvas.tags : []) {
            tags.add(tag);
          }
        }
      }
      return Array.from(tags).sort();
    });

    const load = async () => {
      loading.value = true;
      try {
        const res = await canvas.list();
        own.value = res.own;
        shared.value = res.shared;
        publicCanvases.value = res.public || [];
        welcomeCanvas.value = (res as any).welcome || null;
      } catch {}
      loading.value = false;
    };

    const createCanvas = async () => {
      const c = await canvas.create('Untitled');
      router.push(`/canvas/${c.id}`);
    };

    const createCanvasInFolder = async () => {
      const folder = window.prompt('Folder name');
      if (folder === null) return;
      const normalizedFolder = folder.trim();
      if (!normalizedFolder) return;
      const c = await canvas.create('Untitled', undefined, normalizedFolder);
      router.push(`/canvas/${c.id}`);
    };

    const deleteCanvas = async (id: string) => {
      await canvas.delete(id);
      own.value = own.value.filter((c) => c.id !== id);
    };

    const applyCanvasMetaLocally = (updated: any) => {
      const patch = (items: any[]) => {
        const target = items.find((item) => item.id === updated.id);
        if (!target) return;
        target.folder = updated.folder || '';
        target.tags = Array.isArray(updated.tags) ? updated.tags : [];
      };
      patch(own.value);
      patch(shared.value);
      patch(publicCanvases.value);
    };

    const manageCanvasMeta = async (c: any) => {
      const nextFolder = window.prompt('Folder', c.folder || '');
      if (nextFolder === null) return;
      const nextTagsRaw = window.prompt('Tags (comma separated)', Array.isArray(c.tags) ? c.tags.join(', ') : '');
      if (nextTagsRaw === null) return;
      const tags = nextTagsRaw
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      const updated = await canvas.update(c.id, { folder: nextFolder.trim(), tags });
      applyCanvasMetaLocally(updated);
    };

    const logout = () => {
      clearToken();
      router.push('/login');
    };

    const formatDate = (d: string) => {
      return new Date(d).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    };

    // Import .canvas file
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

    // Rename
    const renamingId = ref('');
    const renameInput = ref<HTMLInputElement[]>([]);

    const startRename = (id: string) => {
      renamingId.value = id;
      nextTick(() => {
        renameInput.value?.[0]?.focus();
        renameInput.value?.[0]?.select();
      });
    };

    const finishRename = async (e: Event, c: any) => {
      const newTitle = (e.target as HTMLInputElement).value.trim();
      renamingId.value = '';
      if (newTitle && newTitle !== c.title) {
        await canvas.update(c.id, { title: newTitle });
        const item = own.value.find((o) => o.id === c.id);
        if (item) item.title = newTitle;
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
      allTags,
      searchQuery,
      selectedTag,
      createCanvas,
      createCanvasInFolder,
      manageCanvasMeta,
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
