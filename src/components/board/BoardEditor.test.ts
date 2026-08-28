// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { BoardChecklistItem, BoardData, BoardOperation } from '../../boards/types';
import BoardCardDialog from './BoardCardDialog.vue';
import BoardEditor from './BoardEditor.vue';

const board: BoardData = {
  version: 1,
  columns: [
    { id: 'todo', title: 'К выполнению', position: 0 },
    { id: 'done', title: 'Готово', position: 1 },
  ],
  cards: [
    {
      id: 'c1',
      columnId: 'todo',
      position: 0,
      title: 'Просроченная задача',
      description: 'Описание',
      dueAt: '2020-01-01T10:00:00.000Z',
      labelIds: ['urgent'],
      assigneeName: 'Лена',
      assigneeUserId: 'user-1',
      checklist: [
        { id: 'check-1', title: 'Готово', completed: true, position: 0 },
        { id: 'check-2', title: 'Осталось', completed: false, position: 1 },
      ],
    },
  ],
  labels: [{ id: 'urgent', title: 'Срочно', color: '#ef4444' }],
};

const participants = [
  { userId: 'user-1', email: 'lena@example.com', name: 'Лена', role: 'edit' as const },
];

const editableBoardProps = { data: board, role: 'edit' as const, participants };

describe('BoardEditor', () => {
  it('emits card-move on a cross-column drop', async () => {
    const wrapper = mount(BoardEditor, { props: editableBoardProps });

    await wrapper.find('[data-card-id="c1"]').trigger('dragstart');
    await wrapper.find('[data-column-id="done"]').trigger('drop');

    expect(wrapper.emitted('operation')?.[0]?.[0]).toMatchObject({
      type: 'card-move',
      cardId: 'c1',
      columnId: 'done',
      position: 0,
    });
  });

  it('hides every mutation control and drag affordance for readers', () => {
    const wrapper = mount(BoardEditor, { props: { ...editableBoardProps, role: 'read' as const } });

    expect(wrapper.find('[data-testid="add-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-column"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-column"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="board-drag-handle"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-access"]').exists()).toBe(false);
    expect(wrapper.find('[data-card-id="c1"]').attributes('draggable')).not.toBe('true');
  });

  it('shows owner-only access management', async () => {
    const owner = mount(BoardEditor, { props: { ...editableBoardProps, role: 'owner' as const } });
    const editor = mount(BoardEditor, { props: editableBoardProps });

    await owner.get('[data-testid="manage-access"]').trigger('click');

    expect(owner.emitted('manage-access')).toHaveLength(1);
    expect(editor.find('[data-testid="manage-access"]').exists()).toBe(false);
  });

  it('renders overdue state, labels, assignee and checklist progress on a card', () => {
    const wrapper = mount(BoardEditor, { props: editableBoardProps });
    const card = wrapper.get('[data-card-id="c1"]');

    expect(card.classes()).toContain('board-card--overdue');
    expect(card.text()).toContain('Срочно');
    expect(card.text()).toContain('Лена');
    expect(card.text()).toContain('1/2');
  });

  it('requires a card disposition before deleting a non-empty column', async () => {
    const wrapper = mount(BoardEditor, { props: editableBoardProps });

    await wrapper.get('[data-column-id="todo"] [data-testid="delete-column"]').trigger('click');

    expect(wrapper.emitted('operation')).toBeUndefined();
    expect(wrapper.find('[data-testid="column-delete-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="move-column-cards"]').trigger('click');

    expect(wrapper.emitted('operation')?.[0]?.[0]).toEqual({
      type: 'column-remove',
      columnId: 'todo',
      disposition: { kind: 'move-cards', targetColumnId: 'done' },
    });
  });

  it('supports adding, updating, and removing labels from an empty label set', async () => {
    const wrapper = mount(BoardEditor, {
      props: { ...editableBoardProps, data: { ...board, labels: [] } },
    });

    await wrapper.get('[data-testid="new-label-title"]').setValue('Backend');
    await wrapper.get('[data-testid="new-label-color"]').setValue('#2563eb');
    await wrapper.get('[data-testid="add-label"]').trigger('click');

    expect(wrapper.emitted('operation')?.[0]?.[0]).toMatchObject({
      type: 'label-add',
      label: { title: 'Backend', color: '#2563eb' },
    });

    await wrapper.setProps({ data: board });
    await wrapper.get('[data-testid="label-title-urgent"]').setValue('Важно');
    await wrapper.get('[data-testid="label-color-urgent"]').setValue('#16a34a');
    await wrapper.get('[data-testid="remove-label-urgent"]').trigger('click');

    expect(wrapper.emitted('operation')?.[1]?.[0]).toEqual({
      type: 'label-update', labelId: 'urgent', changes: { title: 'Важно' },
    });
    expect(wrapper.emitted('operation')?.[2]?.[0]).toEqual({
      type: 'label-update', labelId: 'urgent', changes: { color: '#16a34a' },
    });
    expect(wrapper.emitted('operation')?.[3]?.[0]).toEqual({
      type: 'label-remove', labelId: 'urgent',
    });
  });

  it('offers assigned board users to editors without loading owner permissions', async () => {
    const wrapper = mount(BoardEditor, {
      props: { ...editableBoardProps, participants: [] },
    });

    await wrapper.get('[data-card-id="c1"]').trigger('click');

    const options = wrapper.findAll('[data-testid="assignee-participant"] option');
    expect(options.some((option) => option.attributes('value') === 'user-1' && option.text() === 'Лена')).toBe(true);
  });

  it('clears the in-memory drag payload on dragend', async () => {
    const wrapper = mount(BoardEditor, { props: editableBoardProps });

    await wrapper.get('[data-card-id="c1"]').trigger('dragstart');
    await wrapper.get('[data-card-id="c1"]').trigger('dragend');
    await wrapper.get('[data-column-id="done"]').trigger('drop');

    expect(wrapper.emitted('operation')).toBeUndefined();
  });

  it('moves a dragged column to the end drop target', async () => {
    const wrapper = mount(BoardEditor, { props: editableBoardProps });

    await wrapper.get('[data-column-id="todo"] [data-testid="board-drag-handle"]').trigger('dragstart');
    await wrapper.get('[data-testid="column-end-drop"]').trigger('drop');

    expect(wrapper.emitted('operation')?.[0]?.[0]).toEqual({
      type: 'column-move', columnId: 'todo', position: 2,
    });
  });
});

describe('BoardCardDialog', () => {
  it('emits card fields and separate checklist operations', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: {
        card: board.cards[0]!,
        labels: board.labels,
        participants,
      },
    });

    await wrapper.get('[data-testid="card-title"]').setValue('Обновлённая задача');
    await wrapper.get('[data-testid="card-description"]').setValue('Новое описание');
    await wrapper.get('[data-testid="assignee-free-text"]').setValue('Внешний специалист');
    await wrapper.get('[data-testid="new-checklist-title"]').setValue('Новый пункт');
    await wrapper.get('[data-testid="add-checklist-item"]').trigger('click');
    await wrapper.get('[data-testid="save-card"]').trigger('click');

    const operations = wrapper.emitted<[BoardOperation]>('operation');
    expect(operations?.some(([operation]) => (
      operation.type === 'checklist-add'
      && operation.cardId === 'c1'
      && (operation.item as BoardChecklistItem).title === 'Новый пункт'
    ))).toBe(true);
    expect(operations?.some(([operation]) => (
      operation.type === 'card-update'
      && operation.cardId === 'c1'
      && operation.changes.title === 'Обновлённая задача'
      && operation.changes.description === 'Новое описание'
      && operation.changes.assigneeName === 'Внешний специалист'
      && operation.changes.assigneeUserId === null
    ))).toBe(true);
  });

  it('stores both participant id and display name for a participant assignee', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });

    await wrapper.get('[data-testid="assignee-participant"]').setValue('user-1');
    await wrapper.get('[data-testid="save-card"]').trigger('click');

    const operations = wrapper.emitted<[BoardOperation]>('operation') || [];
    expect(operations[operations.length - 1]?.[0]).toMatchObject({
      type: 'card-update',
      changes: { assigneeName: 'Лена', assigneeUserId: 'user-1' },
    });
  });

  it('preserves unsaved fields when a realtime checklist update replaces the card prop', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });
    await wrapper.get('[data-testid="card-title"]').setValue('Несохранённый заголовок');

    await wrapper.setProps({
      card: {
        ...board.cards[0]!,
        checklist: [
          ...board.cards[0]!.checklist,
          { id: 'remote-check', title: 'Удалённый пункт', completed: false, position: 2 },
        ],
      },
    });

    expect((wrapper.get('[data-testid="card-title"]').element as HTMLInputElement).value)
      .toBe('Несохранённый заголовок');
    expect(wrapper.findAll('.board-checklist__title').some((input) => (
      (input.element as HTMLInputElement).value === 'Удалённый пункт'
    ))).toBe(true);
  });

  it('merges untouched remote fields and saves only locally dirty fields', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });
    await wrapper.get('[data-testid="card-title"]').setValue('Локальный заголовок');

    await wrapper.setProps({
      card: {
        ...board.cards[0]!,
        title: 'Удалённый заголовок',
        description: 'Удалённое описание',
        dueAt: '2030-06-15T08:30:00.000Z',
        checklist: [
          ...board.cards[0]!.checklist,
          { id: 'remote-check', title: 'Удалённый пункт', completed: false, position: 2 },
        ],
      },
    });

    expect((wrapper.get('[data-testid="card-title"]').element as HTMLInputElement).value).toBe('Локальный заголовок');
    expect((wrapper.get('[data-testid="card-description"]').element as HTMLTextAreaElement).value).toBe('Удалённое описание');
    expect(wrapper.findAll('.board-checklist__title').some((input) => (
      (input.element as HTMLInputElement).value === 'Удалённый пункт'
    ))).toBe(true);

    await wrapper.get('[data-testid="save-card"]').trigger('click');
    const operations = wrapper.emitted<[BoardOperation]>('operation') || [];
    expect(operations[operations.length - 1]?.[0]).toEqual({
      type: 'card-update', cardId: 'c1', changes: { title: 'Локальный заголовок' },
    });
  });

  it('merges remote checklist fields while preserving a locally edited checklist title', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });
    await wrapper.get('[aria-label="Пункт: Готово"]').setValue('Локальный пункт');

    await wrapper.setProps({
      card: {
        ...board.cards[0]!,
        checklist: [
          { id: 'check-1', title: 'Удалённый заголовок', completed: false, position: 0 },
          { id: 'check-2', title: 'Удалённый второй', completed: true, position: 1 },
        ],
      },
    });

    const titles = wrapper.findAll('.board-checklist__title').map((input) => (input.element as HTMLInputElement).value);
    expect(titles).toEqual(['Локальный пункт', 'Удалённый второй']);
    expect((wrapper.get('[aria-label="Завершить: Локальный пункт"]').element as HTMLInputElement).checked).toBe(false);
  });

  it('accepts a later remote checklist update after the local optimistic value is reflected', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });
    await wrapper.get('[aria-label="Пункт: Готово"]').setValue('Локально сохранено');

    await wrapper.setProps({
      card: {
        ...board.cards[0]!,
        checklist: [
          { ...board.cards[0]!.checklist[0]!, title: 'Локально сохранено' },
          board.cards[0]!.checklist[1]!,
        ],
      },
    });
    await wrapper.setProps({
      card: {
        ...board.cards[0]!,
        checklist: [
          { ...board.cards[0]!.checklist[0]!, title: 'Позднее удалённое изменение' },
          board.cards[0]!.checklist[1]!,
        ],
      },
    });

    expect((wrapper.get('.board-checklist__title').element as HTMLInputElement).value)
      .toBe('Позднее удалённое изменение');
  });

  it('does not clear an existing participant id when saving another field without permission choices', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants: [] },
    });

    await wrapper.get('[data-testid="card-description"]').setValue('Только описание');
    await wrapper.get('[data-testid="save-card"]').trigger('click');

    const operations = wrapper.emitted<[BoardOperation]>('operation') || [];
    expect(operations[operations.length - 1]?.[0]).toEqual({
      type: 'card-update', cardId: 'c1', changes: { description: 'Только описание' },
    });
  });

  it('emits card-remove from the card dialog', async () => {
    const wrapper = mount(BoardCardDialog, {
      props: { card: board.cards[0]!, labels: board.labels, participants },
    });

    await wrapper.get('[data-testid="delete-card"]').trigger('click');

    expect(wrapper.emitted('operation')?.[0]?.[0]).toEqual({ type: 'card-remove', cardId: 'c1' });
  });
});
