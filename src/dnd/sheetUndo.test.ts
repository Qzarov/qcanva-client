import { describe, expect, it } from 'vitest';
import { createDndCharacterSheet } from './characterSheet';
import { actionKind, operationKind, setupPart } from './sheetKinds';
import { diffSheet, replaySheetOperations, type SheetOperation } from './sheetOperations';
import { redoOps, undoOps, type UndoEntry } from './sheetUndo';

const base = () => JSON.parse(JSON.stringify(createDndCharacterSheet())) as Record<string, any>;
const edit = (before: Record<string, any>, change: (sheet: Record<string, any>) => void): UndoEntry => {
  const after = JSON.parse(JSON.stringify(before));
  change(after);
  return { ops: setupPart(diffSheet(before, after)), before, after };
};
const apply = (sheet: Record<string, unknown>, ops: SheetOperation[] | null) => {
  if (!ops) throw new Error('step was skipped');
  return replaySheetOperations(sheet, ops) as Record<string, any>;
};

describe('operationKind', () => {
  it.each<[SheetOperation, string]>([
    [{ type: 'set', path: ['identity', 'name'], value: 'x' }, 'setup'],
    [{ type: 'set', path: ['identity', 'level'], value: 3 }, 'setup'],
    [{ type: 'set', path: ['identity', 'experience'], value: 300 }, 'play'],
    [{ type: 'set', path: ['abilities', 'strength', 'score'], value: 16 }, 'setup'],
    [{ type: 'set', path: ['combat', 'armorClass'], value: 15 }, 'setup'],
    [{ type: 'set', path: ['combat', 'hitDie'], value: 10 }, 'setup'],
    [{ type: 'set', path: ['combat', 'currentHp'], value: 5 }, 'play'],
    [{ type: 'set', path: ['combat', 'maxHp'], value: 30 }, 'play'],
    [{ type: 'set', path: ['spellcasting', 'slots', 'l1', 'max'], value: 3 }, 'setup'],
    [{ type: 'set', path: ['spellcasting', 'slots', 'l1', 'spent'], value: 1 }, 'play'],
    [{ type: 'set', path: ['notes'], value: 'x' }, 'play'],
    [{ type: 'set', path: ['campaign', 'canvasId'], value: 'c' }, 'play'],
    [{ type: 'set-add', path: ['combat', 'conditions'], value: 'prone' }, 'play'],
    [{ type: 'set-add', path: ['proficiencies', 'armor'], value: 'Щиты' }, 'setup'],
    [{ type: 'list-add', list: 'spells', item: { id: 's' } }, 'setup'],
    [{ type: 'list-remove', list: 'goals', itemId: 'g' }, 'setup'],
    [{ type: 'list-update', list: 'equipment', itemId: 'e', changes: { quantity: 2, equipped: true } }, 'play'],
    [{ type: 'list-update', list: 'features', itemId: 'f', changes: { maxUses: 3 } }, 'setup'],
    [{ type: 'hp-change', mode: 'damage', amount: 3 }, 'play'],
    [{ type: 'rest', kind: 'long' }, 'play'],
  ])('%j is %s', (op, kind) => {
    expect(operationKind(op)).toBe(kind);
  });

  it('counts a mixed action as setup and keeps only its setup part for undo', () => {
    const ops: SheetOperation[] = [
      { type: 'set', path: ['combat', 'currentHp'], value: 5 },
      { type: 'list-update', list: 'features', itemId: 'f', changes: { name: 'Ярость', currentUses: 1 } },
    ];
    expect(actionKind(ops)).toBe('setup');
    expect(setupPart(ops)).toEqual([{ type: 'list-update', list: 'features', itemId: 'f', changes: { name: 'Ярость' } }]);
  });
});

describe('undo and redo', () => {
  it('puts a field back and redoes it', () => {
    const before = base();
    const entry = edit(before, (sheet) => { sheet.identity.name = 'Торин'; });
    const undone = apply(entry.after, undoOps(entry, entry.after));
    expect(undone.identity.name).toBe(before.identity.name);
    expect(apply(undone, redoOps(entry, undone)).identity.name).toBe('Торин');
  });

  it('brings a removed row back at its old place and removes an added one', () => {
    const before = base();
    before.spells = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const removed = edit(before, (sheet) => { sheet.spells.splice(1, 1); });
    const restored = apply(removed.after, undoOps(removed, removed.after));
    expect(restored.spells.map((spell: { id: string }) => spell.id)).toEqual(['a', 'b', 'c']);

    const added = edit(before, (sheet) => { sheet.goals.push({ id: 'g', name: 'Найти брата' }); });
    expect(apply(added.after, undoOps(added, added.after)).goals).toEqual([]);
  });

  it('undoes a set member and a row field', () => {
    const before = base();
    before.features = [{ id: 'f', name: 'Ярость', maxUses: 2, currentUses: 1 }];
    const entry = edit(before, (sheet) => { sheet.proficiencies.armor.push('Щиты'); sheet.features[0].maxUses = 3; });
    const undone = apply(entry.after, undoOps(entry, entry.after));
    expect(undone.proficiencies.armor).toEqual([]);
    expect(undone.features[0]).toMatchObject({ maxUses: 2, currentUses: 1 });
  });

  it('skips the step when someone else changed the same field since', () => {
    const before = base();
    const entry = edit(before, (sheet) => { sheet.identity.name = 'Торин'; });
    const now = JSON.parse(JSON.stringify(entry.after));
    now.identity.name = 'Двалин'; // the DM renamed after us
    expect(undoOps(entry, now)).toBeNull();
  });

  it('leaves other people’s edits to other fields alone', () => {
    const before = base();
    const entry = edit(before, (sheet) => { sheet.abilities.strength.score = 16; });
    const now = JSON.parse(JSON.stringify(entry.after));
    now.combat.currentHp = 3; // damage taken meanwhile
    now.abilities.dexterity.score = 14; // another field set by the DM
    const undone = apply(now, undoOps(entry, now));
    expect(undone.abilities.strength.score).toBe(10);
    expect(undone.abilities.dexterity.score).toBe(14);
    expect(undone.combat.currentHp).toBe(3);
  });

  it('does not undo play changes made in the same action', () => {
    const before = base();
    const entry = edit(before, (sheet) => { sheet.identity.name = 'Торин'; sheet.combat.currentHp = 2; });
    expect(entry.ops.every((op) => op.type === 'set' && op.path[0] === 'identity')).toBe(true);
    expect(apply(entry.after, undoOps(entry, entry.after)).combat.currentHp).toBe(2);
  });
});
