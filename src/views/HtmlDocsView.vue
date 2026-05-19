<template>
  <div class="dashboard" @click="openMenuId = ''">
    <header class="dash-header">
      <div>
        <h1>HTML Documents</h1>
        <p class="dash-subtitle">Upload, edit, group, share and generate HTML docs.</p>
        <nav class="home-tabs">
          <router-link to="/" class="home-tab">Canvas</router-link>
          <router-link to="/html-docs" class="home-tab active">HTML</router-link>
        </nav>
      </div>
      <div class="dash-actions">
        <template v-if="canManageDocs">
          <button class="btn-primary" @click.stop="createDoc">+ Empty HTML</button>
          <button class="btn-ghost" @click.stop="uploadInput?.click()">Upload HTML</button>
          <button class="btn-ghost" @click.stop="createGroup">+ Group</button>
          <router-link to="/html-settings" class="btn-ghost">Settings</router-link>
        </template>
      </div>
      <input ref="uploadInput" type="file" accept=".html,.htm,text/html" hidden @change="uploadFile" />
    </header>

    <div v-if="message" class="dashboard-toast" :class="`dashboard-toast-${messageType}`">{{ message }}</div>

    <section v-if="canManageDocs" class="html-generate-panel">
      <div>
        <h2>Generate from selected</h2>
        <p>{{ selectedIds.length }} selected</p>
      </div>
      <input v-model.trim="generateTitle" class="dash-search" placeholder="New document title" />
      <textarea v-model.trim="prompt" class="html-prompt" placeholder="Prompt for OpenRouter"></textarea>
      <button class="btn-primary" :disabled="!selectedIds.length || !prompt || busy" @click="generate">Generate</button>
    </section>

    <div v-if="loading" class="dash-loading">Loading...</div>
    <div v-else class="folder-manager-list">
      <section
        v-for="group in groupsWithDocs"
        :key="group.id"
        class="folder-manager-row html-drop-zone"
        @dragover.prevent
        @drop.prevent="dropDocument(group.id)"
      >
        <div class="folder-manager-top">
          <button class="folder-manager-main" @click.stop="toggleGroup(group.id)">
            <span class="folder-manager-title">
              <span class="section-toggle-icon folder-row-toggle" :class="{ expanded: openGroups.has(group.id) }">⌄</span>
              <span class="folder-manager-name">{{ group.name }}</span>
            </span>
            <span class="folder-manager-count">{{ group.items.length }} docs</span>
          </button>
          <div v-if="canManageDocs" class="folder-manager-actions">
            <button class="folder-manager-btn" @click.stop="renameGroup(group)">Rename</button>
          </div>
        </div>
        <transition name="folder-collapse">
          <div v-if="openGroups.has(group.id)" class="folder-manager-body">
            <div class="dash-grid">
              <article
                v-for="doc in group.items"
                :key="doc.id"
                class="canvas-card html-doc-card"
                :draggable="canManageDocs"
                @dragstart="draggingId = doc.id"
                @click="router.push('/html/' + doc.id)"
              >
                <label class="html-select" @click.stop>
                  <input type="checkbox" :checked="selectedIds.includes(doc.id)" @change="toggleSelected(doc.id)" />
                </label>
                <div class="card-title">{{ doc.title || 'Untitled HTML' }}</div>
                <div class="card-meta">
                  <span class="badge" :class="doc.shared ? 'badge-public' : 'badge-owner'">{{ doc.shared ? 'Shared' : 'Private' }}</span>
                  <span>{{ formatDate(doc.updatedAt) }}</span>
                </div>
                <button v-if="canManageDocs" class="card-manage" @click.stop="openMenuId = openMenuId === doc.id ? '' : doc.id">⋯</button>
                <div v-if="openMenuId === doc.id" class="card-menu" @click.stop>
                  <button class="card-menu-item" @click="copyLink(doc)">Copy shared link</button>
                  <button class="card-menu-item" @click="toggleShare(doc)">{{ doc.shared ? 'Make private' : 'Share' }}</button>
                </div>
              </article>
            </div>
          </div>
        </transition>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { htmlDocuments, isPasswordAccess } from '../api/client';

