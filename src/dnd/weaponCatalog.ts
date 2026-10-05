import type { DndListItem } from './characterSheet';
import { createWeapon, type DndWeapon, type DndWeaponCategory } from './weapons';

/**
 * The standard weapons of the 2014 Player's Handbook (SRD), with the Russian
 * names of the Russian edition. Picking one adds an equipment item with its
 * weapon stats filled in; range and the other properties go to the item's
 * notes, since they are for the players to read, not for the dice.
 */
export type CatalogWeapon = {
  key: string;
  name: string;
  category: DndWeaponCategory;
  ranged: boolean;
  damage: string;
  damageType: string;
  finesse?: boolean;
  versatile?: string;
  properties: string;
};

const simpleMelee: Array<Omit<CatalogWeapon, 'category' | 'ranged'>> = [
  { key: 'quarterstaff', name: 'Боевой посох', damage: '1d6', damageType: 'дробящий', versatile: '1d8', properties: 'Универсальное (1d8)' },
  { key: 'mace', name: 'Булава', damage: '1d6', damageType: 'дробящий', properties: '' },
  { key: 'club', name: 'Дубинка', damage: '1d4', damageType: 'дробящий', properties: 'Лёгкое' },
  { key: 'dagger', name: 'Кинжал', damage: '1d4', damageType: 'колющий', finesse: true, properties: 'Фехтовальное, лёгкое, метательное (20/60)' },
  { key: 'spear', name: 'Копьё', damage: '1d6', damageType: 'колющий', versatile: '1d8', properties: 'Метательное (20/60), универсальное (1d8)' },
  { key: 'light-hammer', name: 'Лёгкий молот', damage: '1d4', damageType: 'дробящий', properties: 'Лёгкое, метательное (20/60)' },
  { key: 'javelin', name: 'Метательное копьё', damage: '1d6', damageType: 'колющий', properties: 'Метательное (30/120)' },
  { key: 'greatclub', name: 'Палица', damage: '1d8', damageType: 'дробящий', properties: 'Двуручное' },
  { key: 'handaxe', name: 'Ручной топор', damage: '1d6', damageType: 'рубящий', properties: 'Лёгкое, метательное (20/60)' },
  { key: 'sickle', name: 'Серп', damage: '1d4', damageType: 'рубящий', properties: 'Лёгкое' },
];

const simpleRanged: Array<Omit<CatalogWeapon, 'category' | 'ranged'>> = [
  { key: 'light-crossbow', name: 'Арбалет, лёгкий', damage: '1d8', damageType: 'колющий', properties: 'Боеприпасы (80/320), перезарядка, двуручное' },
  { key: 'dart', name: 'Дротик', damage: '1d4', damageType: 'колющий', finesse: true, properties: 'Фехтовальное, метательное (20/60)' },
  { key: 'shortbow', name: 'Короткий лук', damage: '1d6', damageType: 'колющий', properties: 'Боеприпасы (80/320), двуручное' },
  { key: 'sling', name: 'Праща', damage: '1d4', damageType: 'дробящий', properties: 'Боеприпасы (30/120)' },
];

