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

        <router-link :to="backTarget.to" class="access-gate-back">{{ backTarget.label }}</router-link>
      </div>
    </div>

    <template v-else>
      <header class="text-doc-topbar">
        <router-link :to="backTarget.to" class="btn-ghost">{{ backTarget.label }}</router-link>
        <input v-if="canEditContent" v-model="title" class="text-doc-title-input" @blur="saveTitle" @keydown.enter.prevent="saveTitle" />
        <span v-else class="text-doc-title-readonly">{{ title || 'Untitled document' }}</span>
        <div class="text-doc-topbar-actions">
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showShare = !showShare">{{ t('access') }}</button>
          <button class="btn-ghost btn-sm" @click="toggleHistory">{{ t('history') }}</button>
          <button v-if="canEditContent" class="text-doc-sync" :class="`text-doc-sync-${syncStatus.kind}`">
            {{ syncStatus.label }}<template v-if="pendingUpdatesCount"> · {{ pendingUpdatesCount }}</template>
          </button>
          <AccountMenu v-if="currentUser" />
          <router-link v-else :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn-ghost btn-sm">{{ t('login') }}</router-link>
        </div>
      </header>
      <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>

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
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('codeBlock') }" @click="editor?.chain().focus().toggleCodeBlock().run()">{{ t('codeBlock') }}</button>
        <button class="btn-ghost btn-sm" :disabled="uploadingImage" :title="t('addPhoto')" @click="openImagePicker">
          {{ uploadingImage ? t('loading') : t('photo') }}
        </button>
        <button class="btn-ghost btn-sm" :class="{ active: editor?.isActive('callout') }" :title="t('callout')" @click="editor?.chain().focus().toggleCallout().run()">{{ t('callout') }}</button>
        <template v-if="editor?.isActive('callout')">
          <button
            v-for="variant in calloutVariants"
            :key="variant.name"
            class="btn-ghost btn-sm text-doc-callout-variant-btn"
            :class="{ active: editor?.isActive('callout', { variant: variant.name }) }"
            :data-variant="variant.name"
            :title="variant.label"
            @click="editor?.chain().focus().setCalloutVariant(variant.name).run()"
          >
            <span class="text-doc-callout-variant-icon" v-html="variant.icon"></span>
            <span class="text-doc-callout-variant-label">{{ variant.label }}</span>
          </button>
        </template>
      </div>
      <input
        ref="imageInput"
        type="file"
        accept="image/*"
        multiple
        style="display:none"
        @change="onImageSelected"
      />

      <main class="text-doc-editor-shell">
        <article
          class="text-doc-paper"
          :class="{ readonly: !canEditContent }"
          @click="focusEditor($event)"
          @paste="onEditorPaste"
          @drop="onEditorDrop"
          @dragover.prevent
        >
          <EditorContent v-if="editor" :editor="editor" />
        </article>
      </main>

      <!-- The selection bubble. Chrome in the app's themed --ui-* palette,
           like the toolbar; nothing here reaches the Yjs document. -->
      <BubbleMenu
        v-if="editor && canEditContent"
        class="text-doc-bubble-menu"
        :editor="editor"
        :should-show="bubbleShouldShow"
        :tippy-options="{ duration: 100 }"
      >
        <template v-if="!linkEditorOpen">
          <button
            v-for="button in bubbleMarkButtons"
            :key="button.mark"
            class="text-doc-bubble-btn"
            :class="{ active: editor.isActive(button.mark) }"
            :data-bubble-mark="button.mark"
            :title="button.label"
            :aria-label="button.label"
            type="button"
            @click="applyBubbleMark(button.mark)"
          >
            <span class="text-doc-bubble-icon" v-html="button.icon"></span>
          </button>
          <button
            class="text-doc-bubble-btn"
            :class="{ active: editor.isActive('link') }"
            data-bubble-action="link"
            :title="t('linkAdd')"
            :aria-label="t('linkAdd')"
            type="button"
            @click="openLinkEditor"
          >
            <span class="text-doc-bubble-icon" v-html="linkIcon"></span>
          </button>
          <button
            v-if="editor.isActive('link')"
            class="text-doc-bubble-btn"
            data-bubble-action="unlink"
            :title="t('linkRemove')"
            :aria-label="t('linkRemove')"
            type="button"
            @click="removeLink"
          >
            <span class="text-doc-bubble-icon" v-html="unlinkIcon"></span>
          </button>
        </template>
        <form v-else class="text-doc-bubble-link-form" @submit.prevent="applyLink">
          <input
            v-model="linkInput"
            class="text-doc-bubble-link-input"
            data-bubble-link-input
            :placeholder="t('linkUrl')"
            :aria-label="t('linkUrl')"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            @keydown.esc.prevent="closeLinkEditor"
          />
          <button class="text-doc-bubble-btn text-doc-bubble-btn-text" data-bubble-action="apply-link" type="submit">
            {{ t('linkApply') }}
          </button>
        </form>
      </BubbleMenu>

      <!-- The slash menu. Chrome, not document content: it lives in the app's
           themed --ui-* palette (like the toolbar), never in the fixed paper
           palette, and nothing here reaches the Yjs document. -->
      <div
        v-if="slashOpen"
        class="text-doc-slash-menu"
        :style="slashMenuStyle"
        role="listbox"
        :aria-label="t('slashMenu')"
      >
        <button
          v-for="(item, index) in slashItems"
          :key="item.id"
          class="text-doc-slash-item"
          :class="{ active: index === slashIndex }"
          :data-slash-item="item.id"
          role="option"
          :aria-selected="index === slashIndex"
          type="button"
          @mousedown.prevent="selectSlashItem(index)"
          @mouseenter="slashIndex = index"
        >
          <span class="text-doc-slash-icon" v-html="item.icon"></span>
          <span class="text-doc-slash-label">{{ t(item.labelKey) }}</span>
        </button>
        <div v-if="!slashItems.length" class="text-doc-slash-empty">{{ t('slashNoResults') }}</div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { lowlight } from '../text-documents/code-highlighting';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { isRenderableHref } from '../documents/link-policy';
