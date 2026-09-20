import { Node, mergeAttributes } from '@tiptap/core';
import { nodeSpec } from '../documents/document-nodes';
import { findHeadingById } from './heading-id';

/**
 * The heading-link node: an inline atom linking to a heading in THIS SAME
 * document, by its stable `headingId` (heading-id.ts) - never a document
 * `mention`'s target id, and never a cross-document reference (out of scope,
 * see the design discussion this shipped from).
 *
 * Shaped exactly like `mention` (mention-node.ts), including the wire shape
 * shared with canvas-server-back (`documents/document-nodes.ts`, mirrored
 * there, pinned by schema-contract): `<span data-heading-link-id="ID">LABEL</span>`
 * when the target no longer exists, `<a data-heading-link-id="ID" href="#anchor">LABEL</a>`
 * when it does - see the backend's `renderHeadingLink`.
 *
 * WHAT THIS EDITOR SHOWS is resolved LIVE against the current document on
 * every transaction (via an explicit `editor.on('update', ...)` listener in
 * the node view, the same mechanism `table-of-contents.ts` uses and for the
 * same reason - see that file's own comment and this file's `addNodeView`)
 * - a heading retitled after being linked must show its new text everywhere
 * it is linked from, and a deleted heading must show as inert rather than
 * the stale label. Unlike mention's title resolution, this is synchronous
 * and entirely client-side (`findHeadingById` against `editor.state.doc`):
 * no network round trip, because the target is always in the same document
 * already loaded in this editor.
 */

const TAG = nodeSpec('headingLink')?.tag ?? 'span';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingLink: {
      insertHeadingLink: (attrs: { headingId: string; label: string }) => ReturnType;
    };
  }
}

export type HeadingLinkNodeOptions = {
  /** Scrolls to and selects the heading carrying `headingId` in this document. */
  onNavigate: (headingId: string) => void;
  /** Title shown on a link whose target heading no longer exists. */
  labels: { deleted: string };
};

export const HeadingLink = Node.create<HeadingLinkNodeOptions>({
  name: 'headingLink',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      onNavigate: () => undefined,
      labels: { deleted: '' },
    };
  },

  addAttributes() {
    return {
      headingId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-heading-link-id') || '',
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-heading-link-id': attributes.headingId }),
      },
      label: {
        default: '',
        // Same convention as mention: the backend writes the label as the
        // element's text, not an attribute.
        parseHTML: (element) => element.textContent || '',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `${TAG}[data-heading-link-id]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [TAG, mergeAttributes(HTMLAttributes), (node.attrs.label as string) || ''];
  },

  addCommands() {
    return {
      insertHeadingLink:
        (attrs: { headingId: string; label: string }) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
    };
  },

  /**
   * Live rendering, chrome only - see the file comment. `update()` returning
   * `true` unconditionally mirrors mention's own node view for the same
   * reason: ProseMirror calls it on every dispatched transaction whether or
   * not THIS node changed - which is exactly why repainting can't rely on
   * the node view's own `update()` callback the way mention's does: that
   * callback only runs when ProseMirror's diffing decides THIS node's own
   * instance may have changed, and retitling or deleting a DIFFERENT
   * heading elsewhere leaves this node's own reference untouched. Same gap,
   * same fix as `table-of-contents.ts`'s own node view: an explicit
   * `editor.on('update', ...)` listener repaints on every transaction
   * regardless, unhooked in `destroy()`.
   */
  addNodeView() {
    const options = this.options;

    return ({ node, editor }) => {
      const dom = document.createElement(TAG);
      dom.setAttribute('contenteditable', 'false');

      let current = node;

      const paint = () => {
        const headingId = current.attrs.headingId as string;
        const storedLabel = (current.attrs.label as string) || '';
        const target = findHeadingById(editor.state.doc, headingId);

        dom.className = 'text-doc-heading-link';
        dom.removeAttribute('title');
        dom.setAttribute('data-heading-link-id', headingId);

        if (!target) {
          // Deleted target: inert text, never a link - the same treatment
          // mention gives an inaccessible/deleted document.
          dom.textContent = storedLabel;
          dom.classList.add('text-doc-heading-link-deleted');
          dom.setAttribute('data-heading-link-state', 'deleted');
          if (options.labels.deleted) dom.title = options.labels.deleted;
          return;
        }

        // The CURRENT heading text is authoritative, never the stored label,
        // once the target has resolved - same rule as mention's title.
        dom.textContent = target.text || storedLabel;
        dom.classList.add('text-doc-heading-link-accessible');
        dom.setAttribute('data-heading-link-state', 'accessible');
      };

      dom.addEventListener('click', (event) => {
        event.preventDefault();
        const headingId = current.attrs.headingId as string;
        if (!findHeadingById(editor.state.doc, headingId)) return;
        options.onNavigate(headingId);
      });

      paint();
      const onUpdate = () => paint();
      editor.on('update', onUpdate);

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'headingLink') return false;
          current = updated;
          paint();
          return true;
        },
        destroy: () => editor.off('update', onUpdate),
      };
    };
  },
});