const martialMelee: Array<Omit<CatalogWeapon, 'category' | 'ranged'>> = [
  { key: 'halberd', name: 'Алебарда', damage: '1d10', damageType: 'рубящий', properties: 'Двуручное, досягаемость, тяжёлое' },
  { key: 'war-pick', name: 'Боевая кирка', damage: '1d8', damageType: 'колющий', properties: '' },
  { key: 'warhammer', name: 'Боевой молот', damage: '1d8', damageType: 'дробящий', versatile: '1d10', properties: 'Универсальное (1d10)' },
  { key: 'battleaxe', name: 'Боевой топор', damage: '1d8', damageType: 'рубящий', versatile: '1d10', properties: 'Универсальное (1d10)' },
  { key: 'glaive', name: 'Глефа', damage: '1d10', damageType: 'рубящий', properties: 'Двуручное, досягаемость, тяжёлое' },
  { key: 'greatsword', name: 'Двуручный меч', damage: '2d6', damageType: 'рубящий', properties: 'Двуручное, тяжёлое' },
  { key: 'lance', name: 'Длинное копьё', damage: '1d12', damageType: 'колющий', properties: 'Досягаемость, особое' },
  { key: 'longsword', name: 'Длинный меч', damage: '1d8', damageType: 'рубящий', versatile: '1d10', properties: 'Универсальное (1d10)' },
  { key: 'whip', name: 'Кнут', damage: '1d4', damageType: 'рубящий', finesse: true, properties: 'Фехтовальное, досягаемость' },
  { key: 'shortsword', name: 'Короткий меч', damage: '1d6', damageType: 'колющий', finesse: true, properties: 'Фехтовальное, лёгкое' },
  { key: 'maul', name: 'Молот', damage: '2d6', damageType: 'дробящий', properties: 'Двуручное, тяжёлое' },
  { key: 'morningstar', name: 'Моргенштерн', damage: '1d8', damageType: 'колющий', properties: '' },
  { key: 'pike', name: 'Пика', damage: '1d10', damageType: 'колющий', properties: 'Двуручное, досягаемость, тяжёлое' },
  { key: 'rapier', name: 'Рапира', damage: '1d8', damageType: 'колющий', finesse: true, properties: 'Фехтовальное' },
  { key: 'greataxe', name: 'Секира', damage: '1d12', damageType: 'рубящий', properties: 'Двуручное, тяжёлое' },
  { key: 'scimitar', name: 'Скимитар', damage: '1d6', damageType: 'рубящий', finesse: true, properties: 'Фехтовальное, лёгкое' },
  { key: 'trident', name: 'Трезубец', damage: '1d6', damageType: 'колющий', versatile: '1d8', properties: 'Метательное (20/60), универсальное (1d8)' },
  { key: 'flail', name: 'Цеп', damage: '1d8', damageType: 'дробящий', properties: '' },
];

const martialRanged: Array<Omit<CatalogWeapon, 'category' | 'ranged'>> = [
  { key: 'hand-crossbow', name: 'Арбалет, ручной', damage: '1d6', damageType: 'колющий', properties: 'Боеприпасы (30/120), лёгкое, перезарядка' },
  { key: 'heavy-crossbow', name: 'Арбалет, тяжёлый', damage: '1d10', damageType: 'колющий', properties: 'Боеприпасы (100/400), тяжёлое, перезарядка, двуручное' },
  { key: 'longbow', name: 'Длинный лук', damage: '1d8', damageType: 'колющий', properties: 'Боеприпасы (150/600), тяжёлое, двуручное' },
  { key: 'blowgun', name: 'Духовая трубка', damage: '1', damageType: 'колющий', properties: 'Боеприпасы (25/100), перезарядка' },
];

const group = (entries: typeof simpleMelee, category: DndWeaponCategory, ranged: boolean): CatalogWeapon[] =>
  entries.map((entry) => ({ ...entry, category, ranged }));

export const WEAPON_CATALOG_GROUPS: Array<{ title: string; weapons: CatalogWeapon[] }> = [
  { title: 'Простое рукопашное', weapons: group(simpleMelee, 'simple', false) },
  { title: 'Простое дальнобойное', weapons: group(simpleRanged, 'simple', true) },
  { title: 'Воинское рукопашное', weapons: group(martialMelee, 'martial', false) },
  { title: 'Воинское дальнобойное', weapons: group(martialRanged, 'martial', true) },
];

export const WEAPON_CATALOG: CatalogWeapon[] = WEAPON_CATALOG_GROUPS.flatMap((entry) => entry.weapons);

/** Case- and ё-insensitive match on the name, damage type or properties. */
export function searchWeaponCatalog(query: string) {
  const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е');
  const needle = normalize(query.trim());
  if (!needle) return WEAPON_CATALOG_GROUPS;
  return WEAPON_CATALOG_GROUPS
    .map((entry) => ({ ...entry, weapons: entry.weapons.filter((weapon) => normalize(`${weapon.name} ${weapon.damageType} ${weapon.properties}`).includes(needle)) }))
    .filter((entry) => entry.weapons.length);
}

/** A new equipment item for a catalog weapon (not equipped yet). */
export function catalogEquipmentItem(entry: CatalogWeapon, id: string): DndListItem & { weapon: DndWeapon } {
  return {
    id,
    name: entry.name,
    quantity: 1,
    equipped: false,
    description: entry.properties,
    weapon: {
      ...createWeapon(),
      damage: entry.damage,
      damageType: entry.damageType,
      category: entry.category,
      ranged: entry.ranged,
      finesse: Boolean(entry.finesse),
      versatile: entry.versatile ?? '',
    },
  };
}
