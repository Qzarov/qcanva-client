import {
  SPELL_LEVELS, abilityModifier,
  type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type SpellClassKey, type SpellRollKind,
} from './characterSheet';

/**
 * The spellcasting classes of the SRD and the spell catalog built from it.
 *
 * A class tells the sheet which ability casts, how many slots each level
 * gives, how many spells may be prepared and which catalog spells are on
 * offer. The catalog itself (319 spells, mechanics only) is a separate
 * generated module, loaded when the picker opens - see
 * scripts/spell-catalog/build.py.
 */
export type CatalogSpell = {
  key: string;
  name: string;
  /** The SRD name, so a spell can be found by either. */
  en: string;
  level: number;
  school: string;
  time: string;
  range: string;
  components: string;
  duration: string;
  concentration?: boolean;
  ritual?: boolean;
  classes: SpellClassKey[];
  rollKind?: Exclude<SpellRollKind, ''>;
  saveAbility?: DndAbilityKey;
  /** Formula at the spell's own level; `MOD` stands for the spellcasting modifier. */
  damage?: string;
  /** Cantrips: the formula by character level (1, 5, 11, 17). */
  scale?: Record<number, string>;
  damageType?: string;
  heal?: boolean;
  summary: string;
};

type SlotProgression = 'full' | 'half' | 'pact';
export type SpellcasterClass = {
  key: SpellClassKey;
  label: string;
  ability: DndAbilityKey;
  slots: SlotProgression;
  /** Prepares spells each day (cleric, druid, paladin, wizard) rather than knowing a fixed list. */
  prepares: boolean;
};

export const SPELLCASTER_CLASSES: SpellcasterClass[] = [
  { key: 'bard', label: 'Бард', ability: 'charisma', slots: 'full', prepares: false },
  { key: 'wizard', label: 'Волшебник', ability: 'intelligence', slots: 'full', prepares: true },
  { key: 'druid', label: 'Друид', ability: 'wisdom', slots: 'full', prepares: true },
  { key: 'cleric', label: 'Жрец', ability: 'wisdom', slots: 'full', prepares: true },
  { key: 'warlock', label: 'Колдун', ability: 'charisma', slots: 'pact', prepares: false },
  { key: 'paladin', label: 'Паладин', ability: 'charisma', slots: 'half', prepares: true },
  { key: 'ranger', label: 'Следопыт', ability: 'wisdom', slots: 'half', prepares: false },
  { key: 'sorcerer', label: 'Чародей', ability: 'charisma', slots: 'full', prepares: false },
];

export const spellcasterClass = (key: string | undefined) => SPELLCASTER_CLASSES.find((entry) => entry.key === key);

/** Slots of levels 1-9 by class level, rows 1-20 (5e multiclass-free tables). */
const FULL_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const HALF_SLOTS = [
  [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
];
const clampLevel = (level: unknown) => Math.min(20, Math.max(1, Math.trunc(Number(level) || 1)));
/** A warlock's pact slots are all of one level. */
const pactSlotLevel = (level: number) => Math.min(5, Math.ceil(level / 2));
const pactSlotCount = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1);

/** How many slots of each spell level (index 0 = 1st level) the class has at this character level. */
export function classSlots(classKey: SpellClassKey, characterLevel: number): number[] {
  const level = clampLevel(characterLevel);
  const slots = SPELL_LEVELS.map(() => 0);
  const progression = spellcasterClass(classKey)?.slots;
  if (progression === 'pact') slots[pactSlotLevel(level) - 1] = pactSlotCount(level);
  else if (progression) (progression === 'full' ? FULL_SLOTS : HALF_SLOTS)[level - 1]!.forEach((count, index) => { slots[index] = count; });
  return slots;
}

/** The highest spell level the class can cast at this character level (0 = cantrips at most). */
export function maxSpellLevel(classKey: SpellClassKey, characterLevel: number): number {
  const level = clampLevel(characterLevel);
  // Mystic Arcanum gives a warlock one spell of each higher level, without slots.
  if (classKey === 'warlock') return level >= 17 ? 9 : level >= 15 ? 8 : level >= 13 ? 7 : level >= 11 ? 6 : pactSlotLevel(level);
  const slots = classSlots(classKey, level);
  for (let index = slots.length - 1; index >= 0; index -= 1) if (slots[index]) return index + 1;
  return 0;
}

type CasterSheet = Pick<DndCharacterSheetData, 'identity' | 'abilities' | 'spellcasting'>;

/**
 * How many spells the character may have prepared: ability modifier + level
 * (half the level for a paladin), at least one. `null` for classes that know
 * a fixed list instead, and when no class is chosen.
 */
