// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import TextDocumentMobileMenu from './TextDocumentMobileMenu.vue';

describe('TextDocumentMobileMenu', () => {
  it('keeps the document action trigger and menu hooks stable', async () => {
    const wrapper = mount(TextDocumentMobileMenu, {
      props: { open: true, isOwner: true, style: { position: 'fixed' } },
    });

    expect(wrapper.get('.text-doc-menu-trigger').attributes('aria-label')).toBeTruthy();
    const popover = document.querySelector<HTMLElement>('.text-doc-menu-popover');
    expect(popover?.getAttribute('style')).toContain('position: fixed');
    expect(document.querySelectorAll('.text-doc-menu-item')).toHaveLength(3);
    document.querySelector<HTMLElement>('.text-doc-menu-item')?.click();
    await nextTick();
    expect(wrapper.emitted('share')).toHaveLength(1);
    wrapper.unmount();
  });

  it('hides owner-only sharing for readers and emits close from the backdrop', async () => {
    const wrapper = mount(TextDocumentMobileMenu, {
      props: { open: true, isOwner: false },
    });

    expect(document.querySelectorAll('.text-doc-menu-item')).toHaveLength(2);
    document.querySelector<HTMLElement>('.text-doc-menu-backdrop')?.click();
    await nextTick();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
