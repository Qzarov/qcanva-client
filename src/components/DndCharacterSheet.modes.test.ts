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
    expect(isReadonly('[aria-label="Опыт"]')).toBe(false);
    // Hit points are never typed over; in play they change through the HP button, and the maximum is locked.
    for (const label of ['Текущие HP', 'Максимум HP', 'Временные HP']) expect(isReadonly(`[aria-label="${label}"]`), label).toBe(true);
    expect(isDisabled('.dnd-cs-hp-button')).toBe(false);
    expect(wrapper.get('.dnd-cs-rest-button').attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('.dnd-cs-roll').length).toBeGreaterThan(0);
  });

  it('lets uses be spent but not the maximum or recharge changed; hides list composition', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: filled(), mode: 'play' }, attachTo: document.body });
    await tab('Атаки');
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
    await tab('Атаки');
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
    // The level is the heading of the group; the row does not repeat it.
    expect(wrapper.find('[aria-label="Уровень заклинания"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Бросок и урон заклинания"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Удалить заклинание"]').exists()).toBe(false);
    expect(wrapper.find('.dnd-cs-add-row').exists()).toBe(false);
  });

  it('shows a row\'s notes only when there are some, and all the fields again in setup', async () => {
    const data = filled();
    data.spells.push({ id: 'ward', name: 'Щит', level: 1, description: 'Реакция' } as any);
    data.equipment.push({ id: 'rope', name: 'Верёвка', quantity: 1, description: '50 футов' } as any);
    wrapper = mount(DndCharacterSheet, { props: { data, mode: 'play' }, attachTo: document.body });
    await tab('Заклинания');
    const spellNotes = wrapper.findAll('[aria-label="Заметки заклинания"]');
    expect(spellNotes.map((input) => (input.element as HTMLInputElement).value)).toEqual(['Реакция']);
    expect(spellNotes[0]!.attributes('readonly')).toBeDefined();
    await tab('Снаряжение');
    expect(wrapper.findAll('[aria-label="Заметки"]').map((input) => (input.element as HTMLInputElement).value)).toEqual(['50 футов']);

    await wrapper.setProps({ mode: 'setup' });
    expect(wrapper.findAll('[aria-label="Заметки"]')).toHaveLength(2);
    await tab('Заклинания');
    expect(wrapper.findAll('[aria-label="Заметки заклинания"]')).toHaveLength(2);
    expect(wrapper.findAll('[aria-label="Уровень заклинания"]')).toHaveLength(2);
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
    await wrapper.get('.dnd-cs-rest-button').trigger('click');
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
