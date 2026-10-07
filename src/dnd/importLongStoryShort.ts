/**
 * Import of a character exported from Long Story Short (longstoryshort.app).
 *
 * The export is a JSON object whose `data` field is one more JSON string - the
 * sheet itself: `info`, `stats`, `saves`, `skills`, `vitality`, `text` blocks
 * and `resources` (a feature or an item with a counter, placed in a block).
 *
 * The file is someone else's format read as untrusted input: every value is
 * checked and cut to a size, and nothing is taken that the sheet has no place
 * for. What could not be carried over is listed in `skipped`, so the player
 * is told before the character is created rather than finding out later.
 */
import {
  DND_SKILLS, HIT_DICE, SPELL_CLASS_KEYS, SPELL_LEVELS, normalizeDndCharacterSheet, proficiencyBonusForLevel, spellSlotKey,
  abilityModifier, createDndCharacterSheet,
  type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type SkillProficiency, type SpellClassKey,
} from './characterSheet';
import { classOption, raceOption } from './identityOptions';
import { classSlots, spellcasterClass } from './spellCatalog';

export class CharacterImportError extends Error {}

export type CharacterImport = {
  title: string;
  data: DndCharacterSheetData;
  /** What was carried over, one line per part of the sheet. */
  imported: string[];
  /** What the file has and the sheet could not take, with the reason. */
  skipped: string[];
};

/** The largest file read: an export is tens of kilobytes, anything far bigger is not one. */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SHEET_BYTES = 900 * 1024;
const MAX_NAME = 160;
const MAX_TEXT = 6000;
const MAX_LIST_ITEMS = 200;

type Json = Record<string, any>;

const ABILITY_CODES: Record<string, DndAbilityKey> = {
  str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};
const SKILL_NAMES: Record<string, string> = { 'sleight of hand': 'sleightOfHand', 'animal handling': 'animalHandling' };
const COINS: Array<[key: string, label: string]> = [
  ['pp', 'Платиновые монеты'], ['gp', 'Золотые монеты'], ['ep', 'Электрумовые монеты'], ['sp', 'Серебряные монеты'], ['cp', 'Медные монеты'],
];
const APPEARANCE: Array<[key: string, label: string]> = [
  ['age', 'Возраст'], ['height', 'Рост'], ['weight', 'Вес'], ['eyes', 'Глаза'], ['skin', 'Кожа'], ['hair', 'Волосы'],
];
/** Text blocks that have no field of their own and go to the notes under a heading. */
const NOTE_BLOCKS: Record<string, string> = {
  prof: 'Владения и языки', background: 'Предыстория', allies: 'Союзники и организации', appearance: 'Внешность',
  quests: 'Задания', items: 'Сокровища', flaws: 'Слабости',
};

const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
/** Most fields of the export are wrapped: `{ name: 'level', value: 3 }`. */
const unwrap = (value: unknown): unknown => (isObject(value) && 'value' in value ? value.value : value);
const text = (value: unknown, max = MAX_NAME) => {
  const raw = unwrap(value);
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim().slice(0, max) : '';
};
const number = (value: unknown, fallback = 0) => {
  const raw = unwrap(value);
  const parsed = typeof raw === 'string' ? Number.parseFloat(raw.replace(',', '.')) : Number(raw);
  return typeof raw !== 'boolean' && raw !== null && raw !== '' && Number.isFinite(parsed) ? parsed : fallback;
};
const whole = (value: unknown, min: number, max: number, fallback = min) => Math.min(max, Math.max(min, Math.trunc(number(value, fallback))));
const capitalize = (value: string) => (value ? value[0]!.toLocaleUpperCase('ru') + value.slice(1) : value);

/**
 * A number written as a sum, the way the export keeps the armor class:
 * `10+1+[DEX]`. Only whole numbers, + and - and ability modifiers are read;
 * anything else is not guessed at.
 */
