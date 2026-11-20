// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextDocumentMentionMenu from './TextDocumentMentionMenu.vue';

const items = [
  { kind: 'heading', headingId: 'intro', label: 'Intro' },
  { kind: 'document', id: 'doc-1', title: 'Other page' },
  { kind: 'create', query: 'new page' },
] as const;

describe('TextDocumentMentionMenu', () => {
  it('renders document, heading and create rows with stable hooks', async () => {
    const wrapper = mount(TextDocumentMentionMenu, {
      props: { open: true, items, activeIndex: 1, style: { top: '12px' }, documentIcon: '<svg />', headingIcon: '<svg />', createIcon: '<svg />' },
    });

    expect(wrapper.get('[data-mention-item="h-intro"]').text()).toContain('Intro');
    expect(wrapper.get('[data-mention-item="doc-1"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('[data-mention-item="create"]').text()).toContain('new page');
    await wrapper.get('[data-mention-item="doc-1"]').trigger('mousedown');
    expect(wrapper.emitted('select')).toEqual([[1]]);
  });
});
