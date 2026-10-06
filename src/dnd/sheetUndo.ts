import { type SheetList, type SheetListItem, type SheetOperation } from './sheetOperations';

/**
 * Undo and redo of this tab's own setup edits (docs/character-sheet-edit-modes.md,
 * part 2). An entry keeps the setup operations of one user action and the
 * sheet before and after it. Undo is a new edit that puts the targets back to
 * their "before" values, so everyone sees it and it lands in the history.
 *
 * Someone else may have changed the same field since: then the step is
 * skipped, never overwriting their change.
 */
export type UndoEntry = {
  ops: SheetOperation[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

type Sheet = Record<string, unknown>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const valueAt = (sheet: Sheet, path: string[]): unknown => {
  let node: unknown = sheet;
  for (const segment of path) {
    if (!isRecord(node)) return undefined;
    node = node[segment];
  }
  return node;
};

const listOf = (sheet: Sheet, list: SheetList): SheetListItem[] =>
  (Array.isArray(sheet[list]) ? sheet[list] : []) as SheetListItem[];
const itemOf = (sheet: Sheet, list: SheetList, id: string) => listOf(sheet, list).find((item) => item.id === id);
const hasMember = (sheet: Sheet, path: string[], value: string) => {
  const current = valueAt(sheet, path);
  return Array.isArray(current) && current.includes(value);
};

/** What an operation's target looks like in a sheet: the field, the row (or its touched fields), the set membership. */
function targetState(sheet: Sheet, op: SheetOperation): unknown {
  switch (op.type) {
    case 'set':
      return valueAt(sheet, op.path);
    case 'list-add':
      return itemOf(sheet, op.list, op.item.id) ?? null;
    case 'list-remove':
      return itemOf(sheet, op.list, op.itemId) ?? null;
    case 'list-update': {
      const item = itemOf(sheet, op.list, op.itemId);
      return item ? Object.fromEntries(Object.keys(op.changes).map((key) => [key, item[key] ?? null])) : null;
    }
    case 'set-add':
    case 'set-remove':
      return hasMember(sheet, op.path, op.value);
    default:
      return null;
  }
}

/** True when every target of `ops` in `current` still looks as it did in `expected`. */
export const targetsUnchanged = (ops: SheetOperation[], expected: Sheet, current: Sheet) =>
  ops.every((op) => same(targetState(expected, op), targetState(current, op)));

/** Operations that set every target of `ops` to how it is in `target`. */
export function restoreOps(ops: SheetOperation[], target: Sheet): SheetOperation[] {
  const out: SheetOperation[] = [];
  for (const op of ops) {
    switch (op.type) {
      case 'set':
        out.push({ type: 'set', path: op.path, value: clone(valueAt(target, op.path) ?? null) });
        break;
      case 'list-add':
      case 'list-remove':
      case 'list-update': {
        const id = op.type === 'list-add' ? op.item.id : op.itemId;
        const item = itemOf(target, op.list, id);
        if (!item) {
          out.push({ type: 'list-remove', list: op.list, itemId: id });
        } else if (op.type === 'list-update') {
          out.push({ type: 'list-update', list: op.list, itemId: id, changes: Object.fromEntries(Object.keys(op.changes).map((key) => [key, clone(item[key] ?? null)])) });
        } else {
          // Back where it was: same index, whole row.
          out.push({ type: 'list-add', list: op.list, item: clone(item), index: listOf(target, op.list).indexOf(item) });
        }
        break;
      }
      case 'set-add':
      case 'set-remove':
        out.push({ type: hasMember(target, op.path, op.value) ? 'set-add' : 'set-remove', path: op.path, value: op.value });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Undo: the targets must still hold what this tab left there. */
export const undoOps = (entry: UndoEntry, current: Sheet) =>
  targetsUnchanged(entry.ops, entry.after, current) ? restoreOps(entry.ops, entry.before) : null;

/** Redo: the targets must still hold what the undo left there. */
export const redoOps = (entry: UndoEntry, current: Sheet) =>
  targetsUnchanged(entry.ops, entry.before, current) ? restoreOps(entry.ops, entry.after) : null;

