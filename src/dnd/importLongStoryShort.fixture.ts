/**
 * A made-up character in the shape of a Long Story Short export, for tests:
 * the same nesting and field names as a real file, none of a real one's text.
 */
const field = (value: unknown) => ({ value });
const resource = (id: string) => ({ type: 'resource', attrs: { id } });
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content: unknown[]) => ({ value: { data: { type: 'doc', content } } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lssSheet = (): Record<string, any> => ({
  jsonType: 'character',
  template: 'ph',
  name: field('Мирра'),
  info: {
    charClass: field('друид'), charSubclass: field('Круг Дикого Огня'), level: field(3), background: field('отшельник'),
    playerName: field('Аня'), race: field('полуорк'), alignment: field(''), experience: field(900),
  },
  subInfo: { age: field('29'), height: field('185'), weight: field(''), eyes: field('карие'), skin: field(''), hair: field('') },
  spellsInfo: { base: { name: 'base', value: '', code: 'wis' }, available: { classes: ['druid'] } },
  spells: { 'slots-0': { filled: 6 }, 'slots-1': { value: 4, filled: 4 }, 'slots-2': { value: 2, filled: 2 } },
  spellsPact: { 'slots-1': { filled: 0 } },
  bonuses: [{ id: 'bonus-1', target: 'speed.walk', expr: null }],
  proficiency: 2,
  stats: { str: { score: 16 }, dex: { score: 12 }, con: { score: 14 }, int: { score: 8 }, wis: { score: 15 }, cha: { score: 10 } },
  saves: { str: { isProf: false }, dex: { isProf: false }, con: { isProf: false }, int: { isProf: false }, wis: { isProf: true }, cha: { isProf: false } },
  skills: {
    acrobatics: { baseStat: 'dex' }, investigation: { baseStat: 'int', isProf: 0 }, survival: { baseStat: 'wis', isProf: 1 },
    nature: { baseStat: 'int', isProf: 2 }, 'sleight of hand': { baseStat: 'dex', isProf: 1 }, 'not a skill': { isProf: 1 },
  },
  vitality: {
    'hp-dice-current': field(2), shield: field(false), ac: field('10+1+[DEX]'), speed: field('30'), 'hit-die': field('d8'),
    'hp-current': field(17), 'hp-temp': field(0), 'hp-max': field(24), deathFails: 2, deathSuccesses: 1,
  },
  attunementsList: [{ id: 'a-1', checked: true, value: 'Посох леса' }, { id: 'a-2', checked: false, value: '' }],
  weaponsList: [
    { id: 'w-1', name: field('Скимитар'), mod: field('+5'), dmg: field('1к6+3 рубящий') },
    { id: 'w-2', name: field('Праща'), dmg: field('1d4') },
    { id: 'w-3', name: field(''), dmg: field('') },
  ],
  text: {
    personality: doc(resource('r-empty'), paragraph('Молчалива и упряма.')),
    ideals: { value: { data: 'Природа важнее городов.' }, isHidden: true },
    bonds: { value: { data: '' }, isHidden: true },
    equipment: { ...doc(resource('r-food'), paragraph('Верёвка 50 футов')), customLabel: 'Еда' },
    features: doc(resource('r-wild'), resource('r-rage'), paragraph('Друидический язык')),
    traits: doc(resource('r-dark')),
    prof: doc(paragraph('Общий, орочий')),
  },
  coins: { gp: field(15), cp: field('40'), sp: field(0) },
  resources: {
    'r-empty': { id: 'r-empty', name: '', current: 0, location: 'personality' },
    'r-wild': { id: 'r-wild', name: 'Дикий облик', current: 2, location: 'features', isShortRest: true, isLongRest: true, notes: 'Действием примите облик зверя.\n\n\n\nДва раза до отдыха.' },
    'r-rage': { id: 'r-rage', name: 'Ярость предков', current: 1, max: 3, location: 'features', isLongRest: true },
    'r-dark': { id: 'r-dark', name: 'Тёмное зрение', current: 0, resolvedMax: 1, location: 'traits', notes: '60 футов' },
    'r-food': { id: 'r-food', name: 'Сухпаёк', current: 4, resolvedMax: 1, location: 'equipment' },
  },
  conditions: [],
  avatar: { jpeg: 'https://example.invalid/avatar.jpeg' },
  inspiration: true,
});

/** The file as the service writes it: the sheet is a JSON string inside the wrapper. */
export const lssExport = (sheet = lssSheet()) => JSON.stringify({
  tags: [], edition: '2014', jsonType: 'character', version: '2',
  spells: { mode: 'cards', prepared: ['s-1', 's-2'], book: [], granted: ['s-3'], slotless: [] },
  data: JSON.stringify(sheet),
});
