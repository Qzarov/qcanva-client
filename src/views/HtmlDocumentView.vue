<template>
  <div class="html-editor-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <div v-else-if="accessDenied" class="canvas-error">
      <div class="error-modal access-request-modal">
        <h2>No access to this HTML document</h2>
        <p>Enter the document password or request access from the owner.</p>
        <form class="resource-password-form" @submit.prevent="loginWithHtmlPassword">
          <input v-model="resourcePassword" type="password" placeholder="Document password" />
          <button class="error-home-btn" :disabled="checkingResourcePassword || !resourcePassword">
            {{ checkingResourcePassword ? 'Checking...' : 'Open with password' }}
          </button>
        </form>
        <div class="access-request-controls">
          <select v-model="requestedRole">
            <option value="read">Read</option>
            <option value="edit">Edit</option>
          </select>
          <button class="error-home-btn" :disabled="requestingAccess || accessRequestSent" @click="requestHtmlAccess">
            {{ accessRequestSent ? 'Request sent' : 'Request access' }}
          </button>
        </div>
        <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      </div>
    </div>
    <template v-else>
    <header class="html-editor-bar">
      <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      <input v-model="title" class="html-title-input" :readonly="role === 'read'" />
      <select v-if="role === 'owner'" v-model="visibility" class="html-access-select" @change="saveAccessSettings">
        <option value="private">Private</option>
        <option value="authenticated">Auth only</option>
        <option value="public">Public</option>
      </select>
      <label v-if="role === 'owner'" class="share-checkbox">
        <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
        <span>Public edit</span>
      </label>
      <button v-if="role === 'owner'" class="btn-ghost" @click="showShare = !showShare">Share</button>
      <div class="html-mode-tabs">
        <button v-if="role !== 'read'" class="btn-ghost btn-sm" :class="{ active: viewMode === 'visual' }" @click="viewMode = 'visual'">Visual</button>
        <button class="btn-ghost btn-sm" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">Preview</button>
        <button v-if="role !== 'read'" class="btn-ghost btn-sm" :class="{ active: viewMode === 'split' }" @click="viewMode = 'split'">Split</button>
        <button class="btn-ghost btn-sm" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'">Source</button>
      </div>
      <span v-if="role !== 'read'" class="html-save-state" :class="{ dirty: isDirty }">{{ isDirty ? 'Unsaved' : 'Saved' }}</span>
      <button v-if="role !== 'read'" class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </header>
    <section v-if="role !== 'read'" class="html-editor-tools">
      <button class="btn-ghost btn-sm" @click="formatHtml">Format</button>
      <button class="btn-ghost btn-sm" @click="wrapSelection('section')">Section</button>
      <button class="btn-ghost btn-sm" @click="wrapSelection('h2')">H2</button>
      <button class="btn-ghost btn-sm" @click="wrapSelection('p')">P</button>
      <button class="btn-ghost btn-sm" @click="wrapSelection('button')">Button</button>
      <button class="btn-ghost btn-sm" @click="insertSnippet('link')">Link</button>
      <button class="btn-ghost btn-sm" @click="insertSnippet('card')">Card</button>
      <button class="btn-ghost btn-sm" @click="insertSnippet('list')">List</button>
      <button class="btn-ghost btn-sm" @click="insertSnippet('style')">Style</button>
    </section>
    <section v-if="showShare && role === 'owner'" class="share-panel html-share-panel">
      <h3>Share HTML</h3>
      <div class="share-form">
        <input v-model.trim="shareEmail" placeholder="Email" type="email" />
        <select v-model="shareRole">
          <option value="read">Read</option>
          <option value="edit">Edit</option>
        </select>
        <button @click="doShare">Share</button>
      </div>
      <div v-if="permissions.length" class="share-list">
        <div v-for="p in permissions" :key="p.id" class="share-item">
          <span>{{ p.user?.email || p.userId }} - {{ p.role }}</span>
          <button @click="doRevoke(p.userId)">x</button>
        </div>
      </div>
      <div class="password-access-panel">
        <label class="share-checkbox">
          <input type="checkbox" v-model="passwordAccessEnabled" />
          <span>Password access</span>
        </label>
        <div class="share-form">
          <input v-model="passwordAccessPassword" type="password" placeholder="New password" />
          <select v-model="passwordAccessRole">
            <option value="read">Read</option>
            <option value="edit">Edit</option>
          </select>
          <button @click="savePasswordAccess">Save</button>
        </div>
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
        @load="bindPreviewChecklist"
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
          @load="bindPreviewChecklist"
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
    const previewFrame = ref<HTMLIFrameElement | null>(null);
    const sourceEditor = ref<HTMLTextAreaElement | null>(null);
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
      html.value = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    }

    async function save() {
      saving.value = true;
      try {
        syncHtmlFromPreview();
        await htmlDocuments.update(id, { title: title.value, html: html.value });
        savedSnapshot.value = { title: title.value, html: html.value };
        await load();
        showToast('HTML document saved', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to save HTML document', 'error');
      } finally {
        saving.value = false;
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
      save, saveAccessSettings, savePasswordAccess, onPreviewChange, bindPreviewChecklist, doShare,
      doRevoke, requestHtmlAccess, loginWithHtmlPassword, formatHtml, wrapSelection, insertSnippet,
    };
  },
});
</script>
