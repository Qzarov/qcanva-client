// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { HINT_HOLD_MS, HINT_HOVER_DELAY_MS, HINT_TOUCH_LINGER_MS, vHint } from './hint';

function pointer(el: Element, type: string, pointerType: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  el.dispatchEvent(event);
}

const tip = () => document.querySelector('.ui-hint') as HTMLElement | null;
const visible = () => Boolean(tip()?.classList.contains('visible'));

let clicks = 0;
const Host = defineComponent({
  directives: { hint: vHint },
  setup() {
    const label = ref('Move');
    return { label, onClick: () => { clicks += 1; } };
  },
  template: '<button type="button" v-hint="label" @click="onClick">↗</button>',
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
  clicks = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('v-hint', () => {
  it('shows the name after a short hover and hides it when the mouse leaves', () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const button = wrapper.get('button').element;

    pointer(button, 'pointerenter', 'mouse');
    vi.advanceTimersByTime(HINT_HOVER_DELAY_MS - 1);
    expect(visible()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible()).toBe(true);
    expect(tip()!.textContent).toBe('Move');
    expect(button.getAttribute('aria-describedby')).toBe('ui-hint');

    pointer(button, 'pointerleave', 'mouse');
    expect(visible()).toBe(false);
    wrapper.unmount();
  });

  it('a mouse click still runs the action', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    pointer(wrapper.get('button').element, 'pointerdown', 'mouse');
    await wrapper.get('button').trigger('click');
    expect(clicks).toBe(1);
    wrapper.unmount();
  });

  it('press and hold on a phone shows the name and does not run the action', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const button = wrapper.get('button').element;

    pointer(button, 'pointerdown', 'touch');
    vi.advanceTimersByTime(HINT_HOLD_MS);
    expect(visible()).toBe(true);
    pointer(button, 'pointerup', 'touch');
    await wrapper.get('button').trigger('click');
    expect(clicks).toBe(0);

    // It stays a moment to be read, then goes.
    vi.advanceTimersByTime(HINT_TOUCH_LINGER_MS);
    expect(visible()).toBe(false);
    wrapper.unmount();
  });

  it('a quick tap on a phone runs the action and shows nothing', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const button = wrapper.get('button').element;

    pointer(button, 'pointerdown', 'touch');
    vi.advanceTimersByTime(HINT_HOLD_MS - 100);
    pointer(button, 'pointerup', 'touch');
    await wrapper.get('button').trigger('click');
    expect(clicks).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(visible()).toBe(false);
    wrapper.unmount();
  });

  it('follows a changed label', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    (wrapper.vm as any).label = 'Download';
    await wrapper.vm.$nextTick();
    pointer(wrapper.get('button').element, 'pointerenter', 'mouse');
    vi.advanceTimersByTime(HINT_HOVER_DELAY_MS);
    expect(tip()!.textContent).toBe('Download');
    wrapper.unmount();
  });
});
