import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { calloutIconSvg } from './callout';
import { EDITOR_GLYPHS, lucideIcon } from './editor-icons';
import type { messages } from '../composables/useI18n';

/**
 * The slash menu: typing `/` opens a keyboard-driven list of blocks to insert.
 *
 * Built on @tiptap/suggestion, which supplies the match/decoration/keyboard
 * plumbing. What this file owns is
 *
 *  - the ITEM LIST, whose every entry inserts a node the SHARED inventory
 *    (documents/document-nodes.ts) declares, so an inserted block is one the
 *    backend projection can render rather than one it drops;
 *  - the TRIGGER GUARDS, which are the behaviours a naive `/` menu gets
 *    wrong (see `slashMenuAllows` below): code, any other inline mark, and
 *    mid-word.
 *
 * Both are exported as plain functions over `EditorState`, not buried in the
 * plugin, so they can be asserted directly instead of through a simulated
 * keystroke.
 */

/** Lets a test read the suggestion plugin's state (`active`, `query`, `range`). */
export const SlashMenuPluginKey = new PluginKey('qcanvaSlashMenu');

export type SlashMenuContext = {
  editor: Editor;
  /** The range covering `/` and whatever was typed after it. */
  range: Range;
  /**
   * Opens the host view's image picker. An image is inserted by URL after an
   * upload (Image is configured `allowBase64: false`, and a local blob URL
   * would be meaningless to a collaborator), so the item cannot insert a node
   * on its own - it has to ask the view.
   */
  requestImage: () => void;
};

