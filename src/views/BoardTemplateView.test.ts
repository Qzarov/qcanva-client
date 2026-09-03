// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { computed, reactive, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interactiveTemplates } from '../api/client';
import { useI18n } from '../composables/useI18n';
import BoardTemplateView from './BoardTemplateView.vue';

const connect = vi.fn();
const disconnect = vi.fn();
const sendOperation = vi.fn();
const requestSnapshot = vi.fn();
const socketState = {
  data: ref<any>(null),
  role: ref<any>(null),
  participants: ref<any[]>([]),
  revision: ref(0),
  pendingCount: ref(0),
  syncStatus: ref<any>('idle'),
};
const routeState = vi.hoisted(() => ({
  params: null as { id: string } | null,
  query: {} as Record<string, unknown>,
}));

vi.mock('vue-router', () => {
  return {
    // Stable WITHIN a test, fresh BETWEEN tests — the way the real `useRoute`
    // behaves. This used to build a new reactive `params` on every call, so it
    // only worked while something happened to call `useRoute()` exactly once:
    // a second caller replaced the object the component was already watching,
    // and a later `routeState.params.id = ...` mutated an object nobody was
    // subscribed to. Sharing one object forever is the opposite trap, because
    // these tests never unmount: components from earlier tests keep watching
    // it and answer a route change by consuming this test's queued mock
    // values. `beforeEach` therefore hands out a fresh object per test.
    useRoute: () => ({ params: routeState.params, query: routeState.query }),
  };
});

