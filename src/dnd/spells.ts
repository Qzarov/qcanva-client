import {
  DND_ABILITIES, SPELL_LEVELS, abilityModifier, proficiencyBonusForLevel, spellSlotKey,
  type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type SpellRollKind,
} from './characterSheet';

/**
 * Spellcasting numbers worked out from the sheet by 5e rules: the save DC is
 * 8 + proficiency + the spellcasting ability's modifier, the spell attack
 * bonus is proficiency + that modifier. Both need a spellcasting ability, so
 * they are `null` until the player picks one.
 */
type SpellSheet = Pick<DndCharacterSheetData, 'identity' | 'abilities' | 'spellcasting'>;

const spellcastingModifier = (sheet: SpellSheet) => {
  const ability = sheet.spellcasting.ability;
  return ability ? abilityModifier(sheet.abilities[ability].score) : null;
};

export const spellAttackBonus = (sheet: SpellSheet): number | null => {
  const modifier = spellcastingModifier(sheet);
  return modifier === null ? null : proficiencyBonusForLevel(sheet.identity.level) + modifier;
};

export const spellSaveDc = (sheet: SpellSheet): number | null => {
  const bonus = spellAttackBonus(sheet);
  return bonus === null ? null : 8 + bonus;
};

export const SPELL_ROLL_OPTIONS: Array<{ value: SpellRollKind; label: string }> = [
  { value: '', label: 'Без броска' },
  { value: 'attack', label: 'Атака заклинанием' },
  { value: 'save', label: 'Спасбросок цели' },
];

export const spellLevelOf = (item: DndListItem) => Math.min(9, Math.max(0, Math.trunc(Number(item.level) || 0)));
export const spellRollKind = (item: DndListItem): SpellRollKind => (item.rollKind === 'attack' || item.rollKind === 'save' ? item.rollKind : '');
export const spellSaveAbility = (item: DndListItem): DndAbilityKey | '' =>
  (DND_ABILITIES.some((ability) => ability.key === item.saveAbility) ? item.saveAbility as DndAbilityKey : '');
export const abilityShort = (key: DndAbilityKey | '') => DND_ABILITIES.find((ability) => ability.key === key)?.short ?? '';

export const spellLevelLabel = (level: number) => (level === 0 ? 'Заговоры' : `${level} уровень`);

/** Slots of one level: what the character has, and how many are still unspent. */
export function spellSlots(sheet: Pick<DndCharacterSheetData, 'spellcasting'>, level: number) {
  const slot = sheet.spellcasting.slots[spellSlotKey(level)];
  const max = Math.max(0, Math.trunc(Number(slot?.max) || 0));
  const spent = Math.min(max, Math.max(0, Math.trunc(Number(slot?.spent) || 0)));
  return { max, spent, remaining: max - spent };
}

export type SpellGroup = { level: number; spells: DndListItem[] };

/**
 * Spells grouped for display: cantrips first (they use no slots), then each
 * spell level that has spells or slots. One more level than the highest in
 * use is shown too, so there is always somewhere to enter the next slots.
 */
export function spellGroups(sheet: Pick<DndCharacterSheetData, 'spells' | 'spellcasting'>): SpellGroup[] {
  const byLevel = new Map<number, DndListItem[]>();
  for (const spell of sheet.spells) {
    const level = spellLevelOf(spell);
    byLevel.set(level, [...(byLevel.get(level) ?? []), spell]);
  }
  const inUse = SPELL_LEVELS.filter((level) => byLevel.has(level) || spellSlots(sheet, level).max > 0);
  const last = Math.min(9, (inUse.length ? inUse[inUse.length - 1]! : 0) + 1);
  const groups: SpellGroup[] = [];
  if (byLevel.has(0)) groups.push({ level: 0, spells: byLevel.get(0)! });
  for (const level of SPELL_LEVELS) {
    if (level <= last) groups.push({ level, spells: byLevel.get(level) ?? [] });
  }
  return groups;
}

/** Leveled spells marked as prepared (cantrips are always available and are not counted). */
export const preparedSpellCount = (sheet: Pick<DndCharacterSheetData, 'spells'>) =>
  sheet.spells.filter((spell) => spellLevelOf(spell) > 0 && spell.prepared).length;
