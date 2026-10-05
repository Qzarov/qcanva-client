// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import DndCharacterStates from './DndCharacterStates.vue';
import { createDndCharacterSheet } from '../dnd/characterSheet';

describe('condition overlay interactions', () => {
  it('keeps teleported choices open on pointerdown and applies a selection once', async () => {
    const combat = reactive(createDndCharacterSheet().combat);
    const wrapper = mount(DndCharacterStates, { attachTo: document.body, props: { combat, readonly: false } });
    try {
      await wrapper.get('[aria-label="Добавить состояние"]').trigger('click');
      const option = document.querySelector<HTMLButtonElement>('[aria-label="Добавить: Отравлен"]')!;
      expect(option).not.toBeNull();
      option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await nextTick();
      expect(option.isConnected).toBe(true);
      option.click(); await nextTick();
      expect(combat.conditions).toEqual(['poisoned']);
      expect(wrapper.emitted('change')).toHaveLength(1);
      expect(document.querySelector('[aria-label="Доступные состояния"]')).toBeNull();
      expect(document.activeElement).toBe(wrapper.get('[aria-label="Добавить состояние"]').element);
    } finally { wrapper.unmount(); }
  });

  it('dismisses on outside pointerdown and when editing access is revoked', async () => {
    const combat = reactive(createDndCharacterSheet().combat);
    const wrapper = mount(DndCharacterStates, { attachTo: document.body, props: { combat, readonly: false } });
    try {
      await wrapper.get('[aria-label="Добавить состояние"]').trigger('click');
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await nextTick();
      expect(document.querySelector('[aria-label="Доступные состояния"]')).toBeNull();
      await wrapper.get('[aria-label="Добавить состояние"]').trigger('click');
      expect(document.querySelector('[aria-label="Доступные состояния"]')).not.toBeNull();
      await wrapper.setProps({ readonly: true });
      expect(document.querySelector('[aria-label="Доступные состояния"]')).toBeNull();
      expect(combat.conditions).toEqual([]);
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});
