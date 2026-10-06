// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet, type DndCharacterSheetData } from '../dnd/characterSheet';
import { DND_CLASSES, DND_RACES, classOption, raceOption } from '../dnd/identityOptions';

const mountSheet = (setup: (data: DndCharacterSheetData) => void = () => {}, readonly = false) => {
  const initial = createDndCharacterSheet();
  setup(initial);
  const data = reactive(initial);
  const wrapper = mount(DndCharacterSheet, { props: { data, readonly }, global: { stubs: { Teleport: true } }, attachTo: document.body });
  return { data, wrapper };
};
const options = (wrapper: ReturnType<typeof mountSheet>['wrapper'], label: string) =>
  wrapper.findAll(`select[aria-label="${label}"] option`).map((option) => option.text());

describe('the lists', () => {
  it('have the nine races and twelve classes of the SRD', () => {
    expect(DND_RACES).toHaveLength(9);
    expect(DND_CLASSES).toHaveLength(12);
    expect(DND_CLASSES.filter((entry) => entry.caster).map((entry) => entry.caster).sort())
      .toEqual(['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']);
  });

  it('recognise a stored text whatever its case or ё', () => {
    expect(raceOption(' эльф ')?.label).toBe('Эльф');
    expect(raceOption('драконорожденный')?.label).toBe('Драконорождённый');
    expect(classOption('ЖРЕЦ')?.caster).toBe('cleric');
    expect(classOption('Кровавый охотник')).toBeUndefined();
    expect(raceOption('')).toBeUndefined();
  });
});

describe('choosing a race', () => {
  it('is done from a list and sets the walking speed', async () => {
    const { data, wrapper } = mountSheet();
    try {
      expect(options(wrapper, 'Раса')).toEqual(['Раса', ...DND_RACES.map((entry) => entry.label), 'Другая…']);
      await wrapper.get('select[aria-label="Раса"]').setValue('Дварф');
      expect(data.identity.race).toBe('Дварф');
      expect(data.combat.speed).toBe(25);
      expect(wrapper.emitted('change')).toHaveLength(1);
      await wrapper.get('select[aria-label="Раса"]').setValue('Эльф');
      expect(data.combat.speed).toBe(30);
    } finally { wrapper.unmount(); }
  });

  it('keeps a race the list does not have, and lets another be typed', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.identity.race = 'Табакси'; sheet.combat.speed = 35; });
    try {
      // What the sheet already had is shown as its own option.
      expect(options(wrapper, 'Раса')).toContain('Табакси');
      expect((wrapper.get('select[aria-label="Раса"]').element as HTMLSelectElement).selectedOptions[0]!.text).toBe('Табакси');

      await wrapper.get('select[aria-label="Раса"]').setValue('\u0000type');
      const input = wrapper.get('input[aria-label="Раса: свой вариант"]');
      expect(document.activeElement).toBe(input.element);
      expect((input.element as HTMLInputElement).value).toBe('Табакси');
      await input.setValue('Аасимар');
      await input.trigger('change');
      expect(data.identity.race).toBe('Аасимар');
      expect(data.combat.speed).toBe(35); // an unlisted race changes nothing else
      expect(wrapper.find('input[aria-label="Раса: свой вариант"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('goes back to the list when typing is abandoned', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.identity.race = 'Эльф'; });
    try {
      await wrapper.get('select[aria-label="Раса"]').setValue('\u0000type');
      await wrapper.get('input[aria-label="Раса: свой вариант"]').trigger('keydown', { key: 'Escape' });
      expect(wrapper.find('input[aria-label="Раса: свой вариант"]').exists()).toBe(false);
      expect((wrapper.get('select[aria-label="Раса"]').element as HTMLSelectElement).value).toBe('Эльф');
      expect(data.identity.race).toBe('Эльф');
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});

describe('choosing a class', () => {
  it('sets the hit die, and the spellcasting of a caster', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.identity.level = 3; });
    try {
      await wrapper.get('select[aria-label="Класс"]').setValue('Волшебник');
      expect(data.identity.className).toBe('Волшебник');
      expect(data.combat.hitDie).toBe(6);
      expect(data.spellcasting).toMatchObject({ casterClass: 'wizard', ability: 'intelligence' });
      expect([data.spellcasting.slots.l1.max, data.spellcasting.slots.l2.max]).toEqual([4, 2]);
      expect(wrapper.emitted('change')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });

  it('gives a non-caster only its hit die', async () => {
    const { data, wrapper } = mountSheet();
    try {
      await wrapper.get('select[aria-label="Класс"]').setValue('Варвар');
      expect(data.combat.hitDie).toBe(12);
      expect(data.spellcasting.casterClass).toBe('');
    } finally { wrapper.unmount(); }
  });

  it('takes away the spellcasting the previous class brought, but not one set by hand', async () => {
    const fromClass = mountSheet((sheet) => { sheet.identity.className = 'Жрец'; sheet.spellcasting.casterClass = 'cleric'; });
    try {
      await fromClass.wrapper.get('select[aria-label="Класс"]').setValue('Воин');
      expect(fromClass.data.spellcasting.casterClass).toBe('');
    } finally { fromClass.wrapper.unmount(); }

    // A fighter who was given wizard spells by hand (an eldritch knight) keeps them.
    const byHand = mountSheet((sheet) => { sheet.identity.className = 'Воин'; sheet.spellcasting.casterClass = 'wizard'; });
    try {
      await byHand.wrapper.get('select[aria-label="Класс"]').setValue('Плут');
      expect(byHand.data.spellcasting.casterClass).toBe('wizard');
      expect(byHand.data.combat.hitDie).toBe(8);
    } finally { byHand.wrapper.unmount(); }
  });

  it('keeps a homebrew class as typed and changes nothing else', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.combat.hitDie = 10; });
    try {
      await wrapper.get('select[aria-label="Класс"]').setValue('\u0000type');
      const input = wrapper.get('input[aria-label="Класс: свой вариант"]');
      await input.setValue('Кровавый охотник');
      await input.trigger('change');
      expect(data.identity.className).toBe('Кровавый охотник');
      expect(data.combat.hitDie).toBe(10);
      expect(options(wrapper, 'Класс')).toContain('Кровавый охотник');
    } finally { wrapper.unmount(); }
  });

  it('cannot be changed by a read-only viewer', () => {
    const { wrapper } = mountSheet((sheet) => { sheet.identity.race = 'Эльф'; sheet.identity.className = 'Следопыт'; }, true);
    try {
      expect(wrapper.get('select[aria-label="Раса"]').attributes('disabled')).toBeDefined();
      expect(wrapper.get('select[aria-label="Класс"]').attributes('disabled')).toBeDefined();
      expect((wrapper.get('select[aria-label="Класс"]').element as HTMLSelectElement).value).toBe('Следопыт');
    } finally { wrapper.unmount(); }
  });
});
