import { Extension, type CommandProps } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { clampCollapsed } from '../documents/document-nodes';
import { clampHeadingLevel } from '../documents/heading-anchors';
import { EDITOR_GLYPHS, lucideIcon } from './editor-icons';

/**
 * Collapsible headings.
 *
 * `collapsed` is DOCUMENT state, carried in the shared node inventory's
 * `heading.attrs` and written into the Yjs document like any other attribute,
 * so a fold survives a reload and every collaborator sees the same shape. It
 * is deliberately not per-viewer state.
 *
 * It is also a VIEW HINT and nothing more. The backend's projection renders
 * `data-collapsed="true"` on the heading and still puts every block under it
 * into `html` and `plainText`, because those are the columns document search
 * and the canvas previews read - a collapsed section that dropped out of them
 * would leave the content unfindable rather than folded. This file is the only
 * place anything is actually hidden, and it hides DOM, never content: the
 * blocks stay in the document, in the Yjs update and in the projection.
 *
 * Implemented as an Extension with a global attribute plus decorations, not as
 * a replacement Heading node. StarterKit already registers `heading`, so
 * extending the node would mean disabling its copy and registering another -
 * two nodes racing for one name, which is the mistake the code block had to
 * fix with `codeBlock: false`. A global attribute adds the field to the node
 * StarterKit already registered, and decorations hide the DOM without touching
 * the document.
 */

/** Lets a test read the plugin's decorations. */
export const HeadingCollapsePluginKey = new PluginKey('qcanvaHeadingCollapse');

/** One top-level block, with the positions a decoration needs. */
type TopLevelBlock = {
  node: ProseMirrorNode;
  from: number;
  to: number;
};

function topLevelBlocks(doc: ProseMirrorNode): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = [];
  doc.forEach((node, offset) => {
    blocks.push({ node, from: offset, to: offset + node.nodeSize });
  });

  return blocks;
}

function isHeading(node: ProseMirrorNode): boolean {
  return node.type.name === 'heading';
}

/**
 * The blocks a collapsed heading hides: everything after it up to the next
 * heading of the same or a higher level.
 *
 * "Higher level" means a SMALLER number - an h1 is higher than an h2 - so
 * folding an h2 stops at the next h2 or h1 and swallows the h3s in between,
 * which is the nesting a reader expects. Exported as a pure function over the
 * document so the rule can be asserted directly rather than through the DOM.
 *
 * Ranges from two nested folds can cover the same block; they are keyed by
 * start position so the same block is never decorated twice.
 */
export function collapsedRanges(doc: ProseMirrorNode): { from: number; to: number }[] {
  const blocks = topLevelBlocks(doc);
  const hidden = new Map<number, { from: number; to: number }>();

  blocks.forEach((block, index) => {
    if (!isHeading(block.node) || !clampCollapsed(block.node.attrs.collapsed)) return;
    const level = clampHeadingLevel(block.node.attrs.level);

    for (let next = index + 1; next < blocks.length; next += 1) {
      const candidate = blocks[next];
      if (!candidate) break;
      if (isHeading(candidate.node) && clampHeadingLevel(candidate.node.attrs.level) <= level) {
        break;
      }
      hidden.set(candidate.from, { from: candidate.from, to: candidate.to });
    }
  });

  return [...hidden.values()];
}

/** Every heading, with the position of its node. Used by the outline and tests. */
export function headingBlocks(doc: ProseMirrorNode): TopLevelBlock[] {
  return topLevelBlocks(doc).filter((block) => isHeading(block.node));
}

/**
 * The chevron beside a heading.
 *
 * Inline Lucide-style svg, 24x24 stroke-width 2, from the shared glyph set -
 * never an emoji. It is a widget decoration, so it lives only in this editor's
 * DOM: it never enters the document, a Yjs update or the stored html.
 */
function collapseToggle(
  collapsed: boolean,
  labels: HeadingCollapseLabels,
  editable: boolean,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-doc-heading-toggle';
  button.dataset.headingToggle = collapsed ? 'collapsed' : 'expanded';
  // Not part of the document: the caret must not be able to land in it and a
  // mutation inside it must not be read back.
  button.contentEditable = 'false';
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const label = collapsed ? labels.expand : labels.collapse;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = !editable;
  button.innerHTML = lucideIcon(collapsed ? EDITOR_GLYPHS.chevronRight : EDITOR_GLYPHS.chevronDown);

  return button;
}

