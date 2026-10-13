import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import { DOCUMENT_NODES } from '../documents/document-nodes';

/**
 * Stable per-block identity: the address MCP block edits use
 * (text_doc_outline / update_block / ...). Same model as `headingId`
 * (heading-id.ts): assigned once, never derived from content, carried in the
 * shared Yjs document. Two differences: every block type in BLOCK_ID_TYPES
 * gets one, and copies are de-duplicated - a pasted block arrives with its
 * source's id, so the later holder in document order gets a fresh one.
 */
export const BLOCK_ID_TYPES: readonly string[] = DOCUMENT_NODES
  .filter((spec) => spec.attrs?.includes('blockId'))
  .map((spec) => spec.name);

const TYPES = new Set<string>(BLOCK_ID_TYPES);
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function generateBlockId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Blocks with no usable id, or a duplicate of an earlier block's id. */
export function blocksNeedingId(doc: ProseMirrorNode): { pos: number }[] {
  const seen = new Set<string>();
  const needing: { pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!TYPES.has(node.type.name)) return;
    const id = node.attrs.blockId;
    if (typeof id === 'string' && SAFE.test(id) && !seen.has(id)) {
      seen.add(id);
      return;
    }
    needing.push({ pos });
  });
  return needing;
}

function assignBlockIds(tr: Transaction, needing: { pos: number }[]): Transaction {
  for (const { pos } of needing) {
    const node = tr.doc.nodeAt(pos);
    if (!node || !TYPES.has(node.type.name)) continue;
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: generateBlockId() });
  }
  return tr;
}

const BlockIdPluginKey = new PluginKey('qcanvaBlockId');

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_ID_TYPES],
        attributes: {
          blockId: {
            default: '',
            // A split makes a NEW block; it gets its own id from the plugin.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-block-id') || '',
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: BlockIdPluginKey,
        // Only after the user's OWN edit, never after content that arrived
        // through Yjs (the document loading, a collaborator, undo/redo). The
        // ids then ride in that edit's update and its undo step. Assigning
        // on load instead wrote ids for every viewer that merely opened an
        // old document, while its initial state was being applied - a window
        // whose updates are not sent, so every later edit depended on
        // changes the server never got. Old documents get ids with their
        // first edit, or from the server's backfill on text_doc_outline.
        appendTransaction(transactions, _oldState, newState) {
          const byUser = transactions.some(
            (tr) => tr.docChanged && !tr.getMeta(ySyncPluginKey)?.isChangeOrigin,
          );
          if (!byUser) return null;
          const needing = blocksNeedingId(newState.doc);
          if (needing.length === 0) return null;
          const tr = assignBlockIds(newState.tr, needing);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

