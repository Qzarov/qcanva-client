import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { headingBlocks } from './collapsible-heading';

/**
 * Stable per-heading identity.
 *
 * `headingId` is DOCUMENT state, carried in the shared node inventory's
 * `heading.attrs` exactly like `collapsed`, so it survives a reload and every
 * collaborator sees the same value. Unlike the outline/table-of-contents
 * anchor (`documents/heading-anchors.ts`, `slugifyHeading`), it is NOT
 * derived from the heading's text: it is assigned once, when the heading is
 * created, and never recomputed. A `headingLink` (heading-link-node.ts)
 * stores a target's `headingId`, so the link keeps working after the target
 * is retitled or reordered - a slug-based reference would silently point at
 * the wrong heading (or none) the moment the text it was built from changed.
 *
 * ASSIGNMENT is imperative, not a schema default: a static default value
 * cannot be unique per heading, so something has to actually generate one.
 * Two mechanisms, deliberately not one:
 *
 *  - `HeadingId`'s own `appendTransaction` plugin below backfills every
 *    heading missing an id after ANY transaction that could have produced
 *    one (typed, pasted, split, undone, or arrived from a collaborator) -
 *    the sanctioned ProseMirror way to "look at a transaction's result and
 *    append more changes", unlike dispatching a fresh transaction from
 *    inside an `onUpdate`/`editor.on('update')` handler, which fires as
 *    part of that SAME transaction's own commit cycle - exactly the
 *    reentrancy shape that corrupted the Yjs UndoManager's bookkeeping when
 *    an earlier version of TextDocumentView.vue's REDO WORKAROUND tried it
 *    (see `ensureRedoTracked`'s own comment there for the full story).
 *    `appendTransaction` has no such hazard: ProseMirror runs it OUTSIDE the
 *    transaction it is reacting to, specifically so a plugin can safely
 *    react and append.
 *  - `ensureHeadingIds` is the same backfill, exposed as a plain function
 *    for callers that are NOT inside a transaction's own processing at all -
 *    `onCreate` (fires once, at construction) and the heading-link picker's
 *    search (an async callback) - so a heading is guaranteed to have an id
 *    the moment either runs, without waiting for the NEXT transaction to
 *    trigger the plugin above.
 *
 * TRADE-OFF, accepted deliberately: either mechanism dispatches a real
 * transaction, so it goes through y-prosemirror like any local edit and can
 * become its own entry in the Yjs UndoManager's undo stack (its default
 * ~500ms capture window merges it into whatever edit produced the missing
 * id in the first place, but an old document opened and left untouched for
 * longer gets it as a standalone, invisible-effect step). The cost is at
 * most one extra, no-op-looking Undo press the FIRST time an old document is
 * reopened after this shipped, never again after that document's headings
 * all carry an id - not worth the complexity of suppressing Yjs
 * undo-tracking for one transaction for a cosmetic, one-time quirk.
 */

/** A fresh id, unique enough that two headings never collide in practice. */
function generateHeadingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Every top-level heading in `doc` missing a `headingId`, with the position to assign it at. */
export function headingsMissingId(doc: ProseMirrorNode): { pos: number }[] {
  return headingBlocks(doc)
    .filter((block) => !block.node.attrs.headingId)
    .map((block) => ({ pos: block.from }));
}

/**
 * Assigns a fresh `headingId` to every position `headingsMissingId` found,
 * starting from `tr`. Returns the same transaction, mutated in place (the
 * usual ProseMirror transaction-builder shape) - the caller decides whether
 * `tr.docChanged` is worth dispatching/returning.
 */
function assignHeadingIds(tr: Transaction, missing: { pos: number }[]): Transaction {
  for (const { pos } of missing) {
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type.name !== 'heading') continue;
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, headingId: generateHeadingId() });
  }
  return tr;
}

/**
 * Assign a fresh `headingId` to every heading that lacks one, in one
 * transaction, dispatched directly. A no-op when every heading already has
 * one - the same guard shape as `ensureRedoTracked`, so calling this
 * defensively and often (every time the heading-link picker opens, say)
 * costs nothing once a document has been touched by an updated client.
 *
 * For callers OUTSIDE a transaction's own processing only - see the file
 * comment above for why this must never be called from `onUpdate`.
 */
