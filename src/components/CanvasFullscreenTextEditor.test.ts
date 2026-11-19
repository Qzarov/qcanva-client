// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import CanvasFullscreenTextEditor from './CanvasFullscreenTextEditor.vue';

describe('CanvasFullscreenTextEditor', () => {
  it('keeps mobile editor semantics and emits editing actions', async () => {
    const wrapper = mount(CanvasFullscreenTextEditor, { props: { node: { text: 'Hello', fontColor: '#fff' }, saveStatusLabel: 'Saved', canUndo: true, canRedo: false, resolveFontColor: (value) => value || null } });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('textarea')?.value).toBe('Hello');
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Changed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('input')).toHaveLength(1);
    expect(wrapper.emitted('ready')?.[0]?.[0]).toBeInstanceOf(HTMLTextAreaElement);
    (document.querySelector('.node-fullscreen-editor-back') as HTMLElement).click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
