import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { nodeSpec } from '../documents/document-nodes';
import { headingOutline, type HeadingOutlineEntry } from '../documents/heading-anchors';
import { collapsedAncestors, headingBlocks } from './collapsible-heading';

/**
 * The table-of-contents block.
 *
 * An ATOM: the author writes nothing inside it. Its list is DERIVED from the
 * document's headings, and derived in two places for two different audiences:
 *
 *  - the BACKEND renders the real list into the stored html
 *    (`<nav data-toc><ul>...</ul></nav>`, linking to the `id` it puts on every
 *    heading), because that html is what canvas previews and MCP clients see
 *    and a table of contents that arrived empty there would be worse than
 *    none at all;
 *  - this file draws the same list in a NODE VIEW, which is DOM the editor
 *    paints around the node and therefore never reaches the Yjs document or
 *    the projection. So the editor shows a live outline while the stored html
 *    stays the single derived copy - the same split the callout uses for its
 *    icon.
 *
 * The anchors come from `documents/heading-anchors.ts`, the twin of the
 * backend's slug and de-duplication rule, so the outline this editor shows
 * names the same ids the projected html contains.
 */

const TAG = nodeSpec('tableOfContents')?.tag ?? 'nav';

export type TableOfContentsLabels = {
  /** The block's own heading, shown above the list. */
  title: string;
  /** Shown instead of the list while the document has no headings. */
  empty: string;
};

export type TableOfContentsOptions = {
  labels: TableOfContentsLabels;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Insert a table of contents at the selection. */
      insertTableOfContents: () => ReturnType;
    };
  }
}

/** The outline the node view draws, read from the live document. */
export function documentOutline(doc: ProseMirrorNode): HeadingOutlineEntry[] {
  return headingOutline(
    headingBlocks(doc).map((block) => ({
      text: block.node.textContent.replace(/\s+/g, ' ').trim(),
      level: block.node.attrs.level,
      collapsed: block.node.attrs.collapsed,
      pos: block.from,
    })),
  );
}

export const TableOfContents = Node.create<TableOfContentsOptions>({
  name: 'tableOfContents',
  group: 'block',
  // No authored content at all: the list is derived, so there is nothing for
  // a caret to be inside.
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      labels: { title: 'Contents', empty: 'No headings yet' },
    };
  },

  parseHTML() {
    // `data-toc` and not the bare tag: a `<nav>` in pasted html is a site's
    // navigation, not a table of contents, and turning one into this block
    // would swallow its links.
    return [{ tag: `${TAG}[data-toc]` }];
  },

  renderHTML({ HTMLAttributes }) {
    // No content hole and no list: the list is derived per render, and
    // freezing it into the markup would leave it behind the moment a heading
    // was retitled. The backend fills the nav when it projects the document.
    return [TAG, mergeAttributes(HTMLAttributes, { 'data-toc': '' })];
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  /**
   * The list lives here and only here: a node view is DOM the editor draws
   * around the node, so it never reaches `editor.getHTML()`, the Yjs document
   * or the stored projection.
   */
  addNodeView() {
    const labels = () => this.options.labels;

    return ({ editor }) => {
      const dom = document.createElement(TAG);
      dom.className = 'text-doc-toc';
      dom.setAttribute('data-toc', '');
      // The whole block is chrome around an atom: nothing in it is editable.
      dom.setAttribute('contenteditable', 'false');

      const heading = document.createElement('div');
      heading.className = 'text-doc-toc-title';
      const list = document.createElement('ol');
      list.className = 'text-doc-toc-list';
      dom.append(heading, list);

      const paint = () => {
        heading.textContent = labels().title;
        list.replaceChildren();
        const outline = documentOutline(editor.state.doc);
        if (outline.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'text-doc-toc-empty';
          empty.textContent = labels().empty;
          list.append(empty);

          return;
        }
        for (const entry of outline) {
          const item = document.createElement('li');
          item.className = 'text-doc-toc-item';
          // The level drives the indent in css, so the outline reads as a
          // tree without this file hardcoding any spacing.
          item.dataset.level = String(entry.level);
          const link = document.createElement('button');
          link.type = 'button';
          link.className = 'text-doc-toc-link';
          // The id the backend will render on that heading, so the outline
          // names the same anchor the stored html links to.
          link.dataset.tocTarget = entry.id;
          // textContent, never innerHTML: heading text is user content.
          link.textContent = entry.text || labels().empty;
          link.addEventListener('mousedown', (event) => {
            event.preventDefault();
            focusHeading(editor, entry.pos);
          });
          item.append(link);
          list.append(item);
        }
      };

      paint();
      // A heading anywhere in the document changes this list, and so does a
      // collaborator's update, but neither changes THIS node - so the node
      // view's own `update` hook would never fire. Redraw on every editor
      // update instead, and let go of the listener when the node goes.
      const onUpdate = () => paint();
      editor.on('update', onUpdate);

      return {
        dom,
        update: (updated) => updated.type.name === 'tableOfContents',
        destroy: () => editor.off('update', onUpdate),
        // The list is chrome, not content: a mutation inside it must not be
        // read back into the document.
        ignoreMutation: () => true,
      };
    };
  },
});

