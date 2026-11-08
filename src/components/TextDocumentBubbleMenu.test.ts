// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextDocumentBubbleMenu from './TextDocumentBubbleMenu.vue';

const editor = {
  isActive: (mark: string) => mark === 'bold' || mark === 'link',
} as any;

describe('TextDocumentBubbleMenu', () => {
  it('keeps mark and link action hooks in the extracted component', async () => {
    const wrapper = mount(TextDocumentBubbleMenu, {
      props: {
        editor,
        shouldShow: () => true,
        tippyOptions: {},
        linkEditorOpen: false,
        linkInput: '',
        markButtons: [{ mark: 'bold', label: 'Bold', labelKey: 'markBold', icon: '<svg />' }],
        linkIcon: '<svg />',
        unlinkIcon: '<svg />',
      },
      global: { stubs: { BubbleMenu: { template: '<div class="bubble-stub"><slot /></div>' } } },
    });

    expect(wrapper.get('[data-bubble-mark="bold"]').classes()).toContain('active');
    expect(wrapper.get('[data-bubble-action="link"]').classes()).toContain('active');
    expect(wrapper.find('[data-bubble-action="unlink"]').exists()).toBe(true);
    await wrapper.get('[data-bubble-action="unlink"]').trigger('click');
    expect(wrapper.emitted('remove-link')).toHaveLength(1);
  });

  it('emits link input updates and submit actions', async () => {
    const wrapper = mount(TextDocumentBubbleMenu, {
      props: {
        editor,
        shouldShow: () => true,
        tippyOptions: {},
        linkEditorOpen: true,
        linkInput: 'https://example.test',
        markButtons: [],
        linkIcon: '',
        unlinkIcon: '',
      },
      global: { stubs: { BubbleMenu: { template: '<div class="bubble-stub"><slot /></div>' } } },
    });

    await wrapper.get('input').setValue('https://qcanva.test');
    const updates = wrapper.emitted('update:linkInput') || [];
    expect(updates[updates.length - 1]).toEqual(['https://qcanva.test']);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply-link')).toHaveLength(1);
  });
});