export function evaluateSum(expression: unknown, modifiers: Record<DndAbilityKey, number>): number | null {
  if (typeof expression === 'number') return Number.isFinite(expression) ? Math.trunc(expression) : null;
  if (typeof expression !== 'string') return null;
  const compact = expression
    .replace(/\[([a-z]{3})\]/gi, (match, code: string) => {
      const key = ABILITY_CODES[code.toLowerCase()];
      return key ? String(modifiers[key]) : match;
    })
    .replace(/\s+/g, '')
    .replace(/\+-|-\+/g, '-')
    .replace(/--/g, '+');
  if (!/^[+-]?\d{1,4}([+-]\d{1,4}){0,20}$/.test(compact)) return null;
  return compact.match(/[+-]?\d+/g)!.reduce((sum, term) => sum + Number(term), 0);
}

/** The plain text of a rich-text block (its counters are read separately, see `resourceIds`). */
function plainText(node: unknown): string {
  if (typeof node === 'string') return node.replace(/<[^>]*>/g, ' ');
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (!isObject(node)) return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'resource') return '';
  const inner = plainText(node.content);
  return node.type === 'doc' ? inner : `${inner}\n`;
}
const tidy = (value: string, max = MAX_TEXT) => value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

function resourceIds(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((child) => resourceIds(child, found));
  else if (isObject(node)) {
    if (node.type === 'resource' && typeof node.attrs?.id === 'string') found.push(node.attrs.id);
    else resourceIds(node.content, found);
  }
  return found;
}

/** `1к8+3 колющий` -> the formula and the damage type after it. */
function splitDamage(value: string): { damage: string; damageType: string } {
  const match = /^((?:\s*[+-]?\s*(?:\d*[dDкКдД]\d+|\d+))+)\s*(.*)$/.exec(value);
  if (!match || !match[2]) return { damage: value, damageType: '' };
  return { damage: match[1]!.trim(), damageType: match[2].trim().slice(0, 60) };
}

function readSheet(source: string): { root: Json; sheet: Json } {
  let root: unknown;
  try { root = JSON.parse(source); } catch { throw new CharacterImportError('Файл не читается: это не JSON.'); }
  if (!isObject(root)) throw new CharacterImportError('В файле нет персонажа.');
  let sheet: unknown = root.data;
  if (typeof sheet === 'string') {
    try { sheet = JSON.parse(sheet); } catch { throw new CharacterImportError('Файл повреждён: данные персонажа не читаются.'); }
  }
  // The inner sheet alone (without the wrapper) is accepted too.
  if (!isObject(sheet)) sheet = root;
  const candidate = sheet as Json;
  if (!isObject(candidate.stats) && !isObject(candidate.info) && !isObject(candidate.vitality)) {
    throw new CharacterImportError('Это не персонаж из Long Story Short: в файле нет характеристик.');
  }
  return { root, sheet: candidate };
}

