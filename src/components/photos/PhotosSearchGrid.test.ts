// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { FeedItem } from '../../api/photos';
import PhotosSearchGrid from './PhotosSearchGrid.vue';

vi.mock('../../api/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/photos')>();
  return { ...actual, renditionUrl: vi.fn(async (hash: string) => `blob:${hash}`) };
});

function mkItem(i: number): FeedItem {
  return {
    fileId: `f${i}`,
    hash: `h${i}`,
    name: `p${i}.jpg`,
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: null,
    localTakenAt: null,
    width: 10,
    height: 10,
    durationSec: null,
    bytes: 1,
    folderId: null,
    favorite: false,
    albumIds: [],
    thumbhash: null,
    share: null,
  };
}

let scrollH = 300;
let clientH = 600;
const observers: Array<{ cb: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];

describe('PhotosSearchGrid', () => {
  beforeEach(() => {
    scrollH = 300;
    clientH = 600;
    observers.length = 0;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollH });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientH });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        cb: () => void;
        disconnect = vi.fn();
        constructor(cb: () => void) {
          this.cb = cb;
          observers.push(this);
        }
        observe(): void {}
      },
    );
  });

  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function mountGrid(hasMore: boolean, count = 3) {
    return mount(PhotosSearchGrid, {
      props: { items: Array.from({ length: count }, (_, i) => mkItem(i)), tile: 'm', current: null, hasMore },
      attachTo: document.body,
    });
  }

  it('asks for the next page when the first one does not fill the viewport', async () => {
    const w = mountGrid(true);
    await nextTick();
    await nextTick();
    expect(w.emitted('more')?.length).toBeGreaterThanOrEqual(1);
    w.unmount();
  });

  it('does not ask when the content overflows or there is no next page', async () => {
    scrollH = 2000;
    const a = mountGrid(true);
    await nextTick();
    await nextTick();
    expect(a.emitted('more')).toBeUndefined();
    a.unmount();
    scrollH = 300;
    const b = mountGrid(false);
    await nextTick();
    await nextTick();
    expect(b.emitted('more')).toBeUndefined();
    b.unmount();
  });

  it('checks again when new items arrive and when the viewport grows', async () => {
    scrollH = 2000;
    const w = mountGrid(true);
    await nextTick();
    expect(w.emitted('more')).toBeUndefined();
    clientH = 3000; // taller window: the page no longer fills it
    observers[0]!.cb();
    expect(w.emitted('more')?.length).toBe(1);
    await w.setProps({ items: [mkItem(0), mkItem(1), mkItem(2), mkItem(3)] });
    await nextTick();
    expect(w.emitted('more')?.length).toBe(2);
    w.unmount();
  });

  it('disconnects the observer on unmount and lazy-loads images', async () => {
    const w = mountGrid(false);
    await nextTick();
    await new Promise((r) => setTimeout(r));
    expect(w.find('img').attributes('loading')).toBe('lazy');
    w.unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });
});
