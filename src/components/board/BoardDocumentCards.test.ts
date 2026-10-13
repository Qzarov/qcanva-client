// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardData, BoardOperation } from '../../boards/types';
import { applyBoardOperation } from '../../boards/operations';
import { textDocuments } from '../../api/client';
import BoardCardDialog from './BoardCardDialog.vue';
import BoardDocumentPicker from './BoardDocumentPicker.vue';
import BoardEditor from './BoardEditor.vue';

vi.mock('../../api/client', () => ({
  textDocuments: { list: vi.fn(), create: vi.fn() },
}));

const board = (): BoardData => ({
  version: 1,
  columns: [{ id: 'todo', title: 'К выполнению', position: 0 }, { id: 'done', title: 'Готово', position: 1 }],
  cards: [
    { id: 'c1', columnId: 'todo', position: 0, title: 'Обычная', description: '', dueAt: null, labelIds: [], assigneeName: null, assigneeUserId: null, checklist: [] },
    { id: 'c2', columnId: 'todo', position: 1, title: 'ТЗ (старое имя)', description: '', dueAt: null, labelIds: [], assigneeName: null, assigneeUserId: null, checklist: [], documentId: 'doc-spec' },
  ],
  labels: [],
});
const props = (overrides: Record<string, unknown> = {}) => ({ data: board(), role: 'edit' as const, participants: [], ...overrides });
const operations = (wrapper: ReturnType<typeof mount>) => (wrapper.emitted('operation') ?? []).map(([operation]) => operation as BoardOperation);

beforeEach(() => {
  vi.mocked(textDocuments.list).mockReset().mockResolvedValue({ documents: [{ id: 'doc-spec', title: 'ТЗ на вход' }, { id: 'doc-notes', title: 'Заметки встречи' }, { id: 'doc-plan', title: 'План релиза' }] });
  vi.mocked(textDocuments.create).mockReset();
});