/**
 * Put the caret in a heading and bring it on screen.
 *
 * Position-based rather than a real browser `#anchor` jump: a heading DOES
 * carry a `data-heading-id` attribute now (see heading-id.ts), but that is a
 * data attribute, not an `id` the browser's own fragment navigation reads -
 * this editor is a single Yjs-backed ProseMirror view, not a sequence of
 * addressable pages, so "jump to a heading" is always a scroll+select inside
 * the one already-mounted view. Exported for the outline panel and
 * `headingLink`'s click handler, both of which resolve a target's `pos`
 * their own way before calling this.
 *
 * SCROLLING is the native `Element.scrollIntoView`, not ProseMirror's own
 * chained `.scrollIntoView()` command - found root-causing a report that
 * navigating to a heading ABOVE the current scroll position landed it
 * directly behind `.text-doc-topbar`'s sticky ~65px header (reproduced
 * live: the heading's own rect.top measured well under the topbar's
 * height). ProseMirror's command computes its own "is this in view"
 * viewport math with no notion of a sticky element overlaying part of that
 * viewport; the native call instead respects `scroll-margin-top` (set on
 * headings in style.css), which is exactly the mechanism CSS provides for
 * this - a fixed/sticky header offset - and gets real smooth scrolling
 * (`behavior: 'smooth'`) for free, on whichever ancestor actually scrolls
 * (`.text-doc-page`, not `window` - this editor is not the page's only
 * scrollable element).
 *
 * `focus(null, { scrollIntoView: false })`, not a bare `.focus()`: tiptap's
 * own focus command defaults `scrollIntoView` to `true` and, if left on,
 * runs ProseMirror's OWN scroll-into-view internally (deferred a frame via
 * `requestAnimationFrame` - see @tiptap/core's own focus command) - a
 * SECOND, competing scroll call with exactly the sticky-header blindness
 * described above. Caught live: it did not just leave the wrong final
 * position, it silently cancelled the native smooth scroll below outright
 * for every UPWARD navigation, leaving `.text-doc-page`'s scrollTop
 * completely unchanged - reproduced by comparing a bare
 * `heading.scrollIntoView(...)` (worked) against the exact same call
 * preceded by a plain `.focus()` (did not).
 *
 * EXPANDS first, if the target sits inside a collapsed section
 * (`collapsedAncestors`, collapsible-heading.ts): a heading hidden by
 * `.text-doc-collapsed-block`'s `display: none` has no box for
 * `scrollIntoView` to scroll to at all - reported as "the outline click did
 * nothing", root-caused to exactly that (a live element, invisible, so the
 * call below silently no-ops on it). Expanding goes through
 * `toggleHeadingCollapse` - the SAME command the chevron itself dispatches -
 * never a second way to flip `collapsed`. Every found ancestor opens in ONE
 * transaction (chained), so a doubly-nested fold does not flash the middle
 * layer open before the outer one catches up.
 *
 * The scroll itself waits a `requestAnimationFrame` when (and only when)
 * something was actually expanded: an attribute change is applied to
 * `view.state` synchronously, but the RESULTING layout (the height
 * `scrollIntoView`'s geometry depends on, now that a `display: none` block
 * became visible) is only guaranteed settled once the browser has painted a
 * frame with it - scrolling before that risks measuring against the
 * still-collapsed layout. Skipped entirely when nothing needed opening (the
 * common case, and the ordinary already-visible click this function always
 * handled): no reason to hold a frame for a DOM mutation that never
 * happened.
 */
export function focusHeading(editor: Editor, pos: number): void {
  const ancestors = collapsedAncestors(editor.state.doc, pos);
  if (ancestors.length > 0) {
    let chain = editor.chain();
    for (const ancestor of ancestors) chain = chain.toggleHeadingCollapse(ancestor.from);
    chain.run();
  }

  const reveal = () => {
    editor
      .chain()
      .focus(null, { scrollIntoView: false })
      // +1: inside the heading's text, not on the node boundary.
      .setTextSelection(pos + 1)
      .run();

    // `pos` itself (the heading node's OWN start, not pos + 1) is what
    // `nodeDOM` needs - it resolves the DOM node representing the document
    // node AFTER the given position (see prosemirror-view's own doc comment
    // on nodeDOM). Falls back to the chained command above only if it
    // returns null (an opaque node view, or - a real possibility since this
    // is a live collaborative document - the position no longer points at a
    // heading by the time this runs), so a target still gets roughly on
    // screen rather than not moving at all.
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      editor.chain().scrollIntoView().run();
    }
  };

  if (ancestors.length > 0) {
    requestAnimationFrame(reveal);
  } else {
    reveal();
  }
}
