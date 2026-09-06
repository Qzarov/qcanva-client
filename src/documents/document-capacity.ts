/**
 * How much a text document may hold.
 *
 * This file is duplicated in canvas-server-back (src/text-documents/schema/
 * document-capacity.ts) for the same reason document-nodes.ts is: both halves
 * have to agree, and neither repository's test suite can see the other's copy.
 * The agreement is enforced the same way too - MAX_TOP_LEVEL_BLOCKS and
 * CAPACITY_WARN_PERCENT are serialized into the canonical schema string, which
 * the deploy compares byte for byte across the two repositories.
 *
 * WHAT IS COUNTED: the DIRECT CHILDREN of `doc`, and nothing deeper. A bullet
 * list with forty items is ONE block, because that is the unit the editor and
 * the drag handle move around, and because a per-paragraph count would make
 * the same document cost a different amount depending on how it was marked up.
 *
 * WHO ENFORCES IT: this side, alone. The backend counts and reports; nothing
 * there refuses a write for being over. A text document is a Yjs CRDT, so by
 * the time an update reaches the server the client has already applied it
 * locally: rejecting it does not undo anything, it desynchronises that one
 * client from every other, permanently and invisibly. Refusing the edit BEFORE
 * it is applied is something only the editor can do - see capacity-guard.ts,
 * which filters the transaction rather than reverting it.
 */

/**
 * The ceiling, in top-level blocks.
 *
 * Chosen against the measured per-update cost of a document this size, not as
 * a round number.
 */
export const MAX_TOP_LEVEL_BLOCKS = 200;

/**
 * Where the warning starts, as a percentage of the limit.
 *
 * A percentage rather than a second block count, so the warning threshold can
 * only ever be DERIVED from the limit. Writing 180 anywhere is the bug this
 * shape exists to prevent: raise the limit and a literal silently becomes a
 * warning at 90%, or 60%, or wherever it happens to land.
 */
export const CAPACITY_WARN_PERCENT = 90;

export type DocumentCapacity = {
  /** Top-level blocks the document currently holds. */
  blocks: number;
  /** MAX_TOP_LEVEL_BLOCKS, carried so a client never has to hardcode it. */
  limit: number;
  /** The block count at which the warning starts. */
  warnAt: number;
  /**
   * The document is AT or OVER the ceiling.
   *
   * True does not mean the document is broken or read-only. Documents from
   * before this limit existed, and documents built by HTML import, can be
   * genuinely over it; they stay fully editable so their owner can delete
   * their way back under.
   */
  overLimit: boolean;
};

/** How the editor should present the document's fullness. */
export type CapacityLevel = 'ok' | 'warn' | 'full';

/**
 * The warning threshold for a limit. Takes the limit as an argument rather
 * than reading the constant so the derivation itself is testable at more than
 * one value - a hardcoded return would pass a single-value assertion.
 */
export function capacityWarnThreshold(limit: number = MAX_TOP_LEVEL_BLOCKS): number {
  return Math.floor((limit * CAPACITY_WARN_PERCENT) / 100);
}

/** The capacity report for a known block count. */
export function documentCapacityFor(
  blocks: number,
  limit: number = MAX_TOP_LEVEL_BLOCKS,
): DocumentCapacity {
  return {
    blocks,
    limit,
    warnAt: capacityWarnThreshold(limit),
    overLimit: blocks >= limit,
  };
}

export function capacityLevel(
  blocks: number,
  limit: number = MAX_TOP_LEVEL_BLOCKS,
): CapacityLevel {
  if (blocks >= limit) return 'full';
  if (blocks >= capacityWarnThreshold(limit)) return 'warn';
  return 'ok';
}

/**
 * May a transaction that takes the document from `before` to `after`
 * top-level blocks be applied?
 *
 * The whole limit is this one predicate, and its shape is deliberate:
 *
 *  - a change that does not GROW the block count is always allowed. Typing
 *    inside a block, marking text, deleting a block, merging two - none of it
 *    is affected by the limit, at any size. That is what keeps a document that
 *    is already over (imported, or written before this existed) editable, so
 *    its owner can delete their way back under instead of being locked out of
 *    the one document they most need to fix;
 *  - growth is allowed only while it lands at or under the limit. So a paste
 *    of forty blocks into a document with three slots left is refused whole,
 *    rather than truncated to a shape the user did not ask for.
 */
export function allowsBlockCountChange(
  before: number,
  after: number,
  limit: number = MAX_TOP_LEVEL_BLOCKS,
): boolean {
  if (after <= before) return true;
  return after <= limit;
}