describe('document cards on a board', () => {
  it('shows a document card under the document\'s current name, with a button that opens the document', async () => {
    const wrapper = mount(BoardEditor, { props: props({ documentTitles: { 'doc-spec': 'ТЗ на вход' } }), attachTo: document.body });
    const plain = wrapper.get('[data-card-id="c1"]');
    const linked = wrapper.get('[data-card-id="c2"]');
    expect(plain.find('[data-testid="card-open-document"]').exists()).toBe(false);
    expect(plain.get('h3').text()).toBe('Обычная');
    expect(linked.get('h3 span').text()).toBe('ТЗ на вход');
    expect(linked.find('svg').exists()).toBe(true);

    await linked.get('[data-testid="card-open-document"]').trigger('click');
    expect(wrapper.emitted('open-document')).toEqual([['doc-spec']]);
    // Opening the document is not opening the card.
    expect(wrapper.find('.board-card-dialog').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the name the card was linked under while the document cannot be read', () => {
    const wrapper = mount(BoardEditor, { props: props() });
    expect(wrapper.get('[data-card-id="c2"] h3 span').text()).toBe('ТЗ (старое имя)');
  });

  it('adds a document as a card from the column\'s own button', async () => {
    const wrapper = mount(BoardEditor, { props: props(), attachTo: document.body });
    expect(wrapper.find('.board-doc-picker').exists()).toBe(false);
    await wrapper.findAll('[data-testid="add-document-card"]')[1]!.trigger('click');
    await flushPromises();

    const picker = wrapper.get('.board-doc-picker');
    expect(picker.findAll('.board-doc-list button').map((button) => button.get('span').text())).toEqual(['ТЗ на вход', 'Заметки встречи', 'План релиза']);
    // The one already on the board is marked, not hidden: a document may be on a board twice.
    expect(picker.get('[data-doc-id="doc-spec"] small').text()).toBe('уже на доске');
    await picker.get('[data-testid="board-doc-search"]').setValue('встреч');
    expect(picker.findAll('.board-doc-list button')).toHaveLength(1);

    await picker.get('[data-doc-id="doc-notes"]').trigger('click');
    expect(wrapper.find('.board-doc-picker').exists()).toBe(false);
    const [operation] = operations(wrapper);
    expect(operation).toMatchObject({ type: 'card-add', card: { columnId: 'done', position: 0, title: 'Заметки встречи', documentId: 'doc-notes', checklist: [], labelIds: [] } });
    expect(wrapper.emitted('document-linked')).toEqual([[{ id: 'doc-notes', title: 'Заметки встречи' }]]);
    // The card is added, not opened for editing: its name is the document's.
    expect(wrapper.find('.board-card-dialog').exists()).toBe(false);
    // The board's reducer takes the card with its link.
    const next = applyBoardOperation(board(), operation!);
    expect(next.cards.find((card) => card.documentId === 'doc-notes')).toMatchObject({ columnId: 'done', title: 'Заметки встречи' });
    wrapper.unmount();
  });

  it('creates a new document and adds it as a card in one step', async () => {
    vi.mocked(textDocuments.create).mockResolvedValue({ id: 'doc-new', title: 'Ретро спринта' });
    const wrapper = mount(BoardEditor, { props: props(), attachTo: document.body });
    await wrapper.findAll('[data-testid="add-document-card"]')[0]!.trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="board-doc-create"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="board-doc-new-title"]').setValue('  Ретро спринта ');
    await wrapper.get('.board-doc-new').trigger('submit');
    await flushPromises();

    expect(textDocuments.create).toHaveBeenCalledWith({ title: 'Ретро спринта' });
    expect(operations(wrapper)[0]).toMatchObject({ type: 'card-add', card: { columnId: 'todo', position: 2, title: 'Ретро спринта', documentId: 'doc-new' } });
    wrapper.unmount();
  });

  it('says so when the list or the new document fails, and adds nothing', async () => {
    vi.mocked(textDocuments.list).mockRejectedValue(new Error('offline'));
    vi.mocked(textDocuments.create).mockRejectedValue(new Error('Лимит документов исчерпан'));
    const wrapper = mount(BoardDocumentPicker, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Не удалось загрузить список документов.');
    await wrapper.get('[data-testid="board-doc-new-title"]').setValue('Новый');
    await wrapper.get('.board-doc-new').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toContain('Лимит документов исчерпан');
    expect(wrapper.emitted('pick')).toBeUndefined();
    await wrapper.get('.board-doc-picker').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not offer to add documents to a reader', () => {
    const wrapper = mount(BoardEditor, { props: props({ role: 'read' }) });
    expect(wrapper.find('[data-testid="add-document-card"]').exists()).toBe(false);
    // But a reader can still open the document a card stands for.
    expect(wrapper.find('[data-card-id="c2"] [data-testid="card-open-document"]').exists()).toBe(true);
  });
});

describe('a document card\'s dialog', () => {
  const card = () => board().cards[1]!;

  it('names the document, opens it, and has no title to type', async () => {
    const wrapper = mount(BoardCardDialog, { props: { card: card(), labels: [], participants: [], documentTitle: 'ТЗ на вход' } });
    const block = wrapper.get('[data-testid="card-document"]');
    expect(block.get('strong').text()).toBe('ТЗ на вход');
    expect(block.find('.board-field-hint').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card-title"]').exists()).toBe(false);
    await block.get('[data-testid="card-document-open"]').trigger('click');
    expect(wrapper.emitted('open-document')).toEqual([['doc-spec']]);
    // The rest of a card works as on any other.
    expect(wrapper.find('[data-testid="card-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-due-at"]').exists()).toBe(true);
  });

  it('says where the name comes from when the document cannot be read', () => {
    const wrapper = mount(BoardCardDialog, { props: { card: card(), labels: [], participants: [] } });
    expect(wrapper.get('[data-testid="card-document"] strong').text()).toBe('ТЗ (старое имя)');
    expect(wrapper.get('[data-testid="card-document"] .board-field-hint').text()).toContain('недоступен или удалён');
  });

  it('unlinks the document, leaving an ordinary card under its name', async () => {
    const wrapper = mount(BoardCardDialog, { props: { card: card(), labels: [], participants: [], documentTitle: 'ТЗ на вход' } });
    await wrapper.get('[data-testid="card-document-unlink"]').trigger('click');
    const [operation] = operations(wrapper);
    expect(operation).toEqual({ type: 'card-update', cardId: 'c2', changes: { documentId: null, title: 'ТЗ на вход' } });
    const next = applyBoardOperation(board(), operation!);
    expect(next.cards.find((entry) => entry.id === 'c2')).toMatchObject({ documentId: null, title: 'ТЗ на вход' });
    // With the link gone the card has a title to type again.
    await wrapper.setProps({ card: next.cards.find((entry) => entry.id === 'c2')! });
    expect(wrapper.find('[data-testid="card-document"]').exists()).toBe(false);
    expect((wrapper.get('[data-testid="card-title"]').element as HTMLInputElement).value).toBe('ТЗ на вход');
  });

  it('lets a reader open the document but not unlink it', () => {
    const wrapper = mount(BoardCardDialog, { props: { card: card(), labels: [], participants: [], readOnly: true, documentTitle: 'ТЗ на вход' } });
    expect(wrapper.find('[data-testid="card-document-open"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-document-unlink"]').exists()).toBe(false);
  });
});