export function preparedLimit(sheet: CasterSheet): number | null {
  const caster = spellcasterClass(sheet.spellcasting.casterClass);
  if (!caster?.prepares) return null;
  const level = clampLevel(sheet.identity.level);
  const modifier = abilityModifier(sheet.abilities[sheet.spellcasting.ability || caster.ability].score);
  return Math.max(1, modifier + (caster.slots === 'half' ? Math.floor(level / 2) : level));
}

/** Whether spells are ticked as prepared: not for classes that simply know their spells. */
export const preparesSpells = (sheet: Pick<DndCharacterSheetData, 'spellcasting'>) =>
  spellcasterClass(sheet.spellcasting.casterClass)?.prepares ?? true;

/** True when the sheet's slot maxima differ from what the chosen class gives at this level. */
export function slotsDifferFromClass(sheet: CasterSheet): boolean {
  const caster = spellcasterClass(sheet.spellcasting.casterClass);
  if (!caster) return false;
  const expected = classSlots(caster.key, sheet.identity.level);
  return SPELL_LEVELS.some((level, index) => (sheet.spellcasting.slots[`l${level}`]?.max ?? 0) !== expected[index]);
}

const normalize = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');

export type SpellCatalogFilter = {
  query?: string;
  /** A spell level, or `null` for all. */
  level?: number | null;
  /** Only spells of this class... */
  classKey?: SpellClassKey | '';
  /** ...and no higher than this level. */
  maxLevel?: number;
};

/** Catalog spells matching the filter, grouped by level (cantrips first). */
export function searchSpellCatalog(catalog: CatalogSpell[], filter: SpellCatalogFilter = {}) {
  const needle = normalize((filter.query ?? '').trim());
  const matches = catalog.filter((spell) => {
    if (filter.level !== null && filter.level !== undefined && spell.level !== filter.level) return false;
    if (filter.classKey && !spell.classes.includes(filter.classKey)) return false;
    if (filter.maxLevel !== undefined && spell.level > filter.maxLevel) return false;
    return !needle || normalize(`${spell.name} ${spell.en} ${spell.school} ${spell.damageType ?? ''}`).includes(needle);
  });
  const groups: Array<{ level: number; spells: CatalogSpell[] }> = [];
  for (const level of [0, ...SPELL_LEVELS]) {
    const spells = matches.filter((spell) => spell.level === level);
    if (spells.length) groups.push({ level, spells });
  }
  return groups;
}

/** The catalog formula for this character: cantrips scale with level, `MOD` becomes the spellcasting modifier. */
export function catalogSpellFormula(spell: CatalogSpell, sheet: CasterSheet): string {
  if (!spell.damage) return '';
  let formula = spell.damage;
  if (spell.scale) {
    const level = clampLevel(sheet.identity.level);
    const step = Object.keys(spell.scale).map(Number).filter((from) => from <= level).sort((a, b) => b - a)[0];
    if (step !== undefined) formula = spell.scale[step]!;
  }
  if (!formula.includes('MOD')) return formula;
  const ability = sheet.spellcasting.ability;
  const modifier = ability ? abilityModifier(sheet.abilities[ability].score) : 0;
  return formula.replace(/\+MOD$/, modifier > 0 ? `+${modifier}` : modifier < 0 ? `-${-modifier}` : '');
}

/** "Воплощение · 1 действие · 150 футов · В, С, М · Мгновенная" - the line shown under a catalog spell. */
export const catalogSpellFacts = (spell: CatalogSpell) =>
  [spell.school, spell.time, spell.range, spell.components, spell.duration, spell.ritual ? 'ритуал' : ''].filter(Boolean).join(' · ');

/** A new sheet spell for a catalog entry, with its roll already set up. */
export function catalogSpellItem(spell: CatalogSpell, id: string, sheet: CasterSheet): DndListItem {
  const item: DndListItem = {
    id,
    name: spell.name,
    level: spell.level,
    catalogKey: spell.key,
    description: `${catalogSpellFacts(spell)}. ${spell.summary}`,
  };
  if (spell.rollKind) item.rollKind = spell.rollKind;
  if (spell.saveAbility) item.saveAbility = spell.saveAbility;
  const formula = catalogSpellFormula(spell, sheet);
  if (formula) item.damage = formula;
  if (spell.damageType) item.damageType = spell.damageType;
  return item;
}

/** Loads the generated catalog (a separate chunk: 319 spells are not needed until the picker opens). */
export const loadSpellCatalog = () => import('./spellCatalog.data').then((module) => module.SPELL_CATALOG);
