<template>
  <div class="text-doc-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <div v-else-if="accessDenied" class="access-gate">
      <div class="access-gate-card">
        <div class="access-gate-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 class="access-gate-title">Private document</h2>
        <p class="access-gate-sub">You need permission to view this document.</p>

        <div class="access-gate-section">
          <div class="access-gate-label">Have a password?</div>
          <form class="access-gate-form" @submit.prevent="loginWithDocumentPassword">
            <input v-model="resourcePassword" type="password" placeholder="Enter password" class="access-gate-input" />
            <button class="access-gate-btn access-gate-btn-primary" :disabled="checkingResourcePassword || !resourcePassword">
              {{ checkingResourcePassword ? 'Checking...' : 'Open' }}
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
            <button class="access-gate-btn access-gate-btn-secondary" :disabled="requestingAccess || accessRequestSent" @click="requestDocumentAccess">
              {{ accessRequestSent ? 'Request sent' : 'Send request' }}
            </button>
          </div>
        </div>

        <router-link :to="{ name: 'dashboard', query: { type: 'text-document' } }" class="access-gate-back">Back to documents</router-link>
      </div>
    </div>

    <template v-else>
      <header class="text-doc-topbar">
        <router-link :to="{ name: 'dashboard', query: { type: 'text-document' } }" class="btn-ghost">Back</router-link>
        <input v-if="canEditContent" v-model="title" class="text-doc-title-input" @blur="saveTitle" @keydown.enter.prevent="saveTitle" />
        <span v-else class="text-doc-title-readonly">{{ title || 'Untitled document' }}</span>
        <div class="text-doc-topbar-actions">
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showShare = !showShare">Access</button>
          <button class="btn-ghost btn-sm" @click="toggleHistory">History</button>
          <button v-if="canEditContent" class="text-doc-sync" :class="`text-doc-sync-${syncStatus.kind}`">
            {{ syncStatus.label }}<template v-if="pendingUpdatesCount"> · {{ pendingUpdatesCount }}</template>
          </button>
        </div>
      </header>

      <section v-if="showShare && role === 'owner'" class="share-panel text-doc-share-panel">
        <div class="share-panel-header">
          <h3>Access</h3>
          <button class="btn-ghost btn-sm" @click="showShare = false">x</button>
        </div>

        <div class="share-section">
          <div class="share-section-title">Link</div>
          <div class="slug-row">
            <span class="slug-prefix">/docs/</span>
            <input v-model="slugInput" class="slug-input" placeholder="my-document" spellcheck="false" autocapitalize="off" autocomplete="off" @keydown.enter="saveSlug" />
            <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">Save</button>
          </div>
          <div class="slug-hint">Lowercase letters, digits and hyphens. Leave empty to use the id.</div>
        </div>

        <div class="share-section">
          <div class="share-section-title">Who can view</div>
          <select class="share-visibility-select" v-model="visibility" @change="saveAccessSettings">
            <option value="private">Private - only invited people</option>
            <option value="authenticated">Auth only - any logged-in user</option>
            <option value="public">Public - anyone with the link</option>
          </select>
          <label class="share-checkbox">
            <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
            <span>Allow public editing</span>
          </label>
          <label class="share-checkbox">
            <input type="checkbox" v-model="listedInPublic" :disabled="visibility !== 'public'" @change="saveAccessSettings" />
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
              <button @click="doRevoke(p.userId)">x</button>
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

      <section v-if="showHistory" class="html-history-panel text-doc-history-panel">
        <div class="html-history-list">
          <div class="html-history-head">
            <strong>History</strong>
            <button class="btn-ghost btn-sm" @click="showHistory = false">x</button>
          </div>
          <div v-if="historyLoading" class="html-history-empty">Loading...</div>
          <button v-for="entry in historyItems" :key="entry.id" class="html-history-item" :class="{ active: selectedHistory?.id === entry.id }" @click="openHistoryEntry(entry)">
            <span>Revision {{ entry.revision }}</span>
            <small>{{ new Date(entry.createdAt).toLocaleString() }}</small>
          </button>
          <div v-if="!historyLoading && !historyItems.length" class="html-history-empty">No history yet</div>
        </div>
        <div class="html-history-preview">
          <div v-if="!selectedHistory" class="html-history-empty">Select a revision</div>
          <template v-else>
            <div class="html-history-preview-head">
              <div>
                <strong>Revision {{ selectedHistory.revision }}</strong>
                <small>{{ selectedHistory.plainText || 'Snapshot' }}</small>
              </div>
              <button v-if="canEditContent" class="btn-ghost btn-sm" :disabled="restoringHistory" @click="restoreSelectedHistory">
                {{ restoringHistory ? 'Restoring...' : 'Restore' }}
              </button>
            </div>
            <div class="text-doc-history-preview" v-html="selectedHistory.html"></div>
          </template>
        </div>
      </section>

      <div v-if="canEditContent" class="text-doc-toolbar">
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()"><strong>B</strong></button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()"><em>I</em></button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('underline') }" @click="editor?.chain().focus().toggleUnderline().run()"><u>U</u></button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('heading', { level: 2 }) }" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()">List</button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('taskList') }" @click="editor?.chain().focus().toggleTaskList().run()">Tasks</button>
      </div>

      <main class="text-doc-editor-shell">
        <article class="text-doc-paper" :class="{ readonly: !canEditContent }" @click="focusEditor($event)">
          <EditorContent v-if="editor" :editor="editor" />
        </article>
      </main>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { accessRequests, ApiError, auth, getCurrentUser, isAuthenticated, setToken, textDocuments } from '../api/client';
