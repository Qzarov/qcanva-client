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

        <router-link :to="backTarget.to" class="access-gate-back">{{ backTarget.label }}</router-link>
      </div>
    </div>
    <template v-else>
    <header class="html-editor-bar">
      <router-link :to="backTarget.to" class="btn-ghost">{{ backTarget.label }}</router-link>
      <input v-if="canEditContent" v-model="title" class="html-title-input" />
      <span v-else class="html-title-readonly">{{ title || 'Untitled HTML' }}</span>
      <button v-if="role === 'owner'" class="btn-ghost html-desktop-action" @click="showShare = !showShare">{{ t('access') }}</button>
      <div class="html-mode-tabs">
        <button class="btn-ghost btn-sm" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">Preview</button>
        <button v-if="canEditContent" class="btn-ghost btn-sm" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'">Source</button>
      </div>
      <div class="html-export-wrap html-desktop-action">
        <button class="btn-ghost" @click.stop="showExportMenu = !showExportMenu">Download</button>
        <div v-if="showExportMenu" class="mobile-action-popover html-export-menu" @click.stop>
          <button class="card-menu-item" @click="downloadDocument(); showExportMenu = false">Export HTML</button>
          <button class="card-menu-item" @click="exportPdfDocument(); showExportMenu = false">Export PDF</button>
        </div>
      </div>
      <button class="btn-ghost html-desktop-action" @click="toggleHistory">{{ t('history') }}</button>
      <div v-if="canEditContent" class="html-sync-wrap html-desktop-action">
        <button class="html-save-state" :class="'html-save-state-' + htmlSyncStatus.kind" @click="showSyncEvents = !showSyncEvents">
          {{ htmlSyncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
        </button>
        <div v-if="showSyncEvents" class="html-sync-popover">
          <div class="html-sync-head">
            <strong>Sync</strong>
            <span>r{{ revision }}</span>
          </div>
          <div v-if="syncEvents.length === 0" class="html-sync-empty">No local sync events yet</div>
          <div v-for="event in syncEvents" :key="event.id" class="html-sync-event" :class="'html-sync-event-' + event.status">
            <div>
              <strong>{{ event.label }}</strong>
              <span v-if="event.reason">{{ syncReasonLabel(event.reason) }}</span>
            </div>
            <time>{{ formatSyncEventTime(event.timestamp) }}</time>
          </div>
        </div>
      </div>
      <div class="html-mobile-actions">
        <button class="btn-ghost html-actions-trigger" aria-label="Document actions" @click.stop="showHtmlActions = !showHtmlActions">⋯</button>
        <div v-if="showHtmlActions" class="mobile-action-popover html-actions-popover" @click.stop>
          <button class="card-menu-item" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'; showHtmlActions = false">Preview</button>
          <button v-if="canEditContent" class="card-menu-item" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'; showHtmlActions = false">Source</button>
          <button v-if="role === 'owner'" class="card-menu-item" @click="showShare = !showShare; showHtmlActions = false">{{ t('access') }}</button>
          <button class="card-menu-item" @click="downloadDocument(); showHtmlActions = false">Export HTML</button>
          <button class="card-menu-item" @click="exportPdfDocument(); showHtmlActions = false">Export PDF</button>
          <button class="card-menu-item" @click="toggleHistory(); showHtmlActions = false">{{ t('history') }}</button>
          <button v-if="canEditContent" class="card-menu-item" @click="showSyncEvents = !showSyncEvents; showHtmlActions = false">
            {{ htmlSyncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
          </button>
        </div>
      </div>
      <button v-if="canEditContent" class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
      <AccountMenu v-if="currentUser" />
      <router-link v-else :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn-ghost btn-sm html-desktop-action">{{ t('login') }}</router-link>
    </header>
    <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>
    <section v-if="showShare && role === 'owner'" class="share-panel html-share-panel">
      <div class="share-panel-header">
        <h3>Access</h3>
        <button class="btn-ghost btn-sm" @click="showShare = false">×</button>
      </div>

      <div class="share-section">
        <div class="share-section-title">Link</div>
        <div class="slug-row">
          <span class="slug-prefix">/html/</span>
          <input
            v-model="slugInput"
            class="slug-input"
            placeholder="my-page"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            @keydown.enter="saveSlug"
          />
          <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">Save</button>
        </div>
        <div class="slug-hint">Lowercase letters, digits and hyphens. Leave empty to use the id.</div>
        <template v-if="visibility === 'public'">
          <div class="share-section-title">Public document link</div>
          <div class="slug-row">
            <input :value="publicUrl" class="slug-input" readonly aria-label="Public document link" />
            <button class="btn-ghost btn-sm" @click="copyPublicLink">Copy</button>
          </div>
          <div class="slug-hint">Use this link for people, search engines, and AI assistants. It returns the document HTML directly.</div>
        </template>
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
        <label class="share-checkbox">
          <input
            type="checkbox"
            v-model="listedInPublic"
            :disabled="visibility !== 'public'"
            @change="saveAccessSettings"
          />
          <span>Show in Public</span>
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
            <button v-if="canEditContent" class="btn-ghost btn-sm" :disabled="restoringHistory" @click="restoreSelectedHistory">
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
      <HtmlVisualEditor v-if="viewMode === 'visual' && canEditContent" v-model="html" @op="pendingVisualOp = $event" />
      <iframe
        v-if="viewMode === 'preview'"
        ref="previewFrame"
        :srcdoc="html"
        class="html-browser-preview"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        @load="onPreviewLoad"
      ></iframe>
      <div v-else-if="viewMode === 'split' && canEditContent" class="html-editor-grid">
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
        v-else-if="canEditContent"
        ref="sourceEditor"
        v-model="html"
        class="html-source html-source-full"
        spellcheck="false"
      ></textarea>
      <pre v-else class="html-source html-source-readonly" @dblclick="notifyReadOnlyEditAttempt"><code>{{ html }}</code></pre>
    </main>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';
import { accessRequests, ApiError, auth, getCurrentUser, htmlDocuments, isAuthenticated, setToken } from '../api/client';
import HtmlVisualEditor from '../components/html/HtmlVisualEditor.vue';
import AccountMenu from '../components/AccountMenu.vue';
import { useHtmlSocket, type HtmlReject } from '../composables/useHtmlSocket';
import { useToast } from '../composables/useToast';
import { useReadOnlyNotice } from '../composables/useReadOnlyNotice';
import { readNativeResourceCache, writeNativeResourceCache } from '../composables/useNativeResourceCache';
import { createSyncEventStore, syncReasonLabel, type SyncRejectReason } from '../canvas/syncEvents';
import { downloadHtmlDocument } from '../html/htmlDocumentExport';
import { serializeDocumentWithFormState } from '../html/formStateSerialization';
import { captureFrameScroll, restoreFrameScroll } from '../html/scrollRestoration';
import type { FrameScrollPosition } from '../html/scrollRestoration';
import type { HtmlVisualOp } from '../html/visualHtmlOps';
import { useI18n } from '../composables/useI18n';

export default defineComponent({
  components: { AccountMenu, HtmlVisualEditor },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const folderId = ref<string | null>(null);
    const { backTarget } = useResourceBackTarget(folderId);
    // The URL param may be a UUID id or a human-readable slug. `resolvedId`
    // holds the real document id after load (used for the WS room + mutations).
    const id = route.params.id as string;
    const resolvedId = ref(id);
    const slug = ref<string | null>(null);
    const slugInput = ref('');
    const savingSlug = ref(false);
    const { show: showToast } = useToast();
    const { notifyReadOnlyEditAttempt } = useReadOnlyNotice();
    const { t } = useI18n();
    const title = ref('');
    const html = ref('');
    const savedSnapshot = ref({ title: '', html: '' });
    const revision = ref(0);
    const role = ref('read');
    const viewMode = ref<'visual' | 'preview' | 'split' | 'source'>('preview');
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const listedInPublic = ref(true);
    const loading = ref(true);
    const cacheStatus = ref<{ kind: 'refreshing' | 'success' | 'error'; text: string } | null>(null);
    const hydratedFromCache = ref(false);
    let cacheStatusTimeout: ReturnType<typeof setTimeout> | null = null;
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
    const showHtmlActions = ref(false);
    const showExportMenu = ref(false);
    const historyLoading = ref(false);
    const historyItems = ref<any[]>([]);
    const selectedHistory = ref<any | null>(null);
    const restoringHistory = ref(false);
    const showSyncEvents = ref(false);
    const syncIssue = ref<'conflict' | ''>('');
    const syncEventStore = createSyncEventStore(5);
    const syncEvents = syncEventStore.events;
    const pendingVisualOp = ref<HtmlVisualOp | null>(null);
    const previewFrame = ref<HTMLIFrameElement | null>(null);
    const sourceEditor = ref<HTMLTextAreaElement | null>(null);
    let pendingPreviewScroll: FrameScrollPosition | null = null;
    let htmlSocketInitialized = false;
    const canEditContent = computed(() => role.value === 'owner' || role.value === 'edit');
    const currentUser = computed(() => getCurrentUser());
    const publicUrl = computed(() => {
      const publicId = slug.value || resolvedId.value;
      return `${window.location.origin}/html/${encodeURIComponent(publicId)}`;
    });
    const isDirty = computed(() => title.value !== savedSnapshot.value.title || html.value !== savedSnapshot.value.html);
    const htmlSyncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: 'Conflict' };
      if (saving.value || pendingOpsCount.value > 0) return { kind: 'saving', label: 'Saving' };
      if (isDirty.value) return { kind: 'dirty', label: 'Unsaved' };
      if (htmlWsConnected.value) return { kind: 'synced', label: 'Synced' };
      return { kind: 'offline', label: 'Offline' };
    });

    const {
      connected: htmlWsConnected,
      currentRevision,
      pendingOpsCount,
      connect: htmlWsConnect,
      sendOp,
      onRemoteOp,
      onReject,
      onAck,
      setRevision,
      clearPendingOps,
    } = useHtmlSocket(resolvedId);

    async function load() {
      try {
        if (!hydratedFromCache.value) loading.value = true;
        accessDenied.value = false;
        const res = await htmlDocuments.get(resolvedId.value);
        writeNativeResourceCache('html', [id, res.document.id, res.document.slug || ''], res);
        // Canonicalize to the real id (URL may have been a slug).
        resolvedId.value = res.document.id;
        slug.value = res.document.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.document.title;
        folderId.value = res.document.folderId || null;
        html.value = res.document.html;
        savedSnapshot.value = { title: title.value, html: html.value };
        revision.value = res.document.revision ?? 0;
        setRevision(revision.value);
        visibility.value = res.document.visibility || (res.document.shared ? 'public' : 'private');
        allowPublicEdit.value = !!res.document.allowPublicEdit;
        listedInPublic.value = res.document.listedInPublic !== false;
        passwordAccessEnabled.value = !!res.document.passwordAccessEnabled;
        passwordAccessRole.value = res.document.passwordAccessRole || 'read';
        role.value = res.role;
        if (res.role === 'read' && res.document.visibility === 'public') {
          window.location.replace(`/api/html-documents/${slug.value || id}/stream`);
          return;
        }
        // Prettify the address bar: prefer the slug when present.
        const preferred = slug.value || res.document.id;
        if (route.params.id !== preferred) {
          router.replace({ path: `/edit/html/${preferred}`, query: route.query }).catch(() => {});
        }
        if (!canEditContent.value) {
          viewMode.value = 'preview';
        }
        if (res.role === 'owner') await loadPermissions();
        if (!htmlSocketInitialized) {
          htmlSocketInitialized = true;
          htmlWsConnect();
          onRemoteOp((op, nextRevision) => {
            if (!('html' in op)) return;
            html.value = op.html;
            savedSnapshot.value = { title: title.value, html: op.html };
            revision.value = nextRevision;
            showToast('HTML document updated remotely', 'info');
          });
          onAck((ack) => {
            revision.value = ack.revision;
            syncIssue.value = '';
            syncEventStore.confirm(ack.clientOpId, ack.revision);
            savedSnapshot.value = { title: title.value, html: html.value };
          });
          onReject((reject) => {
            void handleHtmlReject(reject);
          });
        }
      } catch (e: any) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          accessDenied.value = true;
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          await router.replace({ name: 'dashboard', query: { type: 'html' } });
          return;
        }
        if (hydratedFromCache.value) {
          cacheStatus.value = { kind: 'error', text: t('failedRefreshCached') };
          return;
        }
        throw e;
      } finally {
        loading.value = false;
        if (cacheStatus.value?.kind === 'refreshing') {
          cacheStatus.value = { kind: 'success', text: t('documentUpdated') };
          cacheStatusTimeout = setTimeout(() => { cacheStatus.value = null; }, 3000);
        }
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

    async function exportPdfDocument() {
      try {
        const blob = await htmlDocuments.exportPdf(resolvedId.value);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(title.value || 'qcanva-document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'qcanva-document'}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error: any) {
        showToast(error?.message || 'Failed to export PDF', 'error');
      }
    }

    async function save() {
      if (!canEditContent.value) return;
      saving.value = true;
      const pageScroll = { x: window.scrollX, y: window.scrollY };
      try {
        if (viewMode.value === 'preview') {
          pendingPreviewScroll = captureFrameScroll(previewFrame.value);
        }
        syncHtmlFromPreview();
        if (htmlWsConnected.value && title.value === savedSnapshot.value.title) {
          const op = pendingVisualOp.value?.html === html.value
            ? pendingVisualOp.value
            : { type: 'html-update' as const, html: html.value };
          const clientOpId = sendOp(op);
          syncEventStore.recordPending(clientOpId, op.type, revision.value);
          pendingVisualOp.value = null;
        } else {
          const updated = await htmlDocuments.update(resolvedId.value, { title: title.value, html: html.value });
          revision.value = updated?.revision ?? revision.value;
          setRevision(revision.value);
          syncIssue.value = '';
          syncEventStore.recordInfo('HTML document saved', revision.value);
          savedSnapshot.value = { title: title.value, html: html.value };
        }
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

    async function handleHtmlReject(reject: HtmlReject) {
      const reason = reject.reason as SyncRejectReason;
      if (reject.clientOpId) {
        syncEventStore.reject(reject.clientOpId, reason, reject.serverRevision);
      } else {
        syncEventStore.recordWarning('HTML realtime update rejected', reason, reject.serverRevision);
      }
      if (reject.reason === 'revision_mismatch' || reject.reason === 'target_missing') {
        syncIssue.value = 'conflict';
        clearPendingOps();
        syncEventStore.resyncStarted(reason);
        showToast('HTML document changed elsewhere. Reloading latest version.', 'error');
        await load();
        syncIssue.value = '';
        syncEventStore.resyncCompleted(revision.value);
        return;
      }
      if (reject.reason === 'timeout' && reject.pending?.op && 'html' in reject.pending.op) {
        clearPendingOps();
        try {
          const updated = await htmlDocuments.update(resolvedId.value, { title: title.value, html: reject.pending.op.html });
          revision.value = updated?.revision ?? revision.value;
          setRevision(revision.value);
          savedSnapshot.value = { title: title.value, html: reject.pending.op.html };
          syncIssue.value = '';
          syncEventStore.recordInfo('REST fallback saved HTML document', revision.value);
          showToast('Realtime timed out. Saved through REST fallback.', 'success');
        } catch (e: any) {
          syncIssue.value = 'conflict';
          syncEventStore.resyncFailed(e.message || 'Failed to save HTML document');
          showToast(e.message || 'Failed to save HTML document', 'error');
        }
        return;
      }
      syncIssue.value = 'conflict';
      showToast('HTML realtime update was rejected', 'error');
    }

    function formatSyncEventTime(timestamp: number) {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    async function loadHistory() {
      historyLoading.value = true;
      try {
        const result = await htmlDocuments.history(resolvedId.value, { limit: 50 });
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
        selectedHistory.value = await htmlDocuments.historyEntry(resolvedId.value, entry.id);
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
        await htmlDocuments.restoreHistoryEntry(resolvedId.value, selectedHistory.value.id);
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
      await htmlDocuments.update(resolvedId.value, {
        visibility: visibility.value,
        allowPublicEdit: allowPublicEdit.value,
        listedInPublic: listedInPublic.value,
      });
      await load();
    }

    async function saveSlug() {
      if (role.value !== 'owner') return;
      const next = slugInput.value.trim().toLowerCase();
      if ((next || null) === (slug.value || null)) return;
      savingSlug.value = true;
      try {
        const updated = await htmlDocuments.update(resolvedId.value, { slug: next === '' ? null : next });
        const doc = (updated as any).document || updated;
        slug.value = doc.slug || null;
        slugInput.value = slug.value || '';
        showToast(slug.value ? 'Link updated' : 'Link removed', 'success');
        const preferred = slug.value || resolvedId.value;
        if (route.params.id !== preferred) router.replace({ path: `/edit/html/${preferred}`, query: route.query }).catch(() => {});
      } catch (err: any) {
        showToast(err?.message || 'Failed to update link', 'error');
        slugInput.value = slug.value || '';
      } finally {
        savingSlug.value = false;
      }
    }

    async function copyPublicLink() {
      try {
        await navigator.clipboard.writeText(publicUrl.value);
        showToast('Public link copied', 'success');
      } catch {
        showToast('Could not copy the link. Please copy it from the field.', 'error');
      }
    }

    async function savePasswordAccess() {
      try {
        await htmlDocuments.update(resolvedId.value, {
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
      await htmlDocuments.checklist(resolvedId.value, target.dataset.checkId, target.checked);
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
      permissions.value = await htmlDocuments.permissions(resolvedId.value);
    }

    async function doShare() {
      if (!shareEmail.value) return;
      try {
        await htmlDocuments.share(resolvedId.value, shareEmail.value, shareRole.value);
        shareEmail.value = '';
        await loadPermissions();
        showToast('HTML document shared', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to share document', 'error');
      }
    }

    async function doRevoke(userId: string) {
      await htmlDocuments.revoke(resolvedId.value, userId);
      await loadPermissions();
    }

    async function requestHtmlAccess() {
      if (!isAuthenticated()) {
        await router.push(`/login?redirect=/edit/html/${id}`);
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
      const cached = readNativeResourceCache<any>('html', id);
      if (cached?.value?.document) {
        const res = cached.value;
        resolvedId.value = res.document.id;
        slug.value = res.document.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.document.title;
        folderId.value = res.document.folderId || null;
        html.value = res.document.html;
        savedSnapshot.value = { title: title.value, html: html.value };
        revision.value = res.document.revision ?? 0;
        setRevision(revision.value);
        visibility.value = res.document.visibility || (res.document.shared ? 'public' : 'private');
        allowPublicEdit.value = !!res.document.allowPublicEdit;
        listedInPublic.value = res.document.listedInPublic !== false;
        passwordAccessEnabled.value = !!res.document.passwordAccessEnabled;
        passwordAccessRole.value = res.document.passwordAccessRole || 'read';
        role.value = res.role;
        hydratedFromCache.value = true;
        loading.value = false;
        if (cached.stale) cacheStatus.value = { kind: 'refreshing', text: t('refreshingSaved') };
      }
      void load();
      window.addEventListener('keydown', onEditorKeydown);
    });
    onBeforeUnmount(() => {
      if (cacheStatusTimeout) clearTimeout(cacheStatusTimeout);
      window.removeEventListener('keydown', onEditorKeydown);
    });
    return {
      t,
      backTarget,
      title, html, role, viewMode, visibility, allowPublicEdit, listedInPublic, canEditContent, currentUser, route, loading, accessDenied, cacheStatus, isDirty,
      revision, htmlWsConnected, pendingOpsCount, currentRevision, htmlSyncStatus,
      showSyncEvents, syncEvents, syncReasonLabel, formatSyncEventTime, pendingVisualOp,
      requestedRole, requestingAccess, accessRequestSent, showShare, shareEmail,
      shareRole, permissions, resourcePassword, checkingResourcePassword,
      passwordAccessEnabled, passwordAccessPassword, passwordAccessRole, saving, previewFrame, sourceEditor,
      showHistory, showHtmlActions, showExportMenu, historyLoading, historyItems, selectedHistory, restoringHistory,
      save, saveAccessSettings, savePasswordAccess, onPreviewChange, bindPreviewChecklist, onPreviewLoad, doShare,
      slug, slugInput, savingSlug, saveSlug, publicUrl, copyPublicLink,
      doRevoke, requestHtmlAccess, loginWithHtmlPassword, formatHtml, wrapSelection, insertSnippet, notifyReadOnlyEditAttempt,
      downloadDocument, exportPdfDocument, loadHistory, toggleHistory, openHistoryEntry, restoreSelectedHistory,
    };
  },
});
</script>
