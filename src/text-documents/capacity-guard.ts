import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import { MAX_TOP_LEVEL_BLOCKS, allowsBlockCountChange } from '../documents/document-capacity';

/**
 * THE BLOCK CEILING, enforced where it is safe to enforce it.
 *
 * A text document is a Yjs CRDT. An update that reaches the server has already
 * been applied on the client that sent it, so a server-side refusal cannot
 * undo anything - it only makes that one client's document differ from
 * everybody else's, silently and for good. The only moment at which a block
 * can be prevented rather than un-done is BEFORE the editor applies it, and
 * `filterTransaction` is that moment: a filtered transaction never reaches the
 * document, so it never reaches the Yjs update, so there is nothing to
 * reconcile.
 *
 * Two things this deliberately does NOT do:
 *
 *  - it does not touch a transaction that came from Yjs. A remote collaborator
 *    (or this document's own initial state) arrives through the y-sync plugin
 *    already applied to the shared document; refusing it here would be the
 *    exact desynchronisation described above, self-inflicted. Those pass
 *    unconditionally, which is why a document CAN legitimately end up over the
 *    limit - two editors filling the last slot at once, for one.
 *  - it does not block editing. Only growth in the top-level block count is
 *    ever refused (see allowsBlockCountChange). A document that is already
 *    over - imported from HTML, or written before this limit existed - stays
 *    fully editable and, above all, fully DELETABLE, which is the only way its
 *    owner can get it back under.
 */

/** Lets a test find the plugin. */
export const CapacityGuardPluginKey = new PluginKey('qcanvaDocumentCapacity');

/**
 * Meta that waives the ceiling for one transaction.
 *
 * Exactly one thing sets it: writing the "continued in ..." link when the user
 * asks to continue on a new page. That link is not authored content, it is the
 * escape hatch itself, and a document whose last slot is full would otherwise
 * be unable to record where it continues - leaving the two pages permanently
 * unconnected, which is a worse outcome than one block over.
 */
export const CAPACITY_OVERRIDE_META = 'qcanvaCapacityOverride';

export type CapacityBlockedInfo = { blocks: number; limit: number };

export type CapacityGuardOptions = {
  limit: number;
  /** Called when a transaction was refused, so the UI can say why. */
  onBlocked: (info: CapacityBlockedInfo) => void;
};

/**
 * Did this transaction come from the shared Yjs document rather than from this
 * user's keyboard?
 *
 * y-prosemirror tags every transaction it dispatches while applying a remote
 * change with its own plugin key. Reading the key it exports beats matching
 * the string it happens to use.
 */
export function isRemoteTransaction(transaction: Transaction): boolean {
  return Boolean(transaction.getMeta(ySyncPluginKey));
}

export const CapacityGuard = Extension.create<CapacityGuardOptions>({
  name: 'documentCapacityGuard',

  addOptions() {
    return {
      limit: MAX_TOP_LEVEL_BLOCKS,
      onBlocked: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: CapacityGuardPluginKey,
        filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          if (isRemoteTransaction(transaction)) return true;
          if (transaction.getMeta(CAPACITY_OVERRIDE_META)) return true;

          const before = state.doc.childCount;
          const after = transaction.doc.childCount;
          if (allowsBlockCountChange(before, after, options.limit)) return true;

          options.onBlocked({ blocks: before, limit: options.limit });
          return false;
        },
      }),
    ];
  },
});
