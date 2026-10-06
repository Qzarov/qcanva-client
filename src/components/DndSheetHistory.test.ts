// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import DndSheetHistory from './DndSheetHistory.vue';
import { interactiveTemplates } from '../api/client';

vi.mock('../api/client', () => ({ interactiveTemplates: { history: vi.fn(), restoreSetup: vi.fn() } }));

const entry = (id: string, kind: 'setup' | 'play', extra: Record<string, unknown> = {}) => ({
  id, kind, note: null, userId: 'u', userName: 'Игрок', at: new Date().toISOString(), revision: 1,
  ops: [{ op: { type: 'set', path: ['identity', 'level'], value: 2 }, before: 1, after: 2 }],
  restorable: kind === 'setup', newerSetupEntries: 2, ...extra,
});

let wrapper: VueWrapper | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(interactiveTemplates.history).mockResolvedValue({ entries: [entry('p', 'play'), entry('s', 'setup'), entry('old', 'setup', { restorable: false, newerSetupEntries: 3 })] } as any);
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

async function openPanel(canRestore = true) {
  wrapper = mount(DndSheetHistory, { props: { sheetId: 'hero', canRestore }, attachTo: document.body });
  await wrapper.get('.dnd-history-button').trigger('click');
  await flushPromises();
}
const items = () => Array.from(document.querySelectorAll('.dnd-history ol > li'));
const click = async (element: Element | null | undefined) => { (element as HTMLElement).click(); await flushPromises(); };

describe('DndSheetHistory', () => {
  it('lists every entry and filters the list (not the sheet mode)', async () => {
    await openPanel();
    expect(items()).toHaveLength(3);
    await click(Array.from(document.querySelectorAll('.dnd-history-filter button')).find((b) => b.textContent === 'Только игра'));
    expect(items()).toHaveLength(1);
    await click(Array.from(document.querySelectorAll('.dnd-history-filter button')).find((b) => b.textContent === 'Только настройка'));
    expect(items()).toHaveLength(2);
  });

  it('offers restore only on restorable setup entries, after a confirmation', async () => {
    vi.mocked(interactiveTemplates.restoreSetup).mockResolvedValue({ revision: 9, rolledBack: 2 });
    await openPanel();
    const [play, setup, old] = items();
    expect(play!.querySelector('.dnd-history-restore')).toBeNull();
    expect(old!.querySelector('.dnd-history-restore')).toBeNull();
    await click(setup!.querySelector('.dnd-history-restore button'));
    expect(setup!.textContent).toContain('Откатить 2 настроечные записи?');
    await click(Array.from(setup!.querySelectorAll('button')).find((b) => b.textContent === 'Вернуть'));
    expect(interactiveTemplates.restoreSetup).toHaveBeenCalledWith('hero', 's');
    expect(wrapper!.emitted('restored')).toEqual([[2]]);
    expect(interactiveTemplates.history).toHaveBeenCalledTimes(2); // reloaded
  });

  it('shows the history to readers without restore buttons', async () => {
    await openPanel(false);
    expect(items()).toHaveLength(3);
    expect(document.querySelector('.dnd-history-restore')).toBeNull();
  });

  it('reports a failed load', async () => {
    vi.mocked(interactiveTemplates.history).mockRejectedValueOnce(new Error('Нет связи'));
    await openPanel();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Нет связи');
  });
});
