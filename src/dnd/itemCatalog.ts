import type { DndListItem } from './characterSheet';
import { catalogEquipmentItem, WEAPON_CATALOG_GROUPS, type CatalogWeapon } from './weaponCatalog';
import type { DndWeapon } from './weapons';

/**
 * Everything the "+ Добавить" dialog of the equipment tab offers: the weapons
 * of weaponCatalog.ts plus armor, gear, food, potions, tools and packs of the
 * 2014 Player's Handbook (SRD), with the names of the Russian edition.
 *
 * Only what the sheet shows is stored on the item: the name, how many, and a
 * short note (what it does, its AC). The category is for the dialog's filter.
 * Equipping armor does not change the AC: the armor class stays a number the
 * player sets, and the note says what the armor gives.
 */
export type ItemCategory = 'weapon' | 'armor' | 'gear' | 'food' | 'consumable' | 'tool' | 'pack';

export const ITEM_CATEGORIES: Array<{ key: ItemCategory; label: string }> = [
  { key: 'weapon', label: 'Оружие' },
  { key: 'armor', label: 'Доспехи' },
  { key: 'gear', label: 'Снаряжение' },
  { key: 'food', label: 'Еда' },
  { key: 'consumable', label: 'Зелья' },
  { key: 'tool', label: 'Инструменты' },
  { key: 'pack', label: 'Наборы' },
];

export type CatalogItem = {
  key: string;
  name: string;
  category: ItemCategory;
  /** The heading it is listed under in the dialog. */
  group: string;
  /** Short facts on the right of the row (damage, AC, how many). */
  facts: string;
  /** The note the item gets on the sheet. */
  description: string;
  quantity: number;
  weapon?: CatalogWeapon;
  /** A pack adds its contents, each as its own item. */
  contents?: Array<{ key: string; quantity: number }>;
};

type Entry = Omit<CatalogItem, 'category' | 'group' | 'facts' | 'quantity'> & { facts?: string; quantity?: number };

const listed = (category: ItemCategory, group: string, entries: Entry[]): CatalogItem[] =>
  entries.map((entry) => ({ facts: '', quantity: 1, ...entry, category, group }));

const weapons: CatalogItem[] = WEAPON_CATALOG_GROUPS.flatMap((entry) => entry.weapons.map((weapon) => ({
  key: `weapon:${weapon.key}`,
  name: weapon.name,
  category: 'weapon' as const,
  group: entry.title,
  facts: `${weapon.damage} ${weapon.damageType}`,
  description: weapon.properties,
  quantity: 1,
  weapon,
})));

const armor: CatalogItem[] = [
  ...listed('armor', 'Лёгкие доспехи', [
    { key: 'padded', name: 'Стёганый доспех', facts: 'КД 11 + ЛОВ', description: 'КД 11 + мод. ЛОВ; помеха на Скрытность' },
    { key: 'leather', name: 'Кожаный доспех', facts: 'КД 11 + ЛОВ', description: 'КД 11 + мод. ЛОВ' },
    { key: 'studded-leather', name: 'Проклёпанный кожаный доспех', facts: 'КД 12 + ЛОВ', description: 'КД 12 + мод. ЛОВ' },
  ]),
  ...listed('armor', 'Средние доспехи', [
    { key: 'hide', name: 'Шкурный доспех', facts: 'КД 12 + ЛОВ (макс. 2)', description: 'КД 12 + мод. ЛОВ (макс. 2)' },
    { key: 'chain-shirt', name: 'Кольчужная рубаха', facts: 'КД 13 + ЛОВ (макс. 2)', description: 'КД 13 + мод. ЛОВ (макс. 2)' },
    { key: 'scale-mail', name: 'Чешуйчатый доспех', facts: 'КД 14 + ЛОВ (макс. 2)', description: 'КД 14 + мод. ЛОВ (макс. 2); помеха на Скрытность' },
    { key: 'breastplate', name: 'Кираса', facts: 'КД 14 + ЛОВ (макс. 2)', description: 'КД 14 + мод. ЛОВ (макс. 2)' },
    { key: 'half-plate', name: 'Полулаты', facts: 'КД 15 + ЛОВ (макс. 2)', description: 'КД 15 + мод. ЛОВ (макс. 2); помеха на Скрытность' },
  ]),
  ...listed('armor', 'Тяжёлые доспехи', [
    { key: 'ring-mail', name: 'Колечный доспех', facts: 'КД 14', description: 'КД 14; помеха на Скрытность' },
    { key: 'chain-mail', name: 'Кольчуга', facts: 'КД 16', description: 'КД 16; Сила 13; помеха на Скрытность' },
    { key: 'splint', name: 'Наборный доспех', facts: 'КД 17', description: 'КД 17; Сила 15; помеха на Скрытность' },
    { key: 'plate', name: 'Латы', facts: 'КД 18', description: 'КД 18; Сила 15; помеха на Скрытность' },
  ]),
  ...listed('armor', 'Щиты', [
    { key: 'shield', name: 'Щит', facts: '+2 КД', description: '+2 к КД' },
  ]),
].map((item) => ({ ...item, key: `armor:${item.key}` }));

