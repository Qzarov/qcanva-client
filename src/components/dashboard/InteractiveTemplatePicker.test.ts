// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import InteractiveTemplatePicker from './InteractiveTemplatePicker.vue';
import { lssExport } from '../../dnd/importLongStoryShort.fixture';

const mountPicker = () => mount(InteractiveTemplatePicker, { attachTo: document.body });

/** Picks a file in the hidden input, the way the system dialog does. */
const pickFile = async (wrapper: ReturnType<typeof mountPicker>, content: string, name = 'hero.json') => {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([content], name, { type: 'application/json' })] });
  await input.trigger('change');
  // FileReader answers on a later task.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushPromises();
};

describe('InteractiveTemplatePicker', () => {
  it('offers an empty sheet, a board and an import, and starts on the first block', async () => {
    const wrapper = mountPicker();
    await flushPromises();
    expect(wrapper.findAll('.template-picker-tile').map((tile) => tile.get('strong').text())).toEqual([
      'Карточка персонажа D&D', 'Канбан-доска', 'Импорт персонажа D&D',
    ]);
    expect(document.activeElement).toBe(wrapper.get('[data-template-type="dnd-character"]').element);

    await wrapper.get('[data-template-type="trello-board"]').trigger('click');
    expect(wrapper.emitted('create')).toEqual([['trello-board']]);
    wrapper.unmount();
  });

  it('shows what an import carries over before anything is created', async () => {
    const wrapper = mountPicker();
    await pickFile(wrapper, lssExport(), 'Мирра.json');

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Импорт персонажа');
    expect(wrapper.get('.template-import-who').text()).toBe('МирраПолуорк · Друид 3 ур.Мирра.json');
    expect(wrapper.get('[data-import-list="imported"]').text()).toContain('HP 17 / 24, КД 12, скорость 30, кость хитов к8');
    expect(wrapper.get('[data-import-list="skipped"]').text()).toContain('Заклинания (3)');
    expect(wrapper.emitted('import')).toBeUndefined();
    expect(document.activeElement).toBe(wrapper.get('[data-import-confirm]').element);

    await wrapper.get('[data-import-confirm]').trigger('click');
    const [result] = wrapper.emitted('import')![0] as [{ title: string; data: { identity: { name: string } } }];
    expect(result.title).toBe('Мирра');
    expect(result.data.identity.name).toBe('Мирра');
    wrapper.unmount();
  });

  it('says in plain words why a file is not a character and lets another one be picked', async () => {
    const wrapper = mountPicker();
    await pickFile(wrapper, '{"nodes":[]}');
    expect(wrapper.get('[role="alert"]').text()).toBe('Это не персонаж из Long Story Short: в файле нет характеристик.');
    expect(wrapper.find('.template-import').exists()).toBe(false);

    await pickFile(wrapper, lssExport());
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('.template-import').exists()).toBe(true);
    wrapper.unmount();
  });

  it('closes on Escape and on the backdrop, and blocks the blocks while busy', async () => {
    const wrapper = mount(InteractiveTemplatePicker, { props: { busy: true }, attachTo: document.body });
    expect(wrapper.findAll('.template-picker-tile').every((tile) => tile.attributes('disabled') !== undefined)).toBe(true);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await wrapper.get('.template-picker-backdrop').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    wrapper.unmount();
  });
});
