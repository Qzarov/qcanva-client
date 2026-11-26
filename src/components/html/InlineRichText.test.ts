// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InlineRichText from './InlineRichText.vue';
import * as appDialog from '../../composables/appDialog';

describe('InlineRichText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes initial modelValue on mount and updates via watch', async () => {
    const wrapper = mount(InlineRichText, {
      props: { modelValue: 'Hi <strong onclick="alert(1)">there</strong><script>alert(1)<\/script>' },
    });
    const surface = wrapper.find('[contenteditable="true"]').element as HTMLElement;
    expect(surface.innerHTML).toContain('<strong>there</strong>');
    expect(surface.innerHTML).not.toContain('<script');
    expect(surface.innerHTML).not.toContain('onclick');

    await wrapper.setProps({ modelValue: '<a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)>' });
    expect(surface.innerHTML).not.toContain('javascript:');
    expect(surface.innerHTML).not.toContain('<img');
  });

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

  it('refuses unsafe href in promptLink before execCommand', async () => {
    const execSpy = vi.fn();
    Object.defineProperty(document, 'execCommand', { value: execSpy, configurable: true, writable: true });
    vi.spyOn(appDialog, 'promptText').mockResolvedValueOnce('javascript:alert(1)');

    const wrapper = mount(InlineRichText, { props: { modelValue: 'Hello' } });
    const linkBtn = wrapper.findAll('button').find((b) => b.text() === 'Link')!;
    await linkBtn.trigger('mousedown');
    await Promise.resolve();
    expect(execSpy).not.toHaveBeenCalled();

    vi.spyOn(appDialog, 'promptText').mockResolvedValueOnce('https://example.com');
    await linkBtn.trigger('mousedown');
    await Promise.resolve();
    await Promise.resolve();
    expect(execSpy).toHaveBeenCalledWith('createLink', false, 'https://example.com');
  });
});
