// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardData } from '../../boards/types';
import BoardPreview from './BoardPreview.vue';

const board: BoardData = {
  version: 1,
  columns: [
    { id: 'todo', title: 'К выполнению', position: 0 },
    { id: 'progress', title: 'В работе', position: 1 },
    { id: 'review', title: 'Проверка', position: 2 },
    { id: 'done', title: 'Готово', position: 3 },
  ],
  cards: Array.from({ length: 4 }, (_, index) => ({
    id: `card-${index + 1}`,
    columnId: 'todo',
    position: index,
    title: `Карточка ${index + 1}`,
    description: '',
    dueAt: index === 0 ? '2030-01-01T10:00:00.000Z' : null,
    labelIds: index === 0 ? ['urgent'] : [],
    assigneeName: null,
    assigneeUserId: null,
    checklist: [{ id: `check-${index + 1}`, title: 'Готово', completed: index === 0, position: 0 }],
  })),
  labels: [{ id: 'urgent', title: 'Срочно', color: '#ef4444' }],
};

const socketFactory = vi.hoisted(() => ({ current: null as any }));
let socket: any;

vi.mock('../../composables/useBoardSocket', () => ({
  useBoardSocket: () => socketFactory.current,
}));

describe('BoardPreview', () => {
  beforeEach(() => {
    socket = {
      data: ref<BoardData | null>(board),
      role: ref<'owner' | 'read' | 'edit' | null>('edit'),
      boardTitle: ref('Команда'),
      syncStatus: ref('synced'),
      requestSnapshot: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    socketFactory.current = socket;
    socket.requestSnapshot.mockImplementation(async () => {
      socket.data.value = board;
      socket.boardTitle.value = 'Команда';
      return board;
    });
  });

  it('renders only three columns and opens the source without edit controls', async () => {
    const wrapper = mount(BoardPreview, { props: { boardId: 'board-1' } });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="preview-column"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="preview-card"]')).toHaveLength(3);
    expect(wrapper.text()).toContain('Команда');
    expect(wrapper.find('[data-testid="add-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="board-drag-handle"]').exists()).toBe(false);
    await wrapper.trigger('click');
    expect(wrapper.emitted('open-board')?.[0]).toEqual(['board-1']);
  });

  it('uses the board snapshot and a read-only realtime subscription', async () => {
    const wrapper = mount(BoardPreview, { props: { boardId: 'board-1' } });
    await flushPromises();

    expect(socket.requestSnapshot).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('renders no board data when the authorized snapshot is unavailable', async () => {
    socket.requestSnapshot.mockResolvedValue(null);
    const wrapper = mount(BoardPreview, { props: { boardId: 'missing-board' } });
    await flushPromises();

    expect(wrapper.text()).toContain('Доска недоступна');
    expect(wrapper.findAll('[data-testid="preview-column"]')).toHaveLength(0);
  });

  it('rerenders when the read-only board socket applies a remote operation', async () => {
    const wrapper = mount(BoardPreview, { props: { boardId: 'board-1' } });
    await flushPromises();
    socket.data.value = {
      ...board,
      cards: board.cards.map((card) => card.id === 'card-1' ? { ...card, title: 'Обновлено коллегой' } : card),
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Обновлено коллегой');
  });
});
