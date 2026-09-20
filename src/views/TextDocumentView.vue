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
      <!--
        Title used to live here as an input/span; it's now the page's own
        first element (see .text-doc-title-block inside .text-doc-paper
        below) so the header holds only chrome, never document content -
        matching Notion's own split between "page title" and "app bar".
      -->
      <header class="text-doc-topbar">
        <router-link :to="backTarget.to" class="btn-ghost text-doc-back-btn" :aria-label="backTarget.label" :title="backTarget.label">
          <ArrowLeft :size="18" aria-hidden="true" />
        </router-link>
        <div class="text-doc-topbar-actions">
          <button
            v-if="canEditContent"
            type="button"
            class="btn-ghost text-doc-undo-btn"
            :disabled="!canUndo"
            :title="t('undo')"
            :aria-label="t('undo')"
            @click="undoEdit"
          ><Undo2 :size="17" aria-hidden="true" /></button>
          <button
            v-if="canEditContent"
            type="button"
            class="btn-ghost text-doc-redo-btn"
            :disabled="!canRedo"
            :title="t('redo')"
            :aria-label="t('redo')"
            @click="redoEdit"
          ><Redo2 :size="17" aria-hidden="true" /></button>
          <!-- Desktop sidebar has its own collapse/expand arrow now (see
               .text-doc-outline-collapse-toggle below) - this header button
               stays only for the narrower breakpoints, where there is no
               sidebar to put one inside (tablet-width drawer, and mobile via
               the "⋮" popover entry further down). -->
          <button
            v-if="!outlineIsDesktop"
            type="button"
            class="btn-ghost text-doc-outline-btn"
            :class="{ active: outlinePanelOpen }"
            :title="outlineLabels.toggle"
            :aria-label="outlineLabels.toggle"
            :aria-pressed="outlinePanelOpen"
            @click="toggleOutlinePanel"
          ><ListTree :size="17" aria-hidden="true" /></button>
          <button v-if="role === 'owner'" class="btn-ghost btn-sm text-doc-access-btn" @click="showShare = !showShare">{{ t('share') }}</button>
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
                <button type="button" class="text-doc-menu-item" @click="toggleOutlinePanelFromDocMenu">{{ outlineLabels.toggle }}</button>
                <button v-if="role === 'owner'" type="button" class="text-doc-menu-item" @click="openAccessFromDocMenu">{{ t('share') }}</button>
                <button type="button" class="text-doc-menu-item" @click="openHistoryFromDocMenu">{{ t('history') }}</button>
                <button type="button" class="text-doc-menu-item" @click="copyDocumentLinkFromDocMenu">{{ t('copyLink') }}</button>
              </div>
            </Teleport>
          </div>
        </div>
      </header>
      <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>

      <!--
        SHARE SHEET (front task 7/8/9). One markup for both breakpoints - the
        mobile media query turns this into a bottom sheet (vertical sections,
        full-width controls, safe-area, backdrop) while desktop keeps a
        floating panel; both now share the same outside-tap/Escape-to-close
        backdrop primitive already used by AccountMenu.vue and the dashboard's
        tag sheet, per the "use the existing primitive" rule (front task 6).
      -->
      <Teleport to="body">
        <div v-if="showShare && role === 'owner'" class="text-doc-share-backdrop" @click="closeShare"></div>
        <section
          v-if="showShare && role === 'owner'"
          class="share-panel text-doc-share-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="t('shareDocumentTitle')"
          @keydown.esc.stop="closeShare"
          @click.stop
        >
          <div class="text-doc-share-grabber" aria-hidden="true"></div>
          <div class="share-panel-header">
            <h3>{{ t('shareDocumentTitle') }}</h3>
            <button type="button" class="text-doc-share-close" :aria-label="t('close')" @click="closeShare"><X :size="16" aria-hidden="true" /></button>
          </div>

          <div class="share-panel-body">
            <div class="share-section">
              <div class="share-section-title">{{ t('generalAccessSection') }}</div>
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
              <label class="share-checkbox">
                <input type="checkbox" v-model="passwordAccessEnabled" />
                <span>{{ t('enablePasswordAccess') }}</span>
              </label>
              <div v-if="passwordAccessEnabled" class="share-form share-password-form">
                <input v-model="passwordAccessPassword" type="password" :placeholder="t('newPasswordPlaceholder')" />
                <select v-model="passwordAccessRole">
                  <option value="read">{{ t('canView') }}</option>
                  <option value="edit">{{ t('canEdit') }}</option>
                </select>
                <button type="button" class="btn-primary" @click="savePasswordAccess">{{ t('save') }}</button>
              </div>
            </div>

            <div class="share-section-divider" aria-hidden="true"></div>

            <div class="share-section">
              <div class="share-section-title">{{ t('shareLinkSection') }}</div>
              <button
                type="button"
                class="share-link-row"
                :class="{ 'share-link-row-copied': linkRowCopied }"
                :aria-label="t('copyLink')"
                @click="copyDocumentLinkFromRow"
              >
                <Link2 :size="15" class="share-link-icon" aria-hidden="true" />
                <span class="share-link-url" :title="documentUrl">{{ documentUrl }}</span>
                <span v-if="linkRowCopied" class="share-link-copied">
                  <Check :size="15" aria-hidden="true" /> {{ t('copied') }}
                </span>
                <Copy v-else :size="15" class="share-link-copy-icon" aria-hidden="true" />
              </button>
            </div>

            <div class="share-section">
              <div class="share-section-title">{{ t('customLinkSection') }}</div>
              <div class="slug-row">
                <span class="slug-prefix">/docs/</span>
                <input
                  v-model="slugInput"
                  class="slug-input"
                  placeholder="my-document"
                  spellcheck="false"
                  autocapitalize="off"
                  autocomplete="off"
                  @keydown.enter.prevent="saveSlug"
                />
              </div>
              <div v-if="slugError || slugFormatError" class="slug-error" role="alert">{{ slugError || slugFormatError }}</div>
              <div v-else class="slug-hint">{{ t('slugHint') }}</div>
              <button type="button" class="btn-primary share-save-slug-btn" :disabled="savingSlug || !!slugFormatError" @click="saveSlug">{{ t('save') }}</button>
            </div>

            <div class="share-section-divider" aria-hidden="true"></div>

            <div class="share-section">
              <div class="share-section-title">{{ t('invitePeople') }}</div>
              <div class="share-form">
                <input v-model.trim="shareEmail" :placeholder="t('email')" type="email" />
                <select v-model="shareRole">
                  <option value="read">{{ t('canView') }}</option>
                  <option value="edit">{{ t('canEdit') }}</option>
                </select>
                <button type="button" class="btn-primary share-invite-btn" @click="doShare">{{ t('inviteBtn') }}</button>
              </div>
              <div v-if="permissions.length" class="share-list">
                <div v-for="p in permissions" :key="p.id" class="share-item">
                  <span>{{ p.user?.email || p.userId }}</span>
                  <span class="share-item-role">{{ p.role === 'edit' ? t('canEdit') : t('canView') }}</span>
                  <button type="button" :aria-label="t('delete')" @click="doRevoke(p.userId)">x</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Teleport>

      <!-- History (front task 6): same missing-outside-close gap the Share
           panel had, fixed the same way (backdrop + window Escape listener). -->
      <Teleport to="body">
        <div v-if="showHistory" class="text-doc-share-backdrop" @click="closeHistory"></div>
        <section v-if="showHistory" class="html-history-panel text-doc-history-panel" role="dialog" aria-modal="true" :aria-label="t('history')" @click.stop>
          <div class="html-history-list">
            <div class="html-history-head">
              <strong>{{ t('history') }}</strong>
              <button class="btn-ghost btn-sm" @click="closeHistory">x</button>
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
      </Teleport>

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

      <!--
        OUTLINE PANEL (auto-generated, separate from the manually-inserted
        `tableOfContents` block below). Desktop: a persistent sidebar
        alongside .text-doc-editor-shell, in a shared flex row so the shell
        re-centers itself in whatever space remains (see .text-doc-body's own
        CSS comment). Mobile/narrow: no sidebar at all - see the Teleported
        drawer variant further down, opened by the header button instead.
      -->
      <div class="text-doc-body">
        <aside
          v-if="outlineIsDesktop"
          class="text-doc-outline-panel"
          :class="{ 'text-doc-outline-panel-collapsed': !outlinePanelOpen, 'text-doc-outline-panel-resizing': outlineResizing }"
          :style="outlinePanelOpen ? { width: outlineWidth + 'px', flexBasis: outlineWidth + 'px' } : {}"
          :aria-label="outlineLabels.title"
        >
          <div v-if="outlinePanelOpen" class="text-doc-outline-panel-inner">
            <div class="text-doc-outline-panel-title">{{ outlineLabels.title }}</div>
            <ol v-if="outlineVisibleRows.length" class="text-doc-outline-list">
              <li
                v-for="row in outlineVisibleRows"
                :key="row.entry.id"
                class="text-doc-outline-item"
                :data-level="row.entry.level"
              >
                <!-- @mousedown.stop so grabbing the chevron never also fires
                     the link's own @mousedown.prevent navigation right next
                     to it - they are siblings, not nested, precisely so a
                     chevron click can never bubble into "navigate". -->
                <button
                  v-if="row.hasChildren"
                  type="button"
                  class="text-doc-outline-chevron"
                  :title="outlineCollapsedSections.has(row.entry.id) ? outlineLabels.expandSection : outlineLabels.collapseSection"
                  :aria-label="outlineCollapsedSections.has(row.entry.id) ? outlineLabels.expandSection : outlineLabels.collapseSection"
                  :aria-expanded="!outlineCollapsedSections.has(row.entry.id)"
                  @mousedown.stop.prevent="toggleOutlineSection(row.entry.id)"
                ><ChevronRight v-if="outlineCollapsedSections.has(row.entry.id)" :size="13" aria-hidden="true" /><ChevronDown v-else :size="13" aria-hidden="true" /></button>
                <span v-else class="text-doc-outline-chevron-spacer" aria-hidden="true"></span>
                <button
                  type="button"
                  class="text-doc-outline-link"
                  @mousedown.prevent="navigateFromOutline(row.entry.pos)"
                  @mouseenter="onOutlineLinkHover($event)"
                >
                  {{ row.entry.text || outlineLabels.empty }}
                </button>
              </li>
            </ol>
            <div v-else class="text-doc-outline-empty">{{ outlineLabels.empty }}</div>
          </div>
          <div
            v-if="outlinePanelOpen"
            class="text-doc-outline-resize-handle"
            @mousedown="startOutlineResize"
            @dblclick="resetOutlineWidth"
          ></div>
          <button
            type="button"
            class="text-doc-outline-collapse-toggle"
            :title="outlinePanelOpen ? outlineLabels.hide : outlineLabels.show"
            :aria-label="outlinePanelOpen ? outlineLabels.hide : outlineLabels.show"
            :aria-pressed="!outlinePanelOpen"
            @click="toggleOutlinePanel"
          ><ChevronLeft v-if="outlinePanelOpen" :size="15" aria-hidden="true" /><ChevronRight v-else :size="15" aria-hidden="true" /></button>
        </aside>

      <main class="text-doc-editor-shell">
        <article
          class="text-doc-paper"
          :class="{ readonly: !canEditContent }"
          @click="focusEditor($event)"
          @paste="onEditorPaste"
          @drop="onEditorDrop"
          @dragover.prevent
        >
          <!--
            TITLE AS THE PAGE'S FIRST ELEMENT (front task: title placement).
            Deliberately NOT a ProseMirror node: `title` stays a plain document
            field (see load()/saveTitle()), exactly as it already was in the
            header, so Dashboard/Recent/search - all of which read the
            document's `title` column, never editor content - keep working
            unchanged, and it never enters the Yjs doc (no CRDT conflict
            handling needed for it). @click.stop keeps a tap here from also
            reaching the paper's own focusEditor($event) handler, which would
            otherwise immediately steal focus back into the editor.
          -->
          <input
            v-if="canEditContent"
            v-model="title"
            class="text-doc-title-page-input"
            :placeholder="t('untitled')"
            :aria-label="t('documentTitle')"
            @blur="saveTitle"
            @keydown.enter.prevent="focusEditorStart"
            @click.stop
          />
          <h1 v-else class="text-doc-title-page-readonly" @click.stop>{{ title || t('untitledDocument') }}</h1>
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
          <button
            type="button"
            class="text-doc-backlinks-head"
            :aria-expanded="backlinksExpanded"
            aria-controls="text-doc-backlinks-panel"
            @click="toggleBacklinksExpanded"
          >
            <span class="text-doc-backlinks-icon" v-html="backlinksIcon" aria-hidden="true"></span>
            <span class="text-doc-backlinks-title">{{ t('backlinksTitle') }}</span>
            <span class="text-doc-backlinks-count" data-backlinks-count>{{ backlinks.length }}</span>
            <ChevronDown v-if="backlinksExpanded" class="text-doc-backlinks-chevron" :size="16" aria-hidden="true" />
            <ChevronRight v-else class="text-doc-backlinks-chevron" :size="16" aria-hidden="true" />
          </button>
          <div v-if="backlinksExpanded" id="text-doc-backlinks-panel" class="text-doc-backlinks-panel">
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
          </div>
        </section>
      </main>
      </div>

      <!--
        MOBILE/NARROW outline drawer - same backdrop+Escape primitive as the
        Share sheet and link editor sheet (front task 6's "use the existing
        primitive" rule), teleported for the same reason the doc-menu
        popover is: the topbar's own backdrop-filter makes it a stacking
        context, so a plain child z-index cannot win against it.
      -->
      <Teleport to="body">
        <div v-if="!outlineIsDesktop && outlineMobileOpen" class="text-doc-outline-drawer-backdrop" @click="closeOutlineMobile"></div>
        <div v-if="!outlineIsDesktop && outlineMobileOpen" class="text-doc-outline-drawer" role="dialog" :aria-label="outlineLabels.title">
          <div class="text-doc-outline-drawer-title">{{ outlineLabels.title }}</div>
          <ol v-if="outlineEntries.length" class="text-doc-outline-list">
            <li v-for="entry in outlineEntries" :key="entry.id" class="text-doc-outline-item" :data-level="entry.level">
              <button type="button" class="text-doc-outline-link" @mousedown.prevent="navigateFromOutline(entry.pos)">
                {{ entry.text || outlineLabels.empty }}
              </button>
            </li>
          </ol>
          <div v-else class="text-doc-outline-empty">{{ outlineLabels.empty }}</div>
        </div>
      </Teleport>

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

      <!--
        TABLE CONTROLS (front task 15). A second BubbleMenu instance, tiptap's
        own officially-supported pattern for a context-sensitive toolbar - no
        new positioning code, and it works the same on desktop and mobile
        (shown whenever the cursor is anywhere inside a table, not tied to a
        text selection like the formatting bubble above). Every button is a
        direct call into the table extension's own commands; nothing here
        touches the schema or the selection model itself.
      -->
      <BubbleMenu
        v-if="editor && canEditContent"
        class="text-doc-table-menu"
        :editor="editor"
        :should-show="tableMenuShouldShow"
        :tippy-options="{ duration: 100, placement: 'top', getReferenceClientRect: tableMenuGetReferenceClientRect }"
      >
        <button type="button" class="text-doc-table-btn" :title="t('tableAddRow')" :aria-label="t('tableAddRow')" @click="tableAddRow"><Rows3 :size="15" aria-hidden="true" /></button>
        <button type="button" class="text-doc-table-btn" :title="t('tableAddColumn')" :aria-label="t('tableAddColumn')" @click="tableAddColumn"><Columns3 :size="15" aria-hidden="true" /></button>
        <button type="button" class="text-doc-table-btn text-doc-table-btn-danger" :title="t('tableDeleteRow')" :aria-label="t('tableDeleteRow')" @click="tableDeleteRow"><Rows3 :size="15" aria-hidden="true" /></button>
        <button type="button" class="text-doc-table-btn text-doc-table-btn-danger" :title="t('tableDeleteColumn')" :aria-label="t('tableDeleteColumn')" @click="tableDeleteColumn"><Columns3 :size="15" aria-hidden="true" /></button>
        <button type="button" class="text-doc-table-btn text-doc-table-btn-danger" :title="t('tableDelete')" :aria-label="t('tableDelete')" @click="tableDeleteTable"><Trash2 :size="15" aria-hidden="true" /></button>
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
              :data-slash-item="item.id"
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
          :key="item.kind === 'document' ? item.id : item.kind === 'heading' ? `h-${item.headingId}` : 'create'"
          class="text-doc-mention-item"
          :class="{ active: index === mentionIndex }"
          :data-mention-item="item.kind === 'document' ? item.id : item.kind === 'heading' ? `h-${item.headingId}` : 'create'"
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
          <template v-else-if="item.kind === 'heading'">
            <span class="text-doc-mention-item-icon" v-html="mentionHeadingIcon"></span>
            <span class="text-doc-mention-item-label">{{ item.label || t('untitledHeading') }}</span>
          </template>
          <template v-else>
            <span class="text-doc-mention-item-icon" v-html="mentionCreateIcon"></span>
            <span class="text-doc-mention-item-label">{{ t('mentionCreatePagePrefix') }} "{{ item.query }}"</span>
          </template>
        </button>
        <div v-if="!mentionItems.length" class="text-doc-mention-empty">{{ t('mentionNoResults') }}</div>
      </div>

      <!--
        LINK TAP/CLICK ACTIONS (front task 4/5). One popover for both
        platforms - see editorProps.handleClick above for why. The backdrop
        is the same invisible-hit-target-plus-Escape-listener primitive as
        the Share sheet (front task 6): a plain click anywhere outside the
        popover closes it, Escape closes it from anywhere on the page.
      -->
      <div v-if="linkActionOpen" class="text-doc-link-action-backdrop" @click="closeLinkActionMenu"></div>
      <div
        v-if="linkActionOpen"
        class="text-doc-link-action-menu"
        :style="linkActionMenuStyle"
        role="menu"
        :aria-label="t('linkAdd')"
        @click.stop
      >
        <div class="text-doc-link-action-url">{{ linkActionHref }}</div>
        <div class="text-doc-link-action-buttons">
          <button type="button" class="text-doc-link-action-btn" @click="copyLinkActionHref">{{ t('linkCopy') }}</button>
          <button type="button" class="text-doc-link-action-btn" @click="editLinkAction">{{ t('linkEdit') }}</button>
          <button type="button" class="text-doc-link-action-btn text-doc-link-action-open" @click="openLinkActionHref">
            <ExternalLink :size="13" aria-hidden="true" />{{ t('linkOpen') }}
          </button>
        </div>
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
import { TableOfContents, type TableOfContentsLabels, documentOutline, focusHeading } from '../text-documents/table-of-contents';
import { HeadingId, ensureHeadingIds, findHeadingById, headingIdEntries } from '../text-documents/heading-id';
import { buildOutlineTree, clampOutlineWidth, flattenVisibleOutline } from '../text-documents/outline-tree';
import { HeadingLink } from '../text-documents/heading-link-node';
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
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import {
  MAX_TOP_LEVEL_BLOCKS,
  capacityLevel,
} from '../documents/document-capacity';
import { CAPACITY_OVERRIDE_META, CapacityGuard } from '../text-documents/capacity-guard';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { accessRequests, ApiError, auth, getCurrentUser, isAuthenticated, setToken, textDocuments, uploadImage, type BacklinkItem, type MentionResolution } from '../api/client';
import { getPublicOrigin } from '../api/public-origin';
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
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Copy, ExternalLink, Link2, ListTree, MoreVertical, Redo2, Rows3, Trash2, Undo2, X } from '@lucide/vue';

