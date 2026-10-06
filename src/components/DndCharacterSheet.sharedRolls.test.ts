// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import ChatPanel from './ChatPanel.vue';
import DndCanvasLink from './DndCanvasLink.vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet, normalizeDndCharacterSheet, type DndCharacterSheetData } from '../dnd/characterSheet';
import { applySheetOperation, diffSheet, type SheetOperation } from '../dnd/sheetOperations';
import { rollSpecLocally, type RemoteRoller, type RollSpec, type RolledSpec } from '../dnd/useSheetRolls';
import { runBackHandlers } from '../composables/useBackHandler';

const canvasList = vi.fn();
vi.mock('../api/client', () => ({ canvas: { list: () => canvasList() } }));

/** A d20 that came up as `kept`, plus the bonus - what the server would answer. */
const serverRoll = (spec: RollSpec, kept: number): RolledSpec => ({
  ...(spec.d20 ? { d20: { mode: spec.d20, rolls: [kept], kept } } : {}),
  dice: spec.dice.map((term) => ({ ...term, rolls: Array.from({ length: term.count }, () => 3) })),
  modifier: spec.modifier,
  total: (spec.d20 ? kept : 0) + spec.dice.reduce((sum, term) => sum + term.sign * term.count * 3, 0) + spec.modifier,
  natural: spec.d20 && kept === 20 ? 'max' : spec.d20 && kept === 1 ? 'min' : '',
  critical: Boolean(spec.critical),
});

const mountSheet = (remoteRoll: RemoteRoller | undefined, setup: (data: DndCharacterSheetData) => void = () => {}) => {
  const initial = createDndCharacterSheet();
  setup(initial);
  const data = reactive(initial);
  const wrapper = mount(DndCharacterSheet, {
    props: {
      data, readonly: false, remoteRoll,
      onOp: (op: SheetOperation) => {
        Object.assign(data, normalizeDndCharacterSheet(applySheetOperation(JSON.parse(JSON.stringify(data)), op)));
      },
    },
    global: { stubs: { Teleport: true } },
  });
  const ops = () => (wrapper.emitted('op') ?? []).map(([op]) => op as SheetOperation);
  return { data, wrapper, ops };
};
const toasts = (wrapper: ReturnType<typeof mountSheet>['wrapper']) => wrapper.findAll('.dnd-cs-toast').map((toast) => toast.text());

