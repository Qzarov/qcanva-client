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
 * The trailing "Create page named …" row, carrying the typed text. What it
 * DOES is the next task (front task 8): this extension only has to make sure
 * choosing it is possible and tells the caller what was typed, rather than
 * being a dead row nothing responds to.
 */
export type MentionMenuCreateItem = {
  kind: 'create';
  query: string;
};

export type MentionMenuItem = MentionMenuDocumentItem | MentionMenuCreateItem;

/**
 * Builds the picker's list from search results: the matching documents, in
 * the order the search returned them, then the create row - ALWAYS last,
 * even when nothing matched (an empty query included), so there is always
 * something to press Enter on.
 */
export function buildMentionMenuItems(
  results: Array<{ id: string; title: string }>,
  query: string,
): MentionMenuItem[] {
  return [
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
  /** Inserts the chosen target as a `mention` node, id + its CURRENT title as label. */
  insertMention: (editor: Editor, range: Range, item: MentionMenuDocumentItem) => void;
  /** The create row's seam: told the typed text, not yet told to create anything. */
  onCreatePage: (query: string, context: { editor: Editor; range: Range }) => void;
};

export const MentionMenu = Extension.create<MentionMenuOptions>({
  name: 'mentionMenu',

  addOptions() {
    return {
      controller: null,
      search: async () => [],
      insertMention: (editor: Editor, range: Range, item: MentionMenuDocumentItem) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: 'mention', attrs: { id: item.id, label: item.title } })
          .insertContent(' ')
          .run();
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
        items: async ({ query }) => buildMentionMenuItems(await options.search(query), query),
        command: ({ editor, range, props }) => {
          if (props.kind === 'document') {
            options.insertMention(editor, range, props);
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
