import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import { isRenderableHref } from '../documents/link-policy';
import { lowlight } from './code-highlighting';
import { CodeBlockWithLanguage } from './code-block-language';
import { QuietTaskItem } from './task-item';
import { TextDocumentImageNodeViewExtension } from './image-node';
import { Callout } from './callout';
import { CollapsibleHeading, type HeadingCollapseLabels } from './collapsible-heading';
import { TableOfContents, type TableOfContentsLabels } from './table-of-contents';
import { HeadingId } from './heading-id';
import { BlockId } from './block-id';
import { HeadingLink } from './heading-link-node';
import { SlashMenu, type SlashMenuController, type SlashMenuItem } from './slash-menu';
import { MentionMenu, type MentionMenuController } from './mention-menu';
import { Mention } from './mention-node';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import Image from '@tiptap/extension-image';
import DragHandle from '@tiptap/extension-drag-handle';
import NodeRange from '@tiptap/extension-node-range';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TableMoveHandles } from './table-move';
import { PinColumnWidthsOnLastColumnResize } from './table-column-widths';
import { CapacityGuard } from './capacity-guard';
import Collaboration from './collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { BREAKPOINTS } from '../composables/layoutMedia';
import type { MentionResolution } from '../api/client';

export type TextDocumentExtensionOptions = {
  t: (key: any) => string;
  locale: { value: string };
  headingCollapseLabels: HeadingCollapseLabels;
  tableOfContentsLabels: TableOfContentsLabels;
  headingLinkNodeLabels: { deleted: string };
  getDocumentId: () => string;
  getImageToken: () => string;
  onImageError: (imageId: string, src?: string | null) => Promise<boolean>;
  onNavigateHeading: (headingId: string) => void;
  slashController: SlashMenuController;
  slashLabel: (item: SlashMenuItem) => string;
  requestImage: () => void;
  resolveMention: (id: string) => MentionResolution | undefined;
  onNavigateMention: (id: string) => void;
  onMentionInaccessible: (payload: { id: string; label: string }) => void;
  mentionNodeLabels: { inaccessible: string; deleted: string };
  mentionController: MentionMenuController;
  searchMentionCandidates: (query: string) => Promise<Array<{ id: string; title: string }>>;
  searchHeadings: (query: string) => Array<{ headingId: string; label: string }>;
  onCreateMentionPage: (query: string, context: { editor: Editor; range: any }) => void;
  insertMention: (editor: Editor, range: any, item: { id: string; title: string }) => void;
  mentionResolutions: Map<string, MentionResolution>;
  renderDragHandle: () => HTMLElement;
  onDragNodeChange: (params: unknown) => void;
  capacityLimit: number;
  onCapacityBlocked: () => void;
  ydoc: Y.Doc;
  awarenessProvider: unknown;
  collaborationUser: { name?: string | null; email?: string | null };
};

