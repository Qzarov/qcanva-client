// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextDocumentSlashMenu from './TextDocumentSlashMenu.vue';

const item = { id: 'paragraph', labelKey: 'slashParagraph' as const, keywords: [] as string[], icon: '<svg />', run: () => {} };

describe('TextDocumentSlashMenu', () => {
  it('renders desktop and mobile hooks from one item model', async () => {
    const wrapper = mount(TextDocumentSlashMenu, {
      props: { open: true, items: [item], activeIndex: 0, style: { top: '10px' } },
    });

    expect(wrapper.get('.text-doc-slash-menu').attributes('style')).toContain('top: 10px');
    expect(wrapper.get('.text-doc-slash-menu [data-slash-item="paragraph"]').attributes('aria-selected')).toBe('true');
    expect(document.querySelectorAll('.text-doc-slash-sheet [data-slash-item="paragraph"]')).toHaveLength(1);
    await wrapper.get('.text-doc-slash-menu [data-slash-item="paragraph"]').trigger('mousedown');
    expect(wrapper.emitted('select')).toEqual([[0]]);
    wrapper.unmount();
  });

  it('emits cancel from the mobile backdrop', async () => {
    const wrapper = mount(TextDocumentSlashMenu, { props: { open: true, items: [], activeIndex: 0 } });
    (document.querySelector('.text-doc-slash-sheet-backdrop') as HTMLElement).click();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });
});
