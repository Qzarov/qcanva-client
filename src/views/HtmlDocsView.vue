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

    <div class="dash-toolbar">
      <input v-model.trim="searchQuery" class="dash-search" placeholder="Search by title, group or tag" />
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
                <div v-if="doc.tags?.length" class="card-tags">
                  <span
                    v-for="tag in doc.tags"
                    :key="tag.name"
                    class="card-tag color-tag"
                    :style="{ '--tag-color': tag.color }"
                  >#{{ tag.name }}</span>
                </div>
                <button v-if="canManageDocs" class="card-manage" @click.stop="openMenuId = openMenuId === doc.id ? '' : doc.id">⋯</button>
                <button v-if="canManageDocs" class="card-delete" @click.stop="deleteDoc(doc)" title="Delete" :disabled="busy">x</button>
                <div v-if="openMenuId === doc.id" class="card-menu" @click.stop>
                  <button class="card-menu-item" @click="copyLink(doc)">Copy shared link</button>
                  <button class="card-menu-item" @click="toggleShare(doc)">{{ doc.shared ? 'Make private' : 'Share' }}</button>
                  <button class="card-menu-item" @click="openTagsModal(doc)">Edit tags</button>
                  <button class="card-menu-item danger" @click="deleteDoc(doc)" :disabled="busy">Delete</button>
                </div>
              </article>
            </div>
          </div>
        </transition>
      </section>
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
                :disabled="busy"
              ></button>
            </div>
            <button class="tag-remove-btn" @click="removeTag(index)" :disabled="busy">x</button>
          </div>
        </div>
        <button class="btn-ghost tag-add-btn" @click="addTag" :disabled="busy">+ Add tag</button>
        <div class="dashboard-modal-actions">
          <button class="btn-ghost" @click="closeTagsModal" :disabled="busy">Cancel</button>
          <button class="btn-primary" @click="saveTagsModal" :disabled="busy">Save tags</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { htmlDocuments, isPasswordAccess, tags, type ResourceTag } from '../api/client';

type HtmlTag = ResourceTag & { id: string };
type HtmlDocumentRecord = {
  id: string;
  title: string;
  groupId?: string;
  shared?: boolean;
  updatedAt: string;
  tags: HtmlTag[];
};

