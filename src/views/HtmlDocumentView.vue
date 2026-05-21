<template>
  <div class="html-editor-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <div v-else-if="accessDenied" class="access-gate">
      <div class="access-gate-card">
        <div class="access-gate-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 class="access-gate-title">Private document</h2>
        <p class="access-gate-sub">You need permission to view this document.</p>

        <div class="access-gate-section">
          <div class="access-gate-label">Have a password?</div>
          <form class="access-gate-form" @submit.prevent="loginWithHtmlPassword">
            <input v-model="resourcePassword" type="password" placeholder="Enter password" class="access-gate-input" />
            <button class="access-gate-btn access-gate-btn-primary" :disabled="checkingResourcePassword || !resourcePassword">
              {{ checkingResourcePassword ? 'Checking…' : 'Open' }}
            </button>
          </form>
        </div>

        <div class="access-gate-divider"><span>or</span></div>

        <div class="access-gate-section">
          <div class="access-gate-label">Request access from the owner</div>
          <div class="access-gate-request-row">
            <select v-model="requestedRole" class="access-gate-select">
              <option value="read">View only</option>
              <option value="edit">Can edit</option>
            </select>
            <button class="access-gate-btn access-gate-btn-secondary" :disabled="requestingAccess || accessRequestSent" @click="requestHtmlAccess">
              {{ accessRequestSent ? '✓ Request sent' : 'Send request' }}
            </button>
          </div>
        </div>

        <router-link to="/html-docs" class="access-gate-back">← Documents</router-link>
      </div>
    </div>
    <template v-else>
    <header class="html-editor-bar">
      <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      <input v-model="title" class="html-title-input" :readonly="role === 'read'" />
      <button v-if="role === 'owner'" class="btn-ghost" @click="showShare = !showShare">Access</button>
      <div class="html-mode-tabs">
        <button class="btn-ghost btn-sm" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">Preview</button>
        <button v-if="role !== 'read'" class="btn-ghost btn-sm" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'">Source</button>
      </div>
      <button class="btn-ghost" @click="downloadDocument">Download</button>
      <button class="btn-ghost" @click="toggleHistory">History</button>
      <span v-if="role !== 'read'" class="html-save-state" :class="{ dirty: isDirty }">{{ isDirty ? 'Unsaved' : 'Saved' }}</span>
      <button v-if="role !== 'read'" class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </header>
    <section v-if="showShare && role === 'owner'" class="share-panel html-share-panel">
      <div class="share-panel-header">
        <h3>Access</h3>
        <button class="btn-ghost btn-sm" @click="showShare = false">×</button>
      </div>

      <div class="share-section">
        <div class="share-section-title">Who can view</div>
        <select class="share-visibility-select" v-model="visibility" @change="saveAccessSettings">
          <option value="private">Private — only invited people</option>
          <option value="authenticated">Auth only — any logged-in user</option>
          <option value="public">Public — anyone with the link</option>
        </select>
        <label class="share-checkbox">
          <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
          <span>Allow public editing</span>
        </label>
      </div>

      <div class="share-section">
        <div class="share-section-title">Invite people</div>
        <div class="share-form">
          <input v-model.trim="shareEmail" placeholder="Email" type="email" />
          <select v-model="shareRole">
            <option value="read">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button @click="doShare">Invite</button>
        </div>
        <div v-if="permissions.length" class="share-list">
          <div v-for="p in permissions" :key="p.id" class="share-item">
            <span>{{ p.user?.email || p.userId }}</span>
            <span class="share-item-role">{{ p.role === 'edit' ? 'Can edit' : 'Can view' }}</span>
            <button @click="doRevoke(p.userId)">×</button>
          </div>
        </div>
      </div>

      <div class="share-section">
        <div class="share-section-title">Password access</div>
        <label class="share-checkbox">
          <input type="checkbox" v-model="passwordAccessEnabled" />
          <span>Enable password access</span>
        </label>
        <div v-if="passwordAccessEnabled" class="share-form">
          <input v-model="passwordAccessPassword" type="password" placeholder="New password" />
          <select v-model="passwordAccessRole">
            <option value="read">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button @click="savePasswordAccess">Save</button>
        </div>
      </div>
    </section>
    <section v-if="showHistory" class="html-history-panel">
      <div class="html-history-list">
        <div class="html-history-head">
          <strong>History</strong>
          <button class="btn-ghost btn-sm" @click="showHistory = false">×</button>
        </div>
        <div v-if="historyLoading" class="html-history-empty">Loading...</div>
        <button
          v-for="entry in historyItems"
          :key="entry.id"
          class="html-history-item"
          :class="{ active: selectedHistory?.id === entry.id }"
          @click="openHistoryEntry(entry)"
        >
          <span>Revision {{ entry.revision }}</span>
          <small>{{ entry.type }} · {{ new Date(entry.createdAt).toLocaleString() }}</small>
        </button>
        <div v-if="!historyLoading && !historyItems.length" class="html-history-empty">No history yet</div>
      </div>
      <div class="html-history-preview">
        <div v-if="!selectedHistory" class="html-history-empty">Select a revision</div>
        <template v-else>
          <div class="html-history-preview-head">
            <div>
              <strong>Revision {{ selectedHistory.revision }}</strong>
              <small>{{ selectedHistory.type }}</small>
            </div>
            <button v-if="role !== 'read'" class="btn-ghost btn-sm" :disabled="restoringHistory" @click="restoreSelectedHistory">
              {{ restoringHistory ? 'Restoring...' : 'Restore' }}
            </button>
          </div>
          <iframe
            :srcdoc="selectedHistory.html"
            class="html-browser-preview"
            sandbox="allow-same-origin allow-scripts allow-forms"
          ></iframe>
        </template>
      </div>
    </section>
    <main class="html-editor-main">
      <HtmlVisualEditor v-if="viewMode === 'visual' && role !== 'read'" v-model="html" />
      <iframe
        v-if="viewMode === 'preview'"
        ref="previewFrame"
        :srcdoc="html"
        class="html-browser-preview"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        @load="onPreviewLoad"
      ></iframe>
      <div v-else-if="viewMode === 'split' && role !== 'read'" class="html-editor-grid">
        <textarea
          ref="sourceEditor"
          v-model="html"
          class="html-source html-source-full"
          spellcheck="false"
        ></textarea>
        <iframe
          :srcdoc="html"
          class="html-browser-preview"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          @load="onPreviewLoad"
        ></iframe>
      </div>
      <textarea
        v-else-if="role !== 'read'"
        ref="sourceEditor"
        v-model="html"
        class="html-source html-source-full"
        spellcheck="false"
      ></textarea>
      <pre v-else class="html-source html-source-readonly"><code>{{ html }}</code></pre>
    </main>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { accessRequests, ApiError, auth, htmlDocuments, isAuthenticated, setToken } from '../api/client';
