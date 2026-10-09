// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet, type DndCharacterSheetData, type DndTab } from '../dnd/characterSheet';
import { diffSheet } from '../dnd/sheetOperations';
import { actionKind } from '../dnd/sheetKinds';

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; });

function open(change: (data: DndCharacterSheetData) => void = () => {}, props: Record<string, unknown> = {}) {
  const data = reactive(createDndCharacterSheet());
  change(data);
  wrapper = mount(DndCharacterSheet, { props: { data, ...props }, attachTo: document.body });
  return data;
}
const section = (key: string) => wrapper!.get(`.dnd-cs-tabs [data-tab="${key}"]`).trigger('click');
const headings = () => wrapper!.findAll('.dnd-cs-tab-panel h4').map((heading) => heading.text());
const snapshot = (data: DndCharacterSheetData) => JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

/** Makes the sheet believe the screen is this wide (jsdom has no layout and no media queries). */
function screenWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return { matches: width <= max, media: query, addEventListener() {}, removeEventListener() {} };
  }) as unknown as typeof window.matchMedia;
}
afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });
const tabNames = () => wrapper!.findAll('.dnd-cs-tabs [role="tab"]').map((tab) => `${tab.attributes('data-tab')}:${tab.text()}`);

describe('the sheet\'s sections', () => {
  it('on a wide screen has four tabs next to the abilities, which are always in view', async () => {
    const data = open();
    expect(tabNames()).toEqual(['combat:Атаки', 'equipment:Снаряжение', 'spells:Заклинания', 'info:Инфо']);
    for (const key of ['equipment', 'spells', 'info', 'combat']) {
      await section(key);
      expect(wrapper!.get('.dnd-cs-tabs .active').attributes('data-tab')).toBe(key);
      expect(wrapper!.get('.dnd-cs-left').isVisible()).toBe(true);
      expect(wrapper!.find('.dnd-cs-tab-panel').exists()).toBe(true);
    }
    // "Abilities" stored by a phone: here the attacks open, and nothing is rewritten.
    data.activeTab = 'abilities';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('.dnd-cs-tabs .active').attributes('data-tab')).toBe('combat');
    expect(wrapper!.find('.dnd-cs-attack-row, .dnd-cs-add').exists()).toBe(true);
    expect(data.activeTab).toBe('abilities');
  });

  it('on a phone has five tabs: the abilities are a section of their own, apart from attacks and features', async () => {
    screenWidth(390);
    const data = open((sheet) => { sheet.activeTab = 'abilities'; sheet.features = [{ id: 'f', name: 'Ярость', maxUses: 2, currentUses: 2 }]; });
    // Five equal segments: short names under the icons, the full ones as the tabs' labels.
    expect(tabNames()).toEqual(['abilities:Статы', 'combat:Атаки', 'equipment:Вещи', 'spells:Магия', 'info:Инфо']);
    expect(wrapper!.findAll('.dnd-cs-tabs [role="tab"]').map((tab) => tab.attributes('aria-label'))).toEqual(['Характеристики', 'Атаки и умения', 'Снаряжение', 'Заклинания', 'Инфо']);
    expect(wrapper!.findAll('.dnd-cs-tabs .dnd-cs-tab-icon')).toHaveLength(5);
    expect(wrapper!.get('.dnd-cs-body').classes()).toEqual(expect.arrayContaining(['is-abilities', 'is-phone']));
    // Only the abilities: no panel under them, so nothing to scroll past.
    expect(wrapper!.get('.dnd-cs-left').isVisible()).toBe(true);
    expect(wrapper!.find('.dnd-cs-tab-panel').exists()).toBe(false);
    expect(wrapper!.find('.dnd-cs-feature-row').exists()).toBe(false);

    await section('combat');
    expect(data.activeTab).toBe('attacks');
    expect(wrapper!.get('.dnd-cs-left').isVisible()).toBe(false);
    expect(headings()).toEqual(['Экипированное оружие', 'Другие атаки', 'Умения']);
    expect(wrapper!.find('.dnd-cs-feature-row').exists()).toBe(true);
    expect(wrapper!.findAll('.dnd-cs-add').map((button) => button.text())).toEqual(['+ Добавить атаку', '+ Добавить умение']);

    await section('equipment');
    expect(wrapper!.get('.dnd-cs-left').isVisible()).toBe(false);
    expect(headings()).toEqual(['Монеты', 'Предметы']);

    await section('abilities');
    expect(data.activeTab).toBe('abilities');
    expect(wrapper!.get('.dnd-cs-left').isVisible()).toBe(true);
  });

  it('spells the names out where five equal segments are wide enough for them', () => {
    screenWidth(700);
    open();
    expect(tabNames()).toEqual(['abilities:Характеристики', 'combat:Атаки', 'equipment:Снаряжение', 'spells:Заклинания', 'info:Инфо']);
  });

  it('puts the wallet above the items in the equipment section', async () => {
    open();
    await section('equipment');
    expect(wrapper!.get('.dnd-cs-body').classes()).toContain('is-equipment');
    expect(headings()).toEqual(['Монеты', 'Предметы']);
  });

  it('gathers goals, personality, notes and proficiencies in "Инфо"', async () => {
    const data = open((sheet) => { sheet.goals = [{ id: 'g', name: 'Найти брата' }]; });
    expect(wrapper!.find('.dnd-cs-proficiencies').exists()).toBe(false);
    await section('info');
    expect(headings()).toEqual(['Цели', 'Характер', 'Заметки', 'Владения']);
    expect(wrapper!.find('.dnd-cs-goal-row').exists()).toBe(true);
    expect(wrapper!.findAll('.dnd-cs-freetext').map((label) => label.text())).toEqual(['Черты характера', 'Идеалы', 'Привязанности', 'Слабости']);
    expect(wrapper!.find('[aria-label="Заметки персонажа"]').exists()).toBe(true);

    await wrapper!.get('.dnd-cs-proficiencies input[type="checkbox"]').setValue(true);
    expect(data.proficiencies.armor).toEqual(['Лёгкие']);
  });

  it('opens the right section for every stored tab, and stores a section as its first tab', async () => {
    screenWidth(390);
    const expected: Record<DndTab, string> = {
      abilities: 'abilities', attacks: 'combat', features: 'combat', equipment: 'equipment', spells: 'spells', personality: 'info', goals: 'info', notes: 'info',
    };
    for (const [tab, key] of Object.entries(expected)) {
      open((data) => { data.activeTab = tab as DndTab; });
      expect(wrapper!.get('.dnd-cs-tabs .active').attributes('data-tab')).toBe(key);
      wrapper!.unmount();
    }
    const data = open((sheet) => { sheet.activeTab = 'notes'; });
    // Already in "Инфо": choosing it again must not rewrite the stored tab.
    await section('info');
    expect(data.activeTab).toBe('notes');
    await section('combat');
    expect(data.activeTab).toBe('attacks');
    await section('info');
    expect(data.activeTab).toBe('personality');
  });
});