vi.mock('../api/client', () => ({
  uploadImage: vi.fn(),
  interactiveTemplates: {
    get: vi.fn(),
    update: vi.fn(),
    permissions: vi.fn(),
    share: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock('../composables/useBoardSocket', () => ({
  useBoardSocket: () => ({
    ...socketState,
    pendingCount: computed(() => socketState.pendingCount.value),
    connect,
    disconnect,
    sendOperation,
    requestSnapshot,
  }),
}));

vi.mock('../components/AccountMenu.vue', () => ({
  default: { name: 'AccountMenu', template: '<div />' },
}));

describe('BoardTemplateView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketState.data.value = null;
    socketState.role.value = null;
    socketState.participants.value = [];
    socketState.revision.value = 0;
    socketState.pendingCount.value = 0;
    socketState.syncStatus.value = 'idle';
    routeState.query = {};
    routeState.params = reactive({ id: 'template-1' });
    vi.mocked(interactiveTemplates.permissions).mockResolvedValue([]);
  });

  it('returns to the originating canvas from the Back button', async () => {
    routeState.query = { fromCanvas: 'canvas-77' };
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Команда', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '',
    });
    requestSnapshot.mockResolvedValue(null);

    const wrapper = mount(BoardTemplateView, {
      global: {
        stubs: {
          RouterLink: {
            name: 'RouterLink',
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    });
    await flushPromises();

    const back = wrapper.getComponent({ name: 'RouterLink' });
    expect(back.props('to')).toBe('/canvas/canvas-77');
    // The label follows the chosen locale. It used to be a hardcoded Russian
    // string for every user, which is what these assertions were pinning.
    const { t, setLocale } = useI18n();
    expect(back.text()).toBe(`← ${t('backToCanvas')}`);
    setLocale('ru');
    await flushPromises();
    expect(back.text()).toBe('← Назад к канвасу');
    setLocale('en');
    await flushPromises();
    expect(back.text()).toBe('← Back to canvas');
  });

  it('returns to the dashboard from the Back button without a canvas origin', async () => {
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Команда', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '',
    });
    requestSnapshot.mockResolvedValue(null);

    const wrapper = mount(BoardTemplateView, {
      global: {
        stubs: {
          RouterLink: {
            name: 'RouterLink',
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    });
    await flushPromises();

    const back = wrapper.getComponent({ name: 'RouterLink' });
    expect(back.props('to')).toEqual({ name: 'dashboard' });
    // Locale-following is proved in the test above; asserting through `t`
    // here keeps this case from re-pinning one language.
    expect(back.text()).toBe(`← ${useI18n().t('back')}`);
  });

  it('loads and connects the collaborative editor for a board template', async () => {
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Команда', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '',
    });
    requestSnapshot.mockImplementation(async () => {
      socketState.data.value = { version: 1, columns: [], cards: [], labels: [] };
      socketState.role.value = 'edit';
      socketState.participants.value = [
        { userId: 'owner', name: 'Owner' },
        { userId: 'unassigned-editor', name: 'Unassigned Editor' },
      ];
      socketState.syncStatus.value = 'synced';
      return socketState.data.value;
    });

    const wrapper = mount(BoardTemplateView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(requestSnapshot).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(interactiveTemplates.permissions).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="board-editor"]').exists()).toBe(true);
    expect(wrapper.getComponent({ name: 'BoardEditor' }).props('participants')).toEqual([
      { userId: 'owner', name: 'Owner' },
      { userId: 'unassigned-editor', name: 'Unassigned Editor' },
    ]);

    wrapper.getComponent({ name: 'BoardEditor' }).vm.$emit('operation', { type: 'column-add', column: { id: 'new', title: 'Новая', position: 0 } });
    expect(sendOperation).toHaveBeenCalledWith({ type: 'column-add', column: { id: 'new', title: 'Новая', position: 0 } });
  });

  it('keeps the existing D&D template editor supported', async () => {
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Лира', templateType: 'dnd-character', data: {}, createdAt: '', updatedAt: '',
    });

    const wrapper = mount(BoardTemplateView, {
      global: {
        stubs: {
          InteractiveTemplateView: { template: '<div data-testid="dnd-template-editor" />' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="dnd-template-editor"]').exists()).toBe(true);
    expect(requestSnapshot).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('loads participants and exposes access management only for the owner', async () => {
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Команда', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '',
    });
    vi.mocked(interactiveTemplates.permissions).mockResolvedValue([
      { userId: 'user-2', email: 'reader@example.com', name: 'Reader', role: 'read' },
    ]);
    requestSnapshot.mockImplementation(async () => {
      socketState.data.value = { version: 1, columns: [], cards: [], labels: [] };
      socketState.role.value = 'owner';
      socketState.syncStatus.value = 'synced';
      return socketState.data.value;
    });

    const wrapper = mount(BoardTemplateView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(interactiveTemplates.permissions).toHaveBeenCalledWith('template-1');
    expect(wrapper.getComponent({ name: 'BoardEditor' }).props('participants')).toEqual([
      { userId: 'user-2', name: 'Reader' },
    ]);
    await wrapper.getComponent({ name: 'BoardEditor' }).vm.$emit('manage-access');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="share-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="share-dialog"] input[type="email"]').setValue('editor@example.com');
    await wrapper.get('[data-testid="share-dialog"] select').setValue('edit');
    await wrapper.get('[data-testid="share-dialog"] form').trigger('submit');
    await flushPromises();
    expect(interactiveTemplates.share).toHaveBeenCalledWith('template-1', 'editor@example.com', 'edit');

    await wrapper.get('[data-testid="share-dialog"] article button').trigger('click');
    await flushPromises();
    expect(interactiveTemplates.revoke).toHaveBeenCalledWith('template-1', 'user-2');
  });

  it('shows a non-disclosing access error when the board is forbidden', async () => {
    vi.mocked(interactiveTemplates.get).mockResolvedValue({
      id: 'template-1', title: 'Команда', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '',
    });
    requestSnapshot.mockImplementation(async () => {
      socketState.syncStatus.value = 'forbidden';
      return null;
    });

    const wrapper = mount(BoardTemplateView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Нет доступа к доске');
    expect(wrapper.find('[data-testid="board-editor"]').exists()).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('clears stale socket data and role before a failed board load', async () => {
    socketState.data.value = { version: 1, columns: [{ id: 'stale' }], cards: [], labels: [] };
    socketState.role.value = 'owner';
    vi.mocked(interactiveTemplates.get).mockRejectedValue(new Error('Доска не найдена'));

    const wrapper = mount(BoardTemplateView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(socketState.data.value).toBeNull();
    expect(socketState.role.value).toBeNull();
    expect(wrapper.text()).toContain('Доска не найдена');
    expect(wrapper.find('[data-testid="board-editor"]').exists()).toBe(false);
  });

  it('does not apply an old delayed snapshot after a newer route load fails', async () => {
    const oldSnapshot = new Promise<any>((resolve) => {
      requestSnapshot.mockImplementationOnce(async (guard: any) => {
        const result = await new Promise<any>((release) => { resolve(() => release({ version: 1, columns: [{ id: 'old' }], cards: [], labels: [] })); });
        if (guard?.isCurrent && !guard.isCurrent()) return null;
        socketState.data.value = result;
        socketState.role.value = 'edit';
        return result;
      });
    });
    vi.mocked(interactiveTemplates.get)
      .mockResolvedValueOnce({ id: 'template-1', title: 'Old', templateType: 'trello-board', data: {}, createdAt: '', updatedAt: '' })
      .mockRejectedValueOnce(new Error('Новая доска не найдена'));

    const wrapper = mount(BoardTemplateView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();
    const releaseOld = await oldSnapshot;

    routeState.params!.id = 'template-2';
    await flushPromises();
    expect(interactiveTemplates.get).toHaveBeenNthCalledWith(2, 'template-2');
    expect(requestSnapshot).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'template-1', isCurrent: expect.any(Function) }));
    releaseOld();
    await flushPromises();

    expect(socketState.data.value).toBeNull();
    expect(socketState.role.value).toBeNull();
    expect(wrapper.text()).toContain('Новая доска не найдена');
  });
});
