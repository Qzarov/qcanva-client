import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { CALLOUT_VARIANTS, clampCalloutVariant, nodeSpec } from '../documents/document-nodes';

/**
 * The callout block: an `<aside data-variant="...">` holding arbitrary block
 * content, like a blockquote.
 *
 * Both halves of its shape come from the SHARED node inventory
 * (`documents/document-nodes.ts`, mirrored byte-for-byte in canvas-server-back
 * and pinned by the canonical schema string), not from literals here:
 *
 * - the tag, so this editor's html and the backend's projection cannot
 *   disagree about which element a callout is;
 * - the variant's closed value set, through `clampCalloutVariant`, so a
 *   variant this editor writes is one the backend will render rather than
 *   silently rewrite to "info".
 *
 * The ICON is deliberately not part of the node's html. `renderHTML` emits
 * only `data-variant`, so the html the backend stores, serves for canvas
 * previews and hands to MCP clients carries no per-callout svg. The icon is
 * drawn by the node view below, which exists only in a live editor's DOM.
 */

const TAG = nodeSpec('callout')?.tag ?? 'aside';

/**
 * Lucide-style glyphs: 24x24 on a 0 0 24 24 viewBox, stroke-width 2, no fill -
 * the same shape as every other icon in this project. Never emoji.
 *
 * `info`          -> lucide "info"
 * `warning`       -> lucide "triangle-alert"
 * `success`       -> lucide "circle-check"
 * `danger`        -> lucide "octagon-alert"
 */
const ICON_PATHS = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  danger:
    '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
} as const;

/** The inline svg for a variant. Bounded first, so an unknown one still draws. */
export function calloutIconSvg(variant: unknown): string {
  const bounded = clampCalloutVariant(variant);
  // A variant added to the inventory without a glyph here still draws the
  // neutral one rather than an empty <svg>.
  const paths = ICON_PATHS[bounded as keyof typeof ICON_PATHS] ?? ICON_PATHS.info;

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"' +
    ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
    ` stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection in a callout, or lift it back out of one. */
      toggleCallout: (variant?: string) => ReturnType;
      /** Change the variant of the callout the selection sits in. */
      setCalloutVariant: (variant: string) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  // Block content, like a blockquote: a callout is not a leaf.
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: CALLOUT_VARIANTS[0],
        // Bounded on the way in as well as out. A collaborator's Yjs update
        // reaches this editor without passing the backend's renderer, and
        // pasted html is not trusted either, so an unrecognised variant must
        // become "info" here rather than reaching the document and then being
        // rewritten by the projection.
        parseHTML: (element) => clampCalloutVariant(element.getAttribute('data-variant')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-variant': clampCalloutVariant(attributes.variant),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: TAG }];
  },

  renderHTML({ HTMLAttributes }) {
    // No icon markup: see the file comment. 0 is the content hole.
    return [TAG, mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        (variant?: string) =>
        ({ commands }: CommandProps) =>
          commands.toggleWrap(this.name, {
            variant: clampCalloutVariant(variant),
          }),
      setCalloutVariant:
        (variant: string) =>
        ({ commands }: CommandProps) =>
          commands.updateAttributes(this.name, {
            variant: clampCalloutVariant(variant),
          }),
    };
  },

  /**
   * The icon lives here and only here: a node view is DOM the editor draws
   * around the node's content, so it never reaches `editor.getHTML()`, the Yjs
   * document or therefore the stored projection.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement(TAG);
      dom.className = 'text-doc-callout';
      const icon = document.createElement('span');
      icon.className = 'text-doc-callout-icon';
      // Not editable and not part of the document: the caret must skip it.
      icon.setAttribute('contenteditable', 'false');
      const body = document.createElement('div');
      body.className = 'text-doc-callout-body';

      const paint = (variant: unknown) => {
        const bounded = clampCalloutVariant(variant);
        dom.setAttribute('data-variant', bounded);
        icon.innerHTML = calloutIconSvg(bounded);
      };

      paint(node.attrs.variant);
      dom.append(icon, body);

      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type.name !== 'callout') return false;
          paint(updated.attrs.variant);

          return true;
        },
        // The icon is chrome, not content: a mutation inside it must not be
        // read back into the document.
        ignoreMutation: (mutation) => icon.contains(mutation.target),
      };
    };
  },
});
