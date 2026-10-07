// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import DndQuickRoll from './DndQuickRoll.vue';
import DndRollList from './DndRollList.vue';
import DndSheetHistory from './DndSheetHistory.vue';
import DndSpellCatalog from './DndSpellCatalog.vue';
import DndWeaponCatalog from './DndWeaponCatalog.vue';
import DndCanvasLink from './DndCanvasLink.vue';
import { createDndCharacterSheet, defaultNextLevelExperience, nextLevelExperienceOf, normalizeDndCharacterSheet } from '../dnd/characterSheet';
import { rollSpecLocally, type SheetRoll } from '../dnd/useSheetRolls';

vi.mock('../api/client', () => ({
  // Never answers: the dialog's focus is checked while its list is still loading.
  canvas: { list: () => new Promise(() => {}) },
  interactiveTemplates: { history: () => Promise.resolve({ entries: [] }), restoreSetup: () => Promise.resolve({ rolledBack: 0 }) },
}));
vi.mock('vue-router', () => ({ RouterLink: { template: '<a><slot /></a>' } }));

const pointer = (coarse: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('coarse') ? coarse : false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
beforeEach(() => pointer(false));
afterEach(() => { document.body.innerHTML = ''; });

describe('free roll from the header', () => {
  const mountRoll = () => mount(DndQuickRoll, { global: { stubs: { Teleport: true } }, attachTo: document.body });

  it('builds a formula from dice buttons and rolls it, keeping the menu open', async () => {
    const wrapper = mountRoll();
    try {
      await wrapper.get('[aria-label="Бросок по формуле"]').trigger('click');
      const input = () => wrapper.get('input[aria-label="Формула броска"]').element as HTMLInputElement;
      await wrapper.get('[aria-label="Добавить к6"]').trigger('click');
      await wrapper.get('[aria-label="Добавить к6"]').trigger('click');
      expect(input().value).toBe('2d6');
      await wrapper.get('[aria-label="Добавить к8"]').trigger('click');
      expect(input().value).toBe('2d6+1d8');
      await wrapper.get('form').trigger('submit');
      const [formula] = wrapper.emitted('roll')![0] as [{ text: string; dice: unknown[] }];
      expect(formula.text).toBe('2d6+1d8');
      expect(formula.dice).toHaveLength(2);
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true); // ready for the next roll
      await wrapper.get('[aria-label="Очистить формулу"]').trigger('click');
      expect(input().value).toBe('');
    } finally { wrapper.unmount(); }
  });

  it('takes a typed formula and keeps the modifier when dice are added', async () => {
    const wrapper = mountRoll();
    try {
      await wrapper.get('[aria-label="Бросок по формуле"]').trigger('click');
      await wrapper.get('input[aria-label="Формула броска"]').setValue('1d20+5');
      await wrapper.get('[aria-label="Добавить к4"]').trigger('click');
      expect((wrapper.get('input[aria-label="Формула броска"]').element as HTMLInputElement).value).toBe('1d20+1d4+5');
    } finally { wrapper.unmount(); }
  });

  it('says what is wrong with a formula instead of rolling it', async () => {
    const wrapper = mountRoll();
    try {
      await wrapper.get('[aria-label="Бросок по формуле"]').trigger('click');
      await wrapper.get('form').trigger('submit');
      expect(wrapper.get('[role="alert"]').text()).toContain('Формула');
      expect(wrapper.emitted('roll')).toBeUndefined();
      await wrapper.get('input[aria-label="Формула броска"]').setValue('много');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false); // typing clears the complaint
      await wrapper.get('form').trigger('submit');
      expect(wrapper.get('[role="alert"]').text()).toContain('Не получилось разобрать');
    } finally { wrapper.unmount(); }
  });

  it('puts the cursor in the field with a mouse, and leaves the keyboard down on a touch screen', async () => {
    const mouse = mountRoll();
    await mouse.get('[aria-label="Бросок по формуле"]').trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(mouse.get('input[aria-label="Формула броска"]').element);
    mouse.unmount();

    pointer(true);
    const touch = mountRoll();
    await touch.get('[aria-label="Бросок по формуле"]').trigger('click');
    await flushPromises();
    expect(document.activeElement).not.toBe(touch.get('input[aria-label="Формула броска"]').element);
    touch.unmount();
  });
});

