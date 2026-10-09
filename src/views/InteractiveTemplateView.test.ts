// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InteractiveTemplateView from './InteractiveTemplateView.vue';
import { interactiveTemplates } from '../api/client';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import { choose } from '../components/dndSelect.testing';
import { currentAppDialog, dismissAppDialog } from '../composables/appDialog';

const routeLeaveGuards: Array<() => boolean> = [];
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'hero' } }), onBeforeRouteLeave: (guard: () => boolean) => { routeLeaveGuards.push(guard); } }));
vi.mock('../api/client', () => ({ interactiveTemplates: { get: vi.fn(), update: vi.fn() }, uploadImage: vi.fn() }));
vi.mock('../composables/useRecentResource', () => ({ markResourceOpened: vi.fn() }));
vi.mock('../components/AccountMenu.vue', () => ({ default: { name: 'AccountMenu', props: ['showPlugins'], template: '<div />' } }));

const sockets: any[] = [];
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const handlers = new Map<string, Function>();
    const socket = {
      connected: false,
      emit: vi.fn(),
      on: vi.fn((event: string, cb: Function) => { handlers.set(event, cb); }),
      disconnect: vi.fn(),
      trigger(event: string, payload?: unknown) {
        if (event === 'connect') socket.connected = true;
        handlers.get(event)?.(payload);
      },
    };
    sockets.push(socket);
    return socket;
  }),
}));

const sentOps = () => sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'sheet-op').map(([, payload]: [string, any]) => payload.op);

