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
      <div v-if="viewMode === 'visual' && role !== 'read'" class="html-visual-grid">
        <aside class="html-block-sidebar">
          <div class="html-panel-title">Templates</div>
          <button v-for="template in templates" :key="template.id" class="html-block-btn" @click="applyTemplate(template.id)">
            {{ template.label }}
          </button>
          <div class="html-panel-title">Blocks</div>
          <button v-for="block in blockTypes" :key="block.type" class="html-block-btn" @click="addBlock(block.type)">
            {{ block.label }}
          </button>
          <div class="html-panel-title">Visual edit</div>
          <button class="html-block-btn" :class="{ active: visualEditorMode === 'blocks' }" @click="visualEditorMode = 'blocks'">Blocks</button>
          <button class="html-block-btn" :class="{ active: visualEditorMode === 'dom' }" @click="openDomVisualEditor">DOM edit</button>
          <button v-if="visualEditorMode === 'dom'" class="html-block-btn" @click="resetDomVisualEditor">Reload from source</button>
        </aside>
        <section v-if="visualEditorMode === 'blocks'" class="html-block-editor">
          <div v-for="(block, index) in visualBlocks" :key="block.id" class="html-block-row">
            <div class="html-block-row-head">
              <span>{{ blockLabel(block.type) }}</span>
              <div>
                <button class="btn-ghost btn-sm" @click="moveBlock(index, -1)" :disabled="index === 0">Up</button>
                <button class="btn-ghost btn-sm" @click="moveBlock(index, 1)" :disabled="index === visualBlocks.length - 1">Down</button>
                <button class="btn-ghost btn-sm danger" @click="removeBlock(index)">Delete</button>
              </div>
            </div>
            <input v-if="block.type !== 'list'" v-model="block.text" class="dashboard-modal-input" :placeholder="blockPlaceholder(block.type)" @input="syncHtmlFromBlocks" />
            <textarea v-else v-model="block.text" class="dashboard-modal-input html-block-textarea" placeholder="One list item per line" @input="syncHtmlFromBlocks"></textarea>
            <input v-if="block.type === 'link' || block.type === 'button' || block.type === 'image'" v-model="block.href" class="dashboard-modal-input" :placeholder="block.type === 'image' ? 'Image URL' : 'URL'" @input="syncHtmlFromBlocks" />
            <input v-if="block.type === 'image'" v-model="block.alt" class="dashboard-modal-input" placeholder="Alt text" @input="syncHtmlFromBlocks" />
          </div>
        </section>
        <section v-else class="html-block-editor html-dom-editor-note">
          <h3>DOM edit</h3>
          <p>Edit the page directly in the preview pane. Changes sync into the HTML source and save through the normal Save button.</p>
        </section>
        <iframe
          ref="visualFrame"
          :srcdoc="visualEditorMode === 'dom' ? visualDomSrcdoc : html"
          class="html-browser-preview"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          @load="visualEditorMode === 'dom' ? bindVisualDomEditor($event) : bindPreviewChecklist($event)"
        ></iframe>
      </div>
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
import { useToast } from '../composables/useToast';

