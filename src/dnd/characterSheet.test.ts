import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  createDndCharacterSheet,
  characterSheetTitle,
  formatModifier,
  normalizeDndCharacterSheet,
  savingThrowBonus,
  skillBonus,
  proficiencyBonusForLevel,
  skillModifier,
  skillAbility,
  passiveScore,
  initiativeBonus,
  DND_SKILLS,
} from './characterSheet';

describe('D&D character sheet calculations', () => {
  it('normalizes saved conditions without dropping unknown labels or accepting malformed values', () => {
    expect(normalizeDndCharacterSheet({ combat: { conditions: ['poisoned', 'poisoned', '  Магическая метка  ', '', null, 12] } }).combat.conditions)
      .toEqual(['poisoned', 'Магическая метка']);
    expect(normalizeDndCharacterSheet({ combat: { conditions: 'poisoned' } }).combat.conditions).toEqual([]);
  });
  it('derives a resource title from the character name, with legacy and empty-name fallbacks', () => {
    expect(characterSheetTitle({ identity: { name: '  Лира  ' } })).toBe('Лира');
    expect(characterSheetTitle({ name: 'Элиан' })).toBe('Элиан');
    expect(characterSheetTitle({ identity: { name: ' ' } })).toBe('Новый персонаж');
    expect(characterSheetTitle(null, 'Старый персонаж')).toBe('Старый персонаж');
  });
  it('calculates and formats ability modifiers', () => {
    expect(abilityModifier(17)).toBe(3);
    expect(abilityModifier(9)).toBe(-1);
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(-1)).toBe('-1');
  });

  it('calculates saving throws and skill proficiency levels', () => {
    expect(savingThrowBonus({ score: 16, savingThrowProficient: true, customSavingThrowBonus: 1 }, 3)).toBe(7);
    expect(skillBonus(14, { proficiency: 'half', customBonus: 0 }, 3)).toBe(3);
    expect(skillBonus(14, { proficiency: 'expertise', customBonus: 1 }, 3)).toBe(9);
  });

  it('derives proficiency bonus from level across the 5e band table', () => {
    expect(proficiencyBonusForLevel(1)).toBe(2);
    expect(proficiencyBonusForLevel(4)).toBe(2);
    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(proficiencyBonusForLevel(8)).toBe(3);
    expect(proficiencyBonusForLevel(9)).toBe(4);
    expect(proficiencyBonusForLevel(12)).toBe(4);
    expect(proficiencyBonusForLevel(13)).toBe(5);
    expect(proficiencyBonusForLevel(17)).toBe(6);
    expect(proficiencyBonusForLevel(20)).toBe(6);
    // Clamped to the 1-20 band.
    expect(proficiencyBonusForLevel(0)).toBe(2);
    expect(proficiencyBonusForLevel(99)).toBe(6);
  });

  it('has all 18 skills, each bound to a real ability', () => {
    expect(DND_SKILLS).toHaveLength(18);
    expect(skillAbility('perception')).toBe('wisdom');
    expect(skillAbility('athletics')).toBe('strength');
    expect(skillAbility('persuasion')).toBe('charisma');
    // Unique keys.
    expect(new Set(DND_SKILLS.map((s) => s.key)).size).toBe(18);
  });

  it('computes a skill modifier off the whole sheet', () => {
    const sheet = createDndCharacterSheet();
    sheet.abilities.wisdom.score = 16; // +3
    sheet.skills.perception = { proficiency: 'proficient', customBonus: 0 };
    // +3 ability + prof(2 at level 1)
    expect(skillModifier(sheet, 'perception', proficiencyBonusForLevel(sheet.identity.level))).toBe(5);
  });

  it('recomputes skills when the ability score changes', () => {
    const sheet = createDndCharacterSheet();
    sheet.skills.stealth = { proficiency: 'proficient', customBonus: 0 };
    const prof = proficiencyBonusForLevel(sheet.identity.level);
    sheet.abilities.dexterity.score = 12; // +1
    expect(skillModifier(sheet, 'stealth', prof)).toBe(3); // +1 + 2
    sheet.abilities.dexterity.score = 18; // +4
    expect(skillModifier(sheet, 'stealth', prof)).toBe(6); // +4 + 2
  });

  it('recomputes proficiency-driven values when the level changes', () => {
    const sheet = createDndCharacterSheet();
    sheet.abilities.charisma.score = 14; // +2
    sheet.skills.persuasion = { proficiency: 'proficient', customBonus: 0 };
    sheet.identity.level = 1;
    expect(skillModifier(sheet, 'persuasion', proficiencyBonusForLevel(sheet.identity.level))).toBe(4); // +2 + 2
    sheet.identity.level = 13;
    expect(skillModifier(sheet, 'persuasion', proficiencyBonusForLevel(sheet.identity.level))).toBe(7); // +2 + 5
  });

  it('computes passive scores as 10 + skill modifier (+ bonus)', () => {
    const sheet = createDndCharacterSheet();
    sheet.abilities.wisdom.score = 14; // +2
    sheet.skills.perception = { proficiency: 'proficient', customBonus: 0 };
    const mod = skillModifier(sheet, 'perception', proficiencyBonusForLevel(sheet.identity.level));
    expect(passiveScore(mod)).toBe(14); // 10 + 2 + 2
    expect(passiveScore(mod, 5)).toBe(19); // + manual bonus
  });

  it('computes initiative from DEX in auto mode and the manual value otherwise', () => {
    const sheet = createDndCharacterSheet();
    sheet.abilities.dexterity.score = 16; // +3
    sheet.combat.customInitiativeBonus = 1;
    expect(initiativeBonus(sheet)).toBe(4); // +3 + 1
    sheet.combat.initiativeMode = 'manual';
    sheet.combat.manualInitiative = 9;
    expect(initiativeBonus(sheet)).toBe(9);
  });

  it('migrates the original flat card payload to the current shape', () => {
    const data = normalizeDndCharacterSheet({ name: 'Лира', level: 3, hp: 8, ac: 15, str: 14 });
    expect(data.identity.name).toBe('Лира');
    expect(data.combat).toMatchObject({ currentHp: 8, maxHp: 10, armorClass: 15 });
    expect(data.abilities.strength.score).toBe(14);
    expect(createDndCharacterSheet().version).toBe(1);
  });

  it('backfills the new fields with defaults on an old payload', () => {
    // An old widget that predates skills / attacksNotes / attack fields.
    const data = normalizeDndCharacterSheet({ name: 'Старый герой', level: 2, hp: 5, ac: 13 });
    expect(data.attacksNotes).toBe('');
    expect(data.skills).toEqual({});
    expect(data.attacks).toEqual([]);
    expect(data.proficiencies).toMatchObject({ armor: [], weapons: [], languages: [], other: [] });
    // Still opens and derives correctly.
    expect(proficiencyBonusForLevel(data.identity.level)).toBe(2);
  });

  it('preserves attack-specific fields through normalize', () => {
    const data = normalizeDndCharacterSheet({
      attacks: [{ id: 'a1', name: 'Longbow', attackBonus: '+5', damage: '1d8+3', damageType: 'piercing', description: 'range 150' }],
    });
    expect(data.attacks[0]).toMatchObject({ name: 'Longbow', attackBonus: '+5', damage: '1d8+3', damageType: 'piercing' });
  });
});
