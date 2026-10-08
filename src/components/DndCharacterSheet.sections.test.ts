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
  const openWallet = async (coins: Partial<DndCharacterSheetData['coins']>, props: Record<string, unknown> = {}) => {
    const data = open((sheet) => { sheet.activeTab = 'equipment'; Object.assign(sheet.coins, coins); }, props);
    return data;
  };
  const dialog = () => document.body.querySelector<HTMLElement>('.dnd-coins-dialog');
  const type = async (label: string, value: string) => {
    const input = dialog()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper!.vm.$nextTick();
  };
  const submit = async () => {
    dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await wrapper!.vm.$nextTick();
  };

  it('shows the five kinds of coins and what they are worth', async () => {
    await openWallet({ gp: 15, sp: 4, cp: 2 });
    expect(wrapper!.findAll('.dnd-wallet-coin span').map((label) => label.text())).toEqual(['пм', 'зм', 'эм', 'см', 'мм']);
    expect(wrapper!.findAll('.dnd-wallet-coin input').map((input) => (input.element as HTMLInputElement).value)).toEqual(['0', '15', '0', '4', '2']);
    expect(wrapper!.get('.dnd-wallet-total').text()).toBe('Всего 15,42 зм');
  });

  it('lets a number be typed over, and syncs it as play data on its own path', async () => {
    const data = await openWallet({ gp: 15 });
    const before = snapshot(data);
    await wrapper!.get('[aria-label="Золотые монеты"]').setValue('20');
    expect(data.coins.gp).toBe(20);
    const ops = diffSheet(before, snapshot(data));
    expect(ops).toEqual([{ type: 'set', path: ['coins', 'gp'], value: 20 }]);
    expect(actionKind(ops)).toBe('play');

    // A cleared or negative field is not money: zero, and the field says so.
    const silver = wrapper!.get('[aria-label="Серебряные монеты"]');
    await silver.setValue('-5');
    expect(data.coins.sp).toBe(0);
    expect((silver.element as HTMLInputElement).value).toBe('0');
  });

  it('adds coins gained, several kinds at once, showing the wallet before it is applied', async () => {
    const data = await openWallet({ gp: 15 });
    await wrapper!.findAll('.dnd-wallet-actions button')[0]!.trigger('click');
    expect(dialog()!.getAttribute('aria-label')).toBe('Получить монеты');
    expect(dialog()!.querySelector<HTMLButtonElement>('.dnd-coins-apply')!.disabled).toBe(true);
    await type('Золотые', '10');
    await type('Серебряные', '5');
    expect(dialog()!.querySelector('p')!.textContent).toBe('После: 25 зм 5 см');
    await submit();
    expect(dialog()).toBeNull();
    expect(data.coins).toEqual({ pp: 0, gp: 25, ep: 0, sp: 5, cp: 0 });
  });

  it('spends with change made automatically, and refuses a price the wallet is not worth', async () => {
    const data = await openWallet({ gp: 1 });
    const before = snapshot(data);
    await wrapper!.findAll('.dnd-wallet-actions button')[1]!.trigger('click');
    expect(dialog()!.getAttribute('aria-label')).toBe('Потратить монеты');

    await type('Золотые', '2');
    expect(dialog()!.querySelector('p')!.textContent).toBe('Не хватает 1 зм. В кошельке: 1 зм');
    expect(dialog()!.querySelector<HTMLButtonElement>('.dnd-coins-apply')!.disabled).toBe(true);
    await submit();
    expect(data.coins.gp).toBe(1);

    await type('Золотые', '');
    await type('Серебряные', '5');
    expect(dialog()!.querySelector('p')!.textContent).toBe('После: 5 см · с разменом');
    await submit();
    expect(data.coins).toEqual({ pp: 0, gp: 0, ep: 0, sp: 5, cp: 0 });
    expect(diffSheet(before, snapshot(data))).toEqual([
      { type: 'set', path: ['coins', 'gp'], value: 0 },
      { type: 'set', path: ['coins', 'sp'], value: 5 },
    ]);
  });

  it('does not accept anything but whole numbers', async () => {
    await openWallet({ gp: 5 });
    await wrapper!.findAll('.dnd-wallet-actions button')[0]!.trigger('click');
    await type('Золотые', '1.5');
    expect(dialog()!.querySelector('input[aria-label="Золотые"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(dialog()!.querySelector<HTMLButtonElement>('.dnd-coins-apply')!.disabled).toBe(true);
  });

  it('stays live in play mode, is read-only for a viewer, and has nothing to spend when empty', async () => {
    await openWallet({ gp: 3 }, { mode: 'play' });
    expect(wrapper!.get('[aria-label="Золотые монеты"]').attributes('readonly')).toBeUndefined();
    expect(wrapper!.findAll('.dnd-wallet-actions button').map((button) => button.attributes('disabled'))).toEqual([undefined, undefined]);
    wrapper!.unmount();

    await openWallet({ gp: 3 }, { readonly: true });
    expect(wrapper!.get('[aria-label="Золотые монеты"]').attributes('readonly')).toBeDefined();
    expect(wrapper!.findAll('.dnd-wallet-actions button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    wrapper!.unmount();

    await openWallet({});
    const [gain, spend] = wrapper!.findAll('.dnd-wallet-actions button');
    expect(gain!.attributes('disabled')).toBeUndefined();
    expect(spend!.attributes('disabled')).toBeDefined();
  });
});
