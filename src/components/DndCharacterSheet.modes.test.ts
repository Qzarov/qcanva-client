// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet, isBlankSheet, spellSlotKey } from '../dnd/characterSheet';
import { createWeapon } from '../dnd/weapons';
import { selectSelector } from './dndSelect.testing';

function filled() {
  const data = reactive(createDndCharacterSheet());
  data.identity.name = 'Торин';
  data.proficiencies.armor = ['Лёгкие'];
  data.features = [{ id: 'rage', name: 'Ярость', currentUses: 2, maxUses: 3, recharge: 'long' } as any];
  data.equipment = [{ id: 'axe', name: 'Топор', quantity: 1, equipped: true, weapon: createWeapon() } as any];
  data.spells = [{ id: 'bolt', name: 'Огненный снаряд', level: 1 } as any];
  data.spellcasting.casterClass = 'wizard';
  data.spellcasting.slots[spellSlotKey(1)] = { max: 2, spent: 0 };
  data.goals = [{ id: 'g', name: 'Найти брата' } as any];
  return data;
}

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; });

const tab = async (label: string) => { await wrapper!.findAll('.dnd-cs-tabs button').find((b) => b.text().startsWith(label))!.trigger('click'); };
const isReadonly = (selector: string) => wrapper!.get(selector).attributes('readonly') !== undefined;
const isDisabled = (selector: string) => wrapper!.get(selector).attributes('disabled') !== undefined;

describe('play mode (docs/character-sheet-edit-modes.md)', () => {
  it('locks identity, abilities, proficiencies and combat setup; keeps HP and rolls live', () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    expect(wrapper.classes()).toContain('dnd-cs-play');
    for (const label of ['Имя персонажа', 'Уровень', 'Сила', 'Класс доспеха', 'Скорость']) expect(isReadonly(`[aria-label="${label}"]`), label).toBe(true);
    expect(isDisabled(selectSelector('Раса'))).toBe(true);
    expect(isDisabled(selectSelector('Класс'))).toBe(true);
    expect(wrapper.findAll('.dnd-cs-save-cell .dnd-cs-pip-btn').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.findAll('.dnd-cs-skill-pip').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.findAll('.dnd-cs-prof-group input').every((i) => i.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.find('.dnd-cs-prof-list .dnd-cs-add-sm').exists()).toBe(false);
    for (const label of ['Текущие HP', 'Максимум HP', 'Временные HP', 'Опыт']) expect(isReadonly(`[aria-label="${label}"]`), label).toBe(false);
    expect(isDisabled('button[aria-label="Урон"]')).toBe(false);
    expect(wrapper.findAll('.dnd-cs-rest-actions button').every((b) => b.attributes('disabled') === undefined)).toBe(true);
    expect(wrapper.findAll('.dnd-cs-roll').length).toBeGreaterThan(0);
  });

  it('lets uses be spent but not the maximum or recharge changed; hides list composition', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await tab('Характеристики');
    expect(isReadonly('[aria-label="Название умения"]')).toBe(true);
    expect(isReadonly('[aria-label="Описание умения"]')).toBe(true);
    expect(isReadonly('[aria-label="Максимум использований"]')).toBe(true);
    expect(isDisabled('[aria-label="Когда восстанавливаются заряды"]')).toBe(true);
    expect(isDisabled('[aria-label="Использовать"]')).toBe(false);
    expect(wrapper.find('[aria-label="Удалить умение"]').exists()).toBe(false);
    expect(wrapper.find('.dnd-cs-add').exists()).toBe(false);
    await wrapper.get('[aria-label="Использовать"]').trigger('click');
    expect(wrapper.emitted('op')).toEqual([[{ type: 'uses-change', itemId: 'rage', delta: -1 }]]);
  });

  it('keeps quantity and "equipped" live; hides weapon parameters and catalogs', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await tab('Снаряжение');
    expect(isReadonly('[aria-label="Название предмета"]')).toBe(true);
    expect(isReadonly('[aria-label="Количество"]')).toBe(false);
    expect(isDisabled('[aria-label="Экипировано"]')).toBe(false);
    expect(wrapper.find('.dnd-cs-weapon-toggle').exists()).toBe(false);
    expect(wrapper.find('.dnd-weapon-fields').exists()).toBe(false);
    expect(wrapper.find('.dnd-cs-add-row').exists()).toBe(false);
    // The weapon itself still attacks.
    await tab('Характеристики');
    expect(wrapper.find('[aria-label="Атака: Топор"]').exists()).toBe(true);
  });

  it('spends spell slots but does not change their number, the class or the spell list', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await tab('Заклинания');
    expect(isDisabled('[aria-label="Заклинательный класс"]')).toBe(true);
    expect(isDisabled('[aria-label="Заклинательная характеристика"]')).toBe(true);
    expect(isReadonly('[aria-label="Всего ячеек 1 уровня"]')).toBe(true);
    expect(isDisabled('[aria-label="Потратить ячейку 1 уровня"]')).toBe(false);
    expect(isReadonly('[aria-label="Название заклинания"]')).toBe(true);
    expect(isReadonly('[aria-label="Уровень заклинания"]')).toBe(true);
    expect(wrapper.find('[aria-label="Бросок и урон заклинания"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Удалить заклинание"]').exists()).toBe(false);
    expect(wrapper.find('.dnd-cs-add-row').exists()).toBe(false);
  });

  it('ticks goals off but does not rename or remove them; notes stay editable', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await tab('Инфо');
    expect(isDisabled('[aria-label="Выполнено"]')).toBe(false);
    expect(isReadonly('[aria-label="Название цели"]')).toBe(true);
    expect(wrapper.find('[aria-label="Удалить цель"]').exists()).toBe(false);
    await tab('Инфо');
    expect(isReadonly('[aria-label="Заметки персонажа"]')).toBe(false);
  });

  it('shows the hit die as text in the short rest dialog', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await wrapper.findAll('.dnd-cs-rest-actions button').find((b) => b.text() === 'Короткий отдых')!.trigger('click');
    expect(document.querySelector(selectSelector('Кость хитов'))).toBeNull();
    expect(document.querySelector('.dnd-rest-hit-die')?.textContent).toContain('к8');
  });

  it('setup mode keeps everything editable, as before', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'setup' }, attachTo: document.body });
    expect(wrapper.classes()).not.toContain('dnd-cs-play');
    expect(isReadonly('[aria-label="Имя персонажа"]')).toBe(false);
    await tab('Снаряжение');
    expect(wrapper.find('.dnd-cs-weapon-toggle').exists()).toBe(true);
    expect(wrapper.find('.dnd-weapon-fields').exists()).toBe(true);
  });
});

describe('isBlankSheet', () => {
  it('is true for a new sheet and false once anything is filled in', () => {
    expect(isBlankSheet(createDndCharacterSheet())).toBe(true);
    const named = createDndCharacterSheet(); named.identity.name = 'Торин';
    const classed = createDndCharacterSheet(); classed.identity.className = 'Воин';
    const strong = createDndCharacterSheet(); strong.abilities.strength.score = 15;
    const equipped = createDndCharacterSheet(); equipped.equipment = [{ id: 'x', name: 'Верёвка' }];
    for (const sheet of [named, classed, strong, equipped]) expect(isBlankSheet(sheet)).toBe(false);
  });
});
