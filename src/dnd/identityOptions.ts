import type { SpellClassKey } from './characterSheet';

/**
 * The races and classes of the SRD 5.1 (the same nine and twelve as the 2014
 * Player's Handbook), with the Russian names of the Russian edition.
 *
 * The sheet still stores a race and a class as plain text, so a homebrew or
 * another book's option can be typed in ("Другая…"). Picking one from the
 * list also sets what follows from it by the rules: a race's walking speed,
 * a class's hit die and - for the eight spellcasters - its spellcasting.
 */
export type RaceOption = { label: string; speed: number };
export type ClassOption = { label: string; hitDie: number; caster?: SpellClassKey };

export const DND_RACES: RaceOption[] = [
  { label: 'Гном', speed: 25 },
  { label: 'Дварф', speed: 25 },
  { label: 'Драконорождённый', speed: 30 },
  { label: 'Полуорк', speed: 30 },
  { label: 'Полурослик', speed: 25 },
  { label: 'Полуэльф', speed: 30 },
  { label: 'Тифлинг', speed: 30 },
  { label: 'Человек', speed: 30 },
  { label: 'Эльф', speed: 30 },
];

export const DND_CLASSES: ClassOption[] = [
  { label: 'Бард', hitDie: 8, caster: 'bard' },
  { label: 'Варвар', hitDie: 12 },
  { label: 'Воин', hitDie: 10 },
  { label: 'Волшебник', hitDie: 6, caster: 'wizard' },
  { label: 'Друид', hitDie: 8, caster: 'druid' },
  { label: 'Жрец', hitDie: 8, caster: 'cleric' },
  { label: 'Колдун', hitDie: 8, caster: 'warlock' },
  { label: 'Монах', hitDie: 8 },
  { label: 'Паладин', hitDie: 10, caster: 'paladin' },
  { label: 'Плут', hitDie: 8 },
  { label: 'Следопыт', hitDie: 10, caster: 'ranger' },
  { label: 'Чародей', hitDie: 6, caster: 'sorcerer' },
];

const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
const find = <T extends { label: string }>(options: T[], value: string | undefined) => {
  const needle = normalize(value ?? '');
  return needle ? options.find((option) => normalize(option.label) === needle) : undefined;
};

/** The listed race or class a stored text names (case and ё/е do not matter), if any. */
export const raceOption = (value: string | undefined) => find(DND_RACES, value);
export const classOption = (value: string | undefined) => find(DND_CLASSES, value);
