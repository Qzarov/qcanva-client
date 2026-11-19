// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardResourceCard from './DashboardResourceCard.vue';

const baseProps = {
  resource: {
    id: 'canvas-1',
    title: 'Roadmap',
    updatedAt: '2026-11-09T12:00:00.000Z',
    pinned: false,
    tags: [{ name: 'work', color: '#50d1b2' }],
  },
  kind: 'canvas',
  titleFallback: 'Untitled',
  iconLabel: 'Canvas',
  selectLabel: 'Select',
  dateLabel: '9 Nov',
  mobileDateLabel: '09.11',
  selectKey: 'canvas:canvas-1',
  selectable: true,
  selected: false,
  showPin: true,
  pinTitle: 'Pin canvas',
  busy: false,
  menuId: 'canvas-1',
  menuOpen: true,
  actions: [{ key: 'delete' as const, label: 'Delete', danger: true }],
};

describe('DashboardResourceCard', () => {
  it('keeps the dashboard selection and resource metadata contract', () => {
    const wrapper = mount(DashboardResourceCard, { props: baseProps });

    expect(wrapper.get('[data-select-key]').attributes('data-select-key')).toBe('canvas:canvas-1');
    expect(wrapper.get('.card-title-text').text()).toBe('Roadmap');
    expect(wrapper.get('.card-tag').text()).toBe('#work');
    expect(wrapper.get('.card-date').text()).toBe('9 Nov');
    expect(wrapper.get('[data-card-menu]').attributes('data-card-menu')).toBe('canvas-1');
  });

  it('emits card interactions instead of owning dashboard business logic', async () => {
    const wrapper = mount(DashboardResourceCard, { props: baseProps });

    await wrapper.get('.card-manage').trigger('click');
    await wrapper.get('.card-pin').trigger('click');
    await wrapper.get('[data-action="delete"]').trigger('click');

    expect(wrapper.emitted('toggle-menu')).toHaveLength(1);
    expect(wrapper.emitted('toggle-pin')).toHaveLength(1);
    expect(wrapper.emitted('select-action')).toEqual([['delete']]);
  });
});