export function importLongStoryShort(source: string): CharacterImport {
  if (source.length > MAX_IMPORT_FILE_BYTES) throw new CharacterImportError('Файл слишком большой для листа персонажа.');
  const { root, sheet } = readSheet(source);
  const draft = createDndCharacterSheet();
  const imported: string[] = [];
  const skipped: string[] = [];
  let nextId = 0;
  const newId = () => `lss-${(nextId += 1)}`;

  // ----- who the character is
  const info = isObject(sheet.info) ? sheet.info : {};
  const raceText = text(info.race);
  const classText = text(info.charClass);
  const knownClass = classOption(classText);
  const level = whole(info.level, 1, 20, 1);
  Object.assign(draft.identity, {
    name: text(sheet.name) || 'Импортированный персонаж',
    race: raceOption(raceText)?.label ?? capitalize(raceText),
    className: knownClass?.label ?? capitalize(classText),
    subclass: capitalize(text(info.charSubclass)),
    level,
    experience: whole(info.experience, 0, 10_000_000, 0),
    background: capitalize(text(info.background)),
    alignment: capitalize(text(info.alignment)),
  });

  // ----- abilities, saving throws, skills
  const stats = isObject(sheet.stats) ? sheet.stats : {};
  const saves = isObject(sheet.saves) ? sheet.saves : {};
  const modifiers = {} as Record<DndAbilityKey, number>;
  for (const [code, key] of Object.entries(ABILITY_CODES)) {
    const score = whole(isObject(stats[code]) ? stats[code].score : undefined, 1, 30, 10);
    draft.abilities[key] = { score, savingThrowProficient: Boolean(isObject(saves[code]) && saves[code].isProf), customSavingThrowBonus: 0 };
    modifiers[key] = abilityModifier(score);
  }
  const proficiency = number(sheet.proficiency);
  draft.proficiencyBonus = proficiency >= 1 && proficiency <= 10 ? Math.trunc(proficiency) : proficiencyBonusForLevel(level);

  let trainedSkills = 0;
  for (const [name, entry] of Object.entries(isObject(sheet.skills) ? sheet.skills : {})) {
    const key = SKILL_NAMES[name] ?? name;
    if (!DND_SKILLS.some((skill) => skill.key === key) || !isObject(entry)) continue;
    const grade = number(entry.isProf);
    const rank: SkillProficiency = grade >= 2 ? 'expertise' : grade >= 1 ? 'proficient' : grade > 0 ? 'half' : 'none';
    if (rank === 'none') continue;
    draft.skills[key] = { proficiency: rank, customBonus: 0 };
    trainedSkills += 1;
  }
  const trainedSaves = Object.values(draft.abilities).filter((ability) => ability.savingThrowProficient).length;
  imported.push(`Характеристики; владение: спасброски — ${trainedSaves}, навыки — ${trainedSkills}`);

  // ----- hit points, armor class, speed, hit dice
  const vitality = isObject(sheet.vitality) ? sheet.vitality : {};
  const maxHp = whole(vitality['hp-max'], 1, 9999, 10);
  const armorSource = unwrap(vitality.ac);
  let armorClass = evaluateSum(armorSource, modifiers);
  if (armorClass === null) {
    armorClass = 10 + modifiers.dexterity;
    if (armorSource !== undefined && armorSource !== '') skipped.push(`КД «${String(armorSource).slice(0, 40)}» не прочитан — поставлен ${armorClass}, поправьте вручную`);
  } else if (unwrap(vitality.shield) === true) armorClass += 2;
  const hitDieSides = Number(/\d+/.exec(text(vitality['hit-die']))?.[0]);
  const hitDie = (HIT_DICE as readonly number[]).includes(hitDieSides) ? hitDieSides : knownClass?.hitDie ?? 8;
  const hitDiceLeft = unwrap(vitality['hp-dice-current']);
  Object.assign(draft.combat, {
    maxHp,
    currentHp: whole(vitality['hp-current'], 0, maxHp, maxHp),
    temporaryHp: whole(vitality['hp-temp'], 0, 9999, 0),
    armorClass: Math.min(99, Math.max(0, armorClass)),
    speed: whole(vitality.speed, 0, 999, raceOption(raceText)?.speed ?? 30),
    hitDie,
    hitDiceSpent: hitDiceLeft === undefined || hitDiceLeft === '' ? 0 : level - whole(hitDiceLeft, 0, level, level),
    deathSaves: { successes: whole(vitality.deathSuccesses, 0, 3, 0), failures: whole(vitality.deathFails, 0, 3, 0) },
    inspiration: sheet.inspiration === true,
  });
  imported.push(`HP ${draft.combat.currentHp} / ${maxHp}, КД ${draft.combat.armorClass}, скорость ${draft.combat.speed}, кость хитов к${hitDie}`);

  // ----- text blocks and the counters ("resources") placed in them
  const resources = isObject(sheet.resources) ? sheet.resources : {};
  const blocks = isObject(sheet.text) ? sheet.text : {};
  const placed = new Set<string>();
  const notes: string[] = [];
  const full = (list: DndListItem[]) => list.length >= MAX_LIST_ITEMS;

  const addResource = (id: string, block: string) => {
    const resource = resources[id];
    if (placed.has(id) || !isObject(resource)) return;
    placed.add(id);
    const name = text(resource.name);
    const description = tidy(text(resource.notes, MAX_TEXT));
    if (!name && !description) return;
    const current = whole(resource.current, 0, 9999, 0);
    if (block === 'equipment') {
      if (!full(draft.equipment)) draft.equipment.push({ id: newId(), name: name || 'Предмет', quantity: Math.max(1, current), ...(description ? { description } : {}) });
    } else if (block === 'features' || block === 'traits') {
      if (full(draft.features)) return;
      const recharge = resource.isShortRest === true ? 'short' : resource.isLongRest === true ? 'long' : undefined;
      // The export keeps how many uses are left; the most it has seen is the best "out of" there is.
      const maxUses = recharge || current > 0 ? Math.max(current, whole(resource.max, 0, 9999, 0)) : 0;
      draft.features.push({
        id: newId(), name: name || 'Умение', ...(description ? { description } : {}),
        ...(maxUses > 0 ? { maxUses, currentUses: current } : {}), ...(recharge ? { recharge } : {}),
      });
    } else {
      notes.push(tidy([name, description].filter(Boolean).join(' — ')));
    }
  };

  for (const [block, entry] of Object.entries(blocks)) {
    const content = isObject(entry) && isObject(entry.value) ? entry.value.data : isObject(entry) ? entry.value : entry;
    const written = tidy(plainText(content));
    const before = notes.length;
    resourceIds(content).forEach((id) => addResource(id, block));
    const fromCounters = notes.splice(before).join('\n');
    const body = [written, fromCounters].filter(Boolean).join('\n');
    if (block === 'features' || block === 'traits') {
      if (written && !full(draft.features)) draft.features.push({ id: newId(), name: block === 'traits' ? 'Черты' : 'Умения и способности', description: written });
    } else if (block === 'equipment') {
      for (const line of written.split('\n').map((item) => item.trim()).filter(Boolean)) {
        if (!full(draft.equipment)) draft.equipment.push({ id: newId(), name: line.slice(0, MAX_NAME), quantity: 1 });
      }
    } else if (block === 'personality') draft.personality.traits = body;
    else if (block === 'ideals' || block === 'bonds' || block === 'flaws') draft.personality[block] = body;
    else if (block === 'attacks') draft.attacksNotes = body;
    else if (body) {
      const heading = (isObject(entry) && text(entry.customLabel)) || NOTE_BLOCKS[block] || (/^notes/.test(block) ? 'Заметки' : block.slice(0, 40));
      notes.push(`${heading}\n${body}`);
    }
  }
  // Counters whose block is gone from the text still belong to the character.
  for (const [id, resource] of Object.entries(resources)) if (isObject(resource)) addResource(id, text(resource.location));

  // ----- weapons, coins, attuned items
  for (const weapon of Array.isArray(sheet.weaponsList) ? sheet.weaponsList : []) {
    const name = isObject(weapon) ? text(weapon.name) : '';
    if (!name || full(draft.attacks)) continue;
    const { damage, damageType } = splitDamage(text(weapon.dmg, 80));
    const attackBonus = text(weapon.mod, 20);
    const description = tidy(text(weapon.notes, MAX_TEXT));
    draft.attacks.push({
      id: newId(), name, ...(attackBonus ? { attackBonus } : {}), ...(damage ? { damage } : {}),
      ...(damageType ? { damageType } : {}), ...(description ? { description } : {}),
    });
  }
  const coins = isObject(sheet.coins) ? sheet.coins : {};
  for (const [key, label] of COINS) {
    const amount = whole(coins[key], 0, 9_999_999, 0);
    if (amount > 0 && !full(draft.equipment)) draft.equipment.push({ id: newId(), name: label, quantity: amount });
  }
  for (const item of Array.isArray(sheet.attunementsList) ? sheet.attunementsList : []) {
    const name = isObject(item) ? text(item.value) : '';
    if (name && !full(draft.equipment)) draft.equipment.push({ id: newId(), name, quantity: 1, description: 'Предмет с настройкой', equipped: item.checked === true });
  }
  if (draft.features.length) imported.push(`Умения: ${draft.features.length}`);
  if (draft.equipment.length) imported.push(`Снаряжение: ${draft.equipment.length}`);
  if (draft.attacks.length) imported.push(`Атаки: ${draft.attacks.length}`);

  // ----- spellcasting
  const spellsInfo = isObject(sheet.spellsInfo) ? sheet.spellsInfo : {};
  const listed = isObject(spellsInfo.available) && Array.isArray(spellsInfo.available.classes) ? spellsInfo.available.classes : [];
  const casterClass: SpellClassKey | '' = listed.find((key: unknown): key is SpellClassKey => (SPELL_CLASS_KEYS as readonly unknown[]).includes(key)) ?? knownClass?.caster ?? '';
  const baseCode = isObject(spellsInfo.base) && typeof spellsInfo.base.code === 'string' ? spellsInfo.base.code.toLowerCase() : '';
  draft.spellcasting.casterClass = casterClass;
  draft.spellcasting.ability = ABILITY_CODES[baseCode] ?? spellcasterClass(casterClass)?.ability ?? '';
  const slotsOf = (source: unknown, slotLevel: number) => (isObject(source) && isObject(source[`slots-${slotLevel}`]) ? whole(source[`slots-${slotLevel}`].value, 0, 99, 0) : 0);
  let slots = SPELL_LEVELS.map((slotLevel) => slotsOf(sheet.spells, slotLevel) || slotsOf(sheet.spellsPact, slotLevel));
  // The export may leave the numbers out when they follow the class table.
  if (casterClass && !slots.some(Boolean)) slots = classSlots(casterClass, level);
  SPELL_LEVELS.forEach((slotLevel, index) => { draft.spellcasting.slots[spellSlotKey(slotLevel)] = { max: slots[index]!, spent: 0 }; });
  if (slots.some(Boolean)) {
    imported.push(`Ячейки заклинаний: ${slots.map((count, index) => (count ? `${index + 1} ур. — ${count}` : '')).filter(Boolean).join(', ')}`);
    skipped.push('Потраченные ячейки не переносятся: все ячейки будут свободны');
  }
  const spellLists = isObject(root.spells) ? root.spells : {};
  const spellIds = new Set<unknown>();
  for (const key of ['prepared', 'book', 'granted', 'slotless']) if (Array.isArray(spellLists[key])) spellLists[key].forEach((id: unknown) => spellIds.add(id));
  if (spellIds.size) skipped.push(`Заклинания (${spellIds.size}): в файле только их номера из базы Long Story Short — добавьте их из каталога на вкладке «Заклинания»`);

  // ----- what has no field of its own
  const subInfo = isObject(sheet.subInfo) ? sheet.subInfo : {};
  const looks = APPEARANCE.map(([key, label]) => [label, text(subInfo[key], 60)] as const).filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  if (looks.length) notes.unshift(`Внешность\n${looks.join(' · ')}`);
  const player = text(info.playerName);
  if (player) notes.unshift(`Игрок: ${player}`);
  draft.notes = tidy(notes.filter(Boolean).join('\n\n'), 20_000);
  if (Object.values(draft.personality).some(Boolean) || draft.notes) imported.push('Личность и заметки');

  if (isObject(sheet.avatar) && (sheet.avatar.jpeg || sheet.avatar.webp)) skipped.push('Портрет: загрузите его в лист отдельно');
  if (Array.isArray(sheet.conditions) && sheet.conditions.length) skipped.push('Состояния: отметьте их в листе');
  const formulas = (Array.isArray(sheet.bonuses) ? sheet.bonuses : []).filter((bonus: unknown) => isObject(bonus) && bonus.expr).length;
  if (formulas) skipped.push(`Бонусы-формулы (${formulas}): значения в листе задаются числами`);

  const data = normalizeDndCharacterSheet(draft);
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_SHEET_BYTES) throw new CharacterImportError('Персонаж слишком большой для листа.');
  return { title: data.identity.name, data, imported, skipped };
}

/** "Полуорк · Друид 3 ур." - the line under the character's name. */
export const importHeadline = (data: DndCharacterSheetData) =>
  [data.identity.race, [data.identity.className, `${data.identity.level} ур.`].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
