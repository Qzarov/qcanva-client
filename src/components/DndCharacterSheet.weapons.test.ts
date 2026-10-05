// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import { diffSheet } from '../dnd/sheetOperations';

/** Makes every die land on the given faces in order (crypto.getRandomValues drives the dice). */
function dice(...faces: Array<[face: number, sides: number]>) {
  let i = 0;
  return vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView>(array: T) => {
    const [face, sides] = faces[Math.min(i++, faces.length - 1)]!;
    (array as unknown as Uint32Array)[0] = Math.floor(((face - 1) / sides) * 2 ** 32) + 1;
    return array;
  });
}

const toastTexts = () => Array.from(document.querySelectorAll('.dnd-cs-toast')).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

function sheet() {
  const data = reactive(createDndCharacterSheet());
  data.identity.level = 5;
  data.abilities.strength.score = 16;
  data.proficiencies.weapons = ['Простое', 'Воинское'];
  data.equipment = [{ id: 'sword', name: 'Длинный меч', equipped: true, weapon: { damage: '1d8', damageType: 'рубящий', category: 'martial', finesse: false, ranged: false, versatile: '1d10', magicBonus: 0, attackBonusOverride: null, damageBonusOverride: null } } as any];
  return data;
}

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('weapons and attack rolls', () => {
  it('turns an equipment item into a weapon and lists it once equipped', async () => {
    const data = reactive(createDndCharacterSheet());
    data.equipment = [{ id: 'axe', name: 'Топор', equipped: false }];
    const before = JSON.parse(JSON.stringify(data));
    wrapper = mount(DndCharacterSheet, { props: { data }, attachTo: document.body });
    await wrapper.findAll('.dnd-cs-tabs button').find((b) => b.text() === 'Снаряжение')!.trigger('click');
    await wrapper.get('[aria-label="Сделать оружием"]').trigger('click');
    expect(wrapper.find('[aria-label="Кость урона"]').exists()).toBe(true);
    await wrapper.get('[aria-label="Кость урона"]').setValue('1d12');
    await wrapper.get('[aria-label="Экипировано"]').setValue(true);
    expect(diffSheet(before, JSON.parse(JSON.stringify(data)))).toEqual([
      { type: 'list-update', list: 'equipment', itemId: 'axe', changes: expect.objectContaining({ equipped: true, weapon: expect.objectContaining({ damage: '1d12' }) }) },
    ]);
    await wrapper.findAll('.dnd-cs-tabs button').find((b) => b.text() === 'Атаки')!.trigger('click');
    expect(wrapper.get('.dnd-weapon-attacks').text()).toContain('Топор');

    // Un-marking it as a weapon must reach the server: null, not a missing key.
    const withWeapon = JSON.parse(JSON.stringify(data));
    await wrapper.findAll('.dnd-cs-tabs button').find((b) => b.text() === 'Снаряжение')!.trigger('click');
    await wrapper.get('[aria-label="Это оружие: убрать боевые параметры"]').trigger('click');
    expect(diffSheet(withWeapon, JSON.parse(JSON.stringify(data)))).toEqual([
      { type: 'list-update', list: 'equipment', itemId: 'axe', changes: { weapon: null } },
    ]);
  });

  it('rolls an attack with the computed bonus, then its damage', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: sheet() }, attachTo: document.body });
    dice([12, 20], [6, 8]);
    await wrapper.get('[aria-label="Атака: Длинный меч"]').trigger('click');
    expect(toastTexts()[0]).toContain('Атака · Длинный меч');
    expect(toastTexts()[0]).toContain('d20 (12) + 6 = 18'); // STR +3, proficiency +3
    const damageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.dnd-cs-toast-actions button'));
    expect(damageButtons.map((button) => button.textContent?.trim())).toEqual(['Урон · одной рукой: 1d8+3', 'Урон · двумя руками: 1d10+3']);
    damageButtons[0]!.click();
    await nextTick();
    expect(toastTexts()[0]).toContain('Урон · Длинный меч · рубящий');
    expect(toastTexts()[0]).toContain('1d8 (6) + 3 = 9');
  });

  it('doubles the damage dice after a natural 20', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: sheet() }, attachTo: document.body });
    dice([20, 20], [5, 8], [7, 8]);
    await wrapper.get('[aria-label="Атака: Длинный меч"]').trigger('click');
    const crit = document.querySelector<HTMLButtonElement>('.dnd-cs-toast-actions button')!;
    expect(crit.textContent).toContain('Крит');
    crit.click();
    await nextTick();
    expect(toastTexts()[0]).toContain('(крит)');
    expect(toastTexts()[0]).toContain('2d8 (5, 7) + 3 = 15');
  });

  it('rolls with advantage once, then goes back to a normal roll', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: sheet() }, attachTo: document.body });
    await wrapper.get('.dnd-roll-mode button[title^="Преимущество"]').trigger('click');
    dice([4, 20], [17, 20], [9, 20]);
    await wrapper.get('[aria-label="Бросить инициативу"]').trigger('click');
    expect(toastTexts()[0]).toContain('d20 (4, 17 → 17)');
    expect(toastTexts()[0]).toContain('преимущество');
    await wrapper.get('[aria-label="Бросить инициативу"]').trigger('click');
    expect(toastTexts()[0]).toContain('d20 (9)');
  });

  it('asks which weapon to use when several are equipped', async () => {
    const data = sheet();
    data.equipment.push({ id: 'dagger', name: 'Кинжал', equipped: true, weapon: { damage: '1d4', finesse: true } } as any);
    wrapper = mount(DndCharacterSheet, { props: { data }, attachTo: document.body });
    dice([10, 20]);
    await wrapper.get('.dnd-roll-attack').trigger('click');
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.dnd-roll-weapon-menu button'));
    expect(items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Длинный меч +6', 'Кинжал +6']);
    items[1]!.click();
    await nextTick();
    expect(toastTexts()[0]).toContain('Атака · Кинжал');
  });

  it('disables the Attack button with nothing equipped', () => {
    const data = sheet();
    data.equipment[0]!.equipped = false;
    wrapper = mount(DndCharacterSheet, { props: { data }, attachTo: document.body });
    expect(wrapper.get('.dnd-roll-attack').attributes('disabled')).toBeDefined();
  });

  it('shows an unparsable formula as text with a hint instead of a roll button', async () => {
    const data = sheet();
    data.attacks = [{ id: 'fire', name: 'Огненный снаряд', attackBonus: '+5', damage: '1d10 огнём' }];
    wrapper = mount(DndCharacterSheet, { props: { data }, attachTo: document.body });
    const rolls = wrapper.get('.dnd-cs-attack-rolls');
    expect(rolls.find('[aria-label="Атака +5: бросить"]').exists()).toBe(true);
    const invalid = rolls.get('.dnd-formula-invalid');
    expect(invalid.text()).toContain('1d10 огнём');
    await invalid.trigger('click');
    const hint = document.querySelector('[role="tooltip"].dnd-formula-hint');
    expect(hint?.textContent).toContain('Не получилось разобрать');
    expect(hint?.textContent).toContain('1d8+3');
  });

  it('keeps every roll in the log', async () => {
    wrapper = mount(DndCharacterSheet, { props: { data: sheet() }, attachTo: document.body });
    dice([3, 20]);
    await wrapper.get('[aria-label="Бросить инициативу"]').trigger('click');
    await wrapper.get('[aria-label="Атака: Длинный меч"]').trigger('click');
    await wrapper.get('.dnd-roll-log-button').trigger('click');
    const entries = Array.from(document.querySelectorAll('.dnd-roll-log li')).map((li) => li.textContent?.replace(/\s+/g, ' '));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('Атака · Длинный меч');
    expect(entries[1]).toContain('Инициатива');
  });
});
