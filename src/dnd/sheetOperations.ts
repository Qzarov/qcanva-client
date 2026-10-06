/**
 * Field-level operations on a D&D character sheet - the frontend copy of
 * canvas-server-back/src/interactive-templates/character-sheet.ops.ts. Both
 * sides must apply operations identically: the server applies them to the
 * stored sheet, this module replays the ones still waiting for confirmation
 * on top of the last confirmed state.
 *
 * `diffSheet` turns "the sheet before an edit" and "after" into operations,
 * so the sheet component can keep mutating its data and emitting `change`;
 * only HP and feature-use changes are emitted as explicit delta operations,
 * because concurrent damage must add up rather than overwrite. A rest, a spent
 * hit die and a death save are single operations for the same reason: each
 * touches several fields that must change together.
 */

export const SHEET_LISTS = ['attacks', 'features', 'equipment', 'spells', 'goals'] as const;
export type SheetList = typeof SHEET_LISTS[number];
export type SheetListItem = { id: string; [key: string]: unknown };

export type SheetOperation =
  | { type: 'set'; path: string[]; value: unknown }
  | { type: 'hp-change'; mode: 'heal' | 'damage'; amount: number }
  | { type: 'uses-change'; itemId: string; delta: number }
  | { type: 'rest'; kind: 'short' | 'long' }
  | { type: 'hit-die'; heal: number }
  | { type: 'death-save'; outcome: 'success' | 'failure' | 'critical-failure' | 'critical-success' }
  | { type: 'list-add'; list: SheetList; item: SheetListItem; index?: number }
  | { type: 'list-update'; list: SheetList; itemId: string; changes: Record<string, unknown> }
  | { type: 'list-remove'; list: SheetList; itemId: string }
  | { type: 'set-add' | 'set-remove'; path: string[]; value: string };

/** Top-level keys the server accepts in a `set`. Everything else is view state or legacy. */
const SETTABLE_ROOTS = new Set([
  'identity', 'abilities', 'proficiencyBonus', 'skills', 'combat',
  'passiveBonuses', 'personality', 'proficiencies', 'attacksNotes', 'notes',
]);
/** String sets synced member by member, so two people toggling different members both win. */
const STRING_SET_PATHS = new Set(['combat.conditions', 'proficiencies.armor', 'proficiencies.weapons']);
const MAX_PATH_DEPTH = 4;
const SEGMENT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export class SheetOperationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'SheetOperationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const validSegment = (segment: string) => SEGMENT.test(segment) && !FORBIDDEN_SEGMENTS.has(segment);

/** Same coercion as the server and the sheet normalizer: numeric strings count. */
const numberOr = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function parentOf(root: Record<string, unknown>, path: string[]) {
  let node = root;
  for (const segment of path.slice(0, -1)) {
    if (!isRecord(node[segment])) node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  return node;
}

function objectAt(root: Record<string, unknown>, path: string[]) {
  const parent = parentOf(root, path);
  const key = path[path.length - 1]!;
  if (!isRecord(parent[key])) parent[key] = {};
  return parent[key] as Record<string, unknown>;
}

function listOf(root: Record<string, unknown>, list: SheetList): SheetListItem[] {
  if (!Array.isArray(root[list])) root[list] = [];
  return root[list] as SheetListItem[];
}

const clampInt = (value: unknown, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(numberOr(value, fallback))));

/** Character level, 1-20 (legacy flat sheets keep it at the root). */
function levelOf(sheet: Record<string, unknown>) {
  const identity = isRecord(sheet.identity) ? sheet.identity : {};
  return clampInt(identity.level ?? sheet.level, 1, 1, 20);
}

function deathSavesOf(combat: Record<string, unknown>) {
  const saves = isRecord(combat.deathSaves) ? combat.deathSaves : {};
  return { successes: clampInt(saves.successes, 0, 0, 3), failures: clampInt(saves.failures, 0, 0, 3) };
}

