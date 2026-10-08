import { describe, expect, it } from 'vitest';
import { describeHistoryEntry } from './sheetHistoryText';

const lines = (...ops: Array<[op: unknown, before: unknown, after: unknown]>) =>
  describeHistoryEntry({ ops: ops.map(([op, before, after]) => ({ op, before, after })) });

describe('describeHistoryEntry', () => {
  it.each<[unknown, unknown, unknown, string]>([
    [{ type: 'hp-change', mode: 'damage', amount: 8 }, { currentHp: 27 }, { currentHp: 19 }, 'HP 27 → 19 (урон 8)'],
    [{ type: 'hp-change', mode: 'heal', amount: 5 }, { currentHp: 10 }, { currentHp: 15 }, 'HP 10 → 15 (лечение 5)'],
    [{ type: 'set', path: ['identity', 'className'], value: 'Волшебник' }, 'Жрец', 'Волшебник', 'Класс: Жрец → Волшебник'],
    [{ type: 'set', path: ['abilities', 'strength', 'score'], value: 16 }, 10, 16, 'Сила: 10 → 16'],
    [{ type: 'set', path: ['skills', 'athletics'], value: { proficiency: 'proficient' } }, null, { proficiency: 'proficient', customBonus: 0 }, 'Навык: Атлетика: — → владение'],
    [{ type: 'set', path: ['spellcasting', 'casterClass'], value: 'wizard' }, '', 'wizard', 'Заклинательный класс: — → Волшебник'],
    [{ type: 'set', path: ['spellcasting', 'slots', 'l2', 'max'], value: 3 }, 2, 3, 'Ячейки 2 уровня: 2 → 3'],
    [{ type: 'set', path: ['combat', 'hitDie'], value: 10 }, 8, 10, 'Кость хитов: к8 → к10'],
    [{ type: 'set', path: ['coins', 'gp'], value: 25 }, 15, 25, 'Золотые монеты: 15 → 25'],
    [{ type: 'set', path: ['coins', 'cp'], value: 0 }, 7, 0, 'Медные монеты: 7 → 0'],
    [{ type: 'set', path: ['notes'], value: 'долгий текст' }, '', 'долгий текст', 'Заметки: изменено'],
    [{ type: 'list-add', list: 'spells', item: { id: 's', name: 'Огненный шар' } }, null, {}, 'Добавлено заклинание: Огненный шар'],
    [{ type: 'list-remove', list: 'equipment', itemId: 'r' }, { id: 'r', name: 'Верёвка' }, null, 'Удалён предмет: Верёвка'],
    [{ type: 'list-update', list: 'features', itemId: 'f', changes: { maxUses: 5 } }, { maxUses: 3 }, { maxUses: 5 }, 'Умение: максимум зарядов: 3 → 5'],
    [{ type: 'uses-change', itemId: 'f', delta: -1 }, { name: 'Ярость', currentUses: 3 }, { name: 'Ярость', currentUses: 2 }, '«Ярость»: заряды 3 → 2'],
    [{ type: 'set-add', path: ['combat', 'conditions'], value: 'poisoned' }, false, true, 'Состояние: + Отравлен'],
    [{ type: 'set-remove', path: ['proficiencies', 'armor'], value: 'Щиты' }, true, false, 'Владение доспехами: − Щиты'],
    [{ type: 'rest', kind: 'long' }, null, null, 'Длинный отдых'],
    [{ type: 'replace' }, null, null, 'Лист перезаписан целиком (старая версия приложения)'],
  ])('%j → %s', (op, before, after, text) => {
    expect(lines([op, before, after])).toEqual([text]);
  });

  it('shows one action as its lines, without repeats', () => {
    expect(lines(
      [{ type: 'set', path: ['identity', 'name'], value: 'Б' }, 'А', 'Б'],
      [{ type: 'set', path: ['identity', 'level'], value: 2 }, 1, 2],
    )).toEqual(['Имя: А → Б', 'Уровень: 1 → 2']);
    expect(lines()).toEqual(['Изменение листа']);
  });
});