export default defineComponent({
  setup() {
    const router = useRouter();
    const uploadInput = ref<HTMLInputElement | null>(null);
    const groups = ref<any[]>([]);
    const documents = ref<any[]>([]);
    const loading = ref(true);
    const busy = ref(false);
    const message = ref('');
    const messageType = ref<'success' | 'error'>('success');
    const openGroups = ref(new Set<string>());
    const selectedIds = ref<string[]>([]);
    const draggingId = ref('');
    const openMenuId = ref('');
    const prompt = ref('');
    const generateTitle = ref('');
    const canManageDocs = computed(() => !isPasswordAccess());

    const groupsWithDocs = computed(() => {
      const baseGroups = groups.value.length ? groups.value : [{ id: 'shared', name: 'Shared', updatedAt: '', createdAt: '' }];
      return baseGroups.map((group) => ({
        ...group,
        items: documents.value.filter((doc) => doc.groupId === group.id || (!groups.value.length && doc.shared)),
      }));
    });

    function flash(type: 'success' | 'error', text: string) {
      messageType.value = type;
      message.value = text;
      setTimeout(() => { message.value = ''; }, 2600);
    }

    async function load() {
      loading.value = true;
      const state = await htmlDocuments.list();
      groups.value = state.groups;
      documents.value = state.documents;
      for (const group of state.groups) openGroups.value.add(group.id);
      loading.value = false;
    }

    async function createGroup() {
      const name = window.prompt('Group name');
      if (!name) return;
      try {
        await htmlDocuments.createGroup(name);
        await load();
      } catch (e: any) {
        flash('error', e.message || 'Failed to create group');
      }
    }

    async function renameGroup(group: any) {
      const name = window.prompt('Group name', group.name);
      if (!name) return;
      try {
        await htmlDocuments.renameGroup(group.id, name);
        await load();
      } catch (e: any) {
        flash('error', e.message || 'Failed to rename group');
      }
    }

    async function createDoc() {
      const title = window.prompt('Document title', 'Untitled HTML');
      if (!title) return;
      try {
        const doc = await htmlDocuments.create({ title, html: '<main><h1>' + title + '</h1></main>', groupId: groups.value[0]?.id });
        router.push('/html/' + doc.id);
      } catch (e: any) {
        flash('error', e.message || 'Failed to create document');
      }
    }

    async function uploadFile(event: Event) {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const html = await file.text();
        const doc = await htmlDocuments.create({
          title: file.name.replace(/\.html?$/i, ''),
          html,
          groupId: groups.value[0]?.id,
        });
        router.push('/html/' + doc.id);
      } catch (e: any) {
        flash('error', e.message || 'Failed to upload document');
      } finally {
        if (uploadInput.value) uploadInput.value.value = '';
      }
    }

    function toggleGroup(id: string) {
      const next = new Set(openGroups.value);
      next.has(id) ? next.delete(id) : next.add(id);
      openGroups.value = next;
    }

    function toggleSelected(id: string) {
      selectedIds.value = selectedIds.value.includes(id)
        ? selectedIds.value.filter((item) => item !== id)
        : [...selectedIds.value, id];
    }

    async function dropDocument(groupId: string) {
      if (!draggingId.value) return;
      try {
        await htmlDocuments.move(draggingId.value, groupId);
        await load();
      } catch (e: any) {
        flash('error', e.message || 'Failed to move document');
      } finally {
        draggingId.value = '';
      }
    }

    async function toggleShare(doc: any) {
      try {
        await htmlDocuments.update(doc.id, { shared: !doc.shared });
        await load();
      } catch (e: any) {
        flash('error', e.message || 'Failed to update sharing');
      }
    }

    async function copyLink(doc: any) {
      const url = `${window.location.origin}/html/${doc.id}`;
      await navigator.clipboard?.writeText(url);
      flash('success', 'Link copied');
    }

    async function generate() {
      busy.value = true;
      try {
        const doc = await htmlDocuments.generate({
          documentIds: selectedIds.value,
          prompt: prompt.value,
          title: generateTitle.value || 'Generated HTML',
          groupId: groups.value[0]?.id,
        });
        router.push('/html/' + doc.id);
      } catch (e: any) {
        flash('error', e.message || 'Generation failed');
      } finally {
        busy.value = false;
      }
    }

    const formatDate = (value: string) => value ? new Date(value).toLocaleDateString() : '';

    onMounted(load);

    return {
      router, uploadInput, groupsWithDocs, loading, busy, message, messageType, canManageDocs,
      openGroups, selectedIds, draggingId, openMenuId, prompt, generateTitle,
      load, createGroup, renameGroup, createDoc, uploadFile, toggleGroup,
      toggleSelected, dropDocument, toggleShare, copyLink, generate, formatDate,
    };
  },
});
</script>