/** Applies an operation, returning a new sheet. Throws `not_found` for a vanished list item. */
export function applySheetOperation(source: Record<string, unknown>, op: SheetOperation): Record<string, unknown> {
  const sheet = clone(source ?? {});
  switch (op.type) {
    case 'set':
      parentOf(sheet, op.path)[op.path[op.path.length - 1]!] = clone(op.value);
      break;
    case 'hp-change': {
      const combat = objectAt(sheet, ['combat']);
      const maxHp = Math.max(1, numberOr(combat.maxHp, 10));
      const currentHp = Math.max(0, numberOr(combat.currentHp ?? sheet.hp, 10));
      const temporaryHp = Math.max(0, numberOr(combat.temporaryHp, 0));
      if (op.mode === 'heal') {
        combat.currentHp = Math.min(maxHp, currentHp + op.amount);
        combat.temporaryHp = temporaryHp;
      } else {
        const absorbed = Math.min(temporaryHp, op.amount);
        combat.currentHp = Math.max(0, currentHp - (op.amount - absorbed));
        combat.temporaryHp = temporaryHp - absorbed;
      }
      // Death saves start from scratch whenever the character gets up or drops.
      if ((combat.currentHp as number) > 0 || currentHp > 0) combat.deathSaves = { successes: 0, failures: 0 };
      break;
    }
    case 'rest': {
      const combat = objectAt(sheet, ['combat']);
      for (const item of listOf(sheet, 'features')) {
        const restores = item.recharge === 'short' || (op.kind === 'long' && item.recharge === 'long');
        const maxUses = Math.max(0, numberOr(item.maxUses, 0));
        if (restores && maxUses > 0) item.currentUses = maxUses;
      }
      if (op.kind === 'long') {
        const level = levelOf(sheet);
        combat.currentHp = Math.max(1, numberOr(combat.maxHp, 10));
        combat.temporaryHp = 0;
        combat.hitDiceSpent = Math.max(0, clampInt(combat.hitDiceSpent, 0, 0, level) - Math.max(1, Math.floor(level / 2)));
        combat.exhaustion = Math.max(0, clampInt(combat.exhaustion, 0, 0, 6) - 1);
        // The sheet shows exhaustion as a condition: once no level is left, it goes too.
        if (combat.exhaustion === 0 && Array.isArray(combat.conditions)) {
          combat.conditions = combat.conditions.filter((value) => value !== 'exhaustion');
        }
        combat.deathSaves = { successes: 0, failures: 0 };
      }
      break;
    }
    case 'hit-die': {
      const combat = objectAt(sheet, ['combat']);
      const level = levelOf(sheet);
      const spent = clampInt(combat.hitDiceSpent, 0, 0, level);
      if (spent >= level) break; // none left: someone else spent the last one first
      const maxHp = Math.max(1, numberOr(combat.maxHp, 10));
      const currentHp = Math.max(0, numberOr(combat.currentHp ?? sheet.hp, 10));
      combat.hitDiceSpent = spent + 1;
      combat.currentHp = Math.min(maxHp, currentHp + op.heal);
      if ((combat.currentHp as number) > 0) combat.deathSaves = { successes: 0, failures: 0 };
      break;
    }
    case 'death-save': {
      const combat = objectAt(sheet, ['combat']);
      const saves = deathSavesOf(combat);
      if (op.outcome === 'critical-success') {
        // A natural 20: back on their feet with 1 HP.
        combat.currentHp = Math.max(1, numberOr(combat.currentHp ?? sheet.hp, 0));
        combat.deathSaves = { successes: 0, failures: 0 };
      } else if (op.outcome === 'success') {
        combat.deathSaves = { ...saves, successes: Math.min(3, saves.successes + 1) };
      } else {
        const failures = saves.failures + (op.outcome === 'critical-failure' ? 2 : 1);
        combat.deathSaves = { ...saves, failures: Math.min(3, failures) };
      }
      break;
    }
    case 'uses-change': {
      const item = listOf(sheet, 'features').find((entry) => entry.id === op.itemId);
      if (!item) throw new SheetOperationError('not_found');
      const maxUses = Math.max(0, numberOr(item.maxUses, 0));
      item.currentUses = Math.min(maxUses, Math.max(0, numberOr(item.currentUses, 0) + op.delta));
      break;
    }
    case 'list-add': {
      const list = listOf(sheet, op.list);
      if (list.some((entry) => entry.id === op.item.id)) break;
      const index = op.index === undefined ? list.length : Math.min(op.index, list.length);
      list.splice(index, 0, clone(op.item));
      break;
    }
    case 'list-update': {
      const item = listOf(sheet, op.list).find((entry) => entry.id === op.itemId);
      if (!item) throw new SheetOperationError('not_found');
      Object.assign(item, clone(op.changes));
      break;
    }
    case 'list-remove': {
      const list = listOf(sheet, op.list);
      const index = list.findIndex((entry) => entry.id === op.itemId);
      if (index >= 0) list.splice(index, 1);
      break;
    }
    case 'set-add':
    case 'set-remove': {
      const parent = parentOf(sheet, op.path);
      const key = op.path[op.path.length - 1]!;
      const current = Array.isArray(parent[key])
        ? (parent[key] as unknown[]).filter((value): value is string => typeof value === 'string')
        : [];
      const without = current.filter((value) => value !== op.value);
      parent[key] = op.type === 'set-add' ? [...without, op.value] : without;
      break;
    }
  }
  return sheet;
}