export function ensureHeadingIds(editor: Editor | undefined): void {
  if (!editor?.state) return;
  const missing = headingsMissingId(editor.state.doc);
  if (missing.length === 0) return;

  const tr = assignHeadingIds(editor.state.tr, missing);
  if (tr.docChanged) editor.view.dispatch(tr);
}

const HeadingIdPluginKey = new PluginKey('qcanvaHeadingId');

/** What a `headingLink` needs about its resolved target: where it is, and its current text. */
export type HeadingIdTarget = { pos: number; text: string };

/**
 * The heading carrying `headingId` in `doc`, if one currently exists.
 *
 * Deliberately NOT `documentOutline`'s slug-based `.id` (table-of-contents.ts,
 * `documents/heading-anchors.ts`): that id is a derived, de-duplicated,
 * TEXT-based anchor for the backend's rendered html and this editor's own
 * outline block, recomputed on every render. A `headingLink` resolves
 * against the heading's STABLE identity instead, which is exactly the
 * property that lets it survive a rename - conflating the two would defeat
 * the whole point of adding `headingId`.
 */
export function findHeadingById(doc: ProseMirrorNode, headingId: string): HeadingIdTarget | undefined {
  if (!headingId) return undefined;
  const block = headingBlocks(doc).find((candidate) => candidate.node.attrs.headingId === headingId);
  if (!block) return undefined;

  return { pos: block.from, text: block.node.textContent.replace(/\s+/g, ' ').trim() };
}

/** One heading available as a `headingLink` target: its stable id and current text. */
export type HeadingIdEntry = { headingId: string; label: string };

/**
 * Every heading in `doc` that already carries a stable id, with its current
 * text - the candidate list the `@`-mention picker's heading section
 * searches (see mention-menu.ts's `searchHeadings`). A heading with none yet
 * (an old document `ensureHeadingIds` has not backfilled) is excluded rather
 * than offered with an empty id: callers run `ensureHeadingIds` first so
 * this list is complete in practice, but this function itself makes no
 * assumption about that having happened.
 */
export function headingIdEntries(doc: ProseMirrorNode): HeadingIdEntry[] {
  return headingBlocks(doc)
    .filter((block) => typeof block.node.attrs.headingId === 'string' && block.node.attrs.headingId)
    .map((block) => ({
      headingId: block.node.attrs.headingId as string,
      label: block.node.textContent.replace(/\s+/g, ' ').trim(),
    }));
}

/**
 * Adds `headingId` to the heading StarterKit already registered, the same
 * way `collapsibleHeading` adds `collapsed` - a global attribute, not a
 * replacement Heading node (see that file's own comment for why).
 */
export const HeadingId = Extension.create({
  name: 'headingId',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          headingId: {
            default: '',
            // A heading made by splitting an existing one is a NEW heading:
            // inheriting the id would let two headings share one identity,
            // exactly the collision `ensureHeadingIds`'s uniqueness exists
            // to prevent. It gets its own id the next time `ensureHeadingIds`
            // runs, same as any other id-less heading.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-heading-id') || '',
            // Emitted only when non-empty, matching `collapsed`'s precedent:
            // the html of a heading nothing has touched yet stays
            // byte-identical to before this attribute existed.
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.headingId ? { 'data-heading-id': attributes.headingId } : {},
          },
        },
      },
    ];
  },

  /**
   * The continuous half of the self-healing story - see the file comment.
   * `docChanged` is checked twice: once on the incoming transactions (skip
   * the scan entirely for a pure selection change, the common case on every
   * cursor move) and once on the built transaction (skip dispatching a
   * transaction that, after the `nodeAt`/type-name guard in
   * `assignHeadingIds`, turned out to change nothing).
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: HeadingIdPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const missing = headingsMissingId(newState.doc);
          if (missing.length === 0) return null;

          const tr = assignHeadingIds(newState.tr, missing);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
