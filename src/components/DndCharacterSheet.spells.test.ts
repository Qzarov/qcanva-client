// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { applySheetOperation, type SheetOperation } from '../dnd/sheetOperations';
import { createDndCharacterSheet, normalizeDndCharacterSheet, type DndCharacterSheetData } from '../dnd/characterSheet';
import { choose, selectSelector } from './dndSelect.testing';

/** Mounts the sheet on the spells tab and applies every emitted `op`, the way the page does. */
const mountSheet = (setup: (data: DndCharacterSheetData) => void = () => {}, readonly = false) => {
  const initial = createDndCharacterSheet();
  initial.activeTab = 'spells';
  setup(initial);
  const data = reactive(initial);
  const wrapper = mount(DndCharacterSheet, {
    props: {
      data, readonly,
      onOp: (op: SheetOperation) => {
        Object.assign(data, normalizeDndCharacterSheet(applySheetOperation(JSON.parse(JSON.stringify(data)), op)));
      },
    },
    global: { stubs: { Teleport: true } },
  });
  const ops = () => (wrapper.emitted('op') ?? []).map(([op]) => op as SheetOperation);
  return { data, wrapper, ops };
};
const cleric = (data: DndCharacterSheetData) => {
  data.identity.level = 5;
  data.abilities.wisdom.score = 16;
  data.spellcasting.ability = 'wisdom';
  data.spellcasting.slots.l1 = { max: 4, spent: 1 };
};

