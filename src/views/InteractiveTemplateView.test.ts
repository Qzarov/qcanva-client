// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InteractiveTemplateView from './InteractiveTemplateView.vue';
import { interactiveTemplates } from '../api/client';
import { createDndCharacterSheet } from '../dnd/characterSheet';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'hero' } }) }));
vi.mock('../api/client', () => ({ interactiveTemplates: { get: vi.fn(), update: vi.fn() }, uploadImage: vi.fn() }));
vi.mock('../composables/useRecentResource', () => ({ markResourceOpened: vi.fn() }));
vi.mock('../components/AccountMenu.vue', () => ({ default: { template: '<div />' } }));

describe('character sheet dashboard title', () => {
  let wrapper: ReturnType<typeof mount>;
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
  async function open() {
    const data = createDndCharacterSheet();
    data.identity.name = 'Лира';
    const template = { id: 'hero', title: 'Старое название', templateType: 'dnd-character' as const, data: { ...data }, createdAt: '', updatedAt: '' };
    vi.mocked(interactiveTemplates.get).mockResolvedValue(template);
    vi.mocked(interactiveTemplates.update).mockImplementation(async (_, payload) => ({ ...template, ...payload }));
    wrapper = mount(InteractiveTemplateView, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
  }
  it('removes the separate dashboard-title field', async () => {
    await open();
    expect(wrapper.text()).not.toContain('Название в дашборде');
  });
  it('saves the character name as the title, including subsequent edits', async () => {
    await open();
    const name = wrapper.get('[aria-label="Имя персонажа"]');
    await name.setValue('Элиан');
    await vi.advanceTimersByTimeAsync(500);
    expect(interactiveTemplates.update).toHaveBeenLastCalledWith('hero', expect.objectContaining({ title: 'Элиан' }));
    await name.setValue('Лира из Лунного леса');
    await vi.advanceTimersByTimeAsync(500);
    expect(interactiveTemplates.update).toHaveBeenLastCalledWith('hero', expect.objectContaining({ title: 'Лира из Лунного леса' }));
  });
  it('uses a nonempty default title when the name is cleared', async () => {
    await open();
    await wrapper.get('[aria-label="Имя персонажа"]').setValue('   ');
    await vi.advanceTimersByTimeAsync(500);
    expect(interactiveTemplates.update).toHaveBeenLastCalledWith('hero', expect.objectContaining({ title: 'Новый персонаж' }));
  });
});
