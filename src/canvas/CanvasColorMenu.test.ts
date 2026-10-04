// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasColorMenu from './CanvasColorMenu.vue';

enableAutoUnmount(afterEach);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

function setup() {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const wrapper = mount(CanvasColorMenu, {
    attachTo: document.body,
    props: { open: true, anchor, label: 'Background color' },
    slots: { default: '<button id="red">Red</button><button id="blue">Blue</button>' },
  });
  return { wrapper, anchor, menu: document.querySelector<HTMLElement>('.canvas-color-menu')! };
}

describe('CanvasColorMenu', () => {
  it('measures natural width after a panel-width popup is reused at another trigger', async () => {
    const { wrapper, anchor, menu } = setup();
    const panel = document.createElement('div');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 310, top: 250, bottom: 330, width: 300 } as DOMRect);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 180, right: 220, top: 450, bottom: 490, width: 40 } as DOMRect);
    vi.spyOn(menu, 'offsetWidth', 'get').mockImplementation(() => menu.style.width ? 300 : 56);
    vi.spyOn(menu, 'scrollHeight', 'get').mockReturnValue(100);
    vi.stubGlobal('innerWidth', 320); vi.stubGlobal('innerHeight', 568);
    await wrapper.setProps({ widthAnchor: panel }); await flushPromises();
    await wrapper.setProps({ widthAnchor: null }); await flushPromises();
    expect(menu.style.width).toBe(''); expect(menu.style.left).toBe('172px');
  });
  it('scrolls a tall mobile menu above its trigger instead of moving beside it', async () => {
    const { wrapper, anchor, menu } = setup();
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 366, right: 394, top: 210, bottom: 238, width: 28 } as DOMRect);
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(56);
    vi.spyOn(menu, 'scrollHeight', 'get').mockReturnValue(336);
    vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390);
    await wrapper.setProps({ above: true }); await flushPromises();
    expect(menu.style.left).toBe('352px'); expect(menu.style.top).toBe('8px');
    expect(menu.style.maxHeight).toBe('194px');
  });
  it('matches a settings panel width and scrolls above it without covering the controls', async () => {
    const { wrapper, anchor, menu } = setup();
    const panel = document.createElement('div'); document.body.append(panel);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 310, top: 250, bottom: 330, width: 300 } as DOMRect);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 160, right: 200, top: 290, bottom: 330, width: 40 } as DOMRect);
    vi.spyOn(menu, 'scrollHeight', 'get').mockReturnValue(334);
    vi.stubGlobal('innerWidth', 320); vi.stubGlobal('innerHeight', 390);
    await wrapper.setProps({ widthAnchor: panel }); await flushPromises();
    expect(menu.style.width).toBe('300px'); expect(menu.style.left).toBe('10px');
    expect(menu.style.maxHeight).toBe('234px'); expect(menu.style.top).toBe('8px');
    window.dispatchEvent(new Event('resize')); await flushPromises();
    expect(menu.style.width).toBe('300px');
  });
  it('does not close on its trigger or a swatch pointerdown; closes on outside pointerdown', () => {
    const { wrapper, anchor, menu } = setup();
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    menu.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeUndefined();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('keeps the popup open after successive options are chosen', () => {
    const { wrapper, menu } = setup();
    menu.querySelector<HTMLButtonElement>('button')!.click();
    menu.querySelectorAll<HTMLButtonElement>('button')[1]!.click();
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('Escape closes and restores focus to the colour trigger', () => {
    const { wrapper, anchor, menu } = setup();
    menu.querySelector<HTMLButtonElement>('button')!.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.activeElement).toBe(anchor);
  });

  it('supports vertical keyboard navigation', () => {
    const { menu } = setup();
    const buttons = menu.querySelectorAll<HTMLButtonElement>('button');
    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('flips below a top-edge trigger and clamps a right-edge trigger within the viewport', async () => {
    const { anchor, menu } = setup();
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 0, bottom: 36, width: 36 } as DOMRect);
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(56);
    vi.spyOn(menu, 'scrollHeight', 'get').mockReturnValue(300);
    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 568);
    await flushPromises();
    expect(menu.style.left).toBe('256px');
    expect(menu.style.top).toBe('44px');
    expect(menu.style.transformOrigin).toBe('top center');
    vi.unstubAllGlobals();
  });

  it('keeps the trigger uncovered when neither above nor below fits in landscape', async () => {
    const { anchor, menu } = setup();
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 366, right: 394, top: 210, bottom: 238, width: 28 } as DOMRect);
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(56);
    vi.spyOn(menu, 'scrollHeight', 'get').mockReturnValue(336);
    vi.stubGlobal('innerWidth', 844);
    vi.stubGlobal('innerHeight', 390);
    await flushPromises();
    expect(menu.style.left).toBe('402px');
    expect(menu.style.top).toBe('8px');
  });
});
