import { describe, expect, it } from 'vitest';
import { createDndCharacterSheet } from './characterSheet';
import { createWeapon, equippedWeaponAttacks, normalizeWeapon, parseAttackBonus, weaponAttack } from './weapons';

const sheet = () => {
  const data = createDndCharacterSheet();
  data.identity.level = 5; // proficiency +3
  data.abilities.strength.score = 16; // +3
  data.abilities.dexterity.score = 18; // +4
  data.proficiencies.weapons = ['Простое', 'Воинское'];
  return data;
};
const item = (weapon: Partial<ReturnType<typeof createWeapon>>, extra: Record<string, unknown> = {}) =>
  ({ id: 'w', name: 'Длинный меч', equipped: true, weapon: { ...createWeapon(), ...weapon }, ...extra });
const formulaText = (attack: ReturnType<typeof weaponAttack>, i = 0) => {
  const formula = attack.damage[i]!.formula;
  return formula.ok ? formula.text : formula.reason;
};

describe('weaponAttack', () => {
  it('uses Strength for a melee weapon and adds proficiency', () => {
    const attack = weaponAttack(sheet(), item({ damage: '1d8', category: 'martial', versatile: '1d10', damageType: 'рубящий' }));
    expect(attack.abilityLabel).toBe('СИЛ');
    expect(attack.attackBonus).toBe(6);
    expect(formulaText(attack, 0)).toBe('1d8+3');
    expect(formulaText(attack, 1)).toBe('1d10+3');
    expect(attack.damage.map((entry) => entry.label)).toEqual(['Одной рукой', 'Двумя руками']);
  });

  it('uses the better of STR and DEX for a finesse weapon, DEX for ranged', () => {
    expect(weaponAttack(sheet(), item({ finesse: true })).attackBonus).toBe(7);
    expect(weaponAttack(sheet(), item({ ranged: true, damage: '1d8' })).abilityLabel).toBe('ЛОВ');
  });

  it('drops proficiency without the category and adds the magic bonus to both rolls', () => {
    const data = sheet();
    data.proficiencies.weapons = ['Простое'];
    const attack = weaponAttack(data, item({ category: 'martial', magicBonus: 1, damage: '1d8' }));
    expect(attack.proficient).toBe(false);
    expect(attack.attackBonus).toBe(4);
    expect(formulaText(attack)).toBe('1d8+4');
  });

  it('honours manual overrides', () => {
    const attack = weaponAttack(sheet(), item({ attackBonusOverride: 9, damageBonusOverride: 0, damage: '2d6' }));
    expect(attack.attackBonus).toBe(9);
    expect(formulaText(attack)).toBe('2d6');
  });

  it('reports an unparsable damage formula instead of guessing', () => {
    const attack = weaponAttack(sheet(), item({ damage: '1d8 огнём' }));
    expect(attack.damage[0]!.formula.ok).toBe(false);
  });
});

describe('equippedWeaponAttacks', () => {
  it('lists only equipped weapons', () => {
    const data = sheet();
    data.equipment = [
      item({}, { id: 'a', name: 'Кинжал' }),
      item({}, { id: 'b', name: 'Лук', equipped: false }),
      { id: 'c', name: 'Верёвка', equipped: true },
    ];
    expect(equippedWeaponAttacks(data).map((attack) => attack.name)).toEqual(['Кинжал']);
  });
});

describe('normalizeWeapon / parseAttackBonus', () => {
  it('fills missing fields of old or partial data', () => {
    expect(normalizeWeapon({ damage: '1d4', attackBonusOverride: '' })).toMatchObject({ damage: '1d4', category: 'simple', attackBonusOverride: null, magicBonus: 0 });
  });
  it('reads custom attack bonuses, empty as +0', () => {
    expect(parseAttackBonus('+5')).toMatchObject({ ok: true, modifier: 5 });
    expect(parseAttackBonus('')).toMatchObject({ ok: true, modifier: 0 });
    expect(parseAttackBonus('+5+1d4')).toMatchObject({ ok: true, modifier: 5, dice: [{ count: 1, sides: 4 }] });
    expect(parseAttackBonus('пять').ok).toBe(false);
  });
});
