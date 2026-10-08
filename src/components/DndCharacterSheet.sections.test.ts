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

describe('the sheet\'s four sections', () => {
  it('has four tabs; the first is named after the abilities on a phone and after what it adds on a wide screen', () => {
    open();
    const tabs = wrapper!.findAll('.dnd-cs-tabs [role="tab"]');
    expect(tabs.map((tab) => tab.attributes('data-tab'))).toEqual(['main', 'equipment', 'spells', 'info']);
    expect(tabs[0]!.get('.dnd-cs-tab-narrow').text()).toBe('Характеристики');
    expect(tabs[0]!.get('.dnd-cs-tab-wide').text()).toBe('Атаки и умения');
    expect(tabs.slice(1).map((tab) => tab.text())).toEqual(['Снаряжение', 'Заклинания', 'Инфо']);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(wrapper!.get('.dnd-cs-body').classes()).toContain('is-main');
  });

  it('keeps attacks and features together in the first section', () => {
    open((data) => { data.features = [{ id: 'f', name: 'Ярость', maxUses: 2, currentUses: 2 }]; });
    expect(headings()).toEqual(['Экипированное оружие', 'Другие атаки', 'Умения']);
    expect(wrapper!.find('.dnd-cs-feature-row').exists()).toBe(true);
    expect(wrapper!.findAll('.dnd-cs-add').map((button) => button.text())).toEqual(['+ Добавить атаку', '+ Добавить умение']);
  });

  it('puts the wallet above the items in the equipment section', async () => {
    open();
    await section('equipment');
    expect(wrapper!.get('.dnd-cs-body').classes()).toContain('is-equipment');
    expect(headings()).toEqual(['Монеты', 'Предметы']);
    expect(wrapper!.find('.dnd-cs-abilities').exists()).toBe(true); // still there: only a phone hides it, by CSS
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
    const expected: Record<DndTab, string> = {
      attacks: 'main', features: 'main', equipment: 'equipment', spells: 'spells', personality: 'info', goals: 'info', notes: 'info',
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
    await section('main');
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
