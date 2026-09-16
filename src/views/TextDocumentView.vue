<template>
  <div class="text-doc-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <AccessGate
      v-else-if="accessDenied"
      resource-type="text-document"
      :password-access-enabled="gatePasswordAccessEnabled"
      :checking-password="checkingResourcePassword"
      :requesting-access="requestingAccess"
      :access-request-sent="accessRequestSent"
      @submit-password="loginWithDocumentPassword"
      @request-access="requestDocumentAccess"
    />

    <template v-else>
      <header class="text-doc-topbar">
        <router-link :to="backTarget.to" class="btn-ghost">{{ backTarget.label }}</router-link>
        <input v-if="canEditContent" v-model="title" class="text-doc-title-input" @blur="saveTitle" @keydown.enter.prevent="saveTitle" />
        <span v-else class="text-doc-title-readonly">{{ title || 'Untitled document' }}</span>
        <div class="text-doc-topbar-actions">
          <button v-if="role === 'owner'" class="btn-ghost btn-sm text-doc-access-btn" @click="showShare = !showShare">{{ t('access') }}</button>
          <button class="btn-ghost btn-sm text-doc-history-btn" @click="toggleHistory">{{ t('history') }}</button>
          <button v-if="canEditContent" class="text-doc-sync" :class="`text-doc-sync-${syncStatus.kind}`">
            {{ syncStatus.label }}<template v-if="pendingUpdatesCount"> · {{ pendingUpdatesCount }}</template>
          </button>
          <AccountMenu v-if="currentUser" />
          <router-link v-else :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn-ghost btn-sm">{{ t('login') }}</router-link>
          <div class="control-menu text-doc-menu-mobile">
            <button
              type="button"
              class="btn-ghost btn-sm text-doc-menu-trigger"
              :aria-label="t('groupActions')"
              :title="t('groupActions')"
              @click.stop="toggleDocMenu"
            ><MoreVertical :size="18" aria-hidden="true" /></button>
            <!-- The topbar's own backdrop-filter makes it a containing block
                 for position:fixed descendants AND its own stacking context,
                 so both the backdrop and the popover are teleported to
                 <body> together with a viewport-relative position computed
                 from the trigger - otherwise the popover's z-index is only
                 compared against the topbar's siblings, not the backdrop. -->
            <Teleport to="body">
              <div v-if="docMenuOpen" class="text-doc-menu-backdrop" @click="closeDocMenu"></div>
              <div v-if="docMenuOpen" class="text-doc-menu-popover" :style="docMenuStyle" @click.stop>
                <button v-if="role === 'owner'" type="button" class="text-doc-menu-item" @click="openAccessFromDocMenu">{{ t('access') }}</button>
                <button type="button" class="text-doc-menu-item" @click="openHistoryFromDocMenu">{{ t('history') }}</button>
              </div>
            </Teleport>
          </div>
        </div>
      </header>
      <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>

      <section v-if="showShare && role === 'owner'" class="share-panel text-doc-share-panel">
        <div class="share-panel-header">
          <h3>{{ t('access') }}</h3>
          <button class="btn-ghost btn-sm" @click="showShare = false">x</button>
        </div>

        <div class="share-section">
          <div class="share-section-title">{{ t('shareLinkSection') }}</div>
          <div class="slug-row">
            <span class="slug-prefix">/docs/</span>
            <input v-model="slugInput" class="slug-input" placeholder="my-document" spellcheck="false" autocapitalize="off" autocomplete="off" @keydown.enter="saveSlug" />
            <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">{{ t('save') }}</button>
          </div>
          <div class="slug-hint">{{ t('slugHint') }}</div>
        </div>

        <div class="share-section">
          <div class="share-section-title">{{ t('whoCanView') }}</div>
          <select class="share-visibility-select" v-model="visibility" @change="saveAccessSettings">
            <option value="private">{{ t('visibilityPrivateDash') }}</option>
            <option value="authenticated">{{ t('visibilityAuthOnlyDash') }}</option>
            <option value="public">{{ t('visibilityPublicDash') }}</option>
          </select>
          <label class="share-checkbox">
            <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
            <span>{{ t('allowPublicEditing') }}</span>
          </label>
          <label class="share-checkbox">
            <input type="checkbox" v-model="listedInPublic" :disabled="visibility !== 'public'" @change="saveAccessSettings" />
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
              <button @click="doRevoke(p.userId)">x</button>
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

      <section v-if="showHistory" class="html-history-panel text-doc-history-panel">
        <div class="html-history-list">
          <div class="html-history-head">
            <strong>{{ t('history') }}</strong>
            <button class="btn-ghost btn-sm" @click="showHistory = false">x</button>
          </div>
          <div v-if="historyLoading" class="html-history-empty">{{ t('loadingDots') }}</div>
          <button v-for="entry in historyItems" :key="entry.id" class="html-history-item" :class="{ active: selectedHistory?.id === entry.id }" @click="openHistoryEntry(entry)">
            <span>{{ t('revisionLabel') }} {{ entry.revision }}</span>
            <small>{{ new Date(entry.createdAt).toLocaleString() }}</small>
          </button>
          <div v-if="!historyLoading && !historyItems.length" class="html-history-empty">{{ t('noHistoryYet') }}</div>
        </div>
        <div class="html-history-preview">
          <div v-if="!selectedHistory" class="html-history-empty">{{ t('selectARevision') }}</div>
          <template v-else>
            <div class="html-history-preview-head">
              <div>
                <strong>{{ t('revisionLabel') }} {{ selectedHistory.revision }}</strong>
                <small>{{ selectedHistory.plainText || t('snapshotLabel') }}</small>
              </div>
              <button v-if="canEditContent" class="btn-ghost btn-sm" :disabled="restoringHistory" @click="restoreSelectedHistory">
                {{ restoringHistory ? t('restoringEllipsis') : t('restoreLabel') }}
              </button>
            </div>
            <div class="text-doc-history-preview" v-html="selectedHistory.html"></div>
          </template>
        </div>
      </section>

      <!-- CAPACITY. Chrome in the app's themed --ui-* palette, never the
           fixed paper palette; nothing here reaches the Yjs document. It
           appears at the warning threshold and stays up
           while the document is at or over the ceiling - including for a
           document that arrived over it, where the honest thing to offer is
           both a new page and the fact that deleting blocks works. -->
      <div
        v-if="canEditContent && capacityNotice"
        class="text-doc-capacity"
        :class="`text-doc-capacity-${capacityNotice.level}`"
        data-capacity-notice
        role="status"
        :aria-live="capacityNotice.level === 'full' ? 'assertive' : 'polite'"
      >
        <span class="text-doc-capacity-icon" v-html="capacityIcon" aria-hidden="true"></span>
        <span class="text-doc-capacity-text">{{ capacityNotice.text }}</span>
        <span class="text-doc-capacity-count" data-capacity-count :title="t('capacityBlocksTitle')">
          {{ blockCount }} / {{ capacityLimit }}
        </span>
        <button
          class="text-doc-capacity-btn"
          type="button"
          data-capacity-continue
          :disabled="continuingPage"
          @click="continueInNewPage"
        >
          <span class="text-doc-capacity-btn-icon" v-html="continuePageIcon" aria-hidden="true"></span>
          <span>{{ continuingPage ? t('capacityContinuing') : t('capacityContinue') }}</span>
        </button>
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

        <!--
          BACKLINKS (front task 10). Chrome at the end of the document, not
          document content - lives in .text-doc-editor-shell's column like
          .text-doc-paper, but outside the paper itself, on the app's themed
          --ui-* palette. Renders only once the fetch has resolved (never a
          flash of "no backlinks" before it has), and shows nothing at all
          when the target document simply is not read yet - see load().

          Two deliberate choices, not left to guesswork:
          - Zero backlinks: a persistent empty line under a persistent
            heading, not a hidden block. Hiding the whole section would make
            "never mentioned" and "mentioned a moment ago, not indexed yet"
            (ruling R1) look identical - nothing at all - which is exactly
            the "user reads it as a bug" case R1 warns about.
          - The refresh-delay IS said in the UI: a small caption under the
            heading, always shown (not only in the empty state, since R1's
            lag applies to an addition on a document that already has other
            backlinks too), rather than repeated per item or left unsaid.
        -->
        <section v-if="backlinksLoaded" class="text-doc-backlinks">
          <div class="text-doc-backlinks-head">
            <span class="text-doc-backlinks-icon" v-html="backlinksIcon" aria-hidden="true"></span>
            <h3 class="text-doc-backlinks-title">{{ t('backlinksTitle') }}</h3>
          </div>
          <p class="text-doc-backlinks-hint">{{ t('backlinksDelayHint') }}</p>
          <ul v-if="backlinks.length" class="text-doc-backlinks-list">
            <li v-for="item in backlinks" :key="item.id">
              <button
                type="button"
                class="text-doc-backlink-item"
                :class="{ 'text-doc-backlink-item-inaccessible': !item.accessible }"
                :data-backlink-id="item.id"
                :data-backlink-state="item.accessible ? 'accessible' : 'inaccessible'"
                @click="onBacklinkClick(item)"
              >
                <span class="text-doc-backlink-item-icon" v-html="mentionDocumentIcon" aria-hidden="true"></span>
                <span class="text-doc-backlink-item-label">{{ item.title }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="text-doc-backlinks-empty">{{ t('backlinksEmpty') }}</p>
        </section>
      </main>

      <!--
        The access-request dialog (ruling R3): one component for both an
        inaccessible mention click (mention-node.ts) and an inaccessible
        backlink click (onBacklinkClick below) - both funnel into the same
        `pendingMentionAccessRequest` seam. R4: title and role only, no
        owner - see AccessRequestDialog.vue.
      -->
      <AccessRequestDialog
        v-if="pendingMentionAccessRequest"
        resource-type="text-document"
        :resource-id="pendingMentionAccessRequest.id"
        :title="pendingMentionAccessRequest.label"
        @close="pendingMentionAccessRequest = null"
      />

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
        <form v-else class="text-doc-bubble-link-form text-doc-bubble-link-form-desktop" @submit.prevent="applyLink">
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

      <!-- Mobile link editor: a bottom sheet pinned to the visual viewport
           instead of the desktop's in-place bubble form. Anchoring here to
           the visual viewport (rather than depending on the browser's own
           "scroll the focused element into view" behavior once the input
           below is focused and the keyboard opens) is what avoids the
           scroll-jump: an element already pinned to the viewport bottom
           never needs scroll-adjusting, wherever the original selection was. -->
      <Teleport to="body">
        <div v-if="linkEditorOpen" class="text-doc-link-sheet-backdrop" @click="closeLinkEditor"></div>
        <div
          v-if="linkEditorOpen"
          class="text-doc-link-sheet"
          :style="{ bottom: keyboardInset + 'px' }"
          role="dialog"
          :aria-label="t('linkAdd')"
        >
          <div class="text-doc-link-sheet-title">{{ t('linkAdd') }}</div>
          <form class="text-doc-link-sheet-form" @submit.prevent="applyLink">
            <input
              v-model="linkInput"
              class="text-doc-link-sheet-input"
              :placeholder="t('linkUrl')"
              :aria-label="t('linkUrl')"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              autofocus
              @keydown.esc.prevent="closeLinkEditor"
            />
            <div class="text-doc-link-sheet-actions">
              <button
                v-if="linkEditorHadLink"
                type="button"
                class="btn-ghost btn-sm"
                @click="removeLink"
              >{{ t('linkRemove') }}</button>
              <button type="submit" class="btn-primary btn-sm text-doc-link-sheet-apply">{{ t('linkApply') }}</button>
            </div>
          </form>
        </div>
      </Teleport>

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

      <!-- Mobile slash menu: a bottom sheet, since the desktop popup's rect-
           based position (right under the caret) is meaningless once the
           keyboard closing has moved everything around. Shares slashItems/
           slashIndex/selectSlashItem with the desktop popup above. -->
      <Teleport to="body">
        <div v-if="slashOpen" class="text-doc-slash-sheet-backdrop" @click="cancelSlashMenu"></div>
        <div v-if="slashOpen" class="text-doc-slash-sheet" role="listbox" :aria-label="t('slashMenu')">
          <div class="text-doc-slash-sheet-title">
            {{ t('slashMenu') }}
            <button type="button" class="text-doc-slash-sheet-close" :aria-label="t('close')" @click="cancelSlashMenu">
              <X :size="16" aria-hidden="true" />
            </button>
          </div>
          <div class="text-doc-slash-sheet-list">
            <button
              v-for="(item, index) in slashItems"
              :key="item.id"
              class="text-doc-slash-item text-doc-slash-sheet-item"
              :class="{ active: index === slashIndex }"
              role="option"
              :aria-selected="index === slashIndex"
              type="button"
              @click="selectSlashItem(index)"
            >
              <span class="text-doc-slash-icon" v-html="item.icon"></span>
              <span class="text-doc-slash-label">{{ t(item.labelKey) }}</span>
            </button>
            <div v-if="!slashItems.length" class="text-doc-slash-empty">{{ t('slashNoResults') }}</div>
          </div>
        </div>
      </Teleport>

      <!-- The @-mention picker. Same chrome rule as the slash menu above:
           lives in the app's themed --ui-* palette, nothing here reaches the
           Yjs document until an item is chosen. -->
      <div
        v-if="mentionOpen"
        class="text-doc-mention-menu"
        :style="mentionMenuStyle"
        role="listbox"
        :aria-label="t('mentionMenu')"
      >
        <button
          v-for="(item, index) in mentionItems"
          :key="item.kind === 'document' ? item.id : 'create'"
          class="text-doc-mention-item"
          :class="{ active: index === mentionIndex }"
          :data-mention-item="item.kind === 'document' ? item.id : 'create'"
          role="option"
          :aria-selected="index === mentionIndex"
          type="button"
          @mousedown.prevent="selectMentionItem(index)"
          @mouseenter="mentionIndex = index"
        >
          <template v-if="item.kind === 'document'">
            <span class="text-doc-mention-item-icon" v-html="mentionDocumentIcon"></span>
            <span class="text-doc-mention-item-label">{{ item.title }}</span>
          </template>
          <template v-else>
            <span class="text-doc-mention-item-icon" v-html="mentionCreateIcon"></span>
            <span class="text-doc-mention-item-label">{{ t('mentionCreatePagePrefix') }} "{{ item.query }}"</span>
          </template>
        </button>
        <div v-if="!mentionItems.length" class="text-doc-mention-empty">{{ t('mentionNoResults') }}</div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/vue-3';
import type { Editor, Range } from '@tiptap/core';
import { trackRange } from '../text-documents/preserve-range';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { lowlight } from '../text-documents/code-highlighting';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { isRenderableHref } from '../documents/link-policy';
import TaskList from '@tiptap/extension-task-list';
import Image from '@tiptap/extension-image';
import TaskItem from '@tiptap/extension-task-item';
import { Callout } from '../text-documents/callout';
import { CollapsibleHeading, type HeadingCollapseLabels } from '../text-documents/collapsible-heading';
import { TableOfContents, type TableOfContentsLabels } from '../text-documents/table-of-contents';
import {
  SLASH_MENU_ITEMS,
  SlashMenu,
  type SlashMenuController,
  type SlashMenuItem,
  type SlashMenuRender,
} from '../text-documents/slash-menu';
import {
  insertMentionAtRange,
  MentionMenu,
  type MentionMenuController,
  type MentionMenuItem,
  type MentionMenuRender,
} from '../text-documents/mention-menu';
import { Mention } from '../text-documents/mention-node';
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
import {
  MAX_TOP_LEVEL_BLOCKS,
  capacityLevel,
} from '../documents/document-capacity';
import { CAPACITY_OVERRIDE_META, CapacityGuard } from '../text-documents/capacity-guard';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { accessRequests, ApiError, auth, getCurrentUser, isAuthenticated, setToken, textDocuments, uploadImage, type BacklinkItem, type MentionResolution } from '../api/client';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useTextDocumentSocket, type TextDocumentReject } from '../composables/useTextDocumentSocket';
import { useToast } from '../composables/useToast';
import { useReadOnlyNotice } from '../composables/useReadOnlyNotice';
import { readNativeResourceCache, writeNativeResourceCache } from '../composables/useNativeResourceCache';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../text-documents/projection';
import { useI18n } from '../composables/useI18n';
import AccountMenu from '../components/AccountMenu.vue';
import AccessRequestDialog from '../components/AccessRequestDialog.vue';
import AccessGate from '../components/AccessGate.vue';
import { MoreVertical, X } from '@lucide/vue';

