// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { captureFrameScroll, restoreFrameScroll } from './scrollRestoration';

function makeFrame() {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frame.contentDocument?.open();
  frame.contentDocument?.write('<!DOCTYPE html><html><body><div style="height: 2000px"></div></body></html>');
  frame.contentDocument?.close();
  return frame;
}

describe('scrollRestoration', () => {
  it('captures iframe window scroll position', () => {
    const frame = makeFrame();
    Object.defineProperty(frame.contentWindow, 'scrollX', { configurable: true, value: 12 });
    Object.defineProperty(frame.contentWindow, 'scrollY', { configurable: true, value: 345 });

    expect(captureFrameScroll(frame)).toEqual({ x: 12, y: 345 });
  });

  it('restores iframe scroll with scrollTo', () => {
    const frame = makeFrame();
    const scrollTo = vi.fn();
    Object.defineProperty(frame.contentWindow, 'scrollTo', { configurable: true, value: scrollTo });

    restoreFrameScroll(frame, { x: 4, y: 567 });

    expect(scrollTo).toHaveBeenCalledWith(4, 567);
  });
});