describe('rolls of a sheet connected to a canvas', () => {
  it('asks the server what to roll and shows the dice it sends back', async () => {
    const asked: RollSpec[] = [];
    let answer: (roll: RolledSpec) => void = () => {};
    const { wrapper } = mountSheet(
      (spec) => { asked.push(spec); return new Promise((resolve) => { answer = resolve; }); },
      (sheet) => { sheet.abilities.dexterity.score = 18; },
    );
    try {
      await wrapper.get('[title="Проверка: Ловкость"]').trigger('click');
      expect(asked).toEqual([{ kind: 'check', label: 'Ловкость', d20: 'normal', dice: [], modifier: 4 }]);
      expect(toasts(wrapper)).toEqual([]); // nothing is shown until the server has rolled
      answer(serverRoll(asked[0]!, 17));
      await flushPromises();
      expect(toasts(wrapper)[0]).toContain('d20 (17) + 4 = 21');
    } finally { wrapper.unmount(); }
  });

  it('sends advantage with the request and uses it up', async () => {
    const asked: RollSpec[] = [];
    const { wrapper } = mountSheet((spec) => { asked.push(spec); return Promise.resolve(serverRoll(spec, 9)); });
    try {
      await wrapper.findAll('.dnd-roll-mode button')[0]!.trigger('click');
      await wrapper.get('[title="Проверка: Сила"]').trigger('click');
      await wrapper.get('[title="Проверка: Сила"]').trigger('click');
      expect(asked.map((spec) => spec.d20)).toEqual(['advantage', 'normal']);
    } finally { wrapper.unmount(); }
  });

  it('rolls here when the server cannot post the roll to the canvas', async () => {
    const { wrapper } = mountSheet(() => Promise.resolve(null));
    try {
      await wrapper.get('[title="Проверка: Сила"]').trigger('click');
      await flushPromises();
      expect(toasts(wrapper)).toHaveLength(1);
      expect(toasts(wrapper)[0]).toMatch(/d20 \(\d+\) = \d+/);
    } finally { wrapper.unmount(); }
  });

  it('makes no roll at all when the server does not answer', async () => {
    const { wrapper } = mountSheet(() => Promise.reject(new Error('offline')));
    try {
      await wrapper.get('[title="Проверка: Сила"]').trigger('click');
      await flushPromises();
      expect(toasts(wrapper)).toEqual([]);
      expect(wrapper.get('.dnd-roll-log-button').text()).toBe('Журнал');
    } finally { wrapper.unmount(); }
  });

  it('applies a death save only once the server has rolled it', async () => {
    let answer: (roll: RolledSpec) => void = () => {};
    const { data, wrapper, ops } = mountSheet(
      (spec) => new Promise((resolve) => { answer = (roll) => resolve(roll); void spec; }),
      (sheet) => { sheet.combat.currentHp = 0; },
    );
    try {
      await wrapper.findAll('button').find((button) => button.text() === 'Спасбросок от смерти')!.trigger('click');
      expect(ops()).toEqual([]);
      answer(serverRoll({ kind: 'death-save', label: '', d20: 'normal', dice: [], modifier: 0 }, 1));
      await flushPromises();
      expect(ops()).toEqual([{ type: 'death-save', outcome: 'critical-failure' }]);
      expect(data.combat.deathSaves.failures).toBe(2);
      expect(toasts(wrapper)[0]).toContain('два провала');
    } finally { wrapper.unmount(); }
  });

  it('heals by the hit die the server rolled, and by nothing if it did not', async () => {
    const tired = (sheet: DndCharacterSheetData) => { sheet.identity.level = 3; sheet.combat = { ...sheet.combat, currentHp: 2, maxHp: 30 }; };
    const rolled = mountSheet((spec) => Promise.resolve(serverRoll(spec, 0)), tired);
    try {
      await rolled.wrapper.findAll('button').find((button) => button.text() === 'Короткий отдых')!.trigger('click');
      await rolled.wrapper.get('.dnd-rest-spend').trigger('click');
      await flushPromises();
      expect(rolled.ops()).toEqual([{ type: 'hit-die', heal: 3 }]);
      expect(rolled.data.combat).toMatchObject({ currentHp: 5, hitDiceSpent: 1 });
    } finally { rolled.wrapper.unmount(); }

    const offline = mountSheet(() => Promise.reject(new Error('offline')), tired);
    try {
      await offline.wrapper.findAll('button').find((button) => button.text() === 'Короткий отдых')!.trigger('click');
      await offline.wrapper.get('.dnd-rest-spend').trigger('click');
      await flushPromises();
      expect(offline.ops()).toEqual([]);
      expect(offline.data.combat).toMatchObject({ currentHp: 2, hitDiceSpent: 0 });
    } finally { offline.wrapper.unmount(); }
  });

  it('keeps an attack waiting for its damage when the damage roll did not happen', async () => {
    let online = true;
    const { wrapper } = mountSheet(
      (spec) => (online ? Promise.resolve(serverRoll(spec, 12)) : Promise.reject(new Error('offline'))),
      (sheet) => {
        sheet.activeTab = 'attacks';
        sheet.attacks = [{ id: 'a', name: 'Кинжал', attackBonus: '+5', damage: '1d4+3', damageType: 'колющий' }];
      },
    );
    try {
      await wrapper.get('[aria-label="Атака +5: бросить"]').trigger('click');
      await flushPromises();
      const damage = () => wrapper.findAll('.dnd-cs-toast-actions button');
      expect(damage()).toHaveLength(1);
      online = false;
      await damage()[0]!.trigger('click');
      await flushPromises();
      expect(damage()).toHaveLength(1); // still there to be tried again
      online = true;
      await damage()[0]!.trigger('click');
      await flushPromises();
      expect(damage()).toHaveLength(0);
      expect(toasts(wrapper)[0]).toContain('Урон · Кинжал');
    } finally { wrapper.unmount(); }
  });
});

