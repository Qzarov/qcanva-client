import { describe, expect, it } from 'vitest';
import { createDndCharacterSheet, normalizeDndCharacterSheet, normalizeSpellcasting } from './characterSheet';
import { applySheetOperation, diffSheet, type SheetOperation } from './sheetOperations';
import { preparedSpellCount, spellAttackBonus, spellGroups, spellSaveDc, spellSlots } from './spells';

const caster = () => {
  const sheet = createDndCharacterSheet();
  sheet.identity.level = 5; // proficiency +3
  sheet.abilities.wisdom.score = 16; // +3
  sheet.spellcasting.ability = 'wisdom';
  return sheet;
};

describe('spellcasting numbers', () => {
  it('are unknown until a spellcasting ability is chosen', () => {
    const sheet = createDndCharacterSheet();
    expect(spellAttackBonus(sheet)).toBeNull();
    expect(spellSaveDc(sheet)).toBeNull();
  });

  it('follow the ability and the level', () => {
    const sheet = caster();
    expect(spellAttackBonus(sheet)).toBe(6);
    expect(spellSaveDc(sheet)).toBe(14);
    sheet.abilities.wisdom.score = 8;
    sheet.identity.level = 1;
    expect(spellAttackBonus(sheet)).toBe(1);
    expect(spellSaveDc(sheet)).toBe(9);
  });
});

describe('spell groups', () => {
  it('shows level 1 on an empty sheet so slots can be entered', () => {
    expect(spellGroups(createDndCharacterSheet()).map((group) => group.level)).toEqual([1]);
  });

  it('puts cantrips first, then levels in use and one more', () => {
    const sheet = caster();
    sheet.spells = [
      { id: 'a', name: 'Огненный шар', level: 3 },
      { id: 'b', name: 'Свет', level: 0 },
      { id: 'c', name: 'Лечение ран', level: 1 },
    ];
    const groups = spellGroups(sheet);
    expect(groups.map((group) => group.level)).toEqual([0, 1, 2, 3, 4]);
    expect(groups[0]!.spells.map((spell) => spell.name)).toEqual(['Свет']);
    expect(groups[2]!.spells).toEqual([]);
  });

  it('keeps a level that has slots but no spells, and stops at 9', () => {
    const sheet = caster();
    sheet.spellcasting.slots.l9.max = 1;
    expect(spellGroups(sheet).map((group) => group.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('counts prepared spells without cantrips', () => {
    const sheet = caster();
    sheet.spells = [
      { id: 'a', name: 'Свет', level: 0, prepared: true },
      { id: 'b', name: 'Щит', level: 1, prepared: true },
      { id: 'c', name: 'Сон', level: 1 },
    ];
    expect(preparedSpellCount(sheet)).toBe(1);
  });
});

// The same cases as canvas-server-back's character-sheet.ops.spec.ts.
describe('spell slot operations', () => {
  const sheet = () => ({ spellcasting: { slots: { l1: { max: 4, spent: 1 }, l3: { max: 2, spent: 2 } } } }) as Record<string, unknown>;
  const slots = (source: Record<string, unknown>, op: SheetOperation) => (applySheetOperation(source, op) as any).spellcasting.slots;

  it('spends and returns slots within what the character has', () => {
    expect(slots(sheet(), { type: 'slot-change', level: 1, delta: 1 }).l1).toEqual({ max: 4, spent: 2 });
    expect(slots(sheet(), { type: 'slot-change', level: 3, delta: 1 }).l3).toEqual({ max: 2, spent: 2 });
    expect(slots(sheet(), { type: 'slot-change', level: 1, delta: -5 }).l1).toEqual({ max: 4, spent: 0 });
    expect(slots(sheet(), { type: 'slot-change', level: 5, delta: 1 }).l5).toEqual({ max: 0, spent: 0 });
  });

  it('a long rest gives every slot back, a short rest none', () => {
    expect(slots(sheet(), { type: 'rest', kind: 'short' }).l1.spent).toBe(1);
    expect(slots(sheet(), { type: 'rest', kind: 'long' })).toEqual({ l1: { max: 4, spent: 0 }, l3: { max: 2, spent: 0 } });
  });

  it('syncs the ability and a slot maximum as field-level sets', () => {
    const prev = JSON.parse(JSON.stringify(createDndCharacterSheet()));
    const next = JSON.parse(JSON.stringify(prev));
    next.spellcasting.ability = 'charisma';
    next.spellcasting.slots.l2.max = 3;
    expect(diffSheet(prev, next)).toEqual(expect.arrayContaining([
      { type: 'set', path: ['spellcasting', 'ability'], value: 'charisma' },
      { type: 'set', path: ['spellcasting', 'slots', 'l2', 'max'], value: 3 },
    ]));
  });
});

describe('stored spellcasting data', () => {
  it('is filled in for sheets saved before spells had slots', () => {
    const sheet = normalizeDndCharacterSheet({ identity: { level: 3 }, spells: [{ id: 'a', name: 'Щит', level: 1 }] });
    expect(sheet.spellcasting.ability).toBe('');
    expect(spellSlots(sheet, 1)).toEqual({ max: 0, spent: 0, remaining: 0 });
    expect(Object.keys(sheet.spellcasting.slots)).toHaveLength(9);
  });

  it('drops an unknown ability and keeps spent within max', () => {
    const data = normalizeSpellcasting({ ability: 'luck', slots: { l1: { max: 2, spent: 7 }, l2: { max: -1, spent: 1 }, l3: { max: 2.9, spent: 1 } } });
    expect(data.ability).toBe('');
    expect(data.slots.l1).toEqual({ max: 2, spent: 2 });
    expect(data.slots.l2).toEqual({ max: 0, spent: 0 });
    expect(data.slots.l3).toEqual({ max: 2, spent: 1 });
  });
});