import TaskList from '@tiptap/extension-task-list';
import Image from '@tiptap/extension-image';
import TaskItem from '@tiptap/extension-task-item';
import { Callout, calloutIconSvg } from '../text-documents/callout';
import {
  SLASH_MENU_ITEMS,
  SlashMenu,
  type SlashMenuController,
  type SlashMenuItem,
  type SlashMenuRender,
} from '../text-documents/slash-menu';
import {
  BUBBLE_MARK_BUTTONS,
  LINK_ICON,
  UNLINK_ICON,
  resolveLinkHref,
  shouldShowBubbleMenu,
} from '../text-documents/bubble-menu';
import { EDITOR_GLYPHS, lucideIcon } from '../text-documents/editor-icons';
import DragHandle from '@tiptap/extension-drag-handle';
import NodeRange from '@tiptap/extension-node-range';
import { CALLOUT_VARIANTS } from '../documents/document-nodes';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { accessRequests, ApiError, auth, getCurrentUser, isAuthenticated, setToken, textDocuments, uploadImage } from '../api/client';
import { useTextDocumentSocket, type TextDocumentReject } from '../composables/useTextDocumentSocket';
import { useToast } from '../composables/useToast';
import { useReadOnlyNotice } from '../composables/useReadOnlyNotice';
import { readNativeResourceCache, writeNativeResourceCache } from '../composables/useNativeResourceCache';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../text-documents/projection';
import { useI18n } from '../composables/useI18n';
import AccountMenu from '../components/AccountMenu.vue';