import HtmlVisualEditor from '../components/html/HtmlVisualEditor.vue';
import { useToast } from '../composables/useToast';
import { downloadHtmlDocument } from '../html/htmlDocumentExport';
import { serializeDocumentWithFormState } from '../html/formStateSerialization';
import { captureFrameScroll, restoreFrameScroll } from '../html/scrollRestoration';
import type { FrameScrollPosition } from '../html/scrollRestoration';

export default defineComponent({
  components: { HtmlVisualEditor },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const id = route.params.id as string;
    const { show: showToast } = useToast();
    const title = ref('');
    const html = ref('');
    const savedSnapshot = ref({ title: '', html: '' });
    const role = ref('read');
    const viewMode = ref<'visual' | 'preview' | 'split' | 'source'>('preview');
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const loading = ref(true);
    const accessDenied = ref(false);
    const requestedRole = ref<'read' | 'edit'>('read');
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref<'read' | 'edit'>('read');
    const permissions = ref<any[]>([]);
    const resourcePassword = ref('');
    const checkingResourcePassword = ref(false);
    const passwordAccessEnabled = ref(false);
    const passwordAccessPassword = ref('');
    const passwordAccessRole = ref<'read' | 'edit'>('read');
    const saving = ref(false);
    const showHistory = ref(false);
    const historyLoading = ref(false);
    const historyItems = ref<any[]>([]);
    const selectedHistory = ref<any | null>(null);
    const restoringHistory = ref(false);
    const previewFrame = ref<HTMLIFrameElement | null>(null);
    const sourceEditor = ref<HTMLTextAreaElement | null>(null);
    let pendingPreviewScroll: FrameScrollPosition | null = null;
    const isDirty = computed(() => title.value !== savedSnapshot.value.title || html.value !== savedSnapshot.value.html);

    async function load() {
      try {
        loading.value = true;
        accessDenied.value = false;
        const res = await htmlDocuments.get(id);
        title.value = res.document.title;
        html.value = res.document.html;
        savedSnapshot.value = { title: title.value, html: html.value };
        visibility.value = res.document.visibility || (res.document.shared ? 'public' : 'private');
        allowPublicEdit.value = !!res.document.allowPublicEdit;
        passwordAccessEnabled.value = !!res.document.passwordAccessEnabled;
        passwordAccessRole.value = res.document.passwordAccessRole || 'read';
        role.value = res.role;
        if (res.role === 'owner') await loadPermissions();
      } catch (e: any) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          accessDenied.value = true;
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          await router.replace('/html-docs');
          return;
        }
        throw e;
      } finally {
        loading.value = false;
      }
    }

    function syncHtmlFromPreview() {
      if (viewMode.value !== 'preview') return;
      const doc = previewFrame.value?.contentDocument;
      if (!doc?.documentElement) return;
      html.value = serializeDocumentWithFormState(doc);
    }

    function downloadDocument() {
      syncHtmlFromPreview();
      downloadHtmlDocument(title.value, html.value);
    }

    async function save() {
      saving.value = true;
      const pageScroll = { x: window.scrollX, y: window.scrollY };
      try {
        if (viewMode.value === 'preview') {
          pendingPreviewScroll = captureFrameScroll(previewFrame.value);
        }
        syncHtmlFromPreview();
        await htmlDocuments.update(id, { title: title.value, html: html.value });
        savedSnapshot.value = { title: title.value, html: html.value };
        if (showHistory.value) await loadHistory();
        await nextTick();
        requestAnimationFrame(() => window.scrollTo(pageScroll.x, pageScroll.y));
        showToast('HTML document saved', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to save HTML document', 'error');
      } finally {
        saving.value = false;
      }
    }

    async function loadHistory() {
      historyLoading.value = true;
      try {
        const result = await htmlDocuments.history(id, { limit: 50 });
        historyItems.value = result.items || [];
      } catch (e: any) {
        showToast(e.message || 'Failed to load history', 'error');
      } finally {
        historyLoading.value = false;
      }
    }

    async function toggleHistory() {
      showHistory.value = !showHistory.value;
      if (showHistory.value && !historyItems.value.length) await loadHistory();
    }

    async function openHistoryEntry(entry: any) {
      try {
        selectedHistory.value = await htmlDocuments.historyEntry(id, entry.id);
      } catch (e: any) {
        showToast(e.message || 'Failed to load history entry', 'error');
      }
    }

    async function restoreSelectedHistory() {
      if (!selectedHistory.value) return;
      const ok = window.confirm(`Restore revision ${selectedHistory.value.revision}? This will create a new revision.`);
      if (!ok) return;
      restoringHistory.value = true;
      try {
        await htmlDocuments.restoreHistoryEntry(id, selectedHistory.value.id);
        selectedHistory.value = null;
        await load();
        await loadHistory();
        showToast('HTML document restored', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to restore history entry', 'error');
      } finally {
        restoringHistory.value = false;
      }
    }

    async function ensureSourceEditor() {
      if (viewMode.value === 'preview') viewMode.value = 'split';
      await nextTick();
      sourceEditor.value?.focus();
      return sourceEditor.value;
    }

    function updateSelectedSource(nextText: string, selectStart?: number, selectEnd?: number) {
      const editor = sourceEditor.value;
      if (!editor) {
        html.value += nextText;
        return;
      }
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      html.value = html.value.slice(0, start) + nextText + html.value.slice(end);
      requestAnimationFrame(() => {
        editor.focus();
        const cursorStart = selectStart ?? start + nextText.length;
        const cursorEnd = selectEnd ?? cursorStart;
        editor.setSelectionRange(cursorStart, cursorEnd);
      });
    }

    async function wrapSelection(tag: string) {
      const editor = await ensureSourceEditor();
      const selected = editor ? html.value.slice(editor.selectionStart, editor.selectionEnd) : '';
      const content = selected || tag.toUpperCase();
      const snippet = `<${tag}>${content}</${tag}>`;
      const base = editor?.selectionStart ?? html.value.length;
      const innerStart = base + tag.length + 2;
      updateSelectedSource(
        snippet,
        selected ? base + snippet.length : innerStart,
        selected ? base + snippet.length : innerStart + content.length,
      );
    }

    async function insertSnippet(kind: 'link' | 'card' | 'list' | 'style') {
      await ensureSourceEditor();
      const snippets = {
        link: '<a href="https://example.com">Link text</a>',
        card: '<section class="card">\n  <h2>Title</h2>\n  <p>Body text</p>\n</section>',
        list: '<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>',
        style: '<style>\n  body { font-family: system-ui, sans-serif; }\n  .card { padding: 24px; border: 1px solid #ddd; border-radius: 8px; }\n</style>',
      };
      updateSelectedSource(snippets[kind]);
    }

    function formatHtml() {
      const source = html.value.trim();
      if (!source) return;
      let depth = 0;
      html.value = source
        .replace(/>\s+</g, '>\n<')
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (/^<\/[^>]+>/.test(trimmed)) depth = Math.max(depth - 1, 0);
          const formatted = `${'  '.repeat(depth)}${trimmed}`;
          if (/^<[^!/][^>]*[^/]>(?!.*<\/[^>]+>$)/.test(trimmed)) depth += 1;
          return formatted;
        })
        .join('\n');
    }

    function onEditorKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && role.value !== 'read') {
        event.preventDefault();
        void save();
      }
    }

    async function saveAccessSettings() {
      await htmlDocuments.update(id, {
        visibility: visibility.value,
        allowPublicEdit: allowPublicEdit.value,
      });
      await load();
    }

    async function savePasswordAccess() {
      try {
        await htmlDocuments.update(id, {
          passwordAccessEnabled: passwordAccessEnabled.value,
          passwordAccessPassword: passwordAccessPassword.value || undefined,
          passwordAccessRole: passwordAccessRole.value,
        });
        passwordAccessPassword.value = '';
        await load();
        showToast('Password access saved', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to save password access', 'error');
      }
    }

    async function persistChecklistChange(target: HTMLInputElement) {
      if (target?.type !== 'checkbox' || !target.dataset.checkId) return;
      await htmlDocuments.checklist(id, target.dataset.checkId, target.checked);
    }

    async function onPreviewChange(event: Event) {
      await persistChecklistChange(event.target as HTMLInputElement);
    }

    function bindPreviewChecklist(event: Event) {
      const iframe = event.target as HTMLIFrameElement;
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.addEventListener('change', (changeEvent) => {
        void persistChecklistChange(changeEvent.target as HTMLInputElement);
      });
    }

    function onPreviewLoad(event: Event) {
      bindPreviewChecklist(event);
      const iframe = event.target as HTMLIFrameElement;
      const scroll = pendingPreviewScroll;
      if (!scroll) return;
      pendingPreviewScroll = null;
      requestAnimationFrame(() => restoreFrameScroll(iframe, scroll));
    }

    async function loadPermissions() {
      permissions.value = await htmlDocuments.permissions(id);
    }

    async function doShare() {
      if (!shareEmail.value) return;
      try {
        await htmlDocuments.share(id, shareEmail.value, shareRole.value);
        shareEmail.value = '';
        await loadPermissions();
        showToast('HTML document shared', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to share document', 'error');
      }
    }

    async function doRevoke(userId: string) {
      await htmlDocuments.revoke(id, userId);
      await loadPermissions();
    }

    async function requestHtmlAccess() {
      if (!isAuthenticated()) {
        await router.push(`/login?redirect=/html/${id}`);
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({
          resourceType: 'html-document',
          resourceId: id,
          requestedRole: requestedRole.value,
        });
        accessRequestSent.value = true;
        showToast('Access request sent', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to request access', 'error');
      } finally {
        requestingAccess.value = false;
      }
    }

    async function loginWithHtmlPassword() {
      checkingResourcePassword.value = true;
      try {
        const res = await auth.resourcePasswordLogin({
          resourceType: 'html-document',
          resourceId: id,
          password: resourcePassword.value,
        });
        setToken(res.token, res.user?.role, res.user?.accessMode || 'resource-password');
        accessDenied.value = false;
        await load();
      } catch (e: any) {
        showToast(e.message || 'Invalid password', 'error');
      } finally {
        checkingResourcePassword.value = false;
      }
    }

    onMounted(() => {
      void load();
      window.addEventListener('keydown', onEditorKeydown);
    });
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onEditorKeydown);
    });
    return {
      title, html, role, viewMode, visibility, allowPublicEdit, loading, accessDenied, isDirty,
      requestedRole, requestingAccess, accessRequestSent, showShare, shareEmail,
      shareRole, permissions, resourcePassword, checkingResourcePassword,
      passwordAccessEnabled, passwordAccessPassword, passwordAccessRole, saving, previewFrame, sourceEditor,
      showHistory, historyLoading, historyItems, selectedHistory, restoringHistory,
      save, saveAccessSettings, savePasswordAccess, onPreviewChange, bindPreviewChecklist, onPreviewLoad, doShare,
      doRevoke, requestHtmlAccess, loginWithHtmlPassword, formatHtml, wrapSelection, insertSnippet,
      downloadDocument, loadHistory, toggleHistory, openHistoryEntry, restoreSelectedHistory,
    };
  },
});
</script>
