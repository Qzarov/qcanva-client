import { describe, expect, it } from 'vitest';
import { applySheetOperation, diffSheet, replaySheetOperations } from './sheetOperations';
import { createDndCharacterSheet } from './characterSheet';

const base = () => JSON.parse(JSON.stringify(createDndCharacterSheet())) as Record<string, any>;

describe('diffSheet', () => {
  it('turns a field edit into one set operation', () => {
    const prev = base();
    const next = base();
    next.identity.race = 'Эльф';
    expect(diffSheet(prev, next)).toEqual([{ type: 'set', path: ['identity', 'race'], value: 'Эльф' }]);
  });

  it('ignores per-viewer state', () => {
    const prev = base();
    const next = base();
    next.activeTab = 'notes';
    next.displayMode = 'compact';
    expect(diffSheet(prev, next)).toEqual([]);
  });

  it('diffs string sets member by member and other arrays as a whole', () => {
    const prev = base();
    prev.combat.conditions = ['prone'];
    const next = base();
    next.combat.conditions = ['poisoned'];
    next.proficiencies.armor = ['Лёгкие'];
    next.proficiencies.languages = ['Общий', 'Эльфийский'];
    expect(diffSheet(prev, next)).toEqual(expect.arrayContaining([
      { type: 'set-remove', path: ['combat', 'conditions'], value: 'prone' },
      { type: 'set-add', path: ['combat', 'conditions'], value: 'poisoned' },
      { type: 'set-add', path: ['proficiencies', 'armor'], value: 'Лёгкие' },
      { type: 'set', path: ['proficiencies', 'languages'], value: ['Общий', 'Эльфийский'] },
    ]));
  });

  it('diffs list items by id', () => {
    const prev = base();
    prev.attacks = [{ id: 'a', name: 'Лук' }, { id: 'b', name: 'Меч' }];
    const next = base();
    next.attacks = [{ id: 'b', name: 'Меч', damage: '1d8' }, { id: 'c', name: '' }];
    expect(diffSheet(prev, next)).toEqual([
      { type: 'list-remove', list: 'attacks', itemId: 'a' },
      { type: 'list-update', list: 'attacks', itemId: 'b', changes: { damage: '1d8' } },
      { type: 'list-add', list: 'attacks', item: { id: 'c', name: '' }, index: 1 },
    ]);
  });

  it('round-trips: applying the diff to the old sheet gives the new one', () => {
    const prev = base();
    prev.features = [{ id: 'f', name: 'Ярость', currentUses: 1, maxUses: 3 }];
    const next = JSON.parse(JSON.stringify(prev));
    next.identity.name = 'Торин';
    next.abilities.strength.score = 18;
    next.skills.athletics = { proficiency: 'proficient', customBonus: 0 };
    next.combat.conditions = ['prone'];
    next.features[0].name = 'Ярость берсерка';
    next.spells = [{ id: 's', name: 'Щит', level: 1 }];
    next.notes = 'Заметка';
    expect(replaySheetOperations(prev, diffSheet(prev, next))).toEqual(next);
  });
});

describe('applySheetOperation', () => {
  it('lets temporary HP absorb damage and caps healing, like calculateHpChange', () => {
    const sheet = { combat: { currentHp: 10, maxHp: 20, temporaryHp: 5 } };
    expect((applySheetOperation(sheet, { type: 'hp-change', mode: 'damage', amount: 8 }) as any).combat).toMatchObject({ currentHp: 7, temporaryHp: 0 });
    expect((applySheetOperation(sheet, { type: 'hp-change', mode: 'heal', amount: 99 }) as any).combat.currentHp).toBe(20);
  });

  it('skips operations whose target vanished when replaying', () => {
    const sheet = { features: [] };
    expect(replaySheetOperations(sheet, [{ type: 'uses-change', itemId: 'gone', delta: 1 }])).toEqual({ features: [] });
  });
});
