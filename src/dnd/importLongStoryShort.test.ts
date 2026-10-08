import { describe, expect, it } from 'vitest';
import { CharacterImportError, MAX_IMPORT_FILE_BYTES, evaluateSum, importHeadline, importLongStoryShort } from './importLongStoryShort';
import { lssExport, lssSheet } from './importLongStoryShort.fixture';

const modifiers = { strength: 3, dexterity: 1, constitution: 2, intelligence: -1, wisdom: 2, charisma: 0 };

describe('importLongStoryShort', () => {
  it('reads who the character is, with the race and class named as in our lists', () => {
    const { title, data } = importLongStoryShort(lssExport());
    expect(title).toBe('Мирра');
    expect(data.identity).toMatchObject({
      name: 'Мирра', race: 'Полуорк', className: 'Друид', subclass: 'Круг Дикого Огня', level: 3, experience: 900, background: 'Отшельник',
    });
    expect(importHeadline(data)).toBe('Полуорк · Друид 3 ур.');
  });

  it('reads abilities, saving throws and skills', () => {
    const { data, imported } = importLongStoryShort(lssExport());
    expect(Object.values(data.abilities).map((ability) => ability.score)).toEqual([16, 12, 14, 8, 15, 10]);
    expect(data.abilities.wisdom.savingThrowProficient).toBe(true);
    expect(data.abilities.strength.savingThrowProficient).toBe(false);
    expect(data.proficiencyBonus).toBe(2);
    expect(data.skills).toEqual({
      survival: { proficiency: 'proficient', customBonus: 0 },
      nature: { proficiency: 'expertise', customBonus: 0 },
      sleightOfHand: { proficiency: 'proficient', customBonus: 0 },
    });
    expect(imported[0]).toBe('Характеристики; владение: спасброски — 1, навыки — 3');
  });

  it('reads hit points, the armor class written as a sum, speed and hit dice', () => {
    const { data } = importLongStoryShort(lssExport());
    expect(data.combat).toMatchObject({
      maxHp: 24, currentHp: 17, temporaryHp: 0, armorClass: 12, speed: 30, hitDie: 8, hitDiceSpent: 1,
      deathSaves: { successes: 1, failures: 2 }, inspiration: true,
    });
  });

  it('adds a shield to the armor class and says so when the armor class is not a sum', () => {
    const shielded = lssSheet();
    shielded.vitality.shield = { value: true };
    expect(importLongStoryShort(lssExport(shielded)).data.combat.armorClass).toBe(14);

    const odd = lssSheet();
    odd.vitality.ac = { value: 'max(10, 12)' };
    const result = importLongStoryShort(lssExport(odd));
    expect(result.data.combat.armorClass).toBe(11);
    expect(result.skipped).toContain('КД «max(10, 12)» не прочитан — поставлен 11, поправьте вручную');
  });

  it('turns counters of the feature blocks into features with uses and a recharge', () => {
    const { data } = importLongStoryShort(lssExport());
    expect(data.features.map(({ id, ...rest }) => rest)).toEqual([
      { name: 'Дикий облик', description: 'Действием примите облик зверя.\n\nДва раза до отдыха.', maxUses: 2, currentUses: 2, recharge: 'short' },
      { name: 'Ярость предков', maxUses: 3, currentUses: 1, recharge: 'long' },
      { name: 'Умения и способности', description: 'Друидический язык' },
      { name: 'Тёмное зрение', description: '60 футов' },
    ]);
    expect(new Set(data.features.map((item) => item.id)).size).toBe(4);
  });

  it('turns counters of the equipment block and attuned items into equipment, and coins into the wallet', () => {
    const { data } = importLongStoryShort(lssExport());
    expect(data.equipment.map(({ id, ...rest }) => rest)).toEqual([
      { name: 'Сухпаёк', quantity: 4 },
      { name: 'Верёвка 50 футов', quantity: 1 },
      { name: 'Посох леса', quantity: 1, description: 'Предмет с настройкой', equipped: true },
    ]);
    const { data: withCoins, imported } = importLongStoryShort(lssExport());
    expect(withCoins.coins).toEqual({ pp: 0, gp: 15, ep: 0, sp: 0, cp: 40 });
    expect(imported).toContain('Монеты: 15 зм 40 мм');
  });

  it('reads weapons, splitting the damage into a formula and a type', () => {
    const { data } = importLongStoryShort(lssExport());
    expect(data.attacks.map(({ id, ...rest }) => rest)).toEqual([
      { name: 'Скимитар', attackBonus: '+5', damage: '1к6+3', damageType: 'рубящий' },
      { name: 'Праща', damage: '1d4' },
    ]);
  });

  it('reads the spellcasting class, ability and slots, and tells that the spells themselves are not in the file', () => {
    const { data, imported, skipped } = importLongStoryShort(lssExport());
    expect(data.spellcasting.casterClass).toBe('druid');
    expect(data.spellcasting.ability).toBe('wisdom');
    expect(data.spellcasting.slots.l1).toEqual({ max: 4, spent: 0 });
    expect(data.spellcasting.slots.l2).toEqual({ max: 2, spent: 0 });
    expect(data.spellcasting.slots.l3).toEqual({ max: 0, spent: 0 });
    expect(data.spells).toEqual([]);
    expect(imported).toContain('Ячейки заклинаний: 1 ур. — 4, 2 ур. — 2');
    expect(skipped.some((line) => line.startsWith('Заклинания (3):'))).toBe(true);
    expect(skipped).toContain('Портрет: загрузите его в лист отдельно');
  });

  it('takes the slots from the class table when the file has none', () => {
    const sheet = lssSheet();
    sheet.spells = {};
    sheet.spellsInfo = { base: { value: '' } };
    const { data } = importLongStoryShort(lssExport(sheet));
    expect(data.spellcasting.casterClass).toBe('druid');
    expect(data.spellcasting.ability).toBe('wisdom');
    expect([data.spellcasting.slots.l1.max, data.spellcasting.slots.l2.max]).toEqual([4, 2]);
  });

  it('puts the personality in its fields and what has no field into the notes', () => {
    const { data } = importLongStoryShort(lssExport());
    expect(data.personality).toEqual({ traits: 'Молчалива и упряма.', ideals: 'Природа важнее городов.', bonds: '', flaws: '' });
    expect(data.notes).toBe('Игрок: Аня\n\nВнешность\nВозраст: 29 · Рост: 185 · Глаза: карие\n\nВладения и языки\nОбщий, орочий');
  });

  it('accepts the inner sheet without the wrapper', () => {
    expect(importLongStoryShort(JSON.stringify(lssSheet())).data.identity.name).toBe('Мирра');
  });

  it('survives a file with almost nothing in it', () => {
    const { data, skipped } = importLongStoryShort(JSON.stringify({ data: JSON.stringify({ stats: {} }) }));
    expect(data.identity).toMatchObject({ name: 'Импортированный персонаж', level: 1 });
    expect(data.combat).toMatchObject({ maxHp: 10, currentHp: 10, armorClass: 10, hitDie: 8, hitDiceSpent: 0 });
    expect(skipped).toEqual([]);
  });

  it('never trusts the numbers and the sizes of the file', () => {
    const sheet = lssSheet();
    sheet.info.level = { value: 999 };
    sheet.stats.str = { score: '1e9' };
    sheet.vitality['hp-max'] = { value: -5 };
    sheet.vitality['hp-current'] = { value: 70 };
    sheet.name = { value: 'Я'.repeat(5000) };
    sheet.resources['r-wild'].notes = 'ё'.repeat(50_000);
    const { data } = importLongStoryShort(lssExport(sheet));
    expect(data.identity.level).toBe(20);
    expect(data.abilities.strength.score).toBe(30);
    expect(data.combat.maxHp).toBe(1);
    expect(data.combat.currentHp).toBe(1);
    expect(data.identity.name).toHaveLength(160);
    expect(data.features[0]!.description).toHaveLength(6000);
  });

  it('refuses what is not a character, in plain words', () => {
    expect(() => importLongStoryShort('not json')).toThrow(new CharacterImportError('Файл не читается: это не JSON.'));
    expect(() => importLongStoryShort('[1, 2]')).toThrow('В файле нет персонажа.');
    expect(() => importLongStoryShort('{"data":"{oops"}')).toThrow('Файл повреждён: данные персонажа не читаются.');
    expect(() => importLongStoryShort('{"nodes":[],"edges":[]}')).toThrow('Это не персонаж из Long Story Short: в файле нет характеристик.');
    expect(() => importLongStoryShort(' '.repeat(MAX_IMPORT_FILE_BYTES + 1))).toThrow('Файл слишком большой для листа персонажа.');
  });
});

describe('evaluateSum', () => {
  it('adds numbers and ability modifiers', () => {
    expect(evaluateSum('10+1+[DEX]', modifiers)).toBe(12);
    expect(evaluateSum(' 13 + [int] ', modifiers)).toBe(12);
    expect(evaluateSum('10 - [INT]', modifiers)).toBe(11);
    expect(evaluateSum('15', modifiers)).toBe(15);
    expect(evaluateSum(17, modifiers)).toBe(17);
  });

  it('does not guess at anything else', () => {
    for (const value of ['', 'abc', '10+[LUCK]', '2*8', '10+', 'alert(1)', null, undefined, {}, Number.NaN]) expect(evaluateSum(value, modifiers)).toBeNull();
  });
});
