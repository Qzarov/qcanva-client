import { describe, expect, it } from 'vitest';
import { abilityModifier, createDndCharacterSheet, formatModifier, normalizeDndCharacterSheet, savingThrowBonus, skillBonus } from './characterSheet';

describe('D&D character sheet calculations', () => {
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
  it('migrates the original flat card payload to the current shape', () => {
    const data = normalizeDndCharacterSheet({ name: 'Лира', level: 3, hp: 8, ac: 15, str: 14 });
    expect(data.identity.name).toBe('Лира');
    expect(data.combat).toMatchObject({ currentHp: 8, maxHp: 10, armorClass: 15 });
    expect(data.abilities.strength.score).toBe(14);
    expect(createDndCharacterSheet().version).toBe(1);
  });
});
