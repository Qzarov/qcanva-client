import type { SheetOperation } from './sheetOperations';

/**
 * Setup or play: which side of docs/character-sheet-edit-modes.md an edit is
 * on. Setup data is set once and only edited in setup mode; play data changes
 * at the table. Undo covers setup edits only, and so will restoring from the
 * history; play events are corrected with the sheet's own buttons.
 *
 * The backend keeps the same lists (character-sheet.kinds.ts); the two must
 * classify every operation the same way.
 */
export type SheetEditKind = 'setup' | 'play';

/** Paths (dot-joined, a prefix match) whose values are play data. Everything else under a settable root is setup. */
const PLAY_PATHS = [
  'identity.experience',
  'identity.nextLevelExperience',
  'combat.currentHp',
  'combat.maxHp',
  'combat.temporaryHp',
  'combat.inspiration',
  'combat.exhaustion',
  'combat.conditions',
  'combat.deathSaves',
  'combat.hitDiceSpent',
  'personality',
  'notes',
  'attacksNotes',
  'campaign',
];

/** Fields of a list row that change at the table: spent uses, carried and ticked state. */
export const PLAY_ITEM_FIELDS = new Set(['currentUses', 'quantity', 'equipped', 'prepared', 'completed']);

const PLAY_OPERATION_TYPES = new Set(['hp-change', 'uses-change', 'slot-change', 'rest', 'hit-die', 'death-save']);

const isPlayPath = (path: string[]) => {
  const key = path.join('.');
  // spellcasting.slots.l1.spent is play; .max (or the whole slot) is setup.
  if (path[0] === 'spellcasting' && path[1] === 'slots' && path[3] === 'spent') return true;
  return PLAY_PATHS.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
};

export function operationKind(op: SheetOperation): SheetEditKind {
  if (PLAY_OPERATION_TYPES.has(op.type)) return 'play';
  switch (op.type) {
    case 'set':
    case 'set-add':
    case 'set-remove':
      return isPlayPath(op.path) ? 'play' : 'setup';
    case 'list-update':
      return Object.keys(op.changes).every((key) => PLAY_ITEM_FIELDS.has(key)) ? 'play' : 'setup';
    case 'list-add':
    case 'list-remove':
      return 'setup';
    default:
      return 'play';
  }
}

/** One user action is setup if any part of it is (choosing a class also sets the hit die). */
export const actionKind = (ops: SheetOperation[]): SheetEditKind =>
  ops.some((op) => operationKind(op) === 'setup') ? 'setup' : 'play';

/**
 * The setup part of an action. A list-update that touched both kinds keeps
 * only its setup fields, so undoing a rename never also refills spent uses.
 */
export function setupPart(ops: SheetOperation[]): SheetOperation[] {
  const out: SheetOperation[] = [];
  for (const op of ops) {
    if (operationKind(op) !== 'setup') continue;
    if (op.type === 'list-update') {
      const changes = Object.fromEntries(Object.entries(op.changes).filter(([key]) => !PLAY_ITEM_FIELDS.has(key)));
      out.push({ ...op, changes });
    } else {
      out.push(op);
    }
  }
  return out;
}