export type SlashMenuItem = {
  /** Stable id: used as a test handle and a DOM key, never shown to a user. */
  id: string;
  /** The i18n key of the label. Every visible string goes through the maps. */
  labelKey: keyof typeof messages.en;
  /**
   * Extra match terms for filtering, in BOTH languages plus the ascii
   * shorthands people actually type (`h1`, `todo`, `hr`). Never rendered, so
   * these are not i18n values - they are match keys, and a Russian term here
   * has to stay reachable while the ui is in English.
   */
  keywords: string[];
  /** Inline Lucide-style svg, 24x24, stroke-width 2. Never an emoji. */
  icon: string;
  /** Inserts the block. Receives the range so it can eat the typed `/query`. */
  run: (context: SlashMenuContext) => void;
};

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    id: 'paragraph',
    labelKey: 'slashParagraph',
    keywords: ['text', 'paragraph', 'plain', 'p', 'tekst', 'abzac'],
    icon: lucideIcon(EDITOR_GLYPHS.type),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run();
    },
  },
  {
    id: 'pageLink',
    labelKey: 'slashPageLink',
    keywords: ['link', 'page', 'mention', 'doc', 'document', 'reference', 'block', '@', 'ssylka', 'ссылка', 'страница', 'упоминание', 'документ', 'блок'],
    icon: lucideIcon(EDITOR_GLYPHS.fileText),
    /**
     * Second in the list on purpose - the whole point is to be seen.
     * A visible way into the "@" picker (links to other documents and to
     * headings/blocks), which people didn't find by typing "@". Replaces
     * the typed `/query` with "@": the mention Suggestion plugin re-derives
     * its match from this transaction exactly as for a typed "@" (the same
     * way the block "+" button opens THIS menu by inserting "/"), so the
     * picker, its search and "create page" are the real ones - nothing is
     * duplicated here. The slash menu's own guards (not in code, at a block
     * start or after whitespace) are the ones the "@" picker needs too.
     */
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('@').run();
    },
  },
  {
    id: 'heading1',
    labelKey: 'slashHeading1',
    keywords: ['h1', 'heading', 'title', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.heading1),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    id: 'heading2',
    labelKey: 'slashHeading2',
    keywords: ['h2', 'heading', 'subtitle', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.heading2),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    id: 'heading3',
    labelKey: 'slashHeading3',
    keywords: ['h3', 'heading', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.heading3),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  {
    id: 'heading4',
    labelKey: 'slashHeading4',
    keywords: ['h4', 'heading', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.heading4),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run();
    },
  },
  {
    id: 'heading5',
    labelKey: 'slashHeading5',
    keywords: ['h5', 'heading', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.heading5),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 5 }).run();
    },
  },
  {
    id: 'bulletList',
    labelKey: 'slashBulletList',
    keywords: ['list', 'bullet', 'ul', 'spisok'],
    icon: lucideIcon(EDITOR_GLYPHS.list),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'orderedList',
    labelKey: 'slashOrderedList',
    keywords: ['list', 'ordered', 'numbered', 'ol', 'spisok', 'nomer'],
    icon: lucideIcon(EDITOR_GLYPHS.listOrdered),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'taskList',
    labelKey: 'slashTaskList',
    keywords: ['task', 'todo', 'checkbox', 'checklist', 'zadacha'],
    icon: lucideIcon(EDITOR_GLYPHS.listChecks),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'blockquote',
    labelKey: 'slashQuote',
    keywords: ['quote', 'blockquote', 'citata'],
    icon: lucideIcon(EDITOR_GLYPHS.quote),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'codeBlock',
    labelKey: 'slashCodeBlock',
    keywords: ['code', 'pre', 'snippet', 'kod'],
    icon: lucideIcon(EDITOR_GLYPHS.squareCode),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'callout',
    labelKey: 'slashCallout',
    keywords: ['callout', 'aside', 'note', 'info', 'vynoska'],
    // The same glyph the callout node view draws for its neutral variant, from
    // the same source, so the menu shows the icon the block will actually get.
    icon: calloutIconSvg('info'),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCallout('info').run();
    },
  },
  {
    id: 'tableOfContents',
    labelKey: 'slashTableOfContents',
    keywords: ['toc', 'contents', 'outline', 'table', 'soderzhanie', 'oglavlenie'],
    icon: lucideIcon(EDITOR_GLYPHS.listTree),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTableOfContents().run();
    },
  },
  {
    id: 'collapseHeading',
    labelKey: 'slashCollapseHeading',
    keywords: ['collapse', 'fold', 'toggle', 'heading', 'svernut', 'zagolovok'],
    icon: lucideIcon(EDITOR_GLYPHS.chevronRight),
    run: ({ editor, range }) => {
      // Eat the typed `/query` first, then fold the heading the caret is now
      // in. The item is a no-op outside a heading, which `toggleHeadingCollapse`
      // reports by returning false rather than by throwing.
      editor.chain().focus().deleteRange(range).toggleHeadingCollapse().run();
    },
  },
  {
    id: 'horizontalRule',
    labelKey: 'slashDivider',
    keywords: ['divider', 'rule', 'hr', 'separator', 'razdelitel'],
    icon: lucideIcon(EDITOR_GLYPHS.minus),
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: 'table',
    labelKey: 'slashTable',
    keywords: ['table', 'grid', 'rows', 'columns', 'spreadsheet', 'tablica', 'таблица'],
    icon: lucideIcon(EDITOR_GLYPHS.table),
    /**
     * A KNOWING exception to this file's own stated rule above ("every entry
     * inserts a node the SHARED inventory declares"): table/tableRow/
     * tableCell/tableHeader are not yet in documents/document-nodes.ts (nor
     * its backend twin), so the backend's separate HTML/plainText renderer
     * doesn't recognise them - see the long comment on the Table extension's
     * registration in TextDocumentView.vue for what that does and doesn't
     * break. Flagged in the front task's final report rather than silently
     * left inconsistent with the comment above.
     */
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: 'image',
    labelKey: 'slashImage',
    keywords: ['image', 'picture', 'photo', 'kartinka', 'foto'],
    icon: lucideIcon(EDITOR_GLYPHS.image),
    run: ({ editor, range, requestImage }) => {
      // Eat the typed `/image` first: the upload is async, and leaving the
      // query in the document until it finishes would let a collaborator see
      // it and would put it in a Yjs update.
      editor.chain().focus().deleteRange(range).run();
      requestImage();
    },
  },
];

/**
 * GUARD 1 - a `/` inside code is ordinary text.
 *
 * Checked through `type.spec.code` rather than by node name, so it covers the
 * StarterKit code block, our CodeBlockLowlight replacement and any future
 * code-ish node without a list to keep in sync. The inline `code` MARK carries
 * the same flag, and a `/` inside `<code>foo/bar</code>` is just as literal, so
 * the marks at the position are checked too.
 */
export function isInCodeContext(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.code) return true;
  }

  return $pos.marks().some((mark) => mark.type.spec.code);
}

