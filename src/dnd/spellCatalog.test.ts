import { describe, expect, it } from 'vitest';
import { createDndCharacterSheet, DND_ABILITIES, SPELL_CLASS_KEYS, normalizeSpellcasting } from './characterSheet';
import { parseFormula } from './dice';
import { applySheetOperation } from './sheetOperations';
import {
  SPELLCASTER_CLASSES, catalogSpellFormula, catalogSpellItem, classSlots, maxSpellLevel, preparedLimit, preparesSpells,
  searchSpellCatalog, slotsDifferFromClass, type CatalogSpell,
} from './spellCatalog';
import { SPELL_CATALOG } from './spellCatalog.data';

const sheetOf = (casterClass: typeof SPELL_CLASS_KEYS[number] | '', level: number, score = 16) => {
  const sheet = createDndCharacterSheet();
  sheet.identity.level = level;
  sheet.spellcasting.casterClass = casterClass;
  const caster = SPELLCASTER_CLASSES.find((entry) => entry.key === casterClass);
  if (caster) {
    sheet.spellcasting.ability = caster.ability;
    sheet.abilities[caster.ability].score = score;
  }
  return sheet;
};
const spell = (key: string) => SPELL_CATALOG.find((entry) => entry.key === key)!;

describe('spellcaster classes', () => {
  it('cover the eight SRD spellcasters', () => {
    expect(SPELLCASTER_CLASSES.map((entry) => entry.key).sort()).toEqual([...SPELL_CLASS_KEYS].sort());
  });

  it('give full casters the standard slots', () => {
    expect(classSlots('wizard', 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('cleric', 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('bard', 11)).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(classSlots('druid', 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('give half casters no slots at level 1 and half the progression after', () => {
    expect(classSlots('paladin', 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('ranger', 2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('paladin', 9)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('ranger', 20)).toEqual([4, 3, 3, 3, 2, 0, 0, 0, 0]);
  });

  it('give a warlock a few slots of one level', () => {
    expect(classSlots('warlock', 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('warlock', 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(classSlots('warlock', 11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0]);
    expect(classSlots('warlock', 17)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0]);
  });

  it('know the highest spell level, with a warlock reaching past pact slots', () => {
    expect(maxSpellLevel('wizard', 1)).toBe(1);
    expect(maxSpellLevel('wizard', 17)).toBe(9);
    expect(maxSpellLevel('paladin', 1)).toBe(0);
    expect(maxSpellLevel('ranger', 20)).toBe(5);
    expect(maxSpellLevel('warlock', 9)).toBe(5);
    expect(maxSpellLevel('warlock', 11)).toBe(6);
    expect(maxSpellLevel('warlock', 17)).toBe(9);
  });

  it('limit prepared spells for the classes that prepare', () => {
    expect(preparedLimit(sheetOf('cleric', 5))).toBe(8); // +3 and level 5
    expect(preparedLimit(sheetOf('wizard', 1, 8))).toBe(1); // never below one
    expect(preparedLimit(sheetOf('paladin', 5))).toBe(5); // +3 and half the level
    expect(preparedLimit(sheetOf('bard', 5))).toBeNull();
    expect(preparedLimit(sheetOf('', 5))).toBeNull();
    expect(preparesSpells(sheetOf('sorcerer', 3))).toBe(false);
    expect(preparesSpells(sheetOf('druid', 3))).toBe(true);
    expect(preparesSpells(sheetOf('', 3))).toBe(true); // a hand-kept list keeps its ticks
  });

  it('notice when the slots no longer match the class table', () => {
    const sheet = sheetOf('cleric', 3);
    expect(slotsDifferFromClass(sheet)).toBe(true);
    sheet.spellcasting.slots.l1.max = 4;
    sheet.spellcasting.slots.l2.max = 2;
    expect(slotsDifferFromClass(sheet)).toBe(false);
    sheet.identity.level = 4;
    expect(slotsDifferFromClass(sheet)).toBe(true);
    expect(slotsDifferFromClass(sheetOf('', 3))).toBe(false);
  });

  it('are kept only if known when a stored sheet is read', () => {
    expect(normalizeSpellcasting({ casterClass: 'warlock' }).casterClass).toBe('warlock');
    expect(normalizeSpellcasting({ casterClass: 'fighter' }).casterClass).toBe('');
  });

  it("a warlock's slots come back on a short rest, a wizard's do not", () => {
    const rest = (casterClass: string) => (applySheetOperation(
      { spellcasting: { casterClass, slots: { l3: { max: 2, spent: 2 } } } }, { type: 'rest', kind: 'short' },
    ) as any).spellcasting.slots.l3.spent;
    expect(rest('warlock')).toBe(0);
    expect(rest('wizard')).toBe(2);
  });
});

describe('the generated catalog', () => {
  it('has every SRD spell once, with a Russian name and a summary', () => {
    expect(SPELL_CATALOG).toHaveLength(319);
    expect(new Set(SPELL_CATALOG.map((entry) => entry.key)).size).toBe(319);
    for (const entry of SPELL_CATALOG) {
      expect(entry.name, entry.key).toMatch(/[А-Яа-яЁё]/);
      expect(entry.summary.length, entry.key).toBeGreaterThan(10);
      expect(entry.level, entry.key).toBeGreaterThanOrEqual(0);
      expect(entry.level, entry.key).toBeLessThanOrEqual(9);
      expect(entry.classes.length, entry.key).toBeGreaterThan(0);
      for (const classKey of entry.classes) expect(SPELL_CLASS_KEYS, entry.key).toContain(classKey);
      for (const field of [entry.school, entry.time, entry.range, entry.components, entry.duration]) expect(field, entry.key).toBeTruthy();
    }
  });

  it('only carries formulas the sheet can roll, and saves it can name', () => {
    const sheet = sheetOf('cleric', 20);
    for (const entry of SPELL_CATALOG) {
      if (entry.damage) expect(parseFormula(catalogSpellFormula(entry, sheet)).ok, `${entry.key}: ${entry.damage}`).toBe(true);
      for (const formula of Object.values(entry.scale ?? {})) expect(parseFormula(formula).ok, `${entry.key}: ${formula}`).toBe(true);
      if (entry.rollKind === 'save') expect(DND_ABILITIES.map((ability) => ability.key), entry.key).toContain(entry.saveAbility);
      if (entry.duration.startsWith('Концентрация')) expect(entry.concentration, entry.key).toBe(true);
    }
  });

  it('keeps a few well-known spells exactly right', () => {
    expect(spell('fireball')).toMatchObject({ name: 'Огненный шар', level: 3, school: 'Воплощение', range: '150 футов', rollKind: 'save', saveAbility: 'dexterity', damage: '8d6', damageType: 'огонь', classes: ['sorcerer', 'wizard'] });
    expect(spell('cure-wounds')).toMatchObject({ level: 1, range: 'Касание', damage: '1d8+MOD', heal: true });
    expect(spell('fire-bolt')).toMatchObject({ level: 0, rollKind: 'attack', scale: { 1: '1d10', 5: '2d10', 11: '3d10', 17: '4d10' } });
    expect(spell('bless')).toMatchObject({ duration: 'Концентрация, до 1 минуты', concentration: true, components: 'В, С, М' });
    expect(spell('detect-magic')).toMatchObject({ ritual: true, range: 'На себя (сфера 30 футов)' });
    expect(spell('burning-hands').range).toBe('На себя (конус 15 футов)');
  });
});

describe('searching the catalog', () => {
  const names = (groups: ReturnType<typeof searchSpellCatalog>) => groups.flatMap((group) => group.spells.map((entry) => entry.name));

  it('finds a spell by its Russian or English name, whatever the case or ё', () => {
    expect(names(searchSpellCatalog(SPELL_CATALOG, { query: 'огненный ш' }))).toEqual(['Огненный шар', 'Замедленный огненный шар']);
    expect(names(searchSpellCatalog(SPELL_CATALOG, { query: 'FIREBALL' }))).toContain('Огненный шар');
    expect(names(searchSpellCatalog(SPELL_CATALOG, { query: 'пёрышком' }))).toEqual(['Падение пёрышком']);
    expect(names(searchSpellCatalog(SPELL_CATALOG, { query: 'перышком' }))).toEqual(['Падение пёрышком']);
  });

  it('offers a class only what it can cast at its level', () => {
    const groups = searchSpellCatalog(SPELL_CATALOG, { classKey: 'cleric', maxLevel: maxSpellLevel('cleric', 3) });
    expect(groups.map((group) => group.level)).toEqual([0, 1, 2]);
    expect(names(groups)).toContain('Лечение ран');
    expect(names(groups)).not.toContain('Огненный шар'); // not a cleric spell
    expect(names(groups)).not.toContain('Возрождение'); // 3rd level, too high
  });

  it('filters by level and groups cantrips first', () => {
    expect(searchSpellCatalog(SPELL_CATALOG, { level: 0 }).map((group) => group.level)).toEqual([0]);
    expect(searchSpellCatalog(SPELL_CATALOG).map((group) => group.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(searchSpellCatalog(SPELL_CATALOG, { query: 'нет такого' })).toEqual([]);
  });
});

describe('adding a catalog spell to the sheet', () => {
  it('sets up the roll and keeps the facts in the notes', () => {
    expect(catalogSpellItem(spell('fireball'), 'x', sheetOf('wizard', 5))).toEqual({
      id: 'x', name: 'Огненный шар', level: 3, catalogKey: 'fireball', rollKind: 'save', saveAbility: 'dexterity', damage: '8d6', damageType: 'огонь',
      description: 'Воплощение · 1 действие · 150 футов · В, С, М · Мгновенная. Взрыв радиусом 20 футов; спасбросок Ловкости, половина при успехе.',
    });
  });

  it('scales a cantrip with the character level', () => {
    const formula = (level: number) => catalogSpellFormula(spell('fire-bolt'), sheetOf('wizard', level));
    expect([1, 4, 5, 10, 11, 17, 20].map(formula)).toEqual(['1d10', '1d10', '2d10', '2d10', '3d10', '4d10', '4d10']);
  });

  it('puts the spellcasting modifier into the formula', () => {
    const cure = spell('cure-wounds') as CatalogSpell;
    expect(catalogSpellFormula(cure, sheetOf('cleric', 3, 16))).toBe('1d8+3');
    expect(catalogSpellFormula(cure, sheetOf('cleric', 3, 10))).toBe('1d8');
    expect(catalogSpellFormula(cure, sheetOf('cleric', 3, 8))).toBe('1d8-1');
    expect(catalogSpellFormula(cure, sheetOf('', 3))).toBe('1d8'); // no ability chosen yet
    expect(parseFormula(catalogSpellFormula(cure, sheetOf('cleric', 3, 8))).ok).toBe(true);
  });

  it('leaves a spell without dice clean', () => {
    const item = catalogSpellItem(spell('bless'), 'y', sheetOf('cleric', 1));
    expect(item.damage).toBeUndefined();
    expect(item.rollKind).toBeUndefined();
  });
});