describe('the local roller', () => {
  it('matches the server: damage and healing stop at zero, a check does not', () => {
    const low = () => 0; // every die comes up 1
    expect(rollSpecLocally({ kind: 'hit-die', label: '', dice: [{ sign: 1, count: 1, sides: 6 }], modifier: -3 }, low).total).toBe(0);
    expect(rollSpecLocally({ kind: 'check', label: '', d20: 'normal', dice: [], modifier: -5 }, low)).toMatchObject({ total: -4, natural: 'min' });
    const crit = rollSpecLocally({ kind: 'damage', label: '', dice: [{ sign: 1, count: 2, sides: 6 }], modifier: 3, critical: true }, low);
    expect(crit.dice[0]!.rolls).toHaveLength(4);
    expect(crit.total).toBe(7);
  });
});

describe('connecting a character to a canvas', () => {
  beforeEach(() => {
    canvasList.mockReset();
    canvasList.mockResolvedValue({
      own: [{ id: 'c1', title: 'Проклятие Страда' }],
      shared: [{ id: 'c2', title: 'Чужая кампания', role: 'edit' }, { id: 'c3', title: 'Только чтение', role: 'read' }],
      public: [],
    });
  });
  const mountLink = (props: { canvasId: string; target: any; readonly?: boolean }) =>
    mount(DndCanvasLink, { props: { readonly: false, ...props }, global: { stubs: { Teleport: true, RouterLink: { template: '<a><slot /></a>' } } }, attachTo: document.body });

  it('offers the canvases the user may post to and connects the chosen one', async () => {
    const wrapper = mountLink({ canvasId: '', target: null });
    try {
      expect(wrapper.get('.dnd-link-button').text()).toBe('Подключить канвас');
      await wrapper.get('.dnd-link-button').trigger('click');
      await flushPromises();
      const dialog = wrapper.get('[role="dialog"]');
      expect(dialog.get('.dnd-link-status').text()).toContain('не подключён');
      // A canvas the user may only read is not offered: its chat would refuse the roll.
      expect(dialog.findAll('.dnd-link-item-title').map((item) => item.text())).toEqual(['Проклятие Страда', 'Чужая кампания']);
      await dialog.get('input[aria-label="Поиск канваса"]').setValue('чужая');
      // (The stubbed Teleport re-renders its content, so the list is looked up again.)
      expect(wrapper.findAll('.dnd-link-item')).toHaveLength(1);
      await wrapper.get('[aria-label="Подключить: Чужая кампания"]').trigger('click');
      expect(wrapper.emitted('link')).toEqual([['c2']]);
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('says where the rolls go, and lets the connection be removed', async () => {
    const wrapper = mountLink({ canvasId: 'c1', target: { status: 'ok', canvasId: 'c1', title: 'Проклятие Страда' } });
    try {
      const button = wrapper.get('.dnd-link-button');
      expect(button.text()).toBe('Проклятие Страда');
      expect(button.classes()).toContain('is-on');
      await button.trigger('click');
      await flushPromises();
      expect(wrapper.get('.dnd-link-status').text()).toBe('Броски уходят в чат канваса «Проклятие Страда».');
      expect(wrapper.get('[aria-label="Подключён: Проклятие Страда"]').attributes('aria-disabled')).toBe('true');
      await wrapper.get('.dnd-link-unlink').trigger('click');
      expect(wrapper.emitted('unlink')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });

  it.each([
    ['forbidden', 'нет права писать в чат'],
    ['plugin_disabled', 'выключены кубики'],
    ['canvas_missing', 'удалён или недоступен'],
  ])('explains why rolls stay local: %s', async (status, text) => {
    const wrapper = mountLink({ canvasId: 'c1', target: { status, canvasId: 'c1', title: 'Кампания' } });
    try {
      const button = wrapper.get('.dnd-link-button');
      expect(button.text()).toBe('Броски только у вас');
      expect(button.classes()).toContain('is-warning');
      await button.trigger('click');
      expect(wrapper.get('.dnd-link-status').text()).toContain(text);
    } finally { wrapper.unmount(); }
  });

  it('shows a read-only viewer the connection, without a way to change it', async () => {
    const hidden = mountLink({ canvasId: '', target: null, readonly: true });
    expect(hidden.find('.dnd-link-button').exists()).toBe(false);
    hidden.unmount();

    const wrapper = mountLink({ canvasId: 'c1', target: { status: 'ok', canvasId: 'c1', title: 'Кампания' }, readonly: true });
    try {
      await wrapper.get('.dnd-link-button').trigger('click');
      await flushPromises();
      expect(canvasList).not.toHaveBeenCalled();
      expect(wrapper.find('.dnd-link-list').exists()).toBe(false);
      expect(wrapper.find('.dnd-link-unlink').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('closes on Escape and on system Back, returning the focus to its button', async () => {
    const wrapper = mountLink({ canvasId: '', target: null });
    try {
      await wrapper.get('.dnd-link-button').trigger('click');
      await flushPromises();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.get('.dnd-link-button').element);

      await wrapper.get('.dnd-link-button').trigger('click');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(runBackHandlers()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('is stored in the sheet as one synced field', () => {
    const prev = JSON.parse(JSON.stringify(createDndCharacterSheet()));
    const next = JSON.parse(JSON.stringify(prev));
    next.campaign.canvasId = 'c1';
    expect(diffSheet(prev, next)).toEqual([{ type: 'set', path: ['campaign', 'canvasId'], value: 'c1' }]);
    expect(normalizeDndCharacterSheet({}).campaign).toEqual({ canvasId: '' });
  });
});

describe('a sheet roll in the canvas chat', () => {
  const message = (sheet: Record<string, unknown>, total: number) => ({
    id: 'm1', authorName: 'Игрок', text: 'fallback', createdAt: new Date().toISOString(),
    rollData: JSON.stringify({ notation: 'd20+4', rolls: [17], modifier: 4, total, sheet }),
  });
  const mountChat = (messages: unknown[]) => mount(ChatPanel, { props: { messages, canPost: true, attachedNode: null, canAttach: false } as any });

  it('shows who rolled what, the dice and the total', () => {
    const wrapper = mountChat([message({ kind: 'attack', label: 'Длинный лук', character: 'Арвен', rolled: 'd20 (17) + 4', natural: '' }, 21)]);
    const roll = wrapper.get('.chat-sheet-roll');
    expect(roll.get('.chat-sheet-roll-head').text()).toBe('АрвенАтака · Длинный лук');
    expect(roll.get('.chat-roll-dice').text()).toBe('d20 (17) + 4');
    expect(roll.get('.chat-roll-total').text()).toBe('= 21');
    expect(wrapper.find('.chat-roll-notation').exists()).toBe(false);
  });

  it('marks a natural 20, a natural 1 and a critical hit', () => {
    const crit = mountChat([message({ kind: 'damage', label: 'Длинный лук', critical: true, damageType: 'колющий', character: 'Арвен', rolled: '2d8 (5, 7) + 4', natural: '' }, 16)]);
    expect(crit.get('.chat-sheet-roll-head').text()).toBe('АрвенУрон · Длинный лук (крит) · колющий');
    expect(mountChat([message({ kind: 'check', label: 'Сила', rolled: 'd20 (20)', natural: 'max' }, 20)]).get('.chat-sheet-roll').classes()).toContain('is-crit');
    expect(mountChat([message({ kind: 'check', label: 'Сила', rolled: 'd20 (1)', natural: 'min' }, 1)]).get('.chat-sheet-roll').classes()).toContain('is-fumble');
  });

  it('leaves plain chat rolls as they were', () => {
    const wrapper = mountChat([{ id: 'm2', authorName: 'A', text: '', createdAt: new Date().toISOString(), rollData: JSON.stringify({ notation: '2d6+1', rolls: [3, 4], modifier: 1, total: 8 }) }]);
    expect(wrapper.find('.chat-sheet-roll').exists()).toBe(false);
    expect(wrapper.get('.chat-roll-notation').text()).toBe('2d6+1');
  });
});