export default defineComponent({
  components: { AccountMenu, BubbleMenu, EditorContent },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const folderId = ref<string | null>(null);
    const { backTarget } = useResourceBackTarget(folderId);
    const id = route.params.id as string;
    const resolvedId = ref(id);
    const { show: showToast } = useToast();
    const { notifyReadOnlyEditAttempt } = useReadOnlyNotice();
    const { t, locale } = useI18n();

    /**
     * The four callout variants for the toolbar: names come from the shared
     * node inventory (so this list cannot claim a variant the backend would
     * bound away) and the labels from i18n. The icon is the same inline
     * Lucide-style svg the node view draws, so the button shows the glyph the
     * block will get.
     */
    const calloutVariants = computed(() =>
      CALLOUT_VARIANTS.map((name) => ({
        name,
        label: t(`callout${name.charAt(0).toUpperCase()}${name.slice(1)}` as 'calloutInfo'),
        icon: calloutIconSvg(name),
      })),
    );

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
    const cacheStatus = ref<{ kind: 'refreshing' | 'success' | 'error'; text: string } | null>(null);
    const hydratedFromCache = ref(false);
    let cacheStatusTimeout: ReturnType<typeof setTimeout> | null = null;
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

    const imageInput = ref<HTMLInputElement | null>(null);
    const uploadingImage = ref(false);

    const insertImages = async (files: File[]) => {
      if (!canEditContent.value || !files.length) return;
      uploadingImage.value = true;
      try {
        for (const file of files) {
          // Upload first: a local blob URL would be meaningless to collaborators.
          const { url } = await uploadImage(file);
          if (!url) throw new Error(t('noImageUrlFromServer'));
          editor.value?.chain().focus().setImage({ src: url, alt: file.name }).run();
        }
      } catch (err: any) {
        showToast(err?.message || t('failedUploadImage'), 'error');
      } finally {
        uploadingImage.value = false;
      }
    };

    const openImagePicker = () => {
      if (!canEditContent.value) return;
      imageInput.value?.click();
    };

    const onImageSelected = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      input.value = '';
      await insertImages(files);
    };

    const imageFilesFrom = (list: FileList | null | undefined) =>
      Array.from(list || []).filter((file) => file.type.startsWith('image/'));

    const onEditorPaste = (event: ClipboardEvent) => {
      const files = imageFilesFrom(event.clipboardData?.files);
      if (!files.length || !canEditContent.value) return;
      // Let the default paste run for anything that is not an image.
      event.preventDefault();
      void insertImages(files);
    };

    const onEditorDrop = (event: DragEvent) => {
      const files = imageFilesFrom(event.dataTransfer?.files);
      if (!files.length || !canEditContent.value) return;
      event.preventDefault();
      void insertImages(files);
    };

    /**
     * DRAG HANDLE.
     *
     * @tiptap/extension-drag-handle renders one element and tippy parks it
     * beside whichever block the pointer is over. It reads the EXISTING
     * y-prosemirror sync plugin (from `Collaboration.configure({ document:
     * ydoc })` below) through `ySyncPluginKey` to keep a RELATIVE position
     * across a collaborator's change; it neither creates nor needs a second
     * Y.Doc, and none is created here.
     *
     * NodeRange is its hard requirement, not an extra: the drag handler builds
     * a NodeRangeSelection over the hovered block, so without that extension
     * registered a drag has nothing to pick up.
     */
    let dragHandleElement: HTMLElement | null = null;
    const paintDragHandleLabel = () => {
      if (!dragHandleElement) return;
      dragHandleElement.setAttribute('aria-label', t('dragBlock'));
      dragHandleElement.setAttribute('title', t('dragBlock'));
    };
    const renderDragHandle = () => {
      const element = document.createElement('div');
      element.className = 'text-doc-drag-handle';
      element.setAttribute('role', 'button');
      // Inline Lucide-style svg (lucide "grip-vertical"), never an emoji.
      element.innerHTML = lucideIcon(EDITOR_GLYPHS.gripVertical);
      dragHandleElement = element;
      paintDragHandleLabel();

      return element;
    };
    // The element is built once, when the editor is created, so its label has
    // to be repainted rather than re-rendered when the language changes.
    watch(locale, paintDragHandleLabel);

    /**
     * BUBBLE MENU state.
     *
     * The popup is @tiptap/vue-3's BubbleMenu component; `shouldShow` and the
     * href policy live in text-documents/bubble-menu.ts so they can be
     * asserted without a popup. The link editor is deliberately the smallest
     * thing that can take a url: one input, inside the bubble.
     */
    const linkEditorOpen = ref(false);
    const linkInput = ref('');
    const bubbleMarkButtons = computed(() =>
      BUBBLE_MARK_BUTTONS.map((button) => ({ ...button, label: t(button.labelKey) })),
    );
    const bubbleShouldShow = ({ state, from, to }: { state: any; from: number; to: number }) =>
      shouldShowBubbleMenu(state, from, to);

    const applyBubbleMark = (mark: string) => {
      editor.value?.chain().focus().toggleMark(mark).run();
    };

    const openLinkEditor = () => {
      linkInput.value = editor.value?.getAttributes('link').href || '';
      linkEditorOpen.value = true;
    };

    const closeLinkEditor = () => {
      linkEditorOpen.value = false;
      linkInput.value = '';
    };

    const removeLink = () => {
      editor.value?.chain().focus().extendMarkRange('link').unsetLink().run();
      closeLinkEditor();
    };

    const applyLink = () => {
      if (!linkInput.value.trim()) {
        // An emptied field reads as "take the link off", which is what the
        // separate unlink button does - not as "link to nothing".
        removeLink();
        return;
      }
      const href = resolveLinkHref(linkInput.value);
      if (!href) {
        // Refused by documents/link-policy.ts. Saying so beats silently
        // dropping the click, because the input looks perfectly fine.
        showToast(t('linkRejected'), 'error');
        return;
      }
      editor.value?.chain().focus().extendMarkRange('link').setLink({ href }).run();
      closeLinkEditor();
    };

    /**
     * SLASH MENU state.
     *
     * The extension owns the trigger, the guards and the filtering; this owns
     * the popup - which items are showing, which one is highlighted, and where
     * on screen it sits. `slashCommand` is the suggestion plugin's own command
     * callback, kept so a click or Enter goes through the plugin's path (which
     * knows the range to replace) rather than reimplementing it.
     */
    const slashOpen = ref(false);
    const slashItems = ref<SlashMenuItem[]>([]);
    const slashIndex = ref(0);
    const slashRect = ref<{ top: number; left: number } | null>(null);
    let slashCommand: ((item: SlashMenuItem) => void) | null = null;
    // Escape dismisses the popup while the caret stays inside the typed
    // `/query`, so the suggestion plugin is still "active". Without this flag
    // the very next keystroke would pop it straight back open.
    let slashDismissed = false;

    const slashLabel = (item: SlashMenuItem) => t(item.labelKey);
    const slashMenuStyle = computed(() =>
      slashRect.value
        ? { top: `${slashRect.value.top}px`, left: `${slashRect.value.left}px` }
        : undefined,
    );

    const applySlashRender = (render: SlashMenuRender) => {
      slashItems.value = render.items;
      slashIndex.value = 0;
      slashCommand = render.command;
      // A DOMRect is not reactive and jsdom reports zeroes; only the two
      // numbers the popup needs are copied out.
      slashRect.value = render.rect
        ? { top: render.rect.bottom + 6, left: render.rect.left }
        : null;
      slashOpen.value = !slashDismissed;
    };

    const closeSlashMenu = () => {
      slashOpen.value = false;
      slashItems.value = [];
      slashIndex.value = 0;
      slashCommand = null;
    };

    const selectSlashItem = (index: number) => {
      const item = slashItems.value[index];
      if (!item || !slashCommand) return;
      slashCommand(item);
    };

    const slashController: SlashMenuController = {
      onOpen: (render) => {
        slashDismissed = false;
        applySlashRender(render);
      },
      onUpdate: (render) => applySlashRender(render),
      onClose: () => {
        slashDismissed = false;
        closeSlashMenu();
      },
      onKeyDown: (event) => {
        if (!slashOpen.value) return false;
        const total = slashItems.value.length;
        if (event.key === 'Escape') {
          slashDismissed = true;
          closeSlashMenu();
          return true;
        }
        if (event.key === 'ArrowDown') {
          if (total) slashIndex.value = (slashIndex.value + 1) % total;
          return true;
        }
        if (event.key === 'ArrowUp') {
          if (total) slashIndex.value = (slashIndex.value - 1 + total) % total;
          return true;
        }
        if (event.key === 'Enter') {
          // Nothing to insert is still a consumed Enter: the query is showing
          // "no matching blocks", and a newline there would be a surprise.
          selectSlashItem(slashIndex.value);
          return true;
        }
        return false;
      },
    };

    const editor = useEditor({
      editable: true,
      extensions: [
        // codeBlock: false disables StarterKit's own code block node so
        // CodeBlockLowlight (added below) is the only node registered for
        // "codeBlock" - having both would register the name twice.
        StarterKit.configure({ history: false, codeBlock: false }),
        CodeBlockLowlight.configure({ lowlight }),
        Underline,
        // A collaborator's Yjs update reaches this editor without passing the
        // backend's renderer, so the href filter has to live here too.
        Link.configure({
          openOnClick: false,
          isAllowedUri: (href, ctx) => isRenderableHref(href, ctx.defaultValidate),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        // Uploaded images are referenced by URL; base64 would bloat the shared Yjs doc.
        Image.configure({ inline: false, allowBase64: false }),
        Callout,
        SlashMenu.configure({
          controller: slashController,
          label: slashLabel,
          // The image item cannot insert a node on its own: the file
          // has to be uploaded first, so it reuses the toolbar's picker.
          requestImage: () => openImagePicker(),
        }),
        NodeRange,
        DragHandle.configure({
          render: renderDragHandle,
          tippyOptions: { offset: [0, 8] },
        }),
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
        if (!hydratedFromCache.value) loading.value = true;
        accessDenied.value = false;
        const res = await textDocuments.get(resolvedId.value);
        writeNativeResourceCache('text-document', [id, res.document.id, res.document.slug || ''], res);
        resolvedId.value = res.document.id;
        slug.value = res.document.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.document.title || 'Untitled document';
        folderId.value = res.document.folderId || null;
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
          router.replace({ name: 'text-document', params: { id: preferred }, query: route.query }).catch(() => {});
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
        await router.replace({ name: 'text-document', params: { id: slug.value || resolvedId.value }, query: route.query });
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
      if (!canEditContent.value) {
        notifyReadOnlyEditAttempt();
        return;
      }
      const target = event?.target;
      if (target instanceof Element && target.closest('.ProseMirror')) return;
      editor.value?.chain().focus('end').run();
    }

    onMounted(() => {
      const cached = readNativeResourceCache<any>('text-document', id);
      if (cached?.value?.document) {
        const res = cached.value;
        resolvedId.value = res.document.id;
        slug.value = res.document.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.document.title || 'Untitled document';
        folderId.value = res.document.folderId || null;
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
        hydratedFromCache.value = true;
        loading.value = false;
        if (cached.stale) cacheStatus.value = { kind: 'refreshing', text: t('refreshingSaved') };
      }
      void load();
    });
    onBeforeUnmount(() => {
      if (cacheStatusTimeout) clearTimeout(cacheStatusTimeout);
      disconnect();
      editor.value?.destroy();
      ydoc.destroy();
    });

    return {
      t,
      calloutVariants,
      slashOpen,
      slashItems,
      slashIndex,
      slashMenuStyle,
      selectSlashItem,
      SLASH_MENU_ITEMS,
      linkEditorOpen,
      linkInput,
      bubbleMarkButtons,
      bubbleShouldShow,
      applyBubbleMark,
      openLinkEditor,
      closeLinkEditor,
      applyLink,
      removeLink,
      linkIcon: LINK_ICON,
      unlinkIcon: UNLINK_ICON,
      backTarget,
      imageInput,
      uploadingImage,
      openImagePicker,
      onImageSelected,
      onEditorPaste,
      onEditorDrop,
      loading, cacheStatus,
      accessDenied,
      title,
      route,
      currentUser,
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