/** Replays operations over a state, skipping any that no longer apply. */
export function replaySheetOperations(source: Record<string, unknown>, ops: Iterable<SheetOperation>) {
  let sheet = clone(source ?? {});
  for (const op of ops) {
    try { sheet = applySheetOperation(sheet, op); } catch { /* target gone; the server will reject it too */ }
  }
  return sheet;
}

function diffList(list: SheetList, prev: unknown, next: unknown, ops: SheetOperation[]) {
  const before = (Array.isArray(prev) ? prev : []).filter((item): item is SheetListItem => isRecord(item) && typeof item.id === 'string');
  const after = (Array.isArray(next) ? next : []).filter((item): item is SheetListItem => isRecord(item) && typeof item.id === 'string');
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterIds = new Set(after.map((item) => item.id));
  for (const item of before) if (!afterIds.has(item.id)) ops.push({ type: 'list-remove', list, itemId: item.id });
  after.forEach((item, index) => {
    const old = beforeById.get(item.id);
    if (!old) {
      ops.push({ type: 'list-add', list, item: clone(item), index });
      return;
    }
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(item)) {
      if (key !== 'id' && validSegment(key) && item[key] !== undefined && !same(item[key], old[key])) changes[key] = clone(item[key]);
    }
    if (Object.keys(changes).length) ops.push({ type: 'list-update', list, itemId: item.id, changes });
  });
}

function diffValue(path: string[], prev: unknown, next: unknown, ops: SheetOperation[]) {
  if (same(prev, next)) return;
  const key = path.join('.');
  if (STRING_SET_PATHS.has(key) && Array.isArray(next)) {
    const before = new Set(Array.isArray(prev) ? prev.filter((value): value is string => typeof value === 'string') : []);
    const after = new Set(next.filter((value): value is string => typeof value === 'string' && value.trim().length > 0));
    for (const value of before) if (!after.has(value)) ops.push({ type: 'set-remove', path, value });
    for (const value of after) if (!before.has(value)) ops.push({ type: 'set-add', path, value });
    return;
  }
  if (isRecord(prev) && isRecord(next) && path.length < MAX_PATH_DEPTH) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    // A key the server would refuse as a path segment: write the whole object instead.
    if ([...keys].some((child) => !validSegment(child))) {
      ops.push({ type: 'set', path, value: clone(next) });
      return;
    }
    for (const child of keys) {
      if (next[child] === undefined) continue;
      diffValue([...path, child], prev[child], next[child], ops);
    }
    return;
  }
  if (next !== undefined) ops.push({ type: 'set', path, value: clone(next) });
}

/** The operations that turn `prev` into `next` (view state and legacy keys are ignored). */
export function diffSheet(prev: Record<string, unknown>, next: Record<string, unknown>): SheetOperation[] {
  const ops: SheetOperation[] = [];
  for (const list of SHEET_LISTS) diffList(list, prev[list], next[list], ops);
  for (const root of SETTABLE_ROOTS) diffValue([root], prev[root], next[root], ops);
  return ops;
}
