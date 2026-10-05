// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InteractiveTemplateView from './InteractiveTemplateView.vue';
import { interactiveTemplates } from '../api/client';
import { createDndCharacterSheet } from '../dnd/characterSheet';

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

  async function open(role: 'owner' | 'edit' | 'read' = 'owner') {
    const data = createDndCharacterSheet();
    data.identity.name = 'Лира';
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

  it('sends a name edit as one field operation, never a whole-sheet save', async () => {
    await open();
    await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
    await flushPromises();
    expect(sentOps()).toEqual([{ type: 'set', path: ['identity', 'name'], value: 'Элиан' }]);
    expect(interactiveTemplates.update).not.toHaveBeenCalled();
  });

  it('sends HP changes as deltas', async () => {
    await open();
    await wrapper.get('button[aria-label="Урон"]').trigger('click');
    await wrapper.get('[aria-label="Количество HP"]').setValue('4');
    await wrapper.get('.dnd-hp-dialog form').trigger('submit');
    await flushPromises();
    expect(sentOps()).toEqual([{ type: 'hp-change', mode: 'damage', amount: 4 }]);
    expect((wrapper.get('[aria-label="Текущие HP"]').element as HTMLInputElement).value).toBe('6');
  });

  it('keeps the selected tab local to this viewer', async () => {
    await open();
    await wrapper.findAll('.dnd-cs-tabs button').find((button) => button.text() === 'Заметки')!.trigger('click');
    await flushPromises();
    expect(sentOps()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('dnd-sheet-view:hero')!)).toMatchObject({ activeTab: 'notes' });
  });

  it('shows a remote edit live without wiping what the user is typing', async () => {
    const data = await open();
    const race = wrapper.get('[aria-label="Раса"]');
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(routeLeaveGuards[0]!()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    sockets[0].trigger('disconnect');
    await wrapper.get('[aria-label="Имя персонажа"]').setValue('Элиан');
    expect(routeLeaveGuards[0]!()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});
