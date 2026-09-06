import { Node, mergeAttributes } from '@tiptap/core';
import { nodeSpec } from '../documents/document-nodes';
import type { MentionResolution } from '../api/client';

/**
 * The mention node: an inline atom carrying a target text-document's `id`
 * and its title AT INSERT TIME as `label`.
 *
 * Both halves of its wire shape come from the SHARED node inventory
 * (`documents/document-nodes.ts`, mirrored byte-for-byte in canvas-server-back
 * and pinned by the canonical schema string) and from the backend's own
 * `renderMention` (canvas-server-back src/text-documents/projection/render-html.ts):
 * `<span data-mention-id="ID">LABEL</span>` - the id in a data attribute, the
 * label as the element's TEXT, not a second attribute. `parseHTML` and
 * `renderHTML` below match that shape exactly so a document round-trips
 * through this editor's `getHTML()`/paste-html path unchanged.
 *
 * WHAT THIS EDITOR SHOWS is deliberately not what gets serialized: `label` is
 * a snapshot, but a page renamed after being mentioned must show its new name
 * everywhere it was mentioned (see the file comment on `resolveMention`
 * below). That resolution is drawn by the node view only - it never touches
 * `node.attrs` or reaches `editor.getHTML()`, the same separation callout.ts
 * uses for its icon.
 */

const TAG = nodeSpec('mention')?.tag ?? 'span';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mention: {
      insertMention: (attrs: { id: string; label: string }) => ReturnType;
    };
  }
}

export type MentionNodeOptions = {
  /**
   * The CURRENT resolution for a mention target, keyed by id - or `undefined`
   * when it has not loaded yet (or the fetch failed). Always a live lookup
   * into whatever the view is currently holding, never a snapshot handed in
   * once: the whole point is that a rename after insertion must show up
   * without re-inserting the mention.
   */
  resolveMention: (id: string) => MentionResolution | undefined;
  /** Accessible target, clicked: navigate there. */
  onNavigate: (id: string) => void;
  /**
   * Inaccessible target, clicked. The seam a later task wires to an
   * access-request dialog (ruling R3) - this extension does not build that
   * dialog, but the click must reach something, not silently do nothing.
   */
  onInaccessibleClick: (payload: { id: string; label: string }) => void;
  /** Mutable, like `headingCollapseLabels` in TextDocumentView.vue: repainted in place on a locale change. */
  labels: { inaccessible: string; deleted: string };
};

export const Mention = Node.create<MentionNodeOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      resolveMention: () => undefined,
      onNavigate: () => undefined,
      onInaccessibleClick: () => undefined,
      labels: { inaccessible: '', deleted: '' },
    };
  },

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-mention-id') || '',
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-mention-id': attributes.id }),
      },
      label: {
        default: '',
        // The backend's `renderMention` writes the label as the element's
        // text, not an attribute - parsing pasted/collaborator html has to
        // read it back from the same place.
        parseHTML: (element) => element.textContent || '',
        // Rendered as the element's text content by this node's own
        // `renderHTML` below, not as a second HTML attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `${TAG}[data-mention-id]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [TAG, mergeAttributes(HTMLAttributes), (node.attrs.label as string) || ''];
  },

  addCommands() {
    return {
      insertMention:
        (attrs: { id: string; label: string }) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
    };
  },

  /**
   * Live rendering. Chrome only - see the file comment - so `paint` reading
   * `options.resolveMention` and repainting on every `update()` call never
   * touches the document or a Yjs update.
   *
   * `update()` returning `true` unconditionally (rather than diffing first)
   * is deliberate: ProseMirror calls a custom node view's `update` on every
   * existing view during EVERY dispatched transaction, whether or not this
   * particular node changed (see prosemirror-view's `updateChildren`/
   * `CustomNodeViewDesc.update`), which is exactly the hook the view uses to
   * repaint once resolutions finish loading - the caller forces that by
   * dispatching a no-op transaction after the fetch resolves. Diffing first
   * would just be a match against the same live options this always reads.
   */
  addNodeView() {
    // Read live, not destructured once: `this.options` is the SAME object
    // `.configure(...)` handed in, and `resolveMention`/`labels` keep being
    // called fresh on every repaint - see the file comment on `update` below.
    const options = this.options;

    return ({ node }) => {
      const dom = document.createElement(TAG);
      dom.setAttribute('contenteditable', 'false');

      let current = node;

      const paint = () => {
        const id = current.attrs.id as string;
        const storedLabel = (current.attrs.label as string) || '';
        const resolution = options.resolveMention(id);

        dom.className = 'text-doc-mention';
        dom.removeAttribute('title');
        dom.setAttribute('data-mention-id', id);

        if (!resolution) {
          // Not loaded yet, or the fetch failed: the stored label is the
          // only honest fallback - never an empty mention, never a spinner.
          dom.textContent = storedLabel;
          dom.setAttribute('data-mention-state', 'unresolved');
          return;
        }

        if (resolution.deleted) {
          // Inert text (§7.3): never a link, never clickable, visibly not a
          // live reference.
          dom.textContent = storedLabel;
          dom.classList.add('text-doc-mention-deleted');
          dom.setAttribute('data-mention-state', 'deleted');
          if (options.labels.deleted) dom.title = options.labels.deleted;
          return;
        }

        // Accessible or not, the CURRENT title is authoritative - never the
        // stored label - once it has resolved.
        dom.textContent = resolution.title;

        if (resolution.accessible) {
          dom.classList.add('text-doc-mention-accessible');
          dom.setAttribute('data-mention-state', 'accessible');
        } else {
          dom.classList.add('text-doc-mention-inaccessible');
          dom.setAttribute('data-mention-state', 'inaccessible');
          if (options.labels.inaccessible) dom.title = options.labels.inaccessible;
        }
      };

      dom.addEventListener('click', (event) => {
        event.preventDefault();
        const id = current.attrs.id as string;
        const resolution = options.resolveMention(id);
        // Unresolved: accessibility is unknown, so the safe default is to do
        // nothing rather than guess navigable.
        if (!resolution || resolution.deleted) return;
        if (resolution.accessible) {
          options.onNavigate(id);
          return;
        }
        // The CURRENT title, same as what is on screen - not the stale
        // stored label - so a later access-request dialog names the
        // document the user is actually looking at.
        options.onInaccessibleClick({ id, label: resolution.title });
      });

      paint();

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'mention') return false;
          current = updated;
          paint();
          return true;
        },
      };
    };
  },
});
