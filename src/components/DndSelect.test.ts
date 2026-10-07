// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DndSelect from './DndSelect.vue';
import { choose, optionLabels, selectSelector, selectedLabel } from './dndSelect.testing';
import { runBackHandlers } from '../composables/useBackHandler';

const OPTIONS = [
  { value: '', label: 'Не выбран' },
  { value: 'bard', label: 'Бард' },
  { value: 'druid', label: 'Друид' },
  { value: 'cleric', label: 'Жрец' },
  { value: 'warlock', label: 'Колдун' },
];
const mountSelect = (props: Record<string, unknown> = {}) =>
  mount(DndSelect, { props: { value: 'druid', options: OPTIONS, label: 'Класс', ...props }, global: { stubs: { Teleport: true } }, attachTo: document.body });
const flush = async (wrapper: ReturnType<typeof mountSelect>) => { for (let i = 0; i < 3; i += 1) await wrapper.vm.$nextTick(); };
const key = (wrapper: ReturnType<typeof mountSelect>, name: string) => wrapper.get('[role="listbox"]').trigger('keydown', { key: name });
const focused = () => (document.activeElement as HTMLElement | null)?.textContent?.trim();

describe('DndSelect', () => {
  it('shows the chosen option and is closed until asked', () => {
    const wrapper = mountSelect();
    try {
      const control = wrapper.get(selectSelector('Класс'));
      expect(selectedLabel(wrapper, 'Класс')).toBe('Друид');
      expect(control.attributes('aria-expanded')).toBe('false');
      expect(control.attributes('aria-haspopup')).toBe('listbox');
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('opens a list of its options with the chosen one marked and focused', async () => {
    const wrapper = mountSelect();
    try {
      await wrapper.get(selectSelector('Класс')).trigger('click');
      await flush(wrapper);
      const options = wrapper.findAll('[role="option"]');
      expect(options.map((option) => option.text())).toEqual(OPTIONS.map((option) => option.label));
      expect(options.map((option) => option.attributes('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false']);
      expect(focused()).toBe('Друид');
      expect(wrapper.get(selectSelector('Класс')).attributes('aria-expanded')).toBe('true');
    } finally { wrapper.unmount(); }
  });

  it('emits the chosen value, closes and gives the focus back', async () => {
    const wrapper = mountSelect();
    try {
      await choose(wrapper, 'Класс', 'cleric');
      expect(wrapper.emitted('change')).toEqual([['cleric']]);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.get(selectSelector('Класс')).element);
      // Choosing what is already chosen changes nothing.
      await choose(wrapper, 'Класс', 'druid');
      expect(wrapper.emitted('change')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });

  it('is driven from the keyboard: arrows, Home and End, letters', async () => {
    const wrapper = mountSelect();
    try {
      await wrapper.get(selectSelector('Класс')).trigger('keydown', { key: 'ArrowDown' });
      await flush(wrapper);
      expect(focused()).toBe('Друид');
      await key(wrapper, 'ArrowDown');
      expect(focused()).toBe('Жрец');
      await key(wrapper, 'End');
      expect(focused()).toBe('Колдун');
      await key(wrapper, 'ArrowDown'); // wraps around
      expect(focused()).toBe('Не выбран');
      await key(wrapper, 'ArrowUp');
      expect(focused()).toBe('Колдун');
      await key(wrapper, 'Home');
      expect(focused()).toBe('Не выбран');
      // Typing jumps to the option that starts with it, whatever the case.
      await key(wrapper, 'к');
      expect(focused()).toBe('Колдун');
      await key(wrapper, 'Ж');
      expect(focused()).toBe('Колдун'); // "кж" matches nothing: the focus stays
    } finally { wrapper.unmount(); }
  });

  it('closes on Escape, on system Back and on a tap outside, without choosing', async () => {
    const wrapper = mountSelect();
    try {
      const control = wrapper.get(selectSelector('Класс'));
      await control.trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flush(wrapper);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
      expect(document.activeElement).toBe(control.element);

      await control.trigger('click');
      expect(runBackHandlers()).toBe(true);
      await flush(wrapper);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

      await control.trigger('click');
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await flush(wrapper);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });

  it('cannot be opened when disabled, and closes if it becomes disabled', async () => {
    const wrapper = mountSelect({ disabled: true });
    try {
      const control = wrapper.get(selectSelector('Класс'));
      expect(control.attributes('disabled')).toBeDefined();
      await wrapper.setProps({ disabled: false });
      await control.trigger('click');
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
      await wrapper.setProps({ disabled: true });
      await flush(wrapper);
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('names itself while nothing is chosen', async () => {
    const wrapper = mountSelect({ value: 'unknown', placeholder: 'Выберите класс' });
    try {
      expect(selectedLabel(wrapper, 'Класс')).toBe('Выберите класс');
      expect(wrapper.classes()).toContain('is-empty');
      expect(await optionLabels(wrapper, 'Класс')).toHaveLength(5);
    } finally { wrapper.unmount(); }
  });
});