/**
 * Whether `pos` sits inside any inline mark (bold, italic, underline, strike,
 * link, ...). Still used by the MENTION menu (mention-menu.ts) to keep `@`
 * literal inside a styled run.
 *
 * NOTE: the SLASH menu deliberately no longer consults this. It used to (old
 * "GUARD 1B": a `/` inside a formatted run was suppressed the way code still
 * is), but a user typing `/` on text they had just formatted expected the menu
 * and got nothing - a reported bug. Formatting a run says nothing about whether
 * the next `/` is a command or literal text, so for the slash trigger only code
 * (GUARD 1, genuinely literal) and position (GUARD 2, the mid-word `and/or`
 * rule) gate it now. See `slashMenuAllows`.
 */
export function isInMarkedContext(state: EditorState, pos: number): boolean {
  return state.doc.resolve(pos).marks().length > 0;
}

/**
 * GUARD 2 - a `/` in the middle of a word is not a menu.
 *
 * `and/or`, `km/h` and a pasted `foo/bar` must stay text. The rule is the one
 * a reader would state: the `/` opens the menu only at the start of its block
 * or directly after whitespace.
 *
 * @tiptap/suggestion has an `allowedPrefixes` option that does something
 * similar, and it is deliberately switched OFF where this plugin is configured
 * (`allowedPrefixes: null`). Two half-guards in two places is how one of them
 * ends up silently doing nothing; this is the single one, and it is a function
 * a test can call.
 */
export function isAtBlockStartOrAfterWhitespace(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if ($pos.parentOffset === 0) return true;
  // A leaf reads as a newline: a `/` right after a hard break IS at the start
  // of its line. (Image is configured as a block node, so the only inline leaf
  // that can sit here is a break.)
  const before = $pos.parent.textBetween($pos.parentOffset - 1, $pos.parentOffset, undefined, '\n');

  return /\s/.test(before);
}

/** The trigger guards. `range.from` is the position of the `/` itself. */
export function slashMenuAllows(state: EditorState, range: { from: number }): boolean {
  if (isInCodeContext(state, range.from)) return false;
  if (!isAtBlockStartOrAfterWhitespace(state, range.from)) return false;

  return true;
}

/**
 * Filtering: match the localized label first, then the ascii/other-language
 * keywords, so `/h1`, `/спис` and `/todo` all land somewhere sensible.
 * `label` is injected rather than imported so this stays a pure function and
 * the caller owns which locale is current.
 */
export function filterSlashItems(
  items: SlashMenuItem[],
  query: string,
  label: (item: SlashMenuItem) => string,
): SlashMenuItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  return items.filter(
    (item) =>
      label(item).toLowerCase().includes(needle) ||
      item.keywords.some((keyword) => keyword.toLowerCase().includes(needle)),
  );
}

/** What the view needs to draw the popup. */
export type SlashMenuRender = {
  items: SlashMenuItem[];
  query: string;
  /** Screen rect of the typed `/`, for positioning. Null before layout. */
  rect: DOMRect | null;
  /** Runs the chosen item through the suggestion plugin's own command path. */
  command: (item: SlashMenuItem) => void;
};

export type SlashMenuController = {
  onOpen: (render: SlashMenuRender) => void;
  onUpdate: (render: SlashMenuRender) => void;
  onClose: () => void;
  /** Returns true when the menu consumed the key, so the editor ignores it. */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export type SlashMenuOptions = {
  /** The view's popup. Null means "no ui": the plugin still guards, but draws nothing. */
  controller: SlashMenuController | null;
  label: (item: SlashMenuItem) => string;
  requestImage: () => void;
};

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions() {
    return {
      controller: null,
      label: (item: SlashMenuItem) => item.id,
      requestImage: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion<SlashMenuItem, SlashMenuItem>({
        editor: this.editor,
        pluginKey: SlashMenuPluginKey,
        char: '/',
        // Styled in style.css, so the typed query reads as a query and not
        // as prose while the menu is open. It is a ProseMirror decoration:
        // it never enters the document or a Yjs update.
        decorationClass: 'qcanva-slash-query',
        // Our own `slashMenuAllows` owns the mid-word rule - see GUARD 2.
        allowedPrefixes: null,
        startOfLine: false,
        allow: ({ state, range }) => slashMenuAllows(state, range),
        items: ({ query }) => filterSlashItems(SLASH_MENU_ITEMS, query, options.label),
        command: ({ editor, range, props }) => {
          props.run({ editor, range, requestImage: options.requestImage });
        },
        render: () => {
          const toRender = (props: {
            items: SlashMenuItem[];
            query: string;
            clientRect?: (() => DOMRect | null) | null;
            command: (item: SlashMenuItem) => void;
          }): SlashMenuRender => ({
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
