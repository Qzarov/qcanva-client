// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AccountMenu from './AccountMenu.vue';
import DndSyncStatus from './DndSyncStatus.vue';
import { runBackHandlers } from '../composables/useBackHandler';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), RouterLink: { template: '<a><slot /></a>' } }));

const phone = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
const mountStatus = (props: { text: string; kind: 'ok' | 'saving' | 'info' | 'danger' | 'notice' }) =>
  mount(DndSyncStatus, { props, global: { stubs: { Teleport: true } }, attachTo: document.body });

beforeEach(() => { vi.useFakeTimers(); phone(true); });
afterEach(() => { vi.useRealTimers(); });

describe('sheet status', () => {
  it('always has its dot, whatever the state - so the header keeps its width', async () => {
    const wrapper = mountStatus({ text: '', kind: 'ok' });
    try {
      expect(wrapper.find('.sheet-status-dot').exists()).toBe(true);
      expect(wrapper.find('.sheet-status-text').exists()).toBe(false);
      await wrapper.setProps({ text: 'Сохраняем…', kind: 'saving' });
      expect(wrapper.find('.sheet-status-dot').exists()).toBe(true);
      expect(wrapper.classes()).toContain('is-saving');
      // The words are still rendered for wide screens, where CSS shows them instead of the dot.
      expect(wrapper.get('.sheet-status-text').text()).toBe('Сохраняем…');
    } finally { wrapper.unmount(); }
  });

  it('says what the dot means when tapped, and that all is saved when there is nothing to say', async () => {
    const wrapper = mountStatus({ text: '', kind: 'ok' });
    try {
      const dot = wrapper.get('.sheet-status-dot');
      expect(dot.attributes('aria-label')).toBe('Состояние листа: Все изменения сохранены');
      await dot.trigger('click');
      expect(wrapper.get('[role="tooltip"]').text()).toBe('Все изменения сохранены');
      expect(dot.attributes('aria-expanded')).toBe('true');
      await dot.trigger('click');
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('closes the hint by itself, on Escape and on system Back', async () => {
    const wrapper = mountStatus({ text: 'Нет связи', kind: 'danger' });
    try {
      const dot = wrapper.get('.sheet-status-dot');
      await dot.trigger('click');
      expect(wrapper.get('[role="tooltip"]').text()).toBe('Нет связи');
      vi.advanceTimersByTime(4100);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

      await dot.trigger('click');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

      await dot.trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('shows a notice by itself on a phone - nobody would see it behind a dot', async () => {
    const wrapper = mountStatus({ text: '', kind: 'ok' });
    try {
      await wrapper.setProps({ text: 'Нет связи — бросок не сделан', kind: 'notice' });
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[role="tooltip"]').text()).toBe('Нет связи — бросок не сделан');
      // A plain state change (saving) is not announced.
      await wrapper.setProps({ text: '', kind: 'ok' });
      vi.advanceTimersByTime(4100);
      await wrapper.vm.$nextTick();
      await wrapper.setProps({ text: 'Сохраняем…', kind: 'saving' });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('does not pop the hint open on a wide screen, where the words are already visible', async () => {
    phone(false);
    const wrapper = mountStatus({ text: '', kind: 'ok' });
    try {
      await wrapper.setProps({ text: 'Изменение не применилось', kind: 'notice' });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
      expect(wrapper.get('.sheet-status-text').classes()).toContain('is-warning');
    } finally { wrapper.unmount(); }
  });
});

describe('account menu in glass', () => {
  it('is opt-in, so pages that have not moved to it look as before', () => {
    const plain = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    expect(plain.classes()).not.toContain('account-menu--glass');
    plain.unmount();
    const glass = mount(AccountMenu, { props: { glass: true }, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    expect(glass.classes()).toContain('account-menu--glass');
    glass.unmount();
  });
});