const gear: CatalogItem[] = [
  ...listed('gear', 'В дорогу', [
    { key: 'backpack', name: 'Рюкзак', description: '' },
    { key: 'bedroll', name: 'Спальник', description: '' },
    { key: 'blanket', name: 'Одеяло', description: '' },
    { key: 'mess-kit', name: 'Столовый набор', description: '' },
    { key: 'tinderbox', name: 'Трутница', description: 'Разжечь огонь: действием' },
    { key: 'torch', name: 'Факел', facts: '×10', quantity: 10, description: 'Горит 1 час: яркий свет 20 фт., тусклый ещё 20 фт.' },
    { key: 'candle', name: 'Свеча', facts: '×5', quantity: 5, description: 'Горит 1 час: яркий свет 5 фт., тусклый ещё 5 фт.' },
    { key: 'lantern-hooded', name: 'Фонарь закрытый', description: 'Яркий свет 30 фт., тусклый ещё 30 фт.; 6 часов на фляге масла' },
    { key: 'oil', name: 'Масло (фляга)', facts: '×2', quantity: 2, description: 'Для фонаря; можно разлить и поджечь: 5 урона огнём' },
    { key: 'rope-hempen', name: 'Верёвка пеньковая (50 фт.)', description: '' },
    { key: 'rope-silk', name: 'Верёвка шёлковая (50 фт.)', description: '' },
    { key: 'tent', name: 'Палатка двухместная', description: '' },
    { key: 'waterskin', name: 'Бурдюк', description: '4 пинты воды' },
    { key: 'pouch', name: 'Поясная сумка', description: '' },
    { key: 'sack', name: 'Мешок', description: '' },
    { key: 'clothes-traveler', name: 'Дорожная одежда', description: '' },
  ]),
  ...listed('gear', 'Полезное', [
    { key: 'crowbar', name: 'Ломик', description: 'Преимущество на проверки Силы, где помогает рычаг' },
    { key: 'hammer', name: 'Молоток', description: '' },
    { key: 'pitons', name: 'Шлямбур', facts: '×10', quantity: 10, description: '' },
    { key: 'grappling-hook', name: 'Абордажный крюк', description: '' },
    { key: 'pole', name: 'Шест (10 фт.)', description: '' },
    { key: 'chain', name: 'Цепь (10 фт.)', description: '' },
    { key: 'manacles', name: 'Кандалы', description: '' },
    { key: 'caltrops', name: 'Калтропы (мешочек)', description: 'Рассыпать на 5×5 фт.: спасбросок ЛОВ 15 или 1 колющего урона и скорость 0' },
    { key: 'ball-bearings', name: 'Металлические шарики (мешочек)', description: 'Рассыпать на 10×10 фт.: спасбросок ЛОВ 10 или падение ничком' },
    { key: 'bell', name: 'Колокольчик', description: '' },
    { key: 'whistle', name: 'Сигнальный свисток', description: '' },
    { key: 'mirror', name: 'Стальное зеркальце', description: '' },
    { key: 'spyglass', name: 'Подзорная труба', description: '' },
    { key: 'magnifying-glass', name: 'Увеличительное стекло', description: '' },
    { key: 'hunting-trap', name: 'Капкан', description: 'Спасбросок СИЛ 13 или 1d4 колющего урона и захват' },
  ]),
  ...listed('gear', 'Письмо и магия', [
    { key: 'ink', name: 'Чернила (бутылочка)', description: '' },
    { key: 'ink-pen', name: 'Писчее перо', description: '' },
    { key: 'parchment', name: 'Пергамент (лист)', facts: '×10', quantity: 10, description: '' },
    { key: 'book', name: 'Книга', description: '' },
    { key: 'spellbook', name: 'Книга заклинаний', description: '' },
    { key: 'component-pouch', name: 'Мешочек с компонентами', description: 'Заменяет материальные компоненты без указанной цены' },
    { key: 'arcane-focus', name: 'Магическая фокусировка', description: 'Жезл, посох, сфера или кристалл' },
    { key: 'holy-symbol', name: 'Священный символ', description: 'Фокусировка жреца и паладина' },
    { key: 'druidic-focus', name: 'Друидическая фокусировка', description: 'Веточка омелы, тотем, посох из живого дерева' },
  ]),
  ...listed('gear', 'Боеприпасы', [
    { key: 'arrows', name: 'Стрелы', facts: '×20', quantity: 20, description: '' },
    { key: 'bolts', name: 'Арбалетные болты', facts: '×20', quantity: 20, description: '' },
    { key: 'sling-bullets', name: 'Снаряды для пращи', facts: '×20', quantity: 20, description: '' },
    { key: 'needles', name: 'Иглы для духовой трубки', facts: '×50', quantity: 50, description: '' },
    { key: 'quiver', name: 'Колчан', description: '' },
  ]),
].map((item) => ({ ...item, key: `gear:${item.key}` }));