import { useTextDocumentSocket, type TextDocumentReject } from '../composables/useTextDocumentSocket';
import { useToast } from '../composables/useToast';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../text-documents/projection';

export default defineComponent({
  components: { EditorContent },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const id = route.params.id as string;
    const resolvedId = ref(id);
    const { show: showToast } = useToast();

    const ydoc = new Y.Doc();
    const awarenessStates = new Map<number, Record<string, unknown>>();
    let localAwarenessState: Record<string, unknown> = {};
    const awarenessProvider = {
      awareness: {
        clientID: ydoc.clientID,
        states: awarenessStates,
        getStates: () => awarenessStates,
        getLocalState: () => localAwarenessState,
        setLocalState: (state: Record<string, unknown>) => {
          localAwarenessState = state || {};
          awarenessStates.set(ydoc.clientID, localAwarenessState);
        },
        setLocalStateField: (field: string, value: unknown) => {
          localAwarenessState = { ...localAwarenessState, [field]: value };
          awarenessStates.set(ydoc.clientID, localAwarenessState);
        },
        on: () => undefined,
        off: () => undefined,
      },
    } as any;

    const title = ref('');
    const savedTitle = ref('');
    const role = ref('read');
    const revision = ref(0);
    const loading = ref(true);
    const accessDenied = ref(false);
    const requestedRole = ref<'read' | 'edit'>('read');
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const resourcePassword = ref('');
    const checkingResourcePassword = ref(false);
    const showShare = ref(false);
    const slug = ref<string | null>(null);
    const slugInput = ref('');
    const savingSlug = ref(false);
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const listedInPublic = ref(true);
    const shareEmail = ref('');
    const shareRole = ref<'read' | 'edit'>('read');
    const permissions = ref<any[]>([]);
    const passwordAccessEnabled = ref(false);
    const passwordAccessPassword = ref('');
    const passwordAccessRole = ref<'read' | 'edit'>('read');
    const showHistory = ref(false);
    const historyLoading = ref(false);
    const historyItems = ref<any[]>([]);
    const selectedHistory = ref<any | null>(null);
    const restoringHistory = ref(false);
    const syncIssue = ref<'conflict' | ''>('');
    let socketInitialized = false;
    let applyingInitialState = false;

    const canEditContent = computed(() => role.value === 'owner' || role.value === 'edit');
    const currentUser = computed(() => getCurrentUser());
    const syncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: 'Conflict' };
      if (pendingUpdatesCount.value > 0) return { kind: 'saving', label: 'Saving' };
      if (connected.value) return { kind: 'synced', label: 'Synced' };
      return { kind: 'offline', label: 'Offline' };
    });

    const editor = useEditor({
      editable: true,
      extensions: [
        StarterKit.configure({ history: false }),
        Underline,
        Link.configure({ openOnClick: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider: awarenessProvider,
          user: {
            name: currentUser.value?.name || currentUser.value?.email || 'Guest',
            color: '#50d1b2',
          },
        }),
      ],
      onSelectionUpdate: ({ editor }) => {
        if (!canEditContent.value) return;
        const selection = editor.state.selection;
        sendAwareness({ anchor: selection.anchor, head: selection.head });
      },
    });

    const {
      connected,
      currentRevision,
      pendingUpdatesCount,
      connect,
      disconnect,
      sendUpdate,
      sendAwareness,
      onRemoteUpdate,
      onReject,
      onAck,
      setRevision,
      clearPendingUpdates,
    } = useTextDocumentSocket(resolvedId);

    function syncEditorEditable() {
      if (loading.value) return;
      editor.value?.setEditable(canEditContent.value);
    }

    watch([canEditContent, editor, loading], syncEditorEditable, { immediate: true });

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (!canEditContent.value || applyingInitialState || origin === 'remote') return;
      sendUpdate(uint8ArrayToBase64(update));
    });

    async function load() {
      try {
        loading.value = true;
        accessDenied.value = false;
        const res = await textDocuments.get(resolvedId.value);
        resolvedId.value = res.document.id;
        slug.value = res.document.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.document.title || 'Untitled document';
        savedTitle.value = title.value;
        role.value = res.role;
        revision.value = res.document.revision ?? 0;
        setRevision(revision.value);
        visibility.value = res.document.visibility || 'private';
        allowPublicEdit.value = !!res.document.allowPublicEdit;
        listedInPublic.value = res.document.listedInPublic !== false;
        passwordAccessEnabled.value = !!res.document.passwordAccessEnabled;
        passwordAccessRole.value = res.document.passwordAccessRole || 'read';
        const state = res.document.snapshot?.yjsState;
        if (state) {
          applyingInitialState = true;
          Y.applyUpdate(ydoc, base64ToUint8Array(state), 'remote');
          applyingInitialState = false;
        }
        const preferred = slug.value || res.document.id;
        if (route.params.id !== preferred) {
          router.replace({ name: 'text-document', params: { id: preferred } }).catch(() => {});
        }
        editor.value?.setEditable(canEditContent.value);
        if (res.role === 'owner') await loadPermissions();
        if (!socketInitialized) {
          socketInitialized = true;
          connect();
          onRemoteUpdate((encodedUpdate, nextRevision) => {
            Y.applyUpdate(ydoc, base64ToUint8Array(encodedUpdate), 'remote');
            revision.value = nextRevision;
          });
          onAck((ack) => {
            revision.value = ack.revision;
            syncIssue.value = '';
          });
          onReject((reject) => {
            void handleReject(reject);
          });
        }
      } catch (e: any) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          accessDenied.value = true;
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          await router.replace({ name: 'dashboard', query: { type: 'text-document' } });
          return;
        }
        throw e;
      } finally {
        loading.value = false;
      }
    }

    async function handleReject(reject: TextDocumentReject) {
      if (reject.reason === 'timeout' && reject.pending?.update) {
        try {
          const result = await textDocuments.applyUpdate(resolvedId.value, reject.clientUpdateId || crypto.randomUUID(), reject.pending.update);
          revision.value = result.revision ?? revision.value;
          setRevision(revision.value);
          showToast('Realtime timed out. Saved through REST fallback.', 'success');
          return;
        } catch (e: any) {
          syncIssue.value = 'conflict';
          showToast(e.message || 'Failed to save document update', 'error');
          return;
        }
      }
      syncIssue.value = 'conflict';
      clearPendingUpdates();
      showToast('Document realtime update was rejected. Reloading latest version.', 'error');
      await load();
      syncIssue.value = '';
    }

    async function saveTitle() {
      if (!canEditContent.value || title.value === savedTitle.value) return;
      const updated = await textDocuments.update(resolvedId.value, { title: title.value });
      savedTitle.value = updated.title || title.value;
      showToast('Title saved', 'success');
    }

    async function loadPermissions() {
      permissions.value = await textDocuments.permissions(resolvedId.value);
    }

    async function saveAccessSettings() {
      await textDocuments.update(resolvedId.value, {
        visibility: visibility.value,
        allowPublicEdit: allowPublicEdit.value,
        listedInPublic: listedInPublic.value,
      });
      await load();
    }

    async function saveSlug() {
      if (role.value !== 'owner') return;
      savingSlug.value = true;
      try {
        const updated = await textDocuments.update(resolvedId.value, { slug: slugInput.value.trim() || null });
        slug.value = updated.slug || null;
        slugInput.value = slug.value || '';
        await router.replace({ name: 'text-document', params: { id: slug.value || resolvedId.value } });
        showToast('Link saved', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to save link', 'error');
      } finally {
        savingSlug.value = false;
      }
    }

    async function doShare() {
      if (!shareEmail.value) return;
      await textDocuments.share(resolvedId.value, shareEmail.value, shareRole.value);
      shareEmail.value = '';
      await loadPermissions();
      showToast('Access granted', 'success');
    }

    async function doRevoke(userId: string) {
      await textDocuments.revoke(resolvedId.value, userId);
      await loadPermissions();
      showToast('Access revoked', 'success');
    }

    async function savePasswordAccess() {
      await textDocuments.update(resolvedId.value, {
        passwordAccessEnabled: passwordAccessEnabled.value,
        passwordAccessPassword: passwordAccessPassword.value || undefined,
        passwordAccessRole: passwordAccessRole.value,
      });
      passwordAccessPassword.value = '';
      showToast('Password access saved', 'success');
      await load();
    }

    async function loginWithDocumentPassword() {
      checkingResourcePassword.value = true;
      try {
        const result = await auth.resourcePasswordLogin({
          resourceType: 'text-document',
          resourceId: resolvedId.value,
          password: resourcePassword.value,
        });
        setToken(result.token, result.user?.role || 'user', result.user?.accessMode || 'resource-password', result.user);
        await load();
      } catch (e: any) {
        showToast(e.message || 'Invalid password', 'error');
      } finally {
        checkingResourcePassword.value = false;
      }
    }

    async function requestDocumentAccess() {
      if (!isAuthenticated()) {
        await router.push({ name: 'login', query: { redirect: route.fullPath } });
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({ resourceType: 'text-document', resourceId: resolvedId.value, requestedRole: requestedRole.value });
        accessRequestSent.value = true;
        showToast('Access request sent', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to request access', 'error');
      } finally {
        requestingAccess.value = false;
      }
    }

    async function loadHistory() {
      historyLoading.value = true;
      try {
        const result = await textDocuments.history(resolvedId.value, 50, 0);
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
        selectedHistory.value = await textDocuments.historySnapshot(resolvedId.value, entry.revision);
      } catch (e: any) {
        showToast(e.message || 'Failed to load history snapshot', 'error');
      }
    }

    async function restoreSelectedHistory() {
      if (!selectedHistory.value) return;
      const ok = window.confirm(`Restore revision ${selectedHistory.value.revision}? This will create a new revision.`);
      if (!ok) return;
      restoringHistory.value = true;
      try {
        await textDocuments.restoreHistorySnapshot(resolvedId.value, selectedHistory.value.revision);
        selectedHistory.value = null;
        await load();
        await loadHistory();
        showToast('Document restored', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to restore document', 'error');
      } finally {
        restoringHistory.value = false;
      }
    }

    function focusEditor(event?: MouseEvent) {
      if (!canEditContent.value) return;
      const target = event?.target;
      if (target instanceof Element && target.closest('.ProseMirror')) return;
      editor.value?.chain().focus('end').run();
    }

    onMounted(load);
    onBeforeUnmount(() => {
      disconnect();
      editor.value?.destroy();
      ydoc.destroy();
    });

    return {
      loading,
      accessDenied,
      title,
      role,
      revision,
      currentRevision,
      canEditContent,
      editor,
      connected,
      pendingUpdatesCount,
      syncStatus,
      showShare,
      slugInput,
      savingSlug,
      visibility,
      allowPublicEdit,
      listedInPublic,
      shareEmail,
      shareRole,
      permissions,
      passwordAccessEnabled,
      passwordAccessPassword,
      passwordAccessRole,
      resourcePassword,
      checkingResourcePassword,
      requestedRole,
      requestingAccess,
      accessRequestSent,
      showHistory,
      historyLoading,
      historyItems,
      selectedHistory,
      restoringHistory,
      saveTitle,
      saveSlug,
      saveAccessSettings,
      doShare,
      doRevoke,
      savePasswordAccess,
      loginWithDocumentPassword,
      requestDocumentAccess,
      toggleHistory,
      openHistoryEntry,
      restoreSelectedHistory,
      focusEditor,
    };
  },
});
</script>
