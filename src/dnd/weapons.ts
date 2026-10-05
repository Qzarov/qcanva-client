import { abilityModifier, proficiencyBonusForLevel, type DndCharacterSheetData, type DndListItem } from './characterSheet';
import { addModifier, formatSigned, parseFormula, type FormulaParse } from './dice';

/**
 * Weapon stats live on an equipment item (`item.weapon`), so a weapon is
 * something the character carries and can equip. Equipped weapons become
 * ready-made attacks: the attack bonus and damage are worked out from the
 * sheet by 5e rules, and either can be overridden by hand.
 */
export type DndWeaponCategory = 'simple' | 'martial';
export type DndWeapon = {
  damage: string;
  damageType: string;
  category: DndWeaponCategory;
  finesse: boolean;
  ranged: boolean;
  /** Two-handed damage of a versatile weapon (e.g. `1d10` for a longsword); empty if not versatile. */
  versatile: string;
  magicBonus: number;
  /** Replaces the computed attack bonus when set. */
  attackBonusOverride: number | null;
  /** Replaces the computed damage bonus (ability + magic) when set. */
  damageBonusOverride: number | null;
};

export const WEAPON_CATEGORY_LABEL: Record<DndWeaponCategory, string> = { simple: 'Простое', martial: 'Воинское' };

export const createWeapon = (): DndWeapon => ({
  damage: '1d6', damageType: '', category: 'simple', finesse: false, ranged: false,
  versatile: '', magicBonus: 0, attackBonusOverride: null, damageBonusOverride: null,
});

const numberOr = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

/** Reads whatever is stored on an item into a complete weapon (old or partial data included). */
export function normalizeWeapon(source: unknown): DndWeapon {
  const data = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const base = createWeapon();
  return {
    damage: typeof data.damage === 'string' ? data.damage : base.damage,
    damageType: typeof data.damageType === 'string' ? data.damageType : '',
    category: data.category === 'martial' ? 'martial' : 'simple',
    finesse: Boolean(data.finesse),
    ranged: Boolean(data.ranged),
    versatile: typeof data.versatile === 'string' ? data.versatile : '',
    magicBonus: numberOr(data.magicBonus, 0),
    attackBonusOverride: nullableNumber(data.attackBonusOverride),
    damageBonusOverride: nullableNumber(data.damageBonusOverride),
  };
}

export const isWeapon = (item: DndListItem) => Boolean((item as { weapon?: unknown }).weapon);
export const weaponOf = (item: DndListItem) => normalizeWeapon((item as { weapon?: unknown }).weapon);

export type WeaponAttack = {
  itemId: string;
  name: string;
  weapon: DndWeapon;
  abilityLabel: string;
  proficient: boolean;
  attackBonus: number;
  /** Flat bonus added to the damage dice (ability + magic, or the override). */
  damageBonus: number;
  /** One-handed damage, then two-handed for a versatile weapon. */
  damage: Array<{ label: string; formula: FormulaParse; type: string }>;
};

/** How an equipped weapon attacks, computed from the sheet. */
export function weaponAttack(sheet: DndCharacterSheetData, item: DndListItem): WeaponAttack {
  const weapon = weaponOf(item);
  const str = abilityModifier(sheet.abilities.strength.score);
  const dex = abilityModifier(sheet.abilities.dexterity.score);
  const useDex = weapon.ranged || (weapon.finesse && dex > str);
  const abilityMod = useDex ? dex : str;
  const proficient = sheet.proficiencies.weapons.includes(WEAPON_CATEGORY_LABEL[weapon.category]);
  const proficiencyBonus = proficiencyBonusForLevel(sheet.identity.level);
  const attackBonus = weapon.attackBonusOverride ?? abilityMod + (proficient ? proficiencyBonus : 0) + weapon.magicBonus;
  const damageBonus = weapon.damageBonusOverride ?? abilityMod + weapon.magicBonus;
  const damage = [{ label: weapon.versatile ? 'Одной рукой' : 'Урон', formula: addModifier(weapon.damage, damageBonus), type: weapon.damageType }];
  if (weapon.versatile.trim()) damage.push({ label: 'Двумя руками', formula: addModifier(weapon.versatile, damageBonus), type: weapon.damageType });
  return {
    itemId: item.id,
    name: item.name.trim() || 'Оружие',
    weapon,
    abilityLabel: useDex ? 'ЛОВ' : 'СИЛ',
    proficient,
    attackBonus,
    damageBonus,
    damage,
  };
}

/** The same attack with no manual overrides: what "auto" would give. */
export const automaticWeaponAttack = (sheet: DndCharacterSheetData, item: DndListItem) =>
  weaponAttack(sheet, { ...item, weapon: { ...weaponOf(item), attackBonusOverride: null, damageBonusOverride: null } } as DndListItem);

export const equippedWeaponAttacks = (sheet: DndCharacterSheetData) =>
  sheet.equipment.filter((item) => item.equipped && isWeapon(item)).map((item) => weaponAttack(sheet, item));

/**
 * The attack bonus typed on a custom attack (`+5`, `5`, or with dice such as
 * `+5+1d4` for Bless). Parsed as a formula added to the d20.
 */
export const parseAttackBonus = (text: string | undefined) => parseFormula(text?.trim() ? text : '0');

export const attackBonusLabel = (bonus: number) => formatSigned(bonus);
