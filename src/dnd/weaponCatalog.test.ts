import { describe, expect, it } from 'vitest';
import { parseFormula } from './dice';
import { createDndCharacterSheet } from './characterSheet';
import { catalogEquipmentItem, searchWeaponCatalog, WEAPON_CATALOG } from './weaponCatalog';
import { weaponAttack } from './weapons';

describe('weapon catalog', () => {
  it('has unique keys and names, and every damage formula parses', () => {
    expect(new Set(WEAPON_CATALOG.map((weapon) => weapon.key)).size).toBe(WEAPON_CATALOG.length);
    expect(new Set(WEAPON_CATALOG.map((weapon) => weapon.name)).size).toBe(WEAPON_CATALOG.length);
    for (const weapon of WEAPON_CATALOG) {
      expect(parseFormula(weapon.damage).ok, weapon.name).toBe(true);
      if (weapon.versatile) expect(parseFormula(weapon.versatile).ok, weapon.name).toBe(true);
    }
    expect(WEAPON_CATALOG).toHaveLength(36);
  });

  it.each([
    ['Длинный меч', { damage: '1d8', damageType: 'рубящий', category: 'martial', versatile: '1d10', ranged: false }],
    ['Рапира', { damage: '1d8', damageType: 'колющий', category: 'martial', finesse: true, ranged: false }],
    ['Двуручный меч', { damage: '2d6', damageType: 'рубящий', category: 'martial' }],
    ['Кинжал', { damage: '1d4', category: 'simple', finesse: true }],
    ['Длинный лук', { damage: '1d8', category: 'martial', ranged: true }],
    ['Арбалет, лёгкий', { damage: '1d8', category: 'simple', ranged: true }],
  ])('%s matches the Player’s Handbook', (name, stats) => {
    expect(WEAPON_CATALOG.find((weapon) => weapon.name === name)).toMatchObject(stats);
  });

  it('searches names, damage types and properties, ignoring case and ё', () => {
    const names = (query: string) => searchWeaponCatalog(query).flatMap((group) => group.weapons.map((weapon) => weapon.name));
    expect(names('МЕЧ')).toEqual(expect.arrayContaining(['Длинный меч', 'Короткий меч', 'Двуручный меч']));
    expect(names('легкий')).toContain('Арбалет, лёгкий');
    expect(names('фехтовальное')).toEqual(expect.arrayContaining(['Рапира', 'Кинжал', 'Скимитар']));
    expect(names('дробящий')).not.toContain('Рапира');
    expect(searchWeaponCatalog('нет такого')).toEqual([]);
  });

  it('makes an equipment item that attacks with the right numbers once equipped', () => {
    const item = catalogEquipmentItem(WEAPON_CATALOG.find((weapon) => weapon.key === 'rapier')!, 'r1');
    expect(item).toMatchObject({ id: 'r1', name: 'Рапира', equipped: false, description: 'Фехтовальное' });
    const sheet = createDndCharacterSheet();
    sheet.abilities.dexterity.score = 16;
    sheet.proficiencies.weapons = ['Воинское'];
    const attack = weaponAttack(sheet, { ...item, equipped: true });
    expect(attack.attackBonus).toBe(5); // DEX +3 (finesse), proficiency +2
    expect(attack.damage[0]!.formula.ok && attack.damage[0]!.formula.text).toBe('1d8+3');
  });
});