const food: CatalogItem[] = listed('food', 'Еда и питьё', [
  { key: 'rations', name: 'Рацион (1 день)', facts: '×5', quantity: 5, description: 'Сухари, вяленое мясо, сухофрукты, орехи' },
  { key: 'bread', name: 'Хлеб (буханка)', description: '' },
  { key: 'cheese', name: 'Сыр (головка)', description: '' },
  { key: 'meat', name: 'Мясо (кусок)', description: '' },
  { key: 'apples', name: 'Яблоки', facts: '×3', quantity: 3, description: '' },
  { key: 'ale', name: 'Эль (кувшин)', description: '' },
  { key: 'wine', name: 'Вино (бутылка)', description: '' },
  { key: 'water', name: 'Вода (бурдюк)', description: '' },
]).map((item) => ({ ...item, key: `food:${item.key}` }));

const consumables: CatalogItem[] = [
  ...listed('consumable', 'Зелья', [
    { key: 'potion-healing', name: 'Зелье лечения', facts: '2d4+2', description: 'Выпить действием: восстанавливает 2d4+2 HP' },
    { key: 'potion-greater-healing', name: 'Зелье большого лечения', facts: '4d4+4', description: 'Выпить действием: восстанавливает 4d4+4 HP' },
    { key: 'potion-superior-healing', name: 'Зелье превосходного лечения', facts: '8d4+8', description: 'Выпить действием: восстанавливает 8d4+8 HP' },
    { key: 'potion-supreme-healing', name: 'Зелье высшего лечения', facts: '10d4+20', description: 'Выпить действием: восстанавливает 10d4+20 HP' },
    { key: 'antitoxin', name: 'Противоядие', description: 'Час преимущества на спасброски от яда' },
  ]),
  ...listed('consumable', 'Расходники', [
    { key: 'healers-kit', name: 'Набор целителя', facts: '10 исп.', description: 'Стабилизировать существо с 0 HP без проверки; 10 использований' },
    { key: 'holy-water', name: 'Святая вода (флакон)', facts: '2d6', description: 'Бросок: 2d6 урона излучением исчадию или нежити' },
    { key: 'acid', name: 'Кислота (флакон)', facts: '2d6', description: 'Бросок: 2d6 урона кислотой' },
    { key: 'alchemists-fire', name: 'Алхимический огонь (флакон)', facts: '1d4', description: 'Бросок: 1d4 урона огнём в начале каждого хода, пока не потушат (ЛОВ 10)' },
    { key: 'poison-basic', name: 'Яд (флакон)', facts: '1d4', description: 'Нанести на оружие или 3 боеприпаса: спасбросок ТЕЛ 10 или 1d4 урона ядом' },
    { key: 'scroll', name: 'Свиток заклинания', description: '' },
  ]),
].map((item) => ({ ...item, key: `consumable:${item.key}` }));

const tools: CatalogItem[] = [
  ...listed('tool', 'Инструменты', [
    { key: 'thieves-tools', name: 'Воровские инструменты', description: 'Вскрывать замки и обезвреживать ловушки' },
    { key: 'herbalism-kit', name: 'Набор травника', description: 'Нужен, чтобы сделать противоядие и зелье лечения' },
    { key: 'disguise-kit', name: 'Набор для грима', description: '' },
    { key: 'forgery-kit', name: 'Набор для фальсификации', description: '' },
    { key: 'poisoners-kit', name: 'Набор отравителя', description: '' },
    { key: 'navigators-tools', name: 'Инструменты навигатора', description: '' },
    { key: 'alchemists-supplies', name: 'Инструменты алхимика', description: '' },
    { key: 'smiths-tools', name: 'Инструменты кузнеца', description: '' },
    { key: 'carpenters-tools', name: 'Инструменты плотника', description: '' },
    { key: 'cooks-utensils', name: 'Инструменты повара', description: '' },
    { key: 'calligraphers-supplies', name: 'Инструменты каллиграфа', description: '' },
    { key: 'cartographers-tools', name: 'Инструменты картографа', description: '' },
    { key: 'dice-set', name: 'Игральные кости', description: '' },
    { key: 'playing-cards', name: 'Игральные карты', description: '' },
  ]),
  ...listed('tool', 'Музыкальные инструменты', [
    { key: 'lute', name: 'Лютня', description: '' },
    { key: 'flute', name: 'Флейта', description: '' },
    { key: 'lyre', name: 'Лира', description: '' },
    { key: 'drum', name: 'Барабан', description: '' },
    { key: 'horn', name: 'Рожок', description: '' },
    { key: 'bagpipes', name: 'Волынка', description: '' },
  ]),
].map((item) => ({ ...item, key: `tool:${item.key}` }));