describe('dialogs with a search field', () => {
  const stubs = { Teleport: true };
  const sheet = () => normalizeDndCharacterSheet(createDndCharacterSheet());

  it.each([
    ['the spell catalog', () => mount(DndSpellCatalog, { props: { sheet: sheet() }, global: { stubs }, attachTo: document.body }), 'input[aria-label="Поиск заклинания"]'],
    ['the weapon catalog', () => mount(DndWeaponCatalog, { global: { stubs }, attachTo: document.body }), 'input[aria-label="Поиск оружия"]'],
  ])('%s focuses its search with a mouse but not on a touch screen', async (_name, mountDialog, selector) => {
    // Checked right after mounting, where the focus is set - before a catalog's data
    // arrives: the stubbed Teleport re-renders its content then and drops the focus.
    const mouse = mountDialog();
    expect(document.activeElement).toBe(mouse.get(selector).element);
    mouse.unmount();

    pointer(true);
    const touch = mountDialog();
    expect(document.activeElement).not.toBe(touch.get(selector).element);
    // The focus is still inside the dialog, on its close button.
    expect(touch.element.parentElement!.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^Закрыть/);
    touch.unmount();
  });

  it('the canvas connection dialog does the same', async () => {
    const open = async () => {
      const wrapper = mount(DndCanvasLink, { props: { canvasId: '', target: null, readonly: false }, global: { stubs }, attachTo: document.body });
      await wrapper.get('.dnd-link-button').trigger('click');
      // Right after opening, before the canvas list arrives: the stubbed Teleport
      // re-renders its content then and would drop the focus with it.
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();
      return wrapper;
    };
    const mouse = await open();
    expect(document.activeElement).toBe(mouse.get('input[aria-label="Поиск канваса"]').element);
    mouse.unmount();
    pointer(true);
    const touch = await open();
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Закрыть');
    touch.unmount();
  });
});

describe('the roll log in the history panel', () => {
  const roll = (id: string, extra: Partial<SheetRoll> = {}): SheetRoll => {
    const rolled = rollSpecLocally({ kind: 'formula', label: '2d6', dice: [{ sign: 1, count: 2, sides: 6 }], modifier: 0 }, () => 0);
    return { id, at: Date.now(), kind: 'formula', label: '2d6', roll: { dice: rolled.dice, modifier: 0, total: rolled.total, critical: false }, total: rolled.total, natural: '', ...extra };
  };

  it('is one more list of the panel, with the count on its switch', async () => {
    const wrapper = mount(DndSheetHistory, { props: { sheetId: 's', canRestore: true, rolls: [roll('a'), roll('b')] }, global: { stubs: { Teleport: true } }, attachTo: document.body });
    try {
      await wrapper.get('.dnd-history-button').trigger('click');
      await flushPromises();
      const switches = wrapper.findAll('.dnd-history-filter button').map((button) => button.text());
      expect(switches).toEqual(['Все записи', 'Только настройка', 'Только игра', 'Броски · 2']);
      await wrapper.findAll('.dnd-history-filter button')[3]!.trigger('click');
      expect(wrapper.findAll('.dnd-roll-list li')).toHaveLength(2);
      expect(wrapper.get('.dnd-roll-list li').text()).toContain('Бросок · 2d6');
      expect(wrapper.get('.dnd-roll-list li').text()).toContain('2d6 (1, 1) = 2');
    } finally { wrapper.unmount(); }
  });

  it('is not offered where the page gives no rolls', async () => {
    const wrapper = mount(DndSheetHistory, { props: { sheetId: 's', canRestore: true }, global: { stubs: { Teleport: true } }, attachTo: document.body });
    try {
      await wrapper.get('.dnd-history-button').trigger('click');
      await flushPromises();
      expect(wrapper.findAll('.dnd-history-filter button')).toHaveLength(3);
    } finally { wrapper.unmount(); }
  });

  it('rolls the damage an attack still waits for', async () => {
    const attack = roll('atk', { kind: 'attack', label: 'Меч', damage: [{ label: 'Урон', formula: { dice: [{ sign: 1, count: 1, sides: 8 }], modifier: 3, text: '1d8+3' }, type: 'рубящий' }] });
    const wrapper = mount(DndRollList, { props: { history: [attack] } });
    await wrapper.get('.dnd-roll-log-actions button').trigger('click');
    expect(wrapper.emitted('damage')).toEqual([['atk', 0]]);
    expect(mount(DndRollList, { props: { history: [] } }).text()).toBe('Бросков пока не было.');
  });
});

describe('experience for the next level', () => {
  it('follows the 5e table', () => {
    expect([1, 2, 3, 4, 5, 10, 19, 20].map(defaultNextLevelExperience)).toEqual([300, 900, 2700, 6500, 14000, 85000, 355000, 355000]);
  });

  it('is the table value unless one was set by hand', () => {
    expect(nextLevelExperienceOf({ level: 3, nextLevelExperience: 0 })).toBe(2700);
    expect(nextLevelExperienceOf({ level: 3, nextLevelExperience: 5000 })).toBe(5000);
  });
});