describe('the wallet', () => {
  const openWallet = async (coins: Partial<DndCharacterSheetData['coins']>, props: Record<string, unknown> = {}) =>
    open((sheet) => { sheet.activeTab = 'equipment'; Object.assign(sheet.coins, coins); }, props);
  const dialog = () => document.body.querySelector<HTMLElement>('.dnd-coins-dialog');
  const coin = (label: string) => wrapper!.findAll('.dnd-wallet-coin').find((button) => button.attributes('aria-label')!.startsWith(label))!;
  const type = async (label: string, value: string) => {
    const input = dialog()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper!.vm.$nextTick();
  };
  const press = async (selector: string) => {
    dialog()!.querySelector<HTMLButtonElement>(selector)!.click();
    await wrapper!.vm.$nextTick();
  };
  const results = () => Array.from(dialog()!.querySelectorAll('.dnd-coins-results li')).map((line) => line.textContent!.replace(/\s+/g, ' ').trim());

  it('shows the five kinds of coins as buttons, with no fields and no total', async () => {
    await openWallet({ gp: 15, sp: 4, cp: 2 });
    const coins = wrapper!.findAll('.dnd-wallet-coin');
    expect(coins.map((button) => button.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']);
    expect(coins.map((button) => button.text())).toEqual(['пм0', 'зм15', 'эм0', 'см4', 'мм2']);
    expect(coins.map((button) => button.attributes('aria-label'))).toEqual([
      'Платиновые монеты: 0', 'Золотые монеты: 15', 'Электрумовые монеты: 0', 'Серебряные монеты: 4', 'Медные монеты: 2',
    ]);
    expect(wrapper!.find('.dnd-wallet input').exists()).toBe(false);
    expect(wrapper!.find('.dnd-wallet-total').exists()).toBe(false);
    expect(wrapper!.get('.dnd-wallet').text()).not.toContain('Всего');
    expect(wrapper!.find('.dnd-wallet-actions').exists()).toBe(false);
  });

  it('opens one dialog from a coin, on that coin\'s field, with "spend" and "gain"', async () => {
    await openWallet({ gp: 15 });
    await coin('Серебряные').trigger('click');
    expect(dialog()!.getAttribute('aria-label')).toBe('Монеты');
    expect(dialog()!.querySelector('.dnd-coins-now')!.textContent).toBe('В кошельке: 15 зм');
    expect(document.activeElement).toBe(dialog()!.querySelector('input[aria-label="Серебряные"]'));
    expect(Array.from(dialog()!.querySelectorAll('.dnd-coins-actions button')).map((button) => button.textContent)).toEqual(['Потратить', 'Получить']);
    // Nothing entered: neither action is available.
    expect(Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.dnd-coins-actions button')).map((button) => button.disabled)).toEqual([true, true]);
    expect(results()).toEqual(['Получить: —', 'Потратить: —']);
  });

  it('adds coins gained, several kinds at once, and syncs them as play data', async () => {
    const data = await openWallet({ gp: 15 });
    const before = snapshot(data);
    await coin('Золотые').trigger('click');
    await type('Золотые', '10');
    await type('Серебряные', '5');
    expect(results()).toEqual(['Получить: 25 зм 5 см', 'Потратить: 4 зм 5 см · с разменом']);
    await press('.dnd-coins-gain');
    expect(dialog()).toBeNull();
    expect(data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 5, cp: 0 });
    const ops = diffSheet(before, snapshot(data));
    expect(ops).toEqual([{ type: 'set', path: ['coins', 'gp'], value: 25 }, { type: 'set', path: ['coins', 'sp'], value: 5 }]);
    expect(actionKind(ops)).toBe('play');
  });

  it('spends with change made automatically, and refuses a price the wallet is not worth', async () => {
    const data = await openWallet({ gp: 1 });
    await coin('Золотые').trigger('click');
    await type('Золотые', '2');
    expect(results()).toEqual(['Получить: 3 зм', 'Потратить: не хватает 1 зм']);
    expect(dialog()!.querySelector<HTMLButtonElement>('.dnd-coins-spend')!.disabled).toBe(true);
    expect(dialog()!.querySelector<HTMLButtonElement>('.dnd-coins-gain')!.disabled).toBe(false);
    await press('.dnd-coins-spend');
    expect(data.coins.gp).toBe(1);

    await type('Золотые', '');
    await type('Серебряные', '5');
    expect(results()).toEqual(['Получить: 1 зм 5 см', 'Потратить: 5 см · с разменом']);
    await press('.dnd-coins-spend');
    expect(dialog()).toBeNull();
    expect(data.coins).toEqual({ pp: 0, gp: 0, ep: 0, sp: 5, cp: 0 });
  });

  it('does not decide between gaining and spending on Enter, and takes whole numbers only', async () => {
    const data = await openWallet({ gp: 5 });
    await coin('Золотые').trigger('click');
    await type('Золотые', '3');
    dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await wrapper!.vm.$nextTick();
    expect(dialog()).not.toBeNull();
    expect(data.coins.gp).toBe(5);

    await type('Золотые', '1.5');
    expect(dialog()!.querySelector('input[aria-label="Золотые"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.dnd-coins-actions button')).every((button) => button.disabled)).toBe(true);
    await press('.dnd-coins-close');
    expect(dialog()).toBeNull();
  });

  it('stays live in play mode and is only read by a viewer', async () => {
    await openWallet({ gp: 3 }, { mode: 'play' });
    expect(coin('Золотые').attributes('disabled')).toBeUndefined();
    await coin('Золотые').trigger('click');
    expect(dialog()).not.toBeNull();
    wrapper!.unmount();

    await openWallet({ gp: 3 }, { readonly: true });
    expect(wrapper!.findAll('.dnd-wallet-coin').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(coin('Золотые').text()).toBe('зм3');
    await coin('Золотые').trigger('click');
    expect(dialog()).toBeNull();
  });
});

describe('what is looked up, and the initiative roll', () => {
  it('puts the initiative roll in the row of actions, on every screen', () => {
    open((sheet) => { sheet.abilities.dexterity.score = 14; });
    expect(wrapper!.findAll('.dnd-cs-hp-actions button').map((button) => button.text())).toEqual(['Лечение', 'Урон', 'Отдых', 'Инициатива+2']);
    expect(wrapper!.get('.dnd-cs-hp-actions [aria-label="Бросить инициативу"]').classes()).toContain('dnd-cs-init-button');
    expect(wrapper!.find('.dnd-cs-combat-stats button').exists()).toBe(false);
  });

  it('on a wide screen keeps armor class, speed, proficiency and the passive scores at the top', () => {
    open();
    expect(wrapper!.findAll('.dnd-cs-topcard .dnd-cs-combat-stats .dnd-cs-stat span').map((label) => label.text())).toEqual(['КД', 'Скорость', 'Мастерство']);
    expect(wrapper!.find('.dnd-cs-status-row .dnd-cs-passives').exists()).toBe(true);
    expect(wrapper!.find('.dnd-cs-left .dnd-cs-combat-stats').exists()).toBe(false);
    expect(wrapper!.findAll('.dnd-cs-passives')).toHaveLength(1);
  });

  it('on a phone moves them into the abilities section', async () => {
    screenWidth(390);
    const data = open((sheet) => { sheet.activeTab = 'abilities'; });
    expect(wrapper!.find('.dnd-cs-topcard .dnd-cs-combat-stats').exists()).toBe(false);
    expect(wrapper!.find('.dnd-cs-status-row .dnd-cs-passives').exists()).toBe(false);
    expect(wrapper!.find('.dnd-cs-status-row').exists()).toBe(true); // the conditions stay on top
    const left = wrapper!.get('.dnd-cs-left');
    expect(left.findAll('.dnd-cs-combat-stats .dnd-cs-stat span').map((label) => label.text())).toEqual(['КД', 'Скорость', 'Мастерство']);
    expect(left.find('.dnd-cs-passives').exists()).toBe(true);
    // They come before the abilities.
    expect(left.element.firstElementChild!.classList.contains('dnd-cs-combat-stats')).toBe(true);

    await left.get('[aria-label="Класс доспеха"]').setValue('17');
    expect(data.combat.armorClass).toBe(17);
    // Still one of each, and gone with the section.
    expect(wrapper!.findAll('[aria-label="Класс доспеха"]')).toHaveLength(1);
    await section('equipment');
    expect(left.isVisible()).toBe(false);
  });
});