export default defineComponent({
  components: { AccountMenu, AccessRequestDialog, AccessGate, BubbleMenu, EditorContent, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Copy, ExternalLink, Link2, ListTree, MoreVertical, Redo2, Rows3, Trash2, Undo2, X },
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
    const closeShare = () => { showShare.value = false; };
    /**
     * ESCAPE (front task 6/23). The sheet is Teleport'd to <body>, so it and
     * its trigger button no longer share a DOM subtree - a template
     * `@keydown.esc` on the sheet only fires for a keypress while focus is
     * actually INSIDE it, which nothing here moves focus into. A window-level
     * listener, scoped to exactly while the sheet is open, is what closing on
     * Escape from anywhere on the page actually requires.
     */
    const onShareEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeShare();
    };
    watch(showShare, (open) => {
      if (open) window.addEventListener('keydown', onShareEscape);
      else window.removeEventListener('keydown', onShareEscape);
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', onShareEscape));
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
    const onDocMenuEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDocMenu();
    };
    watch(docMenuOpen, (open) => {
      if (open) window.addEventListener('keydown', onDocMenuEscape);
      else window.removeEventListener('keydown', onDocMenuEscape);
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', onDocMenuEscape));
    const openAccessFromDocMenu = () => { closeDocMenu(); showShare.value = !showShare.value; };
    const openHistoryFromDocMenu = () => { closeDocMenu(); void toggleHistory(); };

    /**
     * COPY LINK (front task 8/11). The custom slug if one is set, the
     * canonical id otherwise - the same precedence `load()` already uses to
     * canonicalise the URL bar (`slug.value || res.document.id`), so this is
     * never out of step with what the address bar itself shows. Available to
     * anyone who can read the document (not owner-gated like Share), both
     * from the doc-menu ("Copy link" item, task 11) and from the Share sheet
     * itself (task 8).
     *
     * getPublicOrigin(), not window.location.origin directly: inside the
     * packaged Android app this would otherwise be Capacitor's own internal
     * WebView origin (localhost) rather than the real public site - see
     * that function's own comment for the full story (front task: "Share
     * link shows localhost", reported from the mobile app).
     */
    const documentUrl = computed(() =>
      `${getPublicOrigin()}/docs/${encodeURIComponent(slug.value || resolvedId.value)}`,
    );
    async function copyDocumentLink() {
      try {
        await navigator.clipboard.writeText(documentUrl.value);
        showToast(t('copied'), 'success');
      } catch {
        showToast(t('copyLinkFailed'), 'error');
      }
    }
    const copyDocumentLinkFromDocMenu = () => { closeDocMenu(); void copyDocumentLink(); };
    const toggleOutlinePanelFromDocMenu = () => { closeDocMenu(); toggleOutlinePanel(); };

    /**
     * COPY LINK ROW (front task: the whole row is the control now, no
     * separate button). `linkRowCopied` drives the row's own inline
     * "Copied" state - the existing toast (inside copyDocumentLink) still
     * fires too, since that's the only feedback the doc-menu's "Copy link"
     * item has (it has no row of its own to show an inline state in).
     */
    const linkRowCopied = ref(false);
    let linkRowCopiedTimer: ReturnType<typeof setTimeout> | null = null;
    async function copyDocumentLinkFromRow() {
      await copyDocumentLink();
      linkRowCopied.value = true;
      if (linkRowCopiedTimer) clearTimeout(linkRowCopiedTimer);
      linkRowCopiedTimer = setTimeout(() => { linkRowCopied.value = false; }, 1500);
    }
    onBeforeUnmount(() => { if (linkRowCopiedTimer) clearTimeout(linkRowCopiedTimer); });
    const slug = ref<string | null>(null);
    const slugInput = ref('');
    const savingSlug = ref(false);
    /**
     * CUSTOM SLUG VALIDATION (front task 10). Mirrors the backend's
     * normalizeSlug format rules (common/slug.util.ts, back repo) for
     * INSTANT feedback while typing - format only, not the reserved-word
     * list or the uniqueness check, both of which only the server can
     * answer. `slugError` is the server's own answer (conflict, reserved,
     * or a format rejection it caught that this pre-check didn't), shown in
     * preference to the live format hint since it's authoritative; cleared
     * on every edit so a stale server error doesn't linger over new input.
     */
    const SLUG_CLIENT_FORMAT_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
    const slugError = ref('');
    const slugFormatError = computed(() => {
      const value = slugInput.value.trim().toLowerCase();
      if (!value) return '';
      if (value.length < 2 || value.length > 64) return t('slugInvalidFormat');
      if (value.includes('--')) return t('slugInvalidFormat');
      if (!SLUG_CLIENT_FORMAT_RE.test(value)) return t('slugInvalidFormat');
      return '';
    });
    watch(slugInput, () => { slugError.value = ''; });
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

    /**
     * SYNC STATUS DELAY (front task: sync jumping).
     *
     * Root cause of the layout jump was CSS (.text-doc-sync sizes to its own
     * text, so every label-length change reflows its flex siblings) - fixed
     * in style.css with a reserved min-width. This delay is a separate,
     * deliberately requested UX change: a normal autosave resolves in well
     * under a second, and flashing "Saving..." for that instant reads as
     * noisier than useful. `pendingSaveDelayed` only flips true if
     * pendingUpdatesCount is STILL > 0 after SAVE_INDICATOR_DELAY_MS, so a
     * fast round-trip never shows anything but a calm "Synced"; a slow one
     * still shows "Saving..." for as long as it actually takes. This does
     * NOT touch when a save happens or how conflicts/offline are detected -
     * only when the "Saving..." label is allowed to render.
     */
    const SAVE_INDICATOR_DELAY_MS = 400;
    const pendingSaveDelayed = ref(false);
    // The watch driving pendingSaveDelayed is set up further down, right
    // after `pendingUpdatesCount` itself exists (from useTextDocumentSocket)
    // - unlike a computed's lazy getter, watch() evaluates its source
    // immediately on creation, so it cannot reference a not-yet-declared
    // const the way syncStatus below safely can.

    const syncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: t('syncFailed') };
      if (pendingSaveDelayed.value) return { kind: 'saving', label: t('syncSaving') };
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
     * OUTLINE PANEL (auto-generated, separate from the manually-inserted
     * `tableOfContents` block above - both stay, see the design discussion
     * this shipped from).
     *
     * Desktop ("there's room" = the viewport is wide enough that a 240px
     * sidebar and the paper's own 920px reading width both fit without
     * squeezing either uncomfortably): a persistent sidebar, open by
     * default, collapsible - the collapse choice is a per-browser UI
     * preference (`localStorage`, never the document), same reasoning as
     * `useTheme.ts`'s own preference storage.
     *
     * Narrower than that (including mobile): no sidebar at all - opened via
     * the header's outline button as a bottom-sheet-style overlay, closed
     * again by the backdrop, Escape, or picking a heading.
     */
    const OUTLINE_DESKTOP_MIN_WIDTH = 1100;
    const OUTLINE_COLLAPSED_STORAGE_KEY = 'qcanva-outline-collapsed';
    const OUTLINE_WIDTH_STORAGE_KEY = 'qcanva-outline-width';
    // "Использовать значения, лучше соответствующие текущему layout" - 240
    // is the sidebar's own original fixed width, kept as both the default
    // and the double-click-to-reset target; 220/480 leave enough room for
    // .text-doc-editor-shell's 920px reading width at the desktop breakpoint
    // this panel starts showing at (OUTLINE_DESKTOP_MIN_WIDTH) without
    // squeezing it into scrollbar territory - see the live-checked widths
    // in this task's own report.
    const OUTLINE_DEFAULT_WIDTH = 240;
    const OUTLINE_MIN_WIDTH = 220;
    const OUTLINE_MAX_WIDTH = 480;

    function readOutlineCollapsedPref(): boolean {
      try {
        return localStorage.getItem(OUTLINE_COLLAPSED_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    }
    function writeOutlineCollapsedPref(collapsed: boolean): void {
      try {
        localStorage.setItem(OUTLINE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
      } catch {
        // Best-effort only, same as useTheme.ts's own storage guard - a
        // blocked/full localStorage must not break the toggle itself.
      }
    }
    function readOutlineWidth(): number {
      try {
        const raw = localStorage.getItem(OUTLINE_WIDTH_STORAGE_KEY);
        const parsed = raw === null ? NaN : Number(raw);
        return Number.isFinite(parsed) ? clampOutlineWidth(parsed, OUTLINE_MIN_WIDTH, OUTLINE_MAX_WIDTH) : OUTLINE_DEFAULT_WIDTH;
      } catch {
        return OUTLINE_DEFAULT_WIDTH;
      }
    }
    function writeOutlineWidth(width: number): void {
      try {
        localStorage.setItem(OUTLINE_WIDTH_STORAGE_KEY, String(width));
      } catch {
        // Best-effort, same as the collapse preference above.
      }
    }

    const outlineIsDesktop = ref(typeof window !== 'undefined' ? window.innerWidth >= OUTLINE_DESKTOP_MIN_WIDTH : true);
    const outlineCollapsedPref = ref(readOutlineCollapsedPref());
    const outlineMobileOpen = ref(false);
    const outlineWidth = ref(readOutlineWidth());
    // A resize is in progress: adds the "no text selection, col-resize
    // cursor everywhere" body class (style.css) for the duration of the
    // drag, since the cursor can slide off the 6px handle itself onto the
    // document text at any moment mid-drag.
    const outlineResizing = ref(false);

    function updateOutlineIsDesktop(): void {
      outlineIsDesktop.value = window.innerWidth >= OUTLINE_DESKTOP_MIN_WIDTH;
    }
    onMounted(() => window.addEventListener('resize', updateOutlineIsDesktop));
    onBeforeUnmount(() => window.removeEventListener('resize', updateOutlineIsDesktop));

    /** Visible right now, on WHICHEVER breakpoint currently applies. */
    const outlinePanelOpen = computed(() => (outlineIsDesktop.value ? !outlineCollapsedPref.value : outlineMobileOpen.value));

    function toggleOutlinePanel(): void {
      if (outlineIsDesktop.value) {
        outlineCollapsedPref.value = !outlineCollapsedPref.value;
        writeOutlineCollapsedPref(outlineCollapsedPref.value);
        return;
      }
      outlineMobileOpen.value = !outlineMobileOpen.value;
    }
    function closeOutlineMobile(): void {
      outlineMobileOpen.value = false;
    }
    const onOutlineMobileEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOutlineMobile();
    };
    watch(outlineMobileOpen, (open) => {
      if (open) window.addEventListener('keydown', onOutlineMobileEscape);
      else window.removeEventListener('keydown', onOutlineMobileEscape);
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', onOutlineMobileEscape));

    /**
     * RESIZE (desktop sidebar only - the mobile drawer has no handle and
     * always fills its own bottom-sheet width). Plain mousemove/mouseup on
     * `window`, not the handle itself: the cursor routinely outruns a 6px
     * strip mid-drag, and losing tracking the instant that happens would
     * leave the drag "stuck" from the user's perspective.
     */
    let outlineResizeStartX = 0;
    let outlineResizeStartWidth = 0;

    function onOutlineResizeMove(event: MouseEvent): void {
      const delta = event.clientX - outlineResizeStartX;
      outlineWidth.value = clampOutlineWidth(outlineResizeStartWidth + delta, OUTLINE_MIN_WIDTH, OUTLINE_MAX_WIDTH);
    }
    function stopOutlineResize(): void {
      outlineResizing.value = false;
      document.body.classList.remove('text-doc-outline-resizing');
      window.removeEventListener('mousemove', onOutlineResizeMove);
      window.removeEventListener('mouseup', stopOutlineResize);
      writeOutlineWidth(outlineWidth.value);
    }
    function startOutlineResize(event: MouseEvent): void {
      // Not a click on the outline's own content: prevents text selection
      // starting in the document/panel as the mouse sweeps across it.
      event.preventDefault();
      outlineResizeStartX = event.clientX;
      outlineResizeStartWidth = outlineWidth.value;
      outlineResizing.value = true;
      // A BODY class, not a class on the handle: the cursor routinely
      // outruns the 6px strip mid-drag, and `col-resize`/no-selection must
      // hold everywhere it wanders until the button is released, not just
      // while it happens to still be over the handle itself.
      document.body.classList.add('text-doc-outline-resizing');
      window.addEventListener('mousemove', onOutlineResizeMove);
      window.addEventListener('mouseup', stopOutlineResize);
    }
    /** Double-click the handle: back to the original width, same as a fresh install. */
    function resetOutlineWidth(): void {
      outlineWidth.value = OUTLINE_DEFAULT_WIDTH;
      writeOutlineWidth(OUTLINE_DEFAULT_WIDTH);
    }
    onBeforeUnmount(() => {
      window.removeEventListener('mousemove', onOutlineResizeMove);
      window.removeEventListener('mouseup', stopOutlineResize);
      document.body.classList.remove('text-doc-outline-resizing');
    });

    /**
     * The live outline this panel and the in-document `tableOfContents`
     * block both draw from - `documentOutline` is a pure read of
     * `editor.state.doc`, so `editorTransactionTick` is what actually makes
     * this recompute (see the UNDO/REDO section's own comment on why that
     * ref exists at all). Flat, in document order - the mobile drawer
     * renders this directly and unchanged; the desktop sidebar renders the
     * TREE built from it instead (below), so the two stay independent by
     * construction rather than by remembering not to touch one from the
     * other's code path.
     */
    const outlineEntries = computed(() => {
      void editorTransactionTick.value;
      return editor.value ? documentOutline(editor.value.state.doc) : [];
    });

    /**
     * DESKTOP SIDEBAR TREE. Which sections are folded is a per-viewer
     * browsing convenience local to this panel - never persisted, never
     * touching the document's own (unrelated) per-heading `collapsed`
     * attribute (collapsible-heading.ts) - see outline-tree.ts's file
     * comment for why the two must stay separate.
     */
    const outlineCollapsedSections = ref<Set<string>>(new Set());
    const outlineTree = computed(() => buildOutlineTree(outlineEntries.value));
    const outlineVisibleRows = computed(() => flattenVisibleOutline(outlineTree.value, outlineCollapsedSections.value));

    function toggleOutlineSection(id: string): void {
      const next = new Set(outlineCollapsedSections.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      outlineCollapsedSections.value = next;
    }

    function navigateFromOutline(pos: number): void {
      if (!editor.value) return;
      focusHeading(editor.value, pos);
      if (!outlineIsDesktop.value) outlineMobileOpen.value = false;
    }

    /**
     * A native browser tooltip, but only when the single-line, ellipsized
     * heading title (style.css's `.text-doc-outline-link`) is ACTUALLY
     * truncated - measured on hover rather than kept as reactive state per
     * row, since it only ever matters at the one moment a reader's pointer
     * is already sitting on the element asking for it. Comparing scrollWidth
     * against clientWidth is exactly what "does this need an ellipsis"
     * means for a single `white-space: nowrap` line.
     */
    function onOutlineLinkHover(event: MouseEvent): void {
      const link = event.currentTarget as HTMLElement;
      link.title = link.scrollWidth > link.clientWidth ? link.textContent?.trim() ?? '' : '';
    }

    const outlineLabels = {
      title: '',
      empty: '',
      toggle: '',
      hide: '',
      show: '',
      collapseSection: '',
      expandSection: '',
    };
    const paintOutlineLabels = () => {
      outlineLabels.title = t('outlineTitle');
      outlineLabels.empty = t('outlineEmpty');
      outlineLabels.toggle = t('outlineToggle');
      outlineLabels.hide = t('outlineHide');
      outlineLabels.show = t('outlineShow');
      outlineLabels.collapseSection = t('outlineCollapseSection');
      outlineLabels.expandSection = t('outlineExpandSection');
    };
    paintOutlineLabels();
    watch(locale, paintOutlineLabels);

    /** Scrolls to and selects the heading `headingId` names, in THIS document only (see heading-id.ts). */
    function navigateToHeadingLink(headingId: string): void {
      if (!editor.value) return;
      const target = findHeadingById(editor.value.state.doc, headingId);
      if (target) focusHeading(editor.value, target.pos);
    }

    const headingLinkNodeLabels = { deleted: '' };
    const paintHeadingLinkNodeLabels = () => {
      headingLinkNodeLabels.deleted = t('headingLinkDeletedTooltip');
    };
    paintHeadingLinkNodeLabels();
    watch(locale, paintHeadingLinkNodeLabels);

    /**
     * Powers the `@`-mention picker's heading section (mention-menu.ts).
     * Client-side and synchronous, unlike `searchMentionCandidates` above:
     * the candidates are THIS document's own headings, already loaded in
     * this editor, never a server search - see heading-id.ts's file comment
     * on why this stays same-document-only.
     *
     * `ensureHeadingIds` runs first so a heading typed moments ago (still
     * missing an id - see that function's own comment) is still offered and
     * insertable, not silently missing from the list until some unrelated
     * later edit happens to backfill it.
     */
    function searchHeadings(query: string): Array<{ headingId: string; label: string }> {
      if (!editor.value?.state) return [];
      ensureHeadingIds(editor.value);
      const entries = headingIdEntries(editor.value.state.doc);
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return entries;
      return entries.filter((entry) => entry.label.toLowerCase().includes(normalizedQuery));
    }

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
     * TABLE CONTROLS (front task 15). `isActive('table')` is true anywhere
     * the cursor sits inside a table - not gated on a text selection the way
     * shouldShowBubbleMenu is - so the toolbar tracks the cursor moving
     * between cells rather than needing a drag-select first.
     */
    const tableMenuShouldShow = ({ editor: bubbleEditor }: { editor: Editor }) => bubbleEditor.isActive('table');

    /**
     * TABLE MENU POSITION (front task: anchor to the table, not the cell).
     * The bubble-menu extension's own default reference rect is the current
     * selection's (posToDOMRect) - fine for the text-formatting bubble above,
     * wrong here: it put this menu wherever the cursor happened to be inside
     * the table, drifting cell to cell, instead of staying anchored to the
     * table as a whole. Passed as tippy-options.getReferenceClientRect,
     * which @tiptap/extension-bubble-menu's own plugin reads and uses
     * INSTEAD of its default whenever it's provided (see updateHandler in
     * its source) - not a new positioning system, just overriding which
     * rect the existing one measures.
     */
    const tableMenuGetReferenceClientRect = (): DOMRect => {
      const view = editor.value?.view;
      const empty = () => new DOMRect(0, 0, 0, 0);
      if (!view) return empty();
      const { $from } = view.state.selection;
      for (let depth = $from.depth; depth >= 0; depth--) {
        if ($from.node(depth).type.name !== 'table') continue;
        const dom = view.nodeDOM($from.before(depth));
        // renderWrapper:true (see the Table.configure comment below) means
        // this is the .tableWrapper div, not the bare <table> - exactly the
        // "whole table block" bounding box wanted here.
        if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
      }
      return empty();
    };
    const tableAddRow = () => { editor.value?.chain().focus().addRowAfter().run(); };
    const tableAddColumn = () => { editor.value?.chain().focus().addColumnAfter().run(); };
    const tableDeleteRow = () => { editor.value?.chain().focus().deleteRow().run(); };
    const tableDeleteColumn = () => { editor.value?.chain().focus().deleteColumn().run(); };
    const tableDeleteTable = () => { editor.value?.chain().focus().deleteTable().run(); };

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
     * LINK TAP/CLICK ACTIONS (front task 4/5). `Link.configure({ openOnClick:
     * false })` above means nothing already opens a link or offers to on a
     * plain click/tap - there was no interaction at all beyond placing the
     * caret. This is deliberately ONE mechanism for both desktop and mobile
     * (rather than a hover-only desktop affordance) since it needs no new
     * per-link DOM injection (marks don't get NodeViews the way nodes do) and
     * gives desktop the requested explicit Open action for free. Detected via
     * `editorProps.handleClick` below, which hands the raw DOM event - the
     * href is read straight off the rendered `<a>` (Link's own renderHTML
     * output) rather than resolved through ProseMirror mark lookup, since
     * that's exactly what's under the pointer.
     */
    const linkActionOpen = ref(false);
    const linkActionHref = ref('');
    const linkActionRect = ref<{ top: number; left: number } | null>(null);
    const linkActionMenuStyle = computed(() =>
      linkActionRect.value ? { top: `${linkActionRect.value.top}px`, left: `${linkActionRect.value.left}px` } : undefined,
    );
    const closeLinkActionMenu = () => {
      linkActionOpen.value = false;
      linkActionHref.value = '';
      linkActionRect.value = null;
    };
    const onLinkActionEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLinkActionMenu();
    };
    watch(linkActionOpen, (open) => {
      if (open) window.addEventListener('keydown', onLinkActionEscape);
      else window.removeEventListener('keydown', onLinkActionEscape);
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', onLinkActionEscape));

    async function copyLinkActionHref() {
      try {
        await navigator.clipboard.writeText(linkActionHref.value);
        showToast(t('copied'), 'success');
      } catch {
        showToast(t('copyLinkFailed'), 'error');
      }
      closeLinkActionMenu();
    }
    function openLinkActionHref() {
      window.open(linkActionHref.value, '_blank', 'noopener,noreferrer');
      closeLinkActionMenu();
    }
    /**
     * Hands off to the SAME edit flow the bubble menu's link button uses.
     * Unlike applyLink/removeLink (which extend a collapsed selection to the
     * whole mark when APPLYING), this has to extend it FIRST: on desktop the
     * edit form only renders inside <BubbleMenu>, whose shouldShowBubbleMenu
     * requires a non-empty text selection - a click leaves the cursor
     * collapsed, so without this the desktop form would never appear at all
     * (the mobile sheet doesn't share that gate, but extending here keeps
     * both platforms consistent and gives openLinkEditor the correct full
     * range to capture via trackRange).
     */
    function editLinkAction() {
      closeLinkActionMenu();
      editor.value?.chain().focus().extendMarkRange('link').run();
      openLinkEditor();
    }

    /**
     * Named and exposed (like openLinkEditor/applyLink/removeLink already
     * are) so it can be called directly in a test: jsdom does not reliably
     * deliver a real click through ProseMirror's own DOM event pipeline the
     * way a browser does - the same class of limitation
     * TextDocumentView.linkEditor.test.ts already documents for the tippy-
     * based bubble menu. Registered below as editorProps.handleClick.
     */
    function handleEditorLinkClick(event: MouseEvent): boolean {
      if (!canEditContent.value) return false;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) {
        closeLinkActionMenu();
        return false;
      }
      const href = anchor.getAttribute('href') || '';
      if (!href) return false;
      const rect = anchor.getBoundingClientRect();
      const ESTIMATED_MENU_HEIGHT = 96;
      // Opens ABOVE the link by default (front task: it used to sit right on
      // top of the link text, which the popover's own background then hid) -
      // falls back to below only when there isn't enough room above.
      const opensBelow = rect.top - 6 - ESTIMATED_MENU_HEIGHT < 8;
      linkActionHref.value = href;
      linkActionRect.value = {
        top: opensBelow ? rect.bottom + 6 : Math.max(8, rect.top - 6 - ESTIMATED_MENU_HEIGHT),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 258),
      };
      linkActionOpen.value = true;
      // Not `true`: this only shows the popover, it never suppresses
      // ProseMirror's own click handling, so the caret still lands exactly
      // where a plain click on that text would put it.
      return false;
    }

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
      const value = item.kind === 'document' ? item.id : item.kind === 'heading' ? `h-${item.headingId}` : 'create';
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
    /**
     * REOPEN SHARE AFTER THE SLUG-SAVE REMOUNT (front task 9). Same one-shot
     * query-param technique as shouldFocusAfterMentionCreate right below,
     * for the same underlying reason: this view remounts on every path
     * change, so any in-memory UI state (like the Share sheet being open)
     * set before a canonicalising router.replace is gone on the other side
     * of it unless something explicitly restores it.
     */
    const shouldReopenShareAfterRemount = route.query?.openShare === '1';
    let reopenShareConsumed = false;
    function reopenShareIfPending(preferredId: string) {
      if (!shouldReopenShareAfterRemount || reopenShareConsumed) return;
      if (role.value !== 'owner') return;
      reopenShareConsumed = true;
      showShare.value = true;
      const { openShare: _openShare, ...restQuery } = route.query || {};
      router.replace({ name: 'text-document', params: { id: preferredId }, query: restQuery }).catch(() => {});
    }

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
    // Collapsed by default: an empty (or even a non-empty) backlinks section
    // was previously always expanded, taking a fixed chunk of vertical space
    // below every document regardless of whether the reader cares. The count
    // is always visible in the collapsed row, so there's still no
    // "never mentioned" vs. "mentioned, not indexed yet" ambiguity (ruling R1).
    const backlinksExpanded = ref(false);
    const toggleBacklinksExpanded = () => {
      backlinksExpanded.value = !backlinksExpanded.value;
    };

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

    /**
     * REDO WORKAROUND (front task: header buttons - found while testing
     * Redo specifically, since Undo alone never exposed the bug). Confirmed
     * live, not just in jsdom: after any undo, canRedo() reads false
     * forever - not a selection/table-specific bug, every content type hits
     * it the same way.
     *
     * Root cause, traced into @tiptap/extension-collaboration and yjs
     * themselves (both third-party, nothing here caused it): that
     * extension ships its own "quick fix... thanks to @hamflx" (see its
     * source, citing yjs/y-prosemirror issues #114/#102) for a ProseMirror
     * EditorView being constructed/destroyed more than once for what's
     * logically a single mount. y-prosemirror's own yUndoPlugin view calls
     * `undoManager.destroy()` on teardown, which does
     * `trackedOrigins.delete(this)` - removing the UndoManager from its
     * OWN trackedOrigins set, which Yjs's constructor had added it to.
     * Redo only records anything when the undo's own resulting transaction
     * passes that trackedOrigins check, so this delete breaks redo outright.
     *
     * The extension's own `restore()` closure is supposed to undo this, but
     * doesn't reliably here - confirmed live that self-tracking can still
     * be missing well after mount (measured true right at onCreate, false
     * again by the time of the first edit), meaning more than one
     * destroy/rebuild cycle happens across this app's actual load
     * sequence, not just the single cycle the library's own fix accounts
     * for. Fixing it once at mount isn't enough - ensureRedoTracked() re-
     * asserts the one broken invariant (self stays in trackedOrigins)
     * right before every place that reads or acts on it, so it self-heals
     * regardless of how many times the library's own machinery breaks it
     * in between.
     *
     * Safe to delete once @tiptap/extension-collaboration/y-prosemirror
     * actually fix upstream issues #114/#102 for this app's real
     * multi-cycle EditorView lifecycle (not just the single cycle their
     * current "quick fix" covers) and the dependency is bumped past that
     * fix.
     */
    function ensureRedoTracked(current: Editor | undefined): void {
      // current?.state guards the same gap canUndo/canRedo do: several
      // TextDocumentView.test.ts fixtures mock the editor object down to
      // only a handful of methods, with no real ProseMirror `state` at all.
      const undoManager = current?.state && yUndoPluginKey.getState(current.state)?.undoManager;
      if (undoManager && !undoManager.trackedOrigins.has(undoManager)) {
        undoManager.trackedOrigins.add(undoManager);
      }
    }

    /**
     * UNDO/REDO (front task: header buttons). `editor.can().undo()` reads
     * the Collaboration extension's own y-prosemirror UndoManager (StarterKit's
     * own History is disabled below - `history: false` - specifically so
     * this collaborative one is the only one, the same one already backing
     * the table-undo test in TextDocumentView.table.test.ts). That
     * dry-run flag lives inside Yjs's UndoManager state, not a Vue ref, so
     * nothing re-evaluates canUndo/canRedo on its own - editorTransactionTick
     * is bumped on every transaction (onUpdate below) purely to give these
     * two computeds a reactive dependency to re-run on.
     */
    const editorTransactionTick = ref(0);
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
        // Adds the stable `headingId` a headingLink resolves against - see
        // heading-id.ts's file comment for why this is separate from the
        // derived, text-based anchor collapsibleHeading/TableOfContents use.
        HeadingId,
        HeadingLink.configure({
          onNavigate: navigateToHeadingLink,
          labels: headingLinkNodeLabels,
        }),
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
          searchHeadings,
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
        /**
         * TABLE (front task 13-19). The official extension family, not a
         * custom engine: schema, cell selection, keyboard navigation
         * (Tab/Shift+Tab), commands (addRowAfter, deleteColumn, etc.) and
         * serialization all come from it. `resizable: false` keeps column
         * resizing out of v1 as asked.
         *
         * `renderWrapper: true` (front task 33/40, fixed after a live
         * Playwright check caught it): the extension's `.tableWrapper` div -
         * where style.css puts `overflow-x: auto` so the table scrolls
         * within itself instead of the page - is NOT the resizable
         * NodeView's doing. It comes from this schema-level option alone,
         * which defaults to false; `resizable` only controls a separate
         * drag-handle plugin. Confirmed live: without this flag no
         * `.tableWrapper` element exists in the DOM at all, `overflow-x:
         * auto` on a bare `<table>` is a no-op in Chromium, and a wide
         * table's excess width bled straight into `#app`'s global
         * `overflow-x: hidden` and was silently clipped rather than
         * scrollable.
         *
         * ARCHITECTURAL NOTE (front task 26): this only touches the
         * editor's own ProseMirror schema and the Yjs document it syncs -
         * collaboration itself is schema-agnostic, so no realtime-protocol
         * change is needed. What IS incomplete: the backend keeps its own
         * separate hand-written HTML/plainText renderer (canvas-server-back
         * text-documents/schema/document-nodes.ts, duplicated in this repo
         * at src/documents/document-nodes.ts) for search snippets, the
         * public HTML page, PDF export, and link previews - it doesn't know
         * about table/tableRow/tableCell/tableHeader yet. Its own fallback
         * for an unrecognised node renders `<div>` and keeps the children
         * (confirmed by reading render-html.ts), so a table in one of those
         * contexts shows its text, un-gridded, rather than breaking or
         * disappearing. Left as a follow-up: out of this task's frontend
         * scope, and not a blocker for the live collaborative editor.
         */
        Table.configure({ resizable: false, renderWrapper: true }),
        TableRow,
        TableHeader,
        TableCell,
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
      onCreate: ({ editor: createdEditor }) => {
        refreshBlockCount();
        ensureRedoTracked(createdEditor);
        ensureHeadingIds(createdEditor);
      },
      // Fires for a remote collaborator's change as well as this user's, so
      // the count is the document's, not this keyboard's.
      onUpdate: () => { refreshBlockCount(); editorTransactionTick.value++; },
      onSelectionUpdate: ({ editor }) => {
        if (!canEditContent.value) return;
        const selection = editor.state.selection;
        sendAwareness({ anchor: selection.anchor, head: selection.head });
      },
      editorProps: {
        handleClick: (_view, _pos, event) => handleEditorLinkClick(event),
      },
    });

    // Both use ?.can?.(), not just ?.value?. - the Collaboration extension
    // (real production editors) always has .can(), but the several
    // TextDocumentView.test.ts fixtures mock the editor object down to only
    // the handful of methods each of THEIR OWN tests exercises, and don't
    // include .can() at all.
    const canUndo = computed(() => { void editorTransactionTick.value; return !!editor.value?.can?.().undo(); });
    const canRedo = computed(() => {
      void editorTransactionTick.value;
      ensureRedoTracked(editor.value);
      return !!editor.value?.can?.().redo();
    });
    // .chain().focus() first, same as every other toolbar command in this
    // file (tableAddRow etc.) - keeps focus (and with it, the mobile
    // keyboard/no layout jump) on the editor rather than the button just
    // clicked, and undo/redo apply against the editor's own selection
    // either way since ProseMirror's selection isn't tied to DOM focus.
    const undoEdit = () => { editor.value?.chain().focus().undo().run(); };
    const redoEdit = () => { ensureRedoTracked(editor.value); editor.value?.chain().focus().redo().run(); };

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

    let saveIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
    watch(() => pendingUpdatesCount.value > 0, (isPending) => {
      if (saveIndicatorTimer) {
        clearTimeout(saveIndicatorTimer);
        saveIndicatorTimer = null;
      }
      if (!isPending) {
        pendingSaveDelayed.value = false;
        return;
      }
      saveIndicatorTimer = setTimeout(() => {
        if (pendingUpdatesCount.value > 0) pendingSaveDelayed.value = true;
      }, SAVE_INDICATOR_DELAY_MS);
    });
    onBeforeUnmount(() => {
      if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
    });

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
        reopenShareIfPending(preferred);
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
      if (role.value !== 'owner' || slugFormatError.value) return;
      slugError.value = '';
      savingSlug.value = true;
      try {
        const updated = await textDocuments.update(resolvedId.value, { slug: slugInput.value.trim() || null });
        slug.value = updated.slug || null;
        slugInput.value = slug.value || '';
        /**
         * ROOT CAUSE (front task 9, "custom link doesn't save"): the slug DID
         * persist correctly (verified: PUT saves it, GET-by-id and
         * GET-by-slug both resolve it, it survives a reload, conflicts and
         * invalid input already surfaced clear errors) - what was actually
         * broken is that changing the URL below remounts this ENTIRE view
         * (view-remount.ts keys text-document on route.path, so the editor/
         * Y.Doc/socket rebuild correctly for the canonicalised URL), which
         * resets `showShare` to its default `false`. The Share sheet the
         * user was just typing in vanished right after a successful Save,
         * reading as "it didn't work" even though the data was fine.
         * `openShare=1` is the same one-shot-query-param technique already
         * used for `mentionFocus` above: consumed once by
         * reopenShareIfPending() after the fresh mount's load() resolves,
         * then stripped so it never lingers in a shareable URL.
         */
        await router.replace({ name: 'text-document', params: { id: slug.value || resolvedId.value }, query: { ...route.query, openShare: '1' } });
        showToast(t('linkSaved'), 'success');
      } catch (e: any) {
        slugError.value = e.message || t('linkSaveFailed');
        showToast(e.message || t('linkSaveFailed'), 'error');
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
    const closeHistory = () => { showHistory.value = false; };
    const onHistoryEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHistory();
    };
    watch(showHistory, (open) => {
      if (open) window.addEventListener('keydown', onHistoryEscape);
      else window.removeEventListener('keydown', onHistoryEscape);
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', onHistoryEscape));

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

    /** Enter from the title field: continues into the body, not below existing content. */
    function focusEditorStart() {
      if (!canEditContent.value) return;
      editor.value?.chain().focus('start').run();
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
      backlinksExpanded,
      toggleBacklinksExpanded,
      onBacklinkClick,
      mentionDocumentIcon: lucideIcon(EDITOR_GLYPHS.fileText),
      mentionHeadingIcon: lucideIcon(EDITOR_GLYPHS.listTree),
      mentionCreateIcon: lucideIcon(EDITOR_GLYPHS.filePlus),
      linkEditorOpen,
      linkEditorHadLink,
      linkInput,
      keyboardInset,
      bubbleMarkButtons,
      bubbleShouldShow,
      applyBubbleMark,
      tableMenuShouldShow,
      tableMenuGetReferenceClientRect,
      canUndo,
      canRedo,
      undoEdit,
      redoEdit,
      tableAddRow,
      tableAddColumn,
      tableDeleteRow,
      tableDeleteColumn,
      tableDeleteTable,
      openLinkEditor,
      closeLinkEditor,
      applyLink,
      removeLink,
      linkIcon: LINK_ICON,
      unlinkIcon: UNLINK_ICON,
      linkActionOpen,
      linkActionHref,
      linkActionMenuStyle,
      closeLinkActionMenu,
      copyLinkActionHref,
      openLinkActionHref,
      editLinkAction,
      handleEditorLinkClick,
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
      closeShare,
      docMenuOpen,
      docMenuStyle,
      toggleDocMenu,
      closeDocMenu,
      openAccessFromDocMenu,
      openHistoryFromDocMenu,
      documentUrl,
      copyDocumentLink,
      copyDocumentLinkFromDocMenu,
      toggleOutlinePanelFromDocMenu,
      outlinePanelOpen,
      outlineIsDesktop,
      outlineMobileOpen,
      outlineEntries,
      outlineVisibleRows,
      outlineCollapsedSections,
      outlineWidth,
      outlineResizing,
      outlineLabels,
      toggleOutlinePanel,
      closeOutlineMobile,
      navigateFromOutline,
      toggleOutlineSection,
      startOutlineResize,
      resetOutlineWidth,
      onOutlineLinkHover,
      linkRowCopied,
      copyDocumentLinkFromRow,
      slugInput,
      slugError,
      slugFormatError,
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
      closeHistory,
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
      focusEditorStart,
    };
  },
});
</script>