export default defineComponent({
  components: { AccountMenu, AccessRequestDialog, AccessGate, BubbleMenu, EditorContent, MoreVertical, X },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const folderId = ref<string | null>(null);
    const { backTarget } = useResourceBackTarget();
    const id = route.params.id as string;
    const resolvedId = ref(id);
    const { show: showToast } = useToast();
    const { notifyReadOnlyEditAttempt } = useReadOnlyNotice();
    const { t, locale } = useI18n();

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
    useDocumentTitle(title);
    const savedTitle = ref('');
    const role = ref('read');
    const revision = ref(0);
    const loading = ref(true);
    const cacheStatus = ref<{ kind: 'refreshing' | 'success' | 'error'; text: string } | null>(null);
    const hydratedFromCache = ref(false);
    let cacheStatusTimeout: ReturnType<typeof setTimeout> | null = null;
    const accessDenied = ref(false);
    const gatePasswordAccessEnabled = ref<boolean | undefined>(undefined);
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const checkingResourcePassword = ref(false);
    const showShare = ref(false);
    // Mobile-only "⋮" popover that houses Access/History (both stay driven
    // by the same showShare/toggleHistory state the desktop buttons use).
    const docMenuOpen = ref(false);
    const docMenuStyle = ref<Record<string, string> | null>(null);
    const toggleDocMenu = (event?: Event) => {
      if (docMenuOpen.value) {
        docMenuOpen.value = false;
        docMenuStyle.value = null;
        return;
      }
      // Teleported to <body> below (the topbar's own backdrop-filter makes
      // it a containing block for position:fixed, and a separate stacking
      // context that would otherwise sit the popover's z-index UNDER the
      // teleported backdrop's) - so both need a viewport-relative position
      // computed from the trigger, same approach as the dashboard's
      // computeCardMenuStyle.
      const trigger = event?.currentTarget as HTMLElement | undefined;
      const rect = trigger?.getBoundingClientRect();
      docMenuStyle.value = rect
        ? { position: 'fixed', top: `${Math.round(rect.bottom + 6)}px`, right: `${Math.round(window.innerWidth - rect.right)}px` }
        : null;
      docMenuOpen.value = true;
    };
    const closeDocMenu = () => { docMenuOpen.value = false; docMenuStyle.value = null; };
    const openAccessFromDocMenu = () => { closeDocMenu(); showShare.value = !showShare.value; };
    const openHistoryFromDocMenu = () => { closeDocMenu(); void toggleHistory(); };
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
      if (syncIssue.value) return { kind: 'conflict', label: t('syncConflict') };
      if (pendingUpdatesCount.value > 0) return { kind: 'saving', label: t('syncSaving') };
      if (connected.value) return { kind: 'synced', label: t('syncSynced') };
      return { kind: 'offline', label: t('syncOffline') };
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
     * COLLAPSIBLE HEADINGS and TABLE OF CONTENTS labels.
     *
     * Both extensions read `this.options.labels` live (see the `labels()`
     * closures in collapsible-heading.ts and table-of-contents.ts), so handing
     * each extension the SAME object this code keeps mutating is enough to
     * keep every chevron and the ToC node view in the current language - no
     * different from `paintDragHandleLabel` repainting the one drag handle
     * element in place.
     */
    const headingCollapseLabels: HeadingCollapseLabels = { collapse: '', expand: '' };
    const tableOfContentsLabels: TableOfContentsLabels = { title: '', empty: '' };
    const paintI18nLabels = () => {
      headingCollapseLabels.collapse = t('collapseHeading');
      headingCollapseLabels.expand = t('expandHeading');
      tableOfContentsLabels.title = t('tableOfContents');
      tableOfContentsLabels.empty = t('tableOfContentsEmpty');
    };
    paintI18nLabels();
    watch(locale, paintI18nLabels);

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

    /**
     * The mobile link editor is a bottom sheet, not the in-place bubble -
     * opening it moves focus to a plain <input>, and on mobile that also
     * closes/reopens the keyboard (a real layout event, not just a DOM
     * focus change). Capturing the range up front and re-asserting it right
     * before applying/removing means the mark lands on the text that was
     * ACTUALLY selected when the user tapped the link button, regardless of
     * what happened to focus or to the document (a collaborator's edit)
     * while the sheet was open - see text-documents/preserve-range.ts.
     */
    let linkRangeTracker: ReturnType<typeof trackRange> | null = null;
    // Captured at open time rather than read live from editor.isActive('link')
    // in the template: moving focus to the sheet's <input> can leave the
    // editor's selection collapsed/without marks by the time of the next
    // render, which would wrongly hide the Remove button for an existing
    // link - exactly the "don't trust selection after blur" risk this sheet
    // exists to guard against elsewhere too.
    const linkEditorHadLink = ref(false);

    const openLinkEditor = () => {
      linkInput.value = editor.value?.getAttributes('link').href || '';
      linkEditorHadLink.value = editor.value?.isActive('link') ?? false;
      if (editor.value) {
        const { from, to } = editor.value.state.selection;
        linkRangeTracker = trackRange(editor.value, { from, to });
      }
      linkEditorOpen.value = true;
    };

    const closeLinkEditor = () => {
      linkEditorOpen.value = false;
      linkInput.value = '';
      linkEditorHadLink.value = false;
      linkRangeTracker?.stop();
      linkRangeTracker = null;
    };

    const restoreLinkSelection = () => {
      if (!editor.value || !linkRangeTracker) return;
      const range = linkRangeTracker.resolve();
      editor.value.chain().focus().setTextSelection(range).run();
    };

    const removeLink = () => {
      restoreLinkSelection();
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
      restoreLinkSelection();
      editor.value?.chain().focus().extendMarkRange('link').setLink({ href }).run();
      closeLinkEditor();
    };

    /**
     * How far the on-screen keyboard currently pushes up from the bottom of
     * the layout viewport (0 when it's closed or on a device with no
     * `visualViewport`). The mobile link-editor and slash-command sheets are
     * `position: fixed; bottom: 0` and add this as extra bottom offset, so
     * they track the keyboard directly instead of depending on whatever
     * scroll adjustment the browser makes on its own when an input inside
     * them gets focused.
     */
    const keyboardInset = ref(0);
    const updateKeyboardInset = () => {
      const vv = window.visualViewport;
      keyboardInset.value = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
    };
    onMounted(() => {
      updateKeyboardInset();
      window.visualViewport?.addEventListener('resize', updateKeyboardInset);
      window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
    });
    onBeforeUnmount(() => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
    });

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

    // Same as pressing Escape (backdrop tap / the sheet's own close button
    // have no keyboard to send that through) - the caret stays inside the
    // typed "/query", so slashDismissed stops the very next keystroke from
    // reopening the menu the instant it closes.
    const cancelSlashMenu = () => {
      slashDismissed = true;
      closeSlashMenu();
    };

    const selectSlashItem = (index: number) => {
      const item = slashItems.value[index];
      if (!item || !slashCommand) return;
      slashCommand(item);
    };

    const isMobileEditorLayout = () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 760px)').matches;

    const slashController: SlashMenuController = {
      onOpen: (render) => {
        slashDismissed = false;
        applySlashRender(render);
        // On mobile the menu IS the primary UI once "/" is typed - the
        // keyboard has nothing left to do (no further typing is expected;
        // the user taps an item) and just covers the sheet, so it's closed
        // here rather than left open underneath. Each item's own run()
        // already calls .chain().focus() when applying a command, which
        // reopens the keyboard exactly when the chosen block needs typing.
        if (isMobileEditorLayout()) editor.value?.view.dom.blur();
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

    /**
     * The arrow keys move `slashIndex`/`mentionIndex` past the popup's own
     * `max-height`/`overflow-y: auto` window without touching scroll at all,
     * so the highlight can walk off the visible area while the popup itself
     * stays put. `block: 'nearest'` only moves the popup (its own nearest
     * scrollable ancestor), never the page.
     */
    const scrollHighlightedIntoView = async (selector: string) => {
      await nextTick();
      document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
    };

    watch(slashIndex, () => {
      const item = slashItems.value[slashIndex.value];
      if (item) void scrollHighlightedIntoView(`[data-slash-item="${item.id}"]`);
    });

    /**
     * MENTION MENU state, structurally the same as the slash menu above
     * (own popup ref set, own `command` kept from the suggestion plugin's
     * render props) but for `@`: the item list is an async search rather
     * than a fixed table, and the LAST item is always "create page named
     * ...", carrying the typed text.
     */
    const mentionOpen = ref(false);
    const mentionItems = ref<MentionMenuItem[]>([]);
    const mentionIndex = ref(0);
    const mentionRect = ref<{ top: number; left: number } | null>(null);
    let mentionCommand: ((item: MentionMenuItem) => void) | null = null;
    let mentionDismissed = false;

    const mentionMenuStyle = computed(() =>
      mentionRect.value
        ? { top: `${mentionRect.value.top}px`, left: `${mentionRect.value.left}px` }
        : undefined,
    );

    const applyMentionRender = (render: MentionMenuRender) => {
      mentionItems.value = render.items;
      mentionIndex.value = 0;
      mentionCommand = render.command;
      mentionRect.value = render.rect
        ? { top: render.rect.bottom + 6, left: render.rect.left }
        : null;
      mentionOpen.value = !mentionDismissed;
    };

    const closeMentionMenu = () => {
      mentionOpen.value = false;
      mentionItems.value = [];
      mentionIndex.value = 0;
      mentionCommand = null;
    };

    const selectMentionItem = (index: number) => {
      const item = mentionItems.value[index];
      if (!item || !mentionCommand) return;
      mentionCommand(item);
    };

    const mentionController: MentionMenuController = {
      onOpen: (render) => {
        mentionDismissed = false;
        applyMentionRender(render);
      },
      onUpdate: (render) => applyMentionRender(render),
      onClose: () => {
        mentionDismissed = false;
        closeMentionMenu();
      },
      onKeyDown: (event) => {
        if (!mentionOpen.value) return false;
        const total = mentionItems.value.length;
        if (event.key === 'Escape') {
          mentionDismissed = true;
          closeMentionMenu();
          return true;
        }
        if (event.key === 'ArrowDown') {
          if (total) mentionIndex.value = (mentionIndex.value + 1) % total;
          return true;
        }
        if (event.key === 'ArrowUp') {
          if (total) mentionIndex.value = (mentionIndex.value - 1 + total) % total;
          return true;
        }
        if (event.key === 'Enter') {
          selectMentionItem(mentionIndex.value);
          return true;
        }
        return false;
      },
    };

    watch(mentionIndex, () => {
      const item = mentionItems.value[mentionIndex.value];
      if (!item) return;
      const value = item.kind === 'document' ? item.id : 'create';
      void scrollHighlightedIntoView(`[data-mention-item="${value}"]`);
    });

    /** Powers the picker's search. Server-side filtered to what this user can read (R2) - no client-side widening. */
    const searchMentionCandidates = async (query: string) => {
      if (!canEditContent.value) return [];
      try {
        const result = await textDocuments.search(query);
        return result.items.map((item: any) => ({ id: item.id, title: item.title }));
      } catch {
        // A failed search still leaves the "Create page ..." row: see
        // buildMentionMenuItems, which always appends it.
        return [];
      }
    };

    /**
     * CREATE PAGE FROM A MENTION (front task 8, spec §7.1).
     *
     * Order is load-bearing: the sibling page is created FIRST, the mention is
     * committed into THIS document SECOND, and only then does navigation
     * happen. Reversing steps one and two would leave a stray "@query" behind
     * if creation failed; reversing two and three would land the user on the
     * new page while this one still shows the raw typed text - the mention
     * they just made would look like it never happened.
     *
     * `pendingMentionCreate` is kept as the pre-task-8 seam: still set
     * immediately (still what TextDocumentView.mentionMenu.test.ts's "emits
     * its intent" case asserts), it is not this flow's success signal.
     */
    const pendingMentionCreate = ref<{ query: string } | null>(null);

    /**
     * Same folder as the document being edited, with the same fallback
     * `continueInNewPage` already uses above: a document can sit in a folder
     * somebody else owns, and a brand new document cannot always be filed
     * there. Landing at the root and saying so beats refusing the mention
     * entirely.
     */
    async function createMentionSiblingPage(pageTitle: string) {
      try {
        return await textDocuments.create({ title: pageTitle, folderId: folderId.value });
      } catch (e: any) {
        const filingRefused =
          folderId.value && e instanceof ApiError && (e.status === 403 || e.status === 404);
        if (!filingRefused) throw e;
        showToast(t('mentionCreatedOutsideFolder'), 'error');
        return await textDocuments.create({ title: pageTitle });
      }
    }

    const handleMentionCreatePage = async (query: string, context: { editor: Editor; range: Range }) => {
      pendingMentionCreate.value = { query };
      if (!canEditContent.value) return;
      const newTitle = query.trim() || t('untitledDocument');

      /**
       * `context.range` is two plain numbers, valid only as of THIS instant.
       * This is a COLLABORATIVE editor (Collaboration/CollaborationCursor are
       * configured on this same `editor` below): a co-editor's keystroke
       * landing ANYWHERE earlier in the document while `createMentionSiblingPage`
       * awaits the network shifts every position after it - with no action
       * required from the person who typed "@query" here. Trusting the raw
       * numbers after the `await` would delete whatever now happens to sit at
       * those offsets, not necessarily the query text at all: silently
       * deleting a collaborator's freshly-typed sentence.
       *
       * Every transaction dispatched on this editor between now and the
       * moment the range is actually used is folded into one running
       * `Mapping` (see `trackRange` in text-documents/preserve-range.ts,
       * shared with the mobile link-editor and slash-command flows), and the
       * range is mapped through it right before use rather than trusted as
       * captured. Re-deriving the range by searching for the query text
       * instead was rejected: two identical strings in one paragraph would
       * make that wrong in a different way.
       */
      const rangeTracker = trackRange(context.editor, context.range);

      try {
        const created = await createMentionSiblingPage(newTitle);
        const mappedRange = rangeTracker.resolve();
        rangeTracker.stop();
        // Committed into THIS document before anything about navigation runs.
        insertMentionAtRange(context.editor, mappedRange, { id: created.id, label: newTitle });
        const target = created.slug || created.id;
        // `mentionFocus` is read once by the freshly-mounted instance the path
        // change below produces (view-remount.ts keys the text-document view
        // on `route.path`) - see `shouldFocusAfterMentionCreate` near `load()`.
        await router.push({ name: 'text-document', params: { id: target }, query: { mentionFocus: '1' } });
      } catch (e: any) {
        rangeTracker.stop();
        // Nothing was deleted and nothing was inserted above: the typed
        // "@query" text is exactly what it was before this ran.
        showToast(e?.message || t('mentionCreatePageFailed'), 'error');
      }
    };

    /**
     * TITLE RESOLUTION AND STALENESS (front task 9).
     *
     * `label` on a mention node is a snapshot from insert time; the CURRENT
     * title is authoritative. This map is the live source `mention-node.ts`'s
     * node view reads through `resolveMention` - mutated in place (like
     * `headingCollapseLabels` above) rather than replaced, and repainting is
     * forced afterwards by dispatching a no-op transaction, which is the hook
     * ProseMirror gives every custom node view's `update()` on every
     * transaction regardless of whether ITS node changed (see the comment on
     * `addNodeView` in mention-node.ts).
     */
    const mentionResolutions = new Map<string, MentionResolution>();
    const resolveMentionTitle = (id: string) => mentionResolutions.get(id);

    async function loadMentionResolutions() {
      try {
        const result = await textDocuments.mentions(resolvedId.value);
        mentionResolutions.clear();
        for (const item of result.items) mentionResolutions.set(item.id, item);
      } catch {
        // Resolution not loaded: mention-node.ts falls back to each node's
        // stored label rather than an empty mention or a spinner.
        return;
      } finally {
        // Force every existing mention node view to repaint from the map
        // just written, even though no document content changed.
        // Guarded as one lookup, not `editor.value?.view.dispatch(...)`: the
        // fetch can resolve after the view has been destroyed (component
        // unmounted, `.view` gone but `editor.value` itself still set), and
        // evaluating `.state.tr` on a destroyed view is its own crash.
        const view = editor.value?.view;
        if (view) view.dispatch(view.state.tr);
      }
    }

    /**
     * FOCUS AFTER NAVIGATING FROM A MENTION-CREATED PAGE (front task 8).
     *
     * There is no existing "focus after navigation" pattern in this app to
     * reuse. Text documents remount on every path change - view-remount.ts
     * keys this view on `route.path` specifically so the editor, the Y.Doc
     * and the socket get rebuilt for the new document rather than reused -
     * which makes this tractable: the new page is a brand new component
     * instance, and this reads its OWN `route.query.mentionFocus` once, at
     * setup time (never re-read later, so it cannot re-fire on a later
     * `load()` such as the reload `handleReject` triggers after a conflict).
     *
     * The flag is consumed after `load()` has put the document's actual
     * content into the editor, not before: focusing any earlier would move
     * the caret into a still-empty editor moments before the Yjs snapshot
     * lands.
     */
    const shouldFocusAfterMentionCreate = route.query?.mentionFocus === '1';
    let mentionCreateFocusConsumed = false;
    /** `preferredId` is `load()`'s own canonical id (slug if it has one) - the same value its own canonicalising `router.replace` uses. */
    function focusAfterMentionCreateIfPending(preferredId: string) {
      if (!shouldFocusAfterMentionCreate || mentionCreateFocusConsumed) return;
      if (!canEditContent.value) return;
      mentionCreateFocusConsumed = true;
      void nextTick(() => {
        editor.value?.chain().focus('end').run();
      });
      // One-shot flag, consumed: stripped so it cannot linger in a URL that
      // gets shared or bookmarked.
      const { mentionFocus: _mentionFocus, ...restQuery } = route.query || {};
      router.replace({ name: 'text-document', params: { id: preferredId }, query: restQuery }).catch(() => {});
    }

    const navigateToMention = (id: string) => {
      router.push({ name: 'text-document', params: { id } }).catch(() => {});
    };

    /**
     * The access-request seam (ruling R3), now wired to AccessRequestDialog.vue
     * (front task 11) - shared by an inaccessible MENTION click
     * (mention-node.ts's `onInaccessibleClick`) and an inaccessible BACKLINK
     * click (`onBacklinkClick` below): same disclosure rule, same dialog,
     * one seam.
     */
    const pendingMentionAccessRequest = ref<{ id: string; label: string } | null>(null);
    const handleMentionInaccessibleClick = (payload: { id: string; label: string }) => {
      pendingMentionAccessRequest.value = payload;
    };

    /**
     * BACKLINKS (front task 10). `backlinksLoaded` gates the template so an
     * empty array default is never rendered as "no backlinks" before the
     * fetch has actually resolved - the same false-empty-flash concern
     * `loadMentionResolutions` doesn't have to worry about (it repaints
     * existing nodes rather than gating a v-if).
     */
    const backlinks = ref<BacklinkItem[]>([]);
    const backlinksLoaded = ref(false);
    const backlinksIcon = lucideIcon(EDITOR_GLYPHS.link);

    async function loadBacklinks() {
      try {
        const result = await textDocuments.backlinks(resolvedId.value);
        backlinks.value = result.items;
      } catch {
        // Same fallback as loadMentionResolutions: an empty list, not a
        // crash and not a stale one left showing.
        backlinks.value = [];
      } finally {
        backlinksLoaded.value = true;
      }
    }

    /** Accessible source: navigate, same as an accessible mention. Inaccessible: same dialog seam as a mention (R3/R4). */
    const onBacklinkClick = (item: BacklinkItem) => {
      if (item.accessible) {
        navigateToMention(item.id);
        return;
      }
      handleMentionInaccessibleClick({ id: item.id, label: item.title });
    };

    const mentionNodeLabels = { inaccessible: '', deleted: '' };
    const paintMentionNodeLabels = () => {
      mentionNodeLabels.inaccessible = t('mentionInaccessibleTooltip');
      mentionNodeLabels.deleted = t('mentionDeletedTooltip');
    };
    paintMentionNodeLabels();
    watch(locale, paintMentionNodeLabels);

    /**
     * CAPACITY.
     *
     * The ceiling is enforced HERE and nowhere else. A text document is a Yjs
     * CRDT: an update the server has received was already applied by the
     * client that sent it, so a server-side refusal cannot take the block
     * back - it only leaves that client with a document nobody else has. The
     * guard filters the transaction before the editor applies it, which is
     * the last moment at which "no" is still free.
     *
     * `blockCount` follows the document rather than the keyboard, so it is
     * right after a collaborator's edit and after the initial state loads.
     * The limit and the threshold both come from the shared contract; the
     * threshold is never written down here.
     */
    const capacityLimit = MAX_TOP_LEVEL_BLOCKS;
    const blockCount = ref(0);
    const continuingPage = ref(false);
    const refreshBlockCount = () => {
      blockCount.value = editor.value?.state?.doc?.childCount ?? blockCount.value;
    };
    const capacityNotice = computed(() => {
      const level = capacityLevel(blockCount.value, capacityLimit);
      if (level === 'ok') return null;
      return { level, text: level === 'full' ? t('capacityFull') : t('capacityNearlyFull') };
    });
    // A refused keystroke can repeat as fast as a held Enter key; the banner
    // is the standing explanation and the toast only has to be noticed once.
    let lastCapacityToastAt = 0;
    const onCapacityBlocked = () => {
      refreshBlockCount();
      const now = Date.now();
      if (now - lastCapacityToastAt < 2000) return;
      lastCapacityToastAt = now;
      showToast(t('capacityBlocked'), 'error');
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
        // Adds `collapsed` to StarterKit's own heading node (see the file
        // comment in collapsible-heading.ts for why this is a global
        // attribute and not a second heading node).
        CollapsibleHeading.configure({ labels: headingCollapseLabels }),
        TableOfContents.configure({ labels: tableOfContentsLabels }),
        SlashMenu.configure({
          controller: slashController,
          label: slashLabel,
          // The image item cannot insert a node on its own: the file
          // has to be uploaded first, so it reuses the toolbar's picker.
          requestImage: () => openImagePicker(),
        }),
        Mention.configure({
          resolveMention: resolveMentionTitle,
          onNavigate: navigateToMention,
          onInaccessibleClick: handleMentionInaccessibleClick,
          labels: mentionNodeLabels,
        }),
        MentionMenu.configure({
          controller: mentionController,
          search: searchMentionCandidates,
          onCreatePage: (query, context) => void handleMentionCreatePage(query, context),
        }),
        NodeRange,
        DragHandle.configure({
          render: renderDragHandle,
          tippyOptions: { offset: [0, 8] },
          // The 8px offset above is tuned for an ordinary block. A heading
          // reserves its own -28px slot for the collapse chevron
          // (.text-doc-heading-toggle in style.css), which the handle would
          // otherwise land right on top of, so nudge it further left there.
          onNodeChange: ({ node }) => {
            if (!dragHandleElement) return;
            dragHandleElement.classList.toggle('text-doc-drag-handle--heading', node?.type.name === 'heading');
          },
        }),
        // Refuses a transaction that would add a top-level block past the
        // ceiling, and NOTHING else - never a Yjs transaction, never an edit
        // or a deletion. See capacity-guard.ts.
        CapacityGuard.configure({ limit: capacityLimit, onBlocked: onCapacityBlocked }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider: awarenessProvider,
          user: {
            name: currentUser.value?.name || currentUser.value?.email || 'Guest',
            color: '#50d1b2',
          },
        }),
      ],
      onCreate: () => refreshBlockCount(),
      // Fires for a remote collaborator's change as well as this user's, so
      // the count is the document's, not this keyboard's.
      onUpdate: () => refreshBlockCount(),
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
        refreshBlockCount();
        focusAfterMentionCreateIfPending(preferred);
        void loadMentionResolutions();
        // Only reached once `textDocuments.get` above has succeeded - i.e.
        // the caller can read THIS document. Backlinks are not a side
        // channel around that check: moving this call earlier (or into the
        // catch branch below) would fetch them for a document the reader
        // was just refused.
        void loadBacklinks();
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
          gatePasswordAccessEnabled.value = (e as ApiError).body?.passwordAccessEnabled;
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

    async function loginWithDocumentPassword(password: string) {
      checkingResourcePassword.value = true;
      try {
        const result = await auth.resourcePasswordLogin({
          resourceType: 'text-document',
          resourceId: resolvedId.value,
          password,
        });
        setToken(result.token, result.user?.role || 'user', result.user?.accessMode || 'resource-password', result.user);
        await load();
      } catch (e: any) {
        showToast(e.message || t('accessGateInvalidPassword'), 'error');
      } finally {
        checkingResourcePassword.value = false;
      }
    }

    async function requestDocumentAccess(requestedRole: 'read' | 'edit') {
      if (!isAuthenticated()) {
        showToast(t('accessGateLoginRequired'), 'error');
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({ resourceType: 'text-document', resourceId: resolvedId.value, requestedRole });
        accessRequestSent.value = true;
        showToast(t('accessGateRequestSentToast'), 'success');
      } catch (e: any) {
        showToast(e.message || t('accessGateRequestFailed'), 'error');
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

    /** Escapes text that is about to be interpolated into imported html. */
    function escapeHtmlText(value: string) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /**
     * Writes the "continues in ..." link as the last block of THIS document.
     *
     * This is the one transaction allowed past the ceiling, and it has to be:
     * the document is full precisely when the user needs it, and a document
     * that cannot record where it continues leaves the two pages permanently
     * unconnected - a worse outcome than one block over the line.
     */
    function insertContinuationLink(href: string, text: string) {
      const instance = editor.value;
      if (!instance) return;
      instance
        .chain()
        .command(({ tr }: any) => {
          tr.setMeta(CAPACITY_OVERRIDE_META, true);
          return true;
        })
        .insertContentAt(instance.state.doc.content.size, {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'link', attrs: { href } }], text }],
        })
        .run();
      refreshBlockCount();
    }

    /**
     * CONTINUE ON A NEW PAGE - user-initiated, always.
     *
     * Automatic splitting was rejected: choosing a seam in a document two
     * people are typing in is a guess, and moving blocks in a CRDT while a
     * collaborator edits them is how content goes missing. So this creates an
     * EMPTY page, links the two together in both directions, and moves
     * nothing at all.
     */
    async function continueInNewPage() {
      if (!canEditContent.value || continuingPage.value) return;
      continuingPage.value = true;
      try {
        const currentTitle = title.value || t('untitledDocument');
        const newTitle = `${currentTitle} (${t('capacityContinuedSuffix')})`;
        let created: any;
        try {
          // Same folder as this document, per the flow's own definition.
          created = await textDocuments.create({ title: newTitle, folderId: folderId.value });
        } catch (e: any) {
          // A document can sit in a folder somebody else owns, and a new
          // document cannot be filed there. Landing at the root and saying so
          // beats refusing the only way out of a full document.
          const filingRefused =
            folderId.value && e instanceof ApiError && (e.status === 403 || e.status === 404);
          if (!filingRefused) throw e;
          created = await textDocuments.create({ title: newTitle });
          showToast(t('capacityContinuedOutsideFolder'), 'error');
        }
        const target = created.slug || created.id;
        const here = slug.value || resolvedId.value;
        // The back link is the new page's ENTIRE content: nothing is moved.
        await textDocuments.replaceContent(created.id, {
          html:
            `<p><a href="/docs/${encodeURIComponent(here)}">` +
            `${escapeHtmlText(`${t('capacityContinuedFrom')} ${currentTitle}`)}</a></p>`,
        });
        insertContinuationLink(`/docs/${target}`, `${t('capacityContinuesIn')} ${newTitle}`);
        showToast(t('capacityContinueCreated'), 'success');
        // Safe to leave now: `insertContinuationLink` above dispatched
        // synchronously, so the ydoc 'update' handler has already handed the
        // link's Yjs update to the socket. Navigating (and the unmount that
        // disconnects) happens after that, not before it.
        await router.push({ name: 'text-document', params: { id: target } });
      } catch (e: any) {
        showToast(e?.message || t('capacityContinueFailed'), 'error');
      } finally {
        continuingPage.value = false;
      }
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
        refreshBlockCount();
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
      slashOpen,
      slashItems,
      slashIndex,
      slashMenuStyle,
      selectSlashItem,
      cancelSlashMenu,
      SLASH_MENU_ITEMS,
      mentionOpen,
      mentionItems,
      mentionIndex,
      mentionMenuStyle,
      selectMentionItem,
      pendingMentionCreate,
      pendingMentionAccessRequest,
      backlinks,
      backlinksLoaded,
      backlinksIcon,
      onBacklinkClick,
      mentionDocumentIcon: lucideIcon(EDITOR_GLYPHS.fileText),
      mentionCreateIcon: lucideIcon(EDITOR_GLYPHS.filePlus),
      linkEditorOpen,
      linkEditorHadLink,
      linkInput,
      keyboardInset,
      bubbleMarkButtons,
      bubbleShouldShow,
      applyBubbleMark,
      openLinkEditor,
      closeLinkEditor,
      applyLink,
      removeLink,
      linkIcon: LINK_ICON,
      unlinkIcon: UNLINK_ICON,
      capacityIcon: lucideIcon(EDITOR_GLYPHS.triangleAlert),
      continuePageIcon: lucideIcon(EDITOR_GLYPHS.filePlus),
      capacityLimit,
      blockCount,
      capacityNotice,
      continuingPage,
      continueInNewPage,
      backTarget,
      imageInput,
      uploadingImage,
      openImagePicker,
      onImageSelected,
      onEditorPaste,
      onEditorDrop,
      loading, cacheStatus,
      accessDenied,
      gatePasswordAccessEnabled,
      title,
      route,
      currentUser,
      role,
      revision,
      currentRevision,
      canEditContent,
      editor,
      // Testing seam only: tippy takes ownership of this element and moves
      // it in and out of an unattached popper, so `document.querySelector`
      // cannot reliably find it - reading the closure directly is the only
      // stable way to reach it.
      getDragHandleElement: () => dragHandleElement,
      connected,
      pendingUpdatesCount,
      syncStatus,
      showShare,
      docMenuOpen,
      docMenuStyle,
      toggleDocMenu,
      closeDocMenu,
      openAccessFromDocMenu,
      openHistoryFromDocMenu,
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
      checkingResourcePassword,
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