describe('character sheet page', () => {
  let wrapper: ReturnType<typeof mount>;
  beforeEach(() => { vi.clearAllMocks(); sockets.length = 0; routeLeaveGuards.length = 0; localStorage.clear(); });
  afterEach(() => { wrapper?.unmount(); });

  async function open(role: 'owner' | 'edit' | 'read' = 'owner', blank = false) {
    const data = createDndCharacterSheet();
    if (!blank) data.identity.name = 'Лира';
    const template = { id: 'hero', title: 'Лира', templateType: 'dnd-character' as const, data: JSON.parse(JSON.stringify(data)), createdAt: '', updatedAt: '' };
    vi.mocked(interactiveTemplates.get).mockResolvedValue(template);
    wrapper = mount(InteractiveTemplateView, { attachTo: document.body, global: { stubs: { RouterLink: true, Teleport: true } } });
    await flushPromises();
    sockets[0].trigger('connect');
    sockets[0].trigger('sheet-room-state', { sheetId: 'hero', data: template.data, revision: 1, role, appliedClientOpIds: [] });
    await flushPromises();
    return template.data;
  }

  it('keeps the plain header (no separate dashboard-title field)', async () => {
    await open();
    expect(wrapper.text()).not.toContain('Название в дашборде');
    expect(wrapper.getComponent({ name: 'AccountMenu' }).props('showPlugins')).toBe(false);
  });

  const toSetup = async () => {
    await wrapper.get('.dnd-mode-button').trigger('click');
    await flushPromises();
  };

  it('sends a name edit as one field operation, never a whole-sheet save', async () => {
    await open();
    await toSetup();
    await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
    await flushPromises();
    expect(sentOps()).toEqual([{ type: 'set', path: ['identity', 'name'], value: 'Элиан' }]);
    expect(interactiveTemplates.update).not.toHaveBeenCalled();
  });

  it('sends HP changes as deltas', async () => {
    await open();
    await wrapper.get('.dnd-cs-hp-button').trigger('click');
    await wrapper.get('[aria-label="Количество HP"]').setValue('4');
    await wrapper.get('.dnd-hp-damage').trigger('click');
    await flushPromises();
    expect(sentOps()).toEqual([{ type: 'hp-change', mode: 'damage', amount: 4 }]);
    expect((wrapper.get('[aria-label="Текущие HP"]').element as HTMLInputElement).value).toBe('6');
  });

  it('keeps the selected tab local to this viewer', async () => {
    await open();
    await wrapper.get('.dnd-cs-tabs [data-tab="info"]').trigger('click');
    await flushPromises();
    expect(sentOps()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('dnd-sheet-view:hero')!)).toMatchObject({ activeTab: 'personality' });
  });

  it('shows a remote edit live without wiping what the user is typing', async () => {
    const data = await open();
    await toSetup();
    // The race is a list now; its last option switches to typing a custom one.
    await choose(wrapper, 'Раса', '\u0000type');
    const race = wrapper.get('[aria-label="Раса: свой вариант"]');
    (race.element as HTMLInputElement).focus();
    // Typing: `input` only. setValue() would also fire `change` (a commit).
    (race.element as HTMLInputElement).value = 'Полуэ';
    await race.trigger('input');
    sockets[0].trigger('sheet-op-applied', { clientOpId: 'dm', op: { type: 'hp-change', mode: 'damage', amount: 3 }, revision: 2 });
    await flushPromises();
    expect((wrapper.get('[aria-label="Текущие HP"]').element as HTMLInputElement).value).toBe(String(data.combat.currentHp - 3));
    expect((race.element as HTMLInputElement).value).toBe('Полуэ');
    expect(sentOps()).toEqual([]);
  });

  it('is read-only for a viewer with read access', async () => {
    await open('read');
    expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeDefined();
    expect(wrapper.text()).toContain('Только просмотр');
  });

  it('asks before navigating away with unsent edits', async () => {
    await open();
    expect(routeLeaveGuards[0]!()).toBe(true);
    expect(currentAppDialog.value).toBeNull();
    sockets[0].trigger('disconnect');
    await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
    const leaving = routeLeaveGuards[0]!();
    expect(currentAppDialog.value).toMatchObject({ title: 'Уйти со страницы?', confirmLabel: 'Уйти' });
    dismissAppDialog();
    expect(await leaving).toBe(false);
    const staying = routeLeaveGuards[0]!();
    currentAppDialog.value!.settle(true);
    expect(await staying).toBe(true);
  });

  describe('play and setup modes', () => {
    it('opens a filled-in sheet in play: set-once data is text, session data stays live', async () => {
      await open();
      const toggle = wrapper.get('.dnd-mode-button');
      expect(toggle.text()).toContain('Игра');
      expect(toggle.attributes('aria-pressed')).toBe('false');
      expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeDefined();
      expect(wrapper.get('[aria-label="Сила"]').attributes('readonly')).toBeDefined();
      expect(wrapper.get('[aria-label="Уровень"]').attributes('readonly')).toBeDefined();
      expect(wrapper.get('[aria-label="Класс доспеха"]').attributes('readonly')).toBeDefined();
      expect(wrapper.find('.dnd-cs-portrait-actions').exists()).toBe(false);
      expect(wrapper.findAll('.dnd-cs-add').length).toBe(0);
      // Still live in play: HP, experience, rolls.
      expect(wrapper.get('[aria-label="Текущие HP"]').attributes('readonly')).toBeDefined();
      expect(wrapper.get('[aria-label="Опыт"]').attributes('readonly')).toBeUndefined();
      expect(wrapper.get('.dnd-cs-hp-button').attributes('disabled')).toBeUndefined();
      expect(wrapper.get('[aria-label="Бросить инициативу"]').attributes('disabled')).toBeUndefined();
    });

    it('switches to setup and back without syncing the mode', async () => {
      await open();
      await toSetup();
      const toggle = wrapper.get('.dnd-mode-button');
      expect(toggle.text()).toContain('Настройка');
      expect(toggle.attributes('aria-pressed')).toBe('true');
      expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeUndefined();
      expect(wrapper.findAll('.dnd-cs-add').length).toBeGreaterThan(0);
      await wrapper.get('.dnd-mode-button').trigger('click');
      expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeDefined();
      expect(sentOps()).toEqual([]);
      expect(localStorage.getItem('dnd-sheet-view:hero')).toBeNull();
    });

    it('opens a sheet nobody has filled in yet straight in setup', async () => {
      await open('owner', true);
      expect(wrapper.get('.dnd-mode-button').text()).toContain('Настройка');
      expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeUndefined();
    });

    it('starts in play again on the next opening, even after leaving it in setup', async () => {
      await open();
      await toSetup();
      wrapper.unmount();
      sockets.length = 0;
      await open();
      expect(wrapper.get('.dnd-mode-button').text()).toContain('Игра');
    });

    it('gives a reader no mode switch: always play', async () => {
      await open('read', true);
      expect(wrapper.find('.dnd-mode-button').exists()).toBe(false);
      expect(wrapper.get('[aria-label="Имя персонажа"]').attributes('readonly')).toBeDefined();
      expect(wrapper.findAll('.dnd-cs-add').length).toBe(0);
    });
  });

  describe('undo and redo in setup mode', () => {
    const lastOps = (n: number) => sentOps().slice(-n);
    const echo = (op: unknown, revision: number) => {
      const payload = sockets[0].emit.mock.calls.filter(([event]: [string]) => event === 'sheet-op').map(([, p]: [string, any]) => p).find((p: any) => JSON.stringify(p.op) === JSON.stringify(op));
      sockets[0].trigger('sheet-op-applied', { clientOpId: payload.clientOpId, op, revision });
    };

    it('undoes and redoes a rename, as new edits everyone sees', async () => {
      await open();
      expect(wrapper.find('[aria-label="Отменить"]').exists()).toBe(false); // play: no undo
      await toSetup();
      expect(wrapper.get('[aria-label="Отменить"]').attributes('disabled')).toBeDefined();
      await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
      await flushPromises();
      echo({ type: 'set', path: ['identity', 'name'], value: 'Элиан' }, 2);
      await flushPromises();
      await wrapper.get('[aria-label="Отменить"]').trigger('click');
      await flushPromises();
      expect(lastOps(1)).toEqual([{ type: 'set', path: ['identity', 'name'], value: 'Лира' }]);
      expect((wrapper.get('[aria-label="Имя персонажа"]').element as HTMLTextAreaElement).value).toBe('Лира');
      expect(wrapper.get('[aria-label="Вернуть"]').attributes('disabled')).toBeUndefined();
      await wrapper.get('[aria-label="Вернуть"]').trigger('click');
      await flushPromises();
      expect(lastOps(1)).toEqual([{ type: 'set', path: ['identity', 'name'], value: 'Элиан' }]);
    });

    it('does not record play actions, even in setup mode', async () => {
      await open();
      await toSetup();
      await wrapper.get('.dnd-cs-hp-button').trigger('click');
      await wrapper.get('[aria-label="Количество HP"]').setValue('4');
      await wrapper.get('.dnd-hp-damage').trigger('click');
      await wrapper.get('[aria-label="Опыт"]').setValue('300');
      await flushPromises();
      expect(wrapper.get('[aria-label="Отменить"]').attributes('disabled')).toBeDefined();
    });

    it('skips a step whose field someone else changed since, with a notice', async () => {
      await open();
      await toSetup();
      await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
      await flushPromises();
      echo({ type: 'set', path: ['identity', 'name'], value: 'Элиан' }, 2);
      sockets[0].trigger('sheet-op-applied', { clientOpId: 'dm', op: { type: 'set', path: ['identity', 'name'], value: 'Двалин' }, revision: 3 });
      await flushPromises();
      const before = sentOps().length;
      await wrapper.get('[aria-label="Отменить"]').trigger('click');
      await flushPromises();
      expect(sentOps().length).toBe(before);
      expect(wrapper.text()).toContain('Отмена пропущена');
      expect((wrapper.get('[aria-label="Имя персонажа"]').element as HTMLTextAreaElement).value).toBe('Двалин');
    });

    it('answers Ctrl+Z outside text fields and keeps the stack across leaving setup', async () => {
      await open();
      await toSetup();
      await wrapper.get('[aria-label="Сила"]').setValue('16');
      await flushPromises();
      await wrapper.get('.dnd-mode-button').trigger('click'); // back to play
      await toSetup();
      (document.activeElement as HTMLElement | null)?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      await flushPromises();
      expect(lastOps(1)).toEqual([{ type: 'set', path: ['abilities', 'strength', 'score'], value: 10 }]);
    });
  });
});