export type HeadingCollapseLabels = {
  /** Title for the chevron of an expanded heading. */
  collapse: string;
  /** Title for the chevron of a collapsed heading. */
  expand: string;
};

export type CollapsibleHeadingOptions = {
  labels: HeadingCollapseLabels;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsibleHeading: {
      /**
       * Fold or unfold a heading. With no position, the heading the selection
       * sits in.
       */
      toggleHeadingCollapse: (pos?: number) => ReturnType;
    };
  }
}

/** The heading the position sits in, or null. */
function headingAt(doc: ProseMirrorNode, pos: number): TopLevelBlock | null {
  return headingBlocks(doc).find((block) => pos >= block.from && pos <= block.to) ?? null;
}

export const CollapsibleHeading = Extension.create<CollapsibleHeadingOptions>({
  name: 'collapsibleHeading',

  addOptions() {
    return {
      // Overridden by the view with the localized strings. Defaults keep the
      // extension usable (and testable) without an i18n context.
      labels: { collapse: 'Collapse', expand: 'Expand' },
    };
  },

  /**
   * Adds `collapsed` to the heading StarterKit already registered, rather than
   * registering a second heading node.
   */
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          collapsed: {
            default: false,
            // A new heading made by splitting a collapsed one starts open:
            // inheriting the fold would hide the block the author just made.
            keepOnSplit: false,
            // Bounded on the way in as well as out, and read as a STRING,
            // exactly as the backend's importer does: an html attribute value
            // is always a string, so `clampCollapsed` would - correctly -
            // turn "true" into false.
            parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
            renderHTML: (attributes: Record<string, unknown>) =>
              // Emitted only when true, matching the backend's renderer, so
              // the html of an uncollapsed document does not churn.
              clampCollapsed(attributes.collapsed) ? { 'data-collapsed': 'true' } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleHeadingCollapse:
        (pos?: number) =>
        ({ state, dispatch }: CommandProps) => {
          const target = headingAt(state.doc, pos ?? state.selection.from);
          if (!target) return false;
          if (dispatch) {
            dispatch(
              state.tr.setNodeMarkup(target.from, undefined, {
                ...target.node.attrs,
                collapsed: !clampCollapsed(target.node.attrs.collapsed),
              }),
            );
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const labels = () => this.options.labels;

    return [
      new Plugin({
        key: HeadingCollapsePluginKey,
        props: {
          /**
           * Recomputed on every render rather than cached in plugin state.
           * The scan is over TOP-LEVEL blocks only, so it is linear in the
           * number of blocks - and it has to react to the editor becoming
           * read-only, which is not a document change and would leave a
           * cached set stale.
           */
          decorations: (state) => {
            const editable = editor.isEditable;
            const decorations: Decoration[] = [];

            // Nothing is hidden in a READ-ONLY editor. A reader cannot change
            // document state, so a fold they could not open would hide
            // content from them with no way back - the same reason the
            // projection never drops a collapsed section. They see the whole
            // document and a chevron that shows the state without acting.
            if (editable) {
              for (const range of collapsedRanges(state.doc)) {
                decorations.push(
                  Decoration.node(range.from, range.to, {
                    class: 'text-doc-collapsed-block',
                  }),
                );
              }
            }

            for (const block of headingBlocks(state.doc)) {
              const collapsed = clampCollapsed(block.node.attrs.collapsed);
              decorations.push(
                // Inside the heading, before its content, so the chevron
                // rides with the heading's own line rather than becoming a
                // block between two others.
                Decoration.widget(
                  block.from + 1,
                  (view, getPos) => {
                    const button = collapseToggle(collapsed, labels(), editable);
                    button.addEventListener('mousedown', (event) => {
                      // preventDefault so the click does not move the caret
                      // or start a selection in the heading behind it.
                      event.preventDefault();
                      if (!view.editable) return;
                      // Resolved at CLICK time, not captured at build time:
                      // the document may have moved since this decoration
                      // was created. getPos can return undefined once the
                      // node it decorated is gone.
                      const widgetPos = getPos();
                      if (widgetPos === undefined) return;
                      const pos = widgetPos - 1;
                      const node = view.state.doc.nodeAt(pos);
                      if (!node || node.type.name !== 'heading') return;
                      view.dispatch(
                        view.state.tr.setNodeMarkup(pos, undefined, {
                          ...node.attrs,
                          collapsed: !clampCollapsed(node.attrs.collapsed),
                        }),
                      );
                    });

                    return button;
                  },
                  { side: -1, ignoreSelection: true, key: `toggle-${collapsed}` },
                ),
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