export function createTextDocumentExtensions(options: TextDocumentExtensionOptions) {
  const {
    t, locale, headingCollapseLabels, tableOfContentsLabels, headingLinkNodeLabels,
    getDocumentId, getImageToken, onImageError, onNavigateHeading, slashController, slashLabel,
    requestImage, resolveMention, onNavigateMention, onMentionInaccessible, mentionNodeLabels,
    mentionController, searchMentionCandidates, searchHeadings, onCreateMentionPage, insertMention,
    mentionResolutions, renderDragHandle, onDragNodeChange, capacityLimit, onCapacityBlocked, ydoc, awarenessProvider, collaborationUser,
  } = options;
  return [
        // codeBlock: false disables StarterKit's own code block node so
        // CodeBlockLowlight (added below) is the only node registered for
        // "codeBlock" - having both would register the name twice.
        StarterKit.configure({ history: false, codeBlock: false }),
        // CodeBlockLowlight plus a language picker in the block's corner
        // (code-block-language.ts).
        CodeBlockWithLanguage.configure({
          lowlight,
          labels: { auto: t('codeLanguageAuto'), plaintext: t('codeLanguagePlain'), choose: t('codeLanguageChoose') },
        }),
        Underline,
        // A collaborator's Yjs update reaches this editor without passing the
        // backend's renderer, so the href filter has to live here too.
        Link.configure({
          openOnClick: false,
          isAllowedUri: (href, ctx) => isRenderableHref(href, ctx.defaultValidate),
        }),
        TaskList,
        // Ticking a todo never focuses the editor (on a phone that opened
        // the keyboard and scrolled the page to the caret) - see task-item.ts.
        // Also stamps when a todo was ticked and shows "Done N of M" above
        // each list - the labels are read at paint time, so they follow the locale.
        QuietTaskItem.configure({
          nested: true,
          labels: {
            progress: (done, total) =>
              t('taskProgress').replace('{done}', String(done)).replace('{total}', String(total)),
            checkedAt: (date) => new Intl.DateTimeFormat(locale.value, {
              day: 'numeric',
              month: 'short',
              ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
              hour: '2-digit',
              minute: '2-digit',
            }).format(date),
          },
        }),
        // Uploaded images are referenced by URL; base64 would bloat the shared Yjs doc.
        Image.configure({ inline: false, allowBase64: false }),
        TextDocumentImageNodeViewExtension.configure({
          getDocumentId: () => getDocumentId(),
          getImageToken: () => getImageToken(),
          onImageError: (imageId, src) => onImageError(imageId, src),
        }),
        // Clicking a callout's icon picks its kind (icon + colour) - callout.ts.
        Callout.configure({
          labels: {
            info: t('calloutInfo'),
            warning: t('calloutWarning'),
            success: t('calloutSuccess'),
            danger: t('calloutDanger'),
            choose: t('calloutChoose'),
          },
        }),
        // Adds `collapsed` to StarterKit's own heading node (see the file
        // comment in collapsible-heading.ts for why this is a global
        // attribute and not a second heading node).
        CollapsibleHeading.configure({ labels: headingCollapseLabels }),
        TableOfContents.configure({ labels: tableOfContentsLabels }),
        // Adds the stable `headingId` a headingLink resolves against - see
        // heading-id.ts's file comment for why this is separate from the
        // derived, text-based anchor collapsibleHeading/TableOfContents use.
        HeadingId,
        // Stable blockId per block: the address MCP block edits use (block-id.ts).
        BlockId,
        HeadingLink.configure({
          onNavigate: onNavigateHeading,
          labels: headingLinkNodeLabels,
        }),
        SlashMenu.configure({
          controller: slashController,
          label: slashLabel,
          // The image item cannot insert a node on its own: the file
          // has to be uploaded first, so it reuses the toolbar's picker.
          requestImage: () => requestImage(),
        }),
        Mention.configure({
          resolveMention: resolveMention,
          onNavigate: onNavigateMention,
          onInaccessibleClick: onMentionInaccessible,
          labels: mentionNodeLabels,
        }),
        MentionMenu.configure({
          controller: mentionController,
          search: searchMentionCandidates,
          searchHeadings,
          onCreatePage: (query, context) => void onCreateMentionPage(query, context),
          // Resolve the picked document into the live resolution map right away.
          // Without this a freshly inserted mention stayed `unresolved` (plain
          // text, not a styled/clickable link) until a page reload re-ran
          // loadMentionResolutions - the reported "links only render correctly
          // after reload". The target came from THIS user's own mention search,
          // so it is accessible to them. Then dispatch a no-op to repaint the
          // just-inserted node view from the updated map.
          insertMention: (ed, range, item) => {
            insertMention(ed, range, item);
            mentionResolutions.set(item.id, { id: item.id, title: item.title, accessible: true, deleted: false });
            const view = ed.view;
            if (view) view.dispatch(view.state.tr);
          },
        }),
        NodeRange,
        DragHandle.configure({
          render: renderDragHandle,
          // 8px into the left gutter. On mobile the paper reserves a wider
          // left padding (see the 760px rule in style.css) so this gutter has
          // room for the "+" without it landing on the text.
          tippyOptions: { offset: [0, 8] },
          // The 8px offset above is tuned for an ordinary block. A heading
          // reserves its own -28px slot for the collapse chevron
          // (.text-doc-heading-toggle in style.css), which the handle would
          // otherwise land right on top of, so nudge it further left there.
          // `pos` is passed at runtime (see the extension's update() dispatch)
          // but is missing from its published callback type, hence the cast.
          onNodeChange: onDragNodeChange,
        }),
        /**
         * TABLE (front task 13-19, column resizing added later). The
         * official extension family, not a custom engine: schema, cell
         * selection, keyboard navigation (Tab/Shift+Tab), commands
         * (addRowAfter, deleteColumn, etc.), colgroup/colwidth serialization
         * and now column-drag resizing all come from it - no reason to hand-
         * roll any of that ourselves.
         *
         * `resizable: true`: turns on the extension's own `columnResizing`
         * plugin and `TableView` NodeView (a drag handle per column
         * boundary, `.column-resize-handle`/`.resize-cursor` styled below in
         * style.css). This was `false` in v1 - the schema, colgroup
         * rendering and colwidth attribute were ALREADY present the whole
         * time regardless (`Table.renderHTML` calls `createColGroup`
         * unconditionally); `resizable` only withheld the plugin that WRITES
         * colwidth via dragging, and the NodeView that keeps the colgroup in
         * sync as columns are added/removed afterward. Read-only viewers are
         * unaffected either way: `columnResizing` guards `!view.editable` at
         * its own mousedown/mousemove handlers (prosemirror-tables), so no
         * drag and no handle decoration ever appears for someone who cannot
         * edit.
         *
         * `cellMinWidth: 100` (not the extension's own default of 25):
         * matches this file's own `min-width: 100px` CSS floor on td/th
         * exactly (style.css). Leaving the extension's smaller default would
         * have meant a column could be dragged to e.g. 60px and STORE 60,
         * while the CSS floor keeps rendering it at 100 - the next drag then
         * computes from that mismatched geometry, producing the classic
         * "width snaps back" bug. Caught this via review before it shipped,
         * not live.
         *
         * DELIBERATE CONSEQUENCE, not a bug: with this floor, any table with
         * more than ~4 columns (mobile, ~311px of editor content width) or
         * more than ~8 (this app's desktop reading width, ~744px) already
         * needs to scroll horizontally by default, with nothing dragged -
         * `cellMinWidth` feeds the SAME total-width computation used to
         * decide whether the table needs more room than its container.
         * Measured live, not estimated. Accepted: narrow columns that
         * actually scroll beat columns squeezed illegibly thin.
         *
         * `lastColumnResizable: true` (it was false until the table
         * wrapper learnt to shrink-wrap its table - see .tableWrapper in
         * style.css): once EVERY column has a stored width, `updateColumns`
         * gives the table an inline `width: <sum>px`, beating the CSS
         * `width: 100%`. That used to detach the table from the page width
         * for good; now it is exactly what "resize the last column" should
         * do - narrow it and the table ends short of the text column's right
         * edge, widen it and the table grows into the page's free width,
         * then scrolls, like any other wide table. While some column is
         * still unsized, the table keeps `width: 100%` and those columns
         * absorb the slack.
         *
         * `renderWrapper: true` (front task 33/40, fixed after a live
         * Playwright check caught it): the extension's `.tableWrapper` div -
         * where style.css puts `overflow-x: auto` so the table scrolls
         * within itself instead of the page - is the resizable NodeView's
         * own wrapper now that `resizable: true` is on (`editable: true` is
         * set unconditionally at construction here, so that NodeView is
         * always what's active, viewer or not - see `isResizable`/
         * `view.editable` in the extension's own source for why a
         * subsequent `setEditable(false)` for a read-only role still
         * disables the drag itself without swapping NodeViews). Kept
         * anyway: it is a costless flag already proven correct for the
         * pre-resizing state, and there is no reason to remove it on a
         * flip that does not need its removal. Confirmed live, pre-
         * resizing: without this flag no `.tableWrapper` element exists in
         * the DOM at all, `overflow-x: auto` on a bare `<table>` is a no-op
         * in Chromium, and a wide table's excess width bled straight into
         * `#app`'s global `overflow-x: hidden` and was silently clipped
         * rather than scrollable.
         *
         * A SEPARATE, PREREXISTING bug this resurfaced: `.text-doc-editor-
         * shell` (a flex item) was missing `min-width: 0`, so a table (or
         * any block) wide enough to matter stretched the WHOLE SHELL
         * sideways instead of staying put and letting `.tableWrapper` scroll
         * internally - fixed as its own commit, see that commit's message,
         * since it is a prerequisite for resizing to work at all rather than
         * something this change introduces.
         *
         * Resize-handle affordance hidden under the existing 760px mobile
         * breakpoint via CSS only (see style.css) - `columnResizing` binds
         * `mousedown`/`mousemove` only, no touch handling exists in the
         * library, so dragging to resize is not attemptable on a touchscreen
         * regardless. The config itself stays the SAME for every viewport
         * (gating `Table.configure` on viewport would only change which
         * render path draws the table per device for no reason, and would
         * never react to a later resize since the editor is constructed
         * once) - only the handle's own CSS visibility differs.
         *
         * ARCHITECTURAL NOTE (front task 26, still true and now more clearly
         * a deliberate deferral than an oversight): this only touches the
         * editor's own ProseMirror schema and the Yjs document it syncs -
         * collaboration itself is schema-agnostic, so no realtime-protocol
         * change is needed, and resized widths sync/persist/undo exactly
         * like any other node attribute. What IS incomplete: the backend
         * keeps its own separate hand-written HTML/plainText renderer
         * (canvas-server-back text-documents/schema/document-nodes.ts,
         * duplicated in this repo at src/documents/document-nodes.ts) for
         * search snippets, the public HTML page, PDF export, and link
         * previews - it doesn't know about table/tableRow/tableCell/
         * tableHeader AT ALL yet (falls through to a generic tag-only
         * fallback, confirmed by reading render-html.ts), so a table shows
         * as plain un-gridded text in those contexts regardless of column
         * width - reflecting resized widths there would mean first teaching
         * that renderer to draw a grid at all, a materially bigger, separate,
         * cross-repo feature. Left as a follow-up, not a blocker for the
         * live collaborative editor.
         */
        Table.configure({ resizable: true, renderWrapper: true, cellMinWidth: 100, lastColumnResizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        // Desktop drag grips for reordering rows/columns (none on phones -
        // the table menu's arrows cover that). See table-move.ts.
        // Grabbing the LAST column's border stores every column's current
        // width first, so the table's right edge follows the drag. See
        // table-column-widths.ts.
        PinColumnWidthsOnLastColumnResize,
        TableMoveHandles.configure({ columnLabel: () => t('tableDragColumn'), rowLabel: () => t('tableDragRow'), mobileMaxWidth: BREAKPOINTS.phone }),
        // Refuses a transaction that would add a top-level block past the
        // ceiling, and NOTHING else - never a Yjs transaction, never an edit
        // or a deletion. See capacity-guard.ts.
        CapacityGuard.configure({ limit: capacityLimit, onBlocked: onCapacityBlocked }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider: awarenessProvider,
          user: {
            name: collaborationUser.name || collaborationUser.email || 'Guest',
            color: '#50d1b2',
          },
        }),

  ];
}
