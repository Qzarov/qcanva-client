import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { isAtBlockStartOrAfterWhitespace, isInCodeContext, isInMarkedContext } from './slash-menu';

/**
 * The `@` mention picker: typing `@` opens a list of documents matching what
 * was typed since, with "Create page …" always last.
 *
 * Built on @tiptap/suggestion, exactly like the slash menu, and deliberately
 * its own `PluginKey` (`qcanvaMentionMenu`, not `qcanvaSlashMenu`): `/` and `@`
 * are two independent triggers, each tracking its own active range, and one
 * plugin instance cannot serve both without either colliding on state or
 * needing a discriminated item type threaded through the other's code.
 *
 * The TRIGGER GUARDS are reused from slash-menu.ts rather than copied: code,
 * any styled inline run, and mid-word are exactly the same "is this `@` a
 * live trigger or just a character in the prose" question `/` already answers
 * (see slash-menu.ts's own GUARD 1/1B/2 comments for the reasoning behind
 * each). None of the three needs to behave differently for `@` - in
 * particular GUARD 2 (`isAtBlockStartOrAfterWhitespace`) is exactly what
 * keeps `qzarov@family.ru` from opening this menu: the `@` in an email sits
 * right after a run of letters, never after whitespace or at a block start.
 */
export const MentionMenuPluginKey = new PluginKey('qcanvaMentionMenu');

/** All three guards, unmodified from the slash menu. `range.from` is the position of the `@` itself. */
export function mentionMenuAllows(state: EditorState, range: { from: number }): boolean {
  if (isInCodeContext(state, range.from)) return false;
  if (isInMarkedContext(state, range.from)) return false;
  if (!isAtBlockStartOrAfterWhitespace(state, range.from)) return false;

  return true;
}

/** One document result the picker can insert as a mention. */
export type MentionMenuDocumentItem = {
  kind: 'document';
  id: string;
  title: string;
};

/**
 * One heading of THIS SAME document the picker can insert as a
 * `headingLink` - never a heading of another document (out of scope, see
 * heading-id.ts's own file comment). Sourced client-side from the live
 * document outline, never a server search, so it carries no separate
 * loading state the way document results do.
 */
export type MentionMenuHeadingItem = {
  kind: 'heading';
  headingId: string;
  label: string;
};

/**
 * The trailing "Create page named …" row, carrying the typed text. What it
 * DOES is the next task (front task 8): this extension only has to make sure
 * choosing it is possible and tells the caller what was typed, rather than
 * being a dead row nothing responds to.
 */
export type MentionMenuCreateItem = {
  kind: 'create';
  query: string;
};

export type MentionMenuItem = MentionMenuDocumentItem | MentionMenuHeadingItem | MentionMenuCreateItem;

/**
 * Builds the picker's list from search results: this document's own matching
 * headings first (the most likely target while writing IN a document, and
 * free of network latency), then the matching OTHER documents, then the
 * create row - ALWAYS last, even when nothing matched (an empty query
 * included), so there is always something to press Enter on.
 */
export function buildMentionMenuItems(
  results: Array<{ id: string; title: string }>,
  query: string,
  headingResults: Array<{ headingId: string; label: string }> = [],
): MentionMenuItem[] {
  return [
    ...headingResults.map(
      (result): MentionMenuHeadingItem => ({ kind: 'heading', headingId: result.headingId, label: result.label }),
    ),
    ...results.map((result): MentionMenuDocumentItem => ({ kind: 'document', id: result.id, title: result.title })),
    { kind: 'create', query },
  ];
}

/** What the view needs to draw the popup. */
export type MentionMenuRender = {
  items: MentionMenuItem[];
  query: string;
  /** Screen rect of the typed `@`, for positioning. Null before layout. */
  rect: DOMRect | null;
  /** Runs the chosen item through the suggestion plugin's own command path. */
  command: (item: MentionMenuItem) => void;
};