const DEFAULT_TAG_COLOR = '#7c8aff';
const tagColors = ['#7c8aff', '#53dfdd', '#44cf6e', '#e0de71', '#e9973f', '#fb464c', '#f472b6', '#94a3b8'];
const genTagId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  setup() {
    const router = useRouter();
    const uploadInput = ref<HTMLInputElement | null>(null);
    const groups = ref<any[]>([]);
    const documents = ref<HtmlDocumentRecord[]>([]);
    const sharedResourceTags = ref<ResourceTag[]>([]);
    const loading = ref(true);
    const busy = ref(false);
    const searchQuery = ref('');
    const selectedTag = ref('');
    const message = ref('');
    const messageType = ref<'success' | 'error'>('success');
    const openGroups = ref(new Set<string>());
    const selectedIds = ref<string[]>([]);
    const draggingId = ref('');
    const openMenuId = ref('');
    const prompt = ref('');
    const generateTitle = ref('');
    const canManageDocs = computed(() => !isPasswordAccess());
    const tagsModal = ref<{ open: boolean; documentId: string; tags: HtmlTag[] }>({
      open: false,
      documentId: '',
      tags: [],
    });

    const normalizeTags = (tags: unknown): HtmlTag[] => {
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
        .filter((tag): tag is HtmlTag => Boolean(tag));
    };

    const normalizeDocument = (doc: any): HtmlDocumentRecord => ({
      ...doc,
      tags: normalizeTags(doc.tags),
    });

    const getGroupName = (groupId?: string) => groups.value.find((group) => group.id === groupId)?.name || '';

    const matchesDocument = (doc: HtmlDocumentRecord) => {
      const q = searchQuery.value.trim().toLowerCase();
      const groupName = getGroupName(doc.groupId);
      const matchesQuery = !q || `${doc.title || ''} ${groupName} ${doc.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(q);
      const matchesTag = !selectedTag.value || doc.tags.some((tag) => tag.name === selectedTag.value);
      return matchesQuery && matchesTag;
    };

    const filteredDocuments = computed(() => documents.value.filter(matchesDocument));

    const groupsWithDocs = computed(() => {
      const baseGroups = groups.value.length ? groups.value : [{ id: 'shared', name: 'Shared', updatedAt: '', createdAt: '' }];
      return baseGroups.map((group) => ({
        ...group,
        items: filteredDocuments.value.filter((doc) => doc.groupId === group.id || (!groups.value.length && doc.shared)),
      }));
    });

    const allTagNames = computed(() => {
      const names = new Set<string>();
      for (const tag of sharedResourceTags.value) names.add(tag.name);
      for (const doc of documents.value) {
        for (const tag of doc.tags) names.add(tag.name);
      }
      return Array.from(names).sort();
    });

    const tagSuggestions = computed(() => {
      const byName = new Map<string, ResourceTag>();
      for (const tag of sharedResourceTags.value) byName.set(tag.name, tag);
      for (const doc of documents.value) {
        for (const tag of doc.tags) byName.set(tag.name, tag);
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
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
      documents.value = state.documents.map(normalizeDocument);
      if (canManageDocs.value) {
        sharedResourceTags.value = (await tags.list()).tags.map(({ name, color }) => ({ name, color }));
      }
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

    async function deleteDoc(doc: HtmlDocumentRecord) {
      const title = doc.title?.trim() || 'Untitled HTML';
      const confirmed = window.confirm(`Delete HTML document "${title}"?`);
      if (!confirmed) return;
      busy.value = true;
      openMenuId.value = '';
      try {
        await htmlDocuments.delete(doc.id);
        documents.value = documents.value.filter((item) => item.id !== doc.id);
        selectedIds.value = selectedIds.value.filter((id) => id !== doc.id);
        flash('success', `Deleted ${title}`);
      } catch (e: any) {
        flash('error', e.message || 'Failed to delete document');
      } finally {
        busy.value = false;
      }
    }

    function openTagsModal(doc: HtmlDocumentRecord) {
      openMenuId.value = '';
      tagsModal.value = {
        open: true,
        documentId: doc.id,
        tags: doc.tags.length ? doc.tags.map((tag) => ({ ...tag })) : [{ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR }],
      };
    }

    function closeTagsModal() {
      tagsModal.value = { open: false, documentId: '', tags: [] };
    }

    function addTag() {
      tagsModal.value.tags.push({ id: genTagId(), name: '', color: DEFAULT_TAG_COLOR });
    }

    function addSuggestedTag(tag: ResourceTag) {
      if (tagsModal.value.tags.some((current) => current.name === tag.name)) return;
      tagsModal.value.tags.push({ id: genTagId(), name: tag.name, color: tag.color });
    }

    function removeTag(index: number) {
      tagsModal.value.tags.splice(index, 1);
      if (!tagsModal.value.tags.length) addTag();
    }

    async function saveTagsModal() {
      const tags = tagsModal.value.tags
        .map((tag) => ({ name: tag.name.trim().toLowerCase(), color: tag.color }))
        .filter((tag) => tag.name);
      busy.value = true;
      try {
        await htmlDocuments.update(tagsModal.value.documentId, { tags });
        closeTagsModal();
        await load();
        flash('success', 'Tags saved');
      } catch (e: any) {
        flash('error', e.message || 'Failed to save tags');
      } finally {
        busy.value = false;
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
      searchQuery, selectedTag, allTagNames, tagColors, tagsModal, tagSuggestions,
      load, createGroup, renameGroup, createDoc, uploadFile, toggleGroup,
      toggleSelected, dropDocument, toggleShare, copyLink, generate, formatDate,
      deleteDoc, openTagsModal, closeTagsModal, addTag, addSuggestedTag, removeTag, saveTagsModal,
    };
  },
});
</script>
