<template>
  <div class="html-editor-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <AccessGate
      v-else-if="accessDenied"
      resource-type="html-document"
      :password-access-enabled="gatePasswordAccessEnabled"
      :checking-password="checkingResourcePassword"
      :requesting-access="requestingAccess"
      :access-request-sent="accessRequestSent"
      @submit-password="loginWithHtmlPassword"
      @request-access="requestHtmlAccess"
    />
    <template v-else>
    <header class="html-editor-bar">
      <BackButton :to="backTarget.to" :label="backTarget.label" />
      <input v-if="canEditContent" v-model="title" class="html-title-input" />
      <span v-else class="html-title-readonly">{{ title || 'Untitled HTML' }}</span>
      <button v-if="role === 'owner'" class="btn-ghost html-desktop-action" @click="showShare = !showShare">{{ t('access') }}</button>
      <div class="html-mode-tabs">
        <button class="btn-ghost btn-sm" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">{{ t('previewTab') }}</button>
        <button v-if="canEditContent" class="btn-ghost btn-sm" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'">{{ t('sourceTab') }}</button>
      </div>
      <div class="html-export-wrap html-desktop-action">
        <button class="btn-ghost" @click.stop="showExportMenu = !showExportMenu">{{ t('downloadBtn') }}</button>
        <div v-if="showExportMenu" class="mobile-action-popover html-export-menu" @click.stop>
          <button class="card-menu-item" @click="downloadDocument(); showExportMenu = false">{{ t('exportHtml') }}</button>
          <button class="card-menu-item" @click="exportPdfDocument(); showExportMenu = false">{{ t('exportPdf') }}</button>
        </div>
      </div>
      <button class="btn-ghost html-desktop-action" @click="toggleHistory">{{ t('history') }}</button>
      <div v-if="canEditContent" class="html-sync-wrap html-desktop-action">
        <button class="html-save-state" :class="'html-save-state-' + htmlSyncStatus.kind" @click="showSyncEvents = !showSyncEvents">
          {{ htmlSyncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
        </button>
        <div v-if="showSyncEvents" class="html-sync-popover">
          <div class="html-sync-head">
            <strong>{{ t('syncPopoverTitle') }}</strong>
            <span>r{{ revision }}</span>
          </div>
          <div v-if="syncEvents.length === 0" class="html-sync-empty">{{ t('noLocalSyncEventsYet') }}</div>
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
        <button class="btn-ghost html-actions-trigger" :aria-label="t('documentActionsAria')" @click.stop="showHtmlActions = !showHtmlActions">⋯</button>
        <div v-if="showHtmlActions" class="mobile-action-popover html-actions-popover" @click.stop>
          <button class="card-menu-item" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'; showHtmlActions = false">{{ t('previewTab') }}</button>
          <button v-if="canEditContent" class="card-menu-item" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'; showHtmlActions = false">{{ t('sourceTab') }}</button>
          <button v-if="role === 'owner'" class="card-menu-item" @click="showShare = !showShare; showHtmlActions = false">{{ t('access') }}</button>
          <button class="card-menu-item" @click="downloadDocument(); showHtmlActions = false">{{ t('exportHtml') }}</button>
          <button class="card-menu-item" @click="exportPdfDocument(); showHtmlActions = false">{{ t('exportPdf') }}</button>
          <button class="card-menu-item" @click="toggleHistory(); showHtmlActions = false">{{ t('history') }}</button>
          <button v-if="canEditContent" class="card-menu-item" @click="showSyncEvents = !showSyncEvents; showHtmlActions = false">
            {{ htmlSyncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
          </button>
        </div>
      </div>
      <button v-if="canEditContent" class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? t('savingEllipsis') : t('save') }}
      </button>
      <AccountMenu v-if="currentUser" />
      <router-link v-else :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn-ghost btn-sm html-desktop-action">{{ t('login') }}</router-link>
    </header>
    <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>
    <section v-if="showShare && role === 'owner'" class="share-panel html-share-panel">
      <div class="share-panel-header">
        <h3>{{ t('access') }}</h3>
        <button class="btn-ghost btn-sm" @click="showShare = false">×</button>
      </div>

      <div class="share-section">
        <div class="share-section-title">{{ t('shareLinkSection') }}</div>
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
          <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">{{ t('save') }}</button>
        </div>
        <div class="slug-hint">{{ t('slugHint') }}</div>
        <template v-if="visibility === 'public'">
          <div class="share-section-title">{{ t('publicDocumentLink') }}</div>
          <div class="slug-row">
            <input :value="publicUrl" class="slug-input" readonly :aria-label="t('publicDocumentLink')" />
            <button class="btn-ghost btn-sm" @click="copyPublicLink">{{ t('copyBtn') }}</button>
          </div>
          <div class="slug-hint">{{ t('publicLinkHint') }}</div>
        </template>
      </div>

      <div class="share-section">
        <div class="share-section-title">{{ t('whoCanView') }}</div>
        <select class="share-visibility-select" v-model="visibility" @change="saveAccessSettings">
          <option value="private">{{ t('visibilityPrivate') }}</option>
          <option value="authenticated">{{ t('visibilityAuthOnly') }}</option>
          <option value="public">{{ t('visibilityPublic') }}</option>
        </select>
        <label class="share-checkbox">
          <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
          <span>{{ t('allowPublicEditing') }}</span>
        </label>
        <label class="share-checkbox">
          <input
            type="checkbox"
            v-model="listedInPublic"
            :disabled="visibility !== 'public'"
            @change="saveAccessSettings"
          />
          <span>{{ t('showInPublic') }}</span>
        </label>
      </div>

      <div class="share-section">
        <div class="share-section-title">{{ t('invitePeople') }}</div>
        <div class="share-form">
          <input v-model.trim="shareEmail" :placeholder="t('email')" type="email" />
          <select v-model="shareRole">
            <option value="read">{{ t('canView') }}</option>
            <option value="edit">{{ t('canEdit') }}</option>
          </select>
          <button @click="doShare">{{ t('inviteBtn') }}</button>
        </div>
        <div v-if="permissions.length" class="share-list">
          <div v-for="p in permissions" :key="p.id" class="share-item">
            <span>{{ p.user?.email || p.userId }}</span>
            <span class="share-item-role">{{ p.role === 'edit' ? t('canEdit') : t('canView') }}</span>
            <button @click="doRevoke(p.userId)">×</button>
          </div>
        </div>
      </div>

      <div class="share-section">
        <div class="share-section-title">{{ t('passwordAccessSection') }}</div>
        <label class="share-checkbox">
          <input type="checkbox" v-model="passwordAccessEnabled" />
          <span>{{ t('enablePasswordAccess') }}</span>
        </label>
        <div v-if="passwordAccessEnabled" class="share-form">
          <input v-model="passwordAccessPassword" type="password" :placeholder="t('newPasswordPlaceholder')" />
          <select v-model="passwordAccessRole">
            <option value="read">{{ t('canView') }}</option>
            <option value="edit">{{ t('canEdit') }}</option>
          </select>
          <button @click="savePasswordAccess">{{ t('save') }}</button>
        </div>
      </div>
    </section>
    <section v-if="showHistory" class="html-history-panel">
      <div class="html-history-list">
        <div class="html-history-head">
          <strong>{{ t('history') }}</strong>
          <button class="btn-ghost btn-sm" @click="showHistory = false">×</button>
        </div>
        <div v-if="historyLoading" class="html-history-empty">{{ t('loadingDots') }}</div>
        <button
          v-for="entry in historyItems"
          :key="entry.id"
          class="html-history-item"
          :class="{ active: selectedHistory?.id === entry.id }"
          @click="openHistoryEntry(entry)"
        >
          <span>{{ t('revisionLabel') }} {{ entry.revision }}</span>
          <small>{{ entry.type }} · {{ new Date(entry.createdAt).toLocaleString() }}</small>
        </button>
        <div v-if="!historyLoading && !historyItems.length" class="html-history-empty">{{ t('noHistoryYet') }}</div>
      </div>
      <div class="html-history-preview">
        <div v-if="!selectedHistory" class="html-history-empty">{{ t('selectARevision') }}</div>
        <template v-else>
          <div class="html-history-preview-head">
            <div>
              <strong>{{ t('revisionLabel') }} {{ selectedHistory.revision }}</strong>
              <small>{{ selectedHistory.type }}</small>
            </div>
            <button v-if="canEditContent" class="btn-ghost btn-sm" :disabled="restoringHistory" @click="restoreSelectedHistory">
              {{ restoringHistory ? t('restoringEllipsis') : t('restoreLabel') }}
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
import { getPublicOrigin } from '../api/public-origin';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import HtmlVisualEditor from '../components/html/HtmlVisualEditor.vue';
import AccountMenu from '../components/AccountMenu.vue';
import AccessGate from '../components/AccessGate.vue';
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
import BackButton from '../components/BackButton.vue';

export default defineComponent({
  components: { AccountMenu, BackButton, HtmlVisualEditor, AccessGate },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const folderId = ref<string | null>(null);
    const { backTarget } = useResourceBackTarget();
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
    useDocumentTitle(title);
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
    const gatePasswordAccessEnabled = ref<boolean | undefined>(undefined);
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref<'read' | 'edit'>('read');
    const permissions = ref<any[]>([]);
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
    // getPublicOrigin(), not window.location.origin: see its own comment -
    // inside the packaged Android app that would be Capacitor's internal
    // WebView origin (localhost), not the real public site.
    const publicUrl = computed(() => {
      const publicId = slug.value || resolvedId.value;
      return `${getPublicOrigin()}/html/${encodeURIComponent(publicId)}`;
    });
    const isDirty = computed(() => title.value !== savedSnapshot.value.title || html.value !== savedSnapshot.value.html);
    const htmlSyncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: t('syncConflict') };
      if (saving.value || pendingOpsCount.value > 0) return { kind: 'saving', label: t('syncSaving') };
      if (isDirty.value) return { kind: 'dirty', label: t('syncUnsaved') };
      if (htmlWsConnected.value) return { kind: 'synced', label: t('syncSynced') };
      return { kind: 'offline', label: t('syncOffline') };
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
          gatePasswordAccessEnabled.value = (e as ApiError).body?.passwordAccessEnabled;
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

    async function requestHtmlAccess(requestedRole: 'read' | 'edit') {
      if (!isAuthenticated()) {
        showToast(t('accessGateLoginRequired'), 'error');
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({
          resourceType: 'html-document',
          resourceId: id,
          requestedRole,
        });
        accessRequestSent.value = true;
        showToast(t('accessGateRequestSentToast'), 'success');
      } catch (e: any) {
        showToast(e.message || t('accessGateRequestFailed'), 'error');
      } finally {
        requestingAccess.value = false;
      }
    }

    async function loginWithHtmlPassword(password: string) {
      checkingResourcePassword.value = true;
      try {
        const res = await auth.resourcePasswordLogin({
          resourceType: 'html-document',
          resourceId: id,
          password,
        });
        setToken(res.token, res.user?.role, res.user?.accessMode || 'resource-password');
        accessDenied.value = false;
        await load();
      } catch (e: any) {
        showToast(e.message || t('accessGateInvalidPassword'), 'error');
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
      title, html, role, viewMode, visibility, allowPublicEdit, listedInPublic, canEditContent, currentUser, route, loading, accessDenied, gatePasswordAccessEnabled, cacheStatus, isDirty,
      revision, htmlWsConnected, pendingOpsCount, currentRevision, htmlSyncStatus,
      showSyncEvents, syncEvents, syncReasonLabel, formatSyncEventTime, pendingVisualOp,
      requestingAccess, accessRequestSent, showShare, shareEmail,
      shareRole, permissions, checkingResourcePassword,
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