const packContents = (keys: Array<[string, number?]>) => keys.map(([key, quantity]) => ({ key, quantity: quantity ?? 1 }));
const packs: CatalogItem[] = listed('pack', 'Наборы', [
  {
    key: 'pack:explorer', name: 'Набор путешественника', description: '',
    contents: packContents([['gear:backpack'], ['gear:bedroll'], ['gear:mess-kit'], ['gear:tinderbox'], ['gear:torch', 10], ['food:rations', 10], ['gear:waterskin'], ['gear:rope-hempen']]),
  },
  {
    key: 'pack:dungeoneer', name: 'Набор исследователя подземелий', description: '',
    contents: packContents([['gear:backpack'], ['gear:crowbar'], ['gear:hammer'], ['gear:pitons', 10], ['gear:torch', 10], ['gear:tinderbox'], ['food:rations', 10], ['gear:waterskin'], ['gear:rope-hempen']]),
  },
  {
    key: 'pack:burglar', name: 'Набор взломщика', description: '',
    contents: packContents([['gear:backpack'], ['gear:ball-bearings'], ['gear:bell'], ['gear:candle', 5], ['gear:crowbar'], ['gear:hammer'], ['gear:pitons', 10], ['gear:lantern-hooded'], ['gear:oil', 2], ['food:rations', 5], ['gear:tinderbox'], ['gear:waterskin'], ['gear:rope-hempen']]),
  },
  {
    key: 'pack:priest', name: 'Набор священника', description: '',
    contents: packContents([['gear:backpack'], ['gear:blanket'], ['gear:candle', 10], ['gear:tinderbox'], ['food:rations', 2], ['gear:waterskin']]),
  },
  {
    key: 'pack:scholar', name: 'Набор учёного', description: '',
    contents: packContents([['gear:backpack'], ['gear:book'], ['gear:ink'], ['gear:ink-pen'], ['gear:parchment', 10]]),
  },
  {
    key: 'pack:entertainer', name: 'Набор артиста', description: '',
    contents: packContents([['gear:backpack'], ['gear:bedroll'], ['gear:candle', 5], ['food:rations', 5], ['gear:waterskin'], ['tool:disguise-kit']]),
  },
]);

export const ITEM_CATALOG: CatalogItem[] = [...weapons, ...armor, ...gear, ...food, ...consumables, ...tools, ...packs];

const byKey = new Map(ITEM_CATALOG.map((item) => [item.key, item]));
export const catalogItem = (key: string) => byKey.get(key);

// What a pack holds, as facts on its row: "Рюкзак, спальник, факел ×10…".
for (const pack of packs) {
  pack.facts = `${pack.contents!.length} предм.`;
  pack.description = pack.contents!
    .map(({ key, quantity }) => `${byKey.get(key)!.name}${quantity > 1 ? ` ×${quantity}` : ''}`)
    .join(', ');
}

const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е');

/** The catalog under its headings, filtered by category and a case- and ё-insensitive search. */
export function searchItemCatalog(query: string, category: ItemCategory | null = null) {
  const needle = normalize(query.trim());
  const groups: Array<{ title: string; items: CatalogItem[] }> = [];
  for (const item of ITEM_CATALOG) {
    if (category && item.category !== category) continue;
    if (needle && !normalize(`${item.name} ${item.facts} ${item.description}`).includes(needle)) continue;
    const last = groups[groups.length - 1];
    if (last?.title === item.group) last.items.push(item);
    else groups.push({ title: item.group, items: [item] });
  }
  return groups;
}

/** A new equipment item for a catalog entry (a pack has none: it adds its contents). */
export function catalogListItem(entry: CatalogItem, id: string, quantity = entry.quantity): DndListItem & { weapon?: DndWeapon } {
  if (entry.weapon) return { ...catalogEquipmentItem(entry.weapon, id), quantity, catalogKey: entry.key };
  return { id, name: entry.name, quantity, equipped: false, description: entry.description, catalogKey: entry.key };
}

/** What picking an entry adds: the entry itself, or a pack's contents. */
export const catalogPickContents = (entry: CatalogItem): Array<{ item: CatalogItem; quantity: number }> =>
  entry.contents
    ? entry.contents.map(({ key, quantity }) => ({ item: byKey.get(key)!, quantity }))
    : [{ item: entry, quantity: entry.quantity }];