export type MentionMenuController = {
  onOpen: (render: MentionMenuRender) => void;
  onUpdate: (render: MentionMenuRender) => void;
  onClose: () => void;
  /** Returns true when the menu consumed the key, so the editor ignores it. */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export type MentionMenuOptions = {
  /** The view's popup. Null means "no ui": the plugin still guards, but draws nothing. */
  controller: MentionMenuController | null;
  /**
   * Documents the typed query matches. Already filtered to what the current
   * user can read (ruling R2 in
   * docs/superpowers/plans/2026-09-06-mentions-and-backlinks.md) by whatever
   * this calls server-side - this extension adds no filtering of its own and
   * must not be handed a wider search.
   */
  search: (query: string) => Promise<Array<{ id: string; title: string }>>;
  /**
   * This SAME document's headings matching the typed query. Synchronous and
   * client-side (see heading-id.ts) - never a wider search, and never
   * another document's headings (out of scope, same boundary `search`
   * above already respects for documents).
   */
  searchHeadings: (query: string) => Array<{ headingId: string; label: string }>;
  /** Inserts the chosen target as a `mention` node, id + its CURRENT title as label. */
  insertMention: (editor: Editor, range: Range, item: MentionMenuDocumentItem) => void;
  /** Inserts the chosen heading as a `headingLink` node, headingId + its CURRENT text as label. */
  insertHeadingLink: (editor: Editor, range: Range, item: MentionMenuHeadingItem) => void;
  /** The create row's seam: told the typed text, not yet told to create anything. */
  onCreatePage: (query: string, context: { editor: Editor; range: Range }) => void;
};

/**
 * Replaces the typed `range` (the `@query` text, including the `@`) with a
 * `mention` node for `attrs.id`/`attrs.label`, followed by a trailing space so
 * typing continues outside the atom node rather than inside it.
 *
 * Exported so both the picker's own default `insertMention` below AND the
 * "create page" flow (TextDocumentView.vue's `handleMentionCreatePage`, front
 * task 8) go through the exact same chain - a document just created from the
 * picker must lose its typed query text exactly like a document picked from
 * the list does, not through a second, hand-rolled implementation that could
 * drift (e.g. forget the space, or delete before checking the insert worked).
 */
export function insertMentionAtRange(editor: Editor, range: Range, attrs: { id: string; label: string }) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({ type: 'mention', attrs })
    .insertContent(' ')
    .run();
}

/**
 * The `headingLink` twin of `insertMentionAtRange` above, for exactly the
 * same reason: this is the ONE place that replaces the typed `@query` with
 * the chosen node, so a heading picked from the list and a heading inserted
 * any other way in the future cannot drift apart.
 */
export function insertHeadingLinkAtRange(editor: Editor, range: Range, attrs: { headingId: string; label: string }) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({ type: 'headingLink', attrs })
    .insertContent(' ')
    .run();
}

export const MentionMenu = Extension.create<MentionMenuOptions>({
  name: 'mentionMenu',

  addOptions() {
    return {
      controller: null,
      search: async () => [],
      searchHeadings: () => [],
      insertMention: (editor: Editor, range: Range, item: MentionMenuDocumentItem) => {
        insertMentionAtRange(editor, range, { id: item.id, label: item.title });
      },
      insertHeadingLink: (editor: Editor, range: Range, item: MentionMenuHeadingItem) => {
        insertHeadingLinkAtRange(editor, range, { headingId: item.headingId, label: item.label });
      },
      onCreatePage: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion<MentionMenuItem, MentionMenuItem>({
        editor: this.editor,
        pluginKey: MentionMenuPluginKey,
        char: '@',
        decorationClass: 'qcanva-mention-query',
        // Unlike the slash menu's single command words, both a document
        // title search and a typed "create page named ..." are naturally
        // multi-word, so the query has to be allowed to contain spaces.
        allowSpaces: true,
        // Our own `mentionMenuAllows` owns the mid-word rule, same as the slash menu.
        allowedPrefixes: null,
        startOfLine: false,
        allow: ({ state, range }) => mentionMenuAllows(state, range),
        items: async ({ query }) =>
          buildMentionMenuItems(await options.search(query), query, options.searchHeadings(query)),
        command: ({ editor, range, props }) => {
          if (props.kind === 'document') {
            options.insertMention(editor, range, props);
            return;
          }
          if (props.kind === 'heading') {
            options.insertHeadingLink(editor, range, props);
            return;
          }
          options.onCreatePage(props.query, { editor, range });
        },
        render: () => {
          const toRender = (props: {
            items: MentionMenuItem[];
            query: string;
            clientRect?: (() => DOMRect | null) | null;
            command: (item: MentionMenuItem) => void;
          }): MentionMenuRender => ({
            items: props.items,
            query: props.query,
            rect: props.clientRect?.() ?? null,
            command: props.command,
          });

          return {
            onStart: (props) => options.controller?.onOpen(toRender(props)),
            onUpdate: (props) => options.controller?.onUpdate(toRender(props)),
            onExit: () => options.controller?.onClose(),
            onKeyDown: ({ event }) => options.controller?.onKeyDown(event) ?? false,
          };
        },
      }),
    ];
  },
});
