// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextDocumentBacklinks from './TextDocumentBacklinks.vue';

const item = { id: 'doc-1', title: 'Referenced page', accessible: true };

describe('TextDocumentBacklinks', () => {
  it('keeps disclosure and backlink selectors stable', async () => {
    const wrapper = mount(TextDocumentBacklinks, {
      props: { loaded: true, expanded: true, items: [item], backlinksIcon: '<svg />', mentionDocumentIcon: '<svg />' },
    });

    expect(wrapper.get('[data-backlinks-count]').text()).toBe('1');
    expect(wrapper.get('[data-backlink-id="doc-1"]').attributes('data-backlink-state')).toBe('accessible');
    await wrapper.get('[data-backlink-id="doc-1"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[item]]);
    await wrapper.get('.text-doc-backlinks-head').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });

  it('renders the explicit empty state after loading', () => {
    const wrapper = mount(TextDocumentBacklinks, {
      props: { loaded: true, expanded: true, items: [], backlinksIcon: '', mentionDocumentIcon: '' },
    });

    expect(wrapper.find('.text-doc-backlinks-empty').exists()).toBe(true);
  });
});