export default defineComponent({
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
    const visualFrame = ref<HTMLIFrameElement | null>(null);
    const sourceEditor = ref<HTMLTextAreaElement | null>(null);
    const isDirty = computed(() => title.value !== savedSnapshot.value.title || html.value !== savedSnapshot.value.html);
    type VisualBlock = { id: string; type: string; text: string; href?: string; alt?: string };
    const genBlockId = () => Math.random().toString(36).slice(2, 10);
    const blockTypes = [
      { type: 'heading', label: 'Heading' },
      { type: 'paragraph', label: 'Paragraph' },
      { type: 'button', label: 'Button' },
      { type: 'link', label: 'Link' },
      { type: 'card', label: 'Card' },
      { type: 'list', label: 'List' },
      { type: 'image', label: 'Image' },
    ];
    const templates = [
      { id: 'landing', label: 'Landing page' },
      { id: 'brief', label: 'Brief' },
      { id: 'checklist', label: 'Checklist' },
    ];
    const visualBlocks = ref<VisualBlock[]>([]);
    const visualEditorMode = ref<'blocks' | 'dom'>('blocks');
    const visualDomSrcdoc = ref('');

    async function load() {
      try {
        loading.value = true;
        accessDenied.value = false;
        const res = await htmlDocuments.get(id);
        title.value = res.document.title;
        html.value = res.document.html;
        visualDomSrcdoc.value = html.value;
        visualBlocks.value = inferBlocksFromHtml(html.value);
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

    function syncHtmlFromVisualDom() {
      if (viewMode.value !== 'visual' || visualEditorMode.value !== 'dom') return;
      const doc = visualFrame.value?.contentDocument;
      if (!doc?.documentElement) return;
      html.value = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    }

    function openDomVisualEditor() {
      visualEditorMode.value = 'dom';
      visualDomSrcdoc.value = html.value;
    }

    function resetDomVisualEditor() {
      visualDomSrcdoc.value = html.value;
    }

    function bindVisualDomEditor(event: Event) {
      const iframe = event.target as HTMLIFrameElement;
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      doc.designMode = 'on';
      doc.body.contentEditable = 'true';
      doc.body.classList.add('qcanva-dom-editing');
      const sync = () => syncHtmlFromVisualDom();
      doc.body.addEventListener('input', sync);
      doc.body.addEventListener('keyup', sync);
      doc.body.addEventListener('mouseup', sync);
      bindPreviewChecklist(event);
    }

    function escapeHtml(value: string) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function blockToHtml(block: VisualBlock) {
      const text = escapeHtml(block.text || '');
      if (block.type === 'heading') return `<h1>${text || 'Heading'}</h1>`;
      if (block.type === 'paragraph') return `<p>${text || 'Paragraph text'}</p>`;
      if (block.type === 'button') return `<a class="button" href="${escapeHtml(block.href || '#')}">${text || 'Button'}</a>`;
      if (block.type === 'link') return `<a href="${escapeHtml(block.href || '#')}">${text || 'Link text'}</a>`;
      if (block.type === 'card') return `<section class="card"><h2>${text || 'Card title'}</h2><p>Card body text</p></section>`;
      if (block.type === 'list') {
        const items = (block.text || 'First item\nSecond item').split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (block.type === 'image') return `<img src="${escapeHtml(block.href || '')}" alt="${escapeHtml(block.alt || block.text || '')}">`;
      return `<p>${text}</p>`;
    }

    function syncHtmlFromBlocks() {
      const body = visualBlocks.value.map(blockToHtml).join('\n');
      html.value = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: #1f2937; }
    .button { display: inline-block; padding: 10px 16px; border-radius: 6px; background: #2563eb; color: white; text-decoration: none; }
    .card { padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; }
    img { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
    }

    function inferBlocksFromHtml(source: string): VisualBlock[] {
      const parser = new DOMParser();
      const doc = parser.parseFromString(source || '<main></main>', 'text/html');
      const bodyChildren = Array.from(doc.body.children);
      const blocks = bodyChildren.map((element): VisualBlock | null => {
        const tag = element.tagName.toLowerCase();
        if (/h[1-6]/.test(tag)) return { id: genBlockId(), type: 'heading', text: element.textContent || '' };
        if (tag === 'p') return { id: genBlockId(), type: 'paragraph', text: element.textContent || '' };
        if (tag === 'a' && element.classList.contains('button')) return { id: genBlockId(), type: 'button', text: element.textContent || '', href: element.getAttribute('href') || '' };
        if (tag === 'a') return { id: genBlockId(), type: 'link', text: element.textContent || '', href: element.getAttribute('href') || '' };
        if (tag === 'ul' || tag === 'ol') return { id: genBlockId(), type: 'list', text: Array.from(element.children).map((item) => item.textContent || '').join('\n') };
        if (tag === 'img') return { id: genBlockId(), type: 'image', text: element.getAttribute('alt') || '', href: element.getAttribute('src') || '', alt: element.getAttribute('alt') || '' };
        if (tag === 'section' || tag === 'div') return { id: genBlockId(), type: 'card', text: element.querySelector('h1,h2,h3')?.textContent || element.textContent || '' };
        return null;
      }).filter((block): block is VisualBlock => Boolean(block));
      return blocks.length ? blocks : [{ id: genBlockId(), type: 'heading', text: title.value || 'Untitled HTML' }];
    }

    function addBlock(type: string) {
      visualBlocks.value.push({ id: genBlockId(), type, text: '', href: '', alt: '' });
      syncHtmlFromBlocks();
    }

    function removeBlock(index: number) {
      visualBlocks.value.splice(index, 1);
      syncHtmlFromBlocks();
    }

    function moveBlock(index: number, direction: number) {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= visualBlocks.value.length) return;
      const [block] = visualBlocks.value.splice(index, 1);
      if (!block) return;
      visualBlocks.value.splice(nextIndex, 0, block);
      syncHtmlFromBlocks();
    }

    function applyTemplate(templateId: string) {
      const map: Record<string, VisualBlock[]> = {
        landing: [
          { id: genBlockId(), type: 'heading', text: title.value || 'Landing page' },
          { id: genBlockId(), type: 'paragraph', text: 'A concise value proposition for this page.' },
          { id: genBlockId(), type: 'button', text: 'Get started', href: '#' },
          { id: genBlockId(), type: 'card', text: 'Feature highlight' },
        ],
        brief: [
          { id: genBlockId(), type: 'heading', text: title.value || 'Brief' },
          { id: genBlockId(), type: 'paragraph', text: 'Context, goals, and constraints.' },
          { id: genBlockId(), type: 'list', text: 'Goal\nAudience\nNext step' },
        ],
        checklist: [
          { id: genBlockId(), type: 'heading', text: title.value || 'Checklist' },
          { id: genBlockId(), type: 'list', text: 'First task\nSecond task\nFinal review' },
        ],
      };
      const selectedTemplate = map[templateId] || map.landing || [];
      visualBlocks.value = selectedTemplate.map((block) => ({ ...block, id: genBlockId() }));
      syncHtmlFromBlocks();
    }

    function blockLabel(type: string) {
      return blockTypes.find((block) => block.type === type)?.label || type;
    }

    function blockPlaceholder(type: string) {
      if (type === 'heading') return 'Heading text';
      if (type === 'button') return 'Button label';
      if (type === 'link') return 'Link text';
      if (type === 'image') return 'Caption';
      if (type === 'card') return 'Card title';
      return 'Text';
    }

    async function save() {
      saving.value = true;
      try {
        syncHtmlFromPreview();
        syncHtmlFromVisualDom();
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
      passwordAccessEnabled, passwordAccessPassword, passwordAccessRole, saving, previewFrame, visualFrame, sourceEditor,
      visualBlocks, blockTypes, templates, visualEditorMode, visualDomSrcdoc,
      save, saveAccessSettings, savePasswordAccess, onPreviewChange, bindPreviewChecklist, doShare,
      doRevoke, requestHtmlAccess, loginWithHtmlPassword, formatHtml, wrapSelection, insertSnippet,
      addBlock, removeBlock, moveBlock, applyTemplate, syncHtmlFromBlocks, blockLabel, blockPlaceholder,
      openDomVisualEditor, resetDomVisualEditor, bindVisualDomEditor,
    };
  },
});
</script>
