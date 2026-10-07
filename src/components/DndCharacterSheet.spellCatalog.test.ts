// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet, type DndCharacterSheetData } from '../dnd/characterSheet';
import { choose } from './dndSelect.testing';

const mountSheet = (setup: (data: DndCharacterSheetData) => void = () => {}, readonly = false) => {
  const initial = createDndCharacterSheet();
  initial.activeTab = 'spells';
  setup(initial);
  const data = reactive(initial);
  const wrapper = mount(DndCharacterSheet, { props: { data, readonly }, global: { stubs: { Teleport: true } } });
  return { data, wrapper };
};
const button = (wrapper: ReturnType<typeof mountSheet>['wrapper'], text: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === text);

describe('spellcasting class', () => {
  it('sets the ability and the slots for the current level', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.identity.level = 5; sheet.abilities.wisdom.score = 16; });
    try {
      await choose(wrapper, 'Заклинательный класс', 'cleric');
      expect(data.spellcasting).toMatchObject({ casterClass: 'cleric', ability: 'wisdom' });
      const maxima = [data.spellcasting.slots.l1.max, data.spellcasting.slots.l2.max, data.spellcasting.slots.l3.max, data.spellcasting.slots.l4.max];
      expect(maxima).toEqual([4, 3, 2, 0]);
      expect(wrapper.get('.dnd-cs-spell-prepared').text()).toBe('Подготовлено: 0 из 8');
      expect(button(wrapper, 'Ячейки по уровню 5')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });

  it('offers to refill the slots after a level-up and keeps what is spent', async () => {
    const { data, wrapper } = mountSheet((sheet) => {
      sheet.identity.level = 3;
      sheet.spellcasting.casterClass = 'wizard';
      sheet.spellcasting.ability = 'intelligence';
      sheet.spellcasting.slots.l1 = { max: 4, spent: 2 };
      sheet.spellcasting.slots.l2 = { max: 2, spent: 1 };
    });
    try {
      expect(button(wrapper, 'Ячейки по уровню 3')).toBeUndefined();
      data.identity.level = 5;
      await wrapper.vm.$nextTick();
      await button(wrapper, 'Ячейки по уровню 5')!.trigger('click');
      expect(data.spellcasting.slots.l1).toEqual({ max: 4, spent: 2 });
      expect(data.spellcasting.slots.l2).toEqual({ max: 3, spent: 1 });
      expect(data.spellcasting.slots.l3).toEqual({ max: 2, spent: 0 });
      expect(button(wrapper, 'Ячейки по уровню 5')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });

  it('warns when more spells are prepared than the class allows', () => {
    const { wrapper } = mountSheet((sheet) => {
      sheet.identity.level = 1;
      sheet.spellcasting.casterClass = 'wizard';
      sheet.spellcasting.ability = 'intelligence';
      sheet.spells = [{ id: 'a', name: 'Щит', level: 1, prepared: true }, { id: 'b', name: 'Сон', level: 1, prepared: true }];
    });
    try {
      const counter = wrapper.get('.dnd-cs-spell-prepared');
      expect(counter.text()).toBe('Подготовлено: 2 из 1');
      expect(counter.classes()).toContain('is-over');
    } finally { wrapper.unmount(); }
  });

  it('has no preparing for classes that know their spells', () => {
    const { wrapper } = mountSheet((sheet) => {
      sheet.spellcasting.casterClass = 'sorcerer';
      sheet.spells = [{ id: 'a', name: 'Щит', level: 1, prepared: true }];
    });
    try {
      expect(wrapper.find('input[aria-label="Подготовлено"]').exists()).toBe(false);
      expect(wrapper.find('.dnd-cs-spell-prepared').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
});

describe('spell catalog', () => {
  // The catalog is a lazily loaded chunk: wait for its first item to render.
  const loaded = async (wrapper: ReturnType<typeof mountSheet>['wrapper']) => {
    for (let i = 0; i < 100 && !wrapper.find('.dnd-spellbook-item').exists(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  };
  const dialog = (wrapper: ReturnType<typeof mountSheet>['wrapper']) => wrapper.get('[role="dialog"][aria-label="Заклинания из списка"]');

  it('offers what the class can cast and adds a spell ready to roll', async () => {
    const { data, wrapper } = mountSheet((sheet) => {
      sheet.identity.level = 3;
      sheet.abilities.wisdom.score = 16;
      sheet.spellcasting.casterClass = 'cleric';
      sheet.spellcasting.ability = 'wisdom';
    });
    try {
      await button(wrapper, '+ Из списка заклинаний')!.trigger('click');
      await loaded(wrapper);
      expect(dialog(wrapper).text()).toContain('Только доступные: Жрец, до 2 уровня');
      expect(dialog(wrapper).find('[aria-label="Добавить: Огненный шар"]').exists()).toBe(false);
      expect(dialog(wrapper).findAll('.dnd-spellbook-group h3').map((heading) => heading.text())).toEqual(['Заговоры', '1 уровень', '2 уровень']);

      await dialog(wrapper).get('[aria-label="Добавить: Лечение ран"]').trigger('click');
      expect(data.spells).toHaveLength(1);
      expect(data.spells[0]).toMatchObject({ name: 'Лечение ран', level: 1, catalogKey: 'cure-wounds', damage: '1d8+3' });
      expect(wrapper.emitted('change')).toHaveLength(1);
      // The dialog stays open for the next spell, and the added one cannot be added twice.
      await wrapper.vm.$nextTick();
      const taken = dialog(wrapper).get('[aria-label="Уже в листе: Лечение ран"]');
      expect(taken.attributes('aria-disabled')).toBe('true');
      await taken.trigger('click');
      expect(data.spells).toHaveLength(1);

      // Without the class filter every spell is on offer.
      await dialog(wrapper).get('.dnd-spellbook-only input').setValue(false);
      await dialog(wrapper).get('input[aria-label="Поиск заклинания"]').setValue('fireball');
      await dialog(wrapper).get('[aria-label="Добавить: Огненный шар"]').trigger('click');
      expect(data.spells[1]).toMatchObject({ name: 'Огненный шар', level: 3, rollKind: 'save', saveAbility: 'dexterity', damage: '8d6' });
    } finally { wrapper.unmount(); }
  });

  it('filters by level and says when nothing matches', async () => {
    const { wrapper } = mountSheet();
    try {
      await button(wrapper, '+ Из списка заклинаний')!.trigger('click');
      await loaded(wrapper);
      // No class chosen: no class filter, every level on offer.
      expect(dialog(wrapper).find('.dnd-spellbook-only').exists()).toBe(false);
      const levels = dialog(wrapper).findAll('.dnd-spellbook-levels button');
      expect(levels.map((entry) => entry.text())).toEqual(['Все', 'Заговоры', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
      await levels[10]!.trigger('click');
      expect(dialog(wrapper).findAll('.dnd-spellbook-group h3').map((heading) => heading.text())).toEqual(['9 уровень']);
      expect(dialog(wrapper).findAll('.dnd-spellbook-item')).toHaveLength(15);
      await dialog(wrapper).get('input[aria-label="Поиск заклинания"]').setValue('такого нет');
      expect(dialog(wrapper).get('.dnd-spellbook-empty').text()).toContain('Ничего не нашлось');
    } finally { wrapper.unmount(); }
  });

  it('is not offered to read-only viewers', () => {
    const { wrapper } = mountSheet(() => {}, true);
    try {
      expect(button(wrapper, '+ Из списка заклинаний')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});
