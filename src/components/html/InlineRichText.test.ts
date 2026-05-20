// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import InlineRichText from './InlineRichText.vue';

describe('InlineRichText', () => {
  it('emits sanitized html on input', async () => {
    const wrapper = mount(InlineRichText, { props: { modelValue: 'Hello' } });
    const surface = wrapper.find('[contenteditable="true"]').element as HTMLElement;
    surface.innerHTML = 'Hello <strong>world</strong><script>alert(1)<\/script>';
    await wrapper.find('[contenteditable="true"]').trigger('input');

    const emissions = wrapper.emitted('update:modelValue') || [];
    const last = emissions[emissions.length - 1]?.[0] as string;
    expect(last).toContain('<strong>world</strong>');
    expect(last).not.toContain('<script');
  });

  it('keeps allow-listed anchors', async () => {
    const wrapper = mount(InlineRichText, { props: { modelValue: 'x' } });
    const surface = wrapper.find('[contenteditable="true"]').element as HTMLElement;
    surface.innerHTML = 'See <a href="https://example.com">site</a>';
    await wrapper.find('[contenteditable="true"]').trigger('input');
    const emissions2 = wrapper.emitted('update:modelValue') || [];
    const last = emissions2[emissions2.length - 1]?.[0] as string;
    expect(last).toContain('<a href="https://example.com">site</a>');
  });
});