describe('spellcasting summary', () => {
  it('asks for an ability first, then shows the DC and the attack bonus', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.identity.level = 5; sheet.abilities.wisdom.score = 16; });
    try {
      const summary = wrapper.get('.dnd-cs-spell-summary');
      expect(summary.text()).toContain('Сл спасброска—');
      expect(summary.get('.dnd-cs-roll').attributes('disabled')).toBeDefined();
      await choose(wrapper, 'Заклинательная характеристика', 'wisdom');
      expect(data.spellcasting.ability).toBe('wisdom');
      expect(wrapper.emitted('change')).toHaveLength(1);
      expect(summary.text()).toContain('Сл спасброска14');
      expect(summary.get('.dnd-cs-roll').text()).toBe('Атака заклинанием +6');
      expect(summary.get('.dnd-cs-roll').attributes('disabled')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});

describe('spell slots', () => {
  it('are spent and returned as delta operations, within what the character has', async () => {
    const { data, wrapper, ops } = mountSheet(cleric);
    try {
      const slots = wrapper.get('[aria-label="Ячейки 1 уровня"]');
      expect(slots.text()).toContain('3/');
      await wrapper.get('[aria-label="Потратить ячейку 1 уровня"]').trigger('click');
      expect(ops()).toEqual([{ type: 'slot-change', level: 1, delta: 1 }]);
      expect(data.spellcasting.slots.l1).toEqual({ max: 4, spent: 2 });
      expect(wrapper.get('[aria-label="Ячейки 1 уровня"]').text()).toContain('2/');
      await wrapper.get('[aria-label="Вернуть ячейку 1 уровня"]').trigger('click');
      expect(data.spellcasting.slots.l1.spent).toBe(1);
      // No slots of the next level yet: nothing to spend or return.
      expect(wrapper.get('[aria-label="Потратить ячейку 2 уровня"]').attributes('disabled')).toBeDefined();
      expect(wrapper.get('[aria-label="Вернуть ячейку 2 уровня"]').attributes('disabled')).toBeDefined();
    } finally { wrapper.unmount(); }
  });

  it('the maximum is edited by hand and never leaves more spent than there is', async () => {
    const { data, wrapper } = mountSheet((sheet) => { cleric(sheet); sheet.spellcasting.slots.l1.spent = 3; });
    try {
      await wrapper.get('input[aria-label="Всего ячеек 1 уровня"]').setValue('2');
      expect(data.spellcasting.slots.l1).toEqual({ max: 2, spent: 2 });
      expect(wrapper.emitted('change')).toHaveLength(1);
      // Entering slots of level 2 opens level 3 for the next ones.
      expect(wrapper.find('[aria-label="Ячейки 3 уровня"]').exists()).toBe(false);
      await wrapper.get('input[aria-label="Всего ячеек 2 уровня"]').setValue('3');
      expect(wrapper.find('[aria-label="Ячейки 3 уровня"]').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('come back on a long rest, which says so beforehand', async () => {
    const { data, wrapper } = mountSheet((sheet) => { cleric(sheet); sheet.spellcasting.slots.l1.spent = 3; });
    try {
      await wrapper.findAll('button').find((button) => button.text() === 'Длинный отдых')!.trigger('click');
      const dialog = wrapper.get('[role="dialog"][aria-label="Длинный отдых"]');
      expect(dialog.text()).toContain('Ячейки заклинаний: возвращается 3');
      await dialog.get('form').trigger('submit');
      expect(data.spellcasting.slots.l1).toEqual({ max: 4, spent: 0 });
    } finally { wrapper.unmount(); }
  });

  it('cannot be spent in read-only mode', () => {
    const { wrapper } = mountSheet(cleric, true);
    try {
      expect(wrapper.get('[aria-label="Потратить ячейку 1 уровня"]').attributes('disabled')).toBeDefined();
      expect(wrapper.get(selectSelector('Заклинательная характеристика')).attributes('disabled')).toBeDefined();
      expect(wrapper.findAll('button').some((button) => button.text() === '+ Добавить заговор')).toBe(false);
    } finally { wrapper.unmount(); }
  });
});

describe('spells', () => {
  it('cantrips go to their own group and are not prepared', async () => {
    const { data, wrapper } = mountSheet(cleric);
    try {
      await wrapper.findAll('button').find((button) => button.text() === '+ Добавить заговор')!.trigger('click');
      await wrapper.findAll('button').find((button) => button.text() === '+ Добавить заклинание')!.trigger('click');
      expect(data.spells.map((spell) => spell.level)).toEqual([0, 1]);
      expect(wrapper.findAll('.dnd-cs-spell-level h4').map((heading) => heading.text())).toEqual(['Заговоры', '1 уровень', '2 уровень']);
      expect(wrapper.findAll('input[aria-label="Подготовлено"]')).toHaveLength(1);
      // Changing the level moves the spell to another group.
      await wrapper.findAll('input[aria-label="Уровень заклинания"]')[1]!.setValue('0');
      expect(wrapper.findAll('input[aria-label="Подготовлено"]')).toHaveLength(0);
    } finally { wrapper.unmount(); }
  });

  it('roll settings open in the row and turn into roll buttons', async () => {
    const { data, wrapper } = mountSheet((sheet) => {
      cleric(sheet);
      sheet.spells = [{ id: 'a', name: 'Священное пламя', level: 0 }];
    });
    try {
      expect(wrapper.find('.dnd-spell-fields').exists()).toBe(false);
      await wrapper.get('[aria-label="Бросок и урон заклинания"]').trigger('click');
      await choose(wrapper, 'Бросок заклинания', 'save');
      await choose(wrapper, 'Характеристика спасброска', 'dexterity');
      await wrapper.get('input[aria-label="Формула заклинания"]').setValue('2d8');
      await wrapper.get('input[aria-label="Тип урона заклинания"]').setValue('излучение');
      expect(data.spells[0]).toMatchObject({ rollKind: 'save', saveAbility: 'dexterity', damage: '2d8', damageType: 'излучение' });
      expect(wrapper.get('.dnd-cs-spell-dc').text()).toBe('Сл 14 · ЛОВ');
      await wrapper.get('[aria-label="Урон 2d8: бросить"]').trigger('click');
      expect(wrapper.get('.dnd-cs-toast').text()).toContain('Урон · Священное пламя');

      await choose(wrapper, 'Бросок заклинания', 'attack');
      expect(wrapper.find('.dnd-cs-spell-dc').exists()).toBe(false);
      await wrapper.get('[aria-label="Атака +6: бросить"]').trigger('click');
      expect(wrapper.findAll('.dnd-cs-toast').some((toast) => toast.text().includes('Атака · Священное пламя'))).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('says what is missing instead of rolling: a bad formula, no ability', async () => {
    const { wrapper } = mountSheet((sheet) => {
      sheet.spells = [{ id: 'a', name: 'Огненный снаряд', level: 0, rollKind: 'attack', damage: 'много' }];
    });
    try {
      await wrapper.get('[aria-label="Бросок и урон заклинания"]').trigger('click');
      expect(wrapper.get('.dnd-spell-error').text()).toContain('Формула');
      expect(wrapper.find('[aria-label="Атака +0: бросить"]').exists()).toBe(false);
      await wrapper.get('input[aria-label="Формула заклинания"]').setValue('1d10');
      expect(wrapper.get('.dnd-spell-error').text()).toContain('Выберите заклинательную характеристику');
    } finally { wrapper.unmount(); }
  });
});
