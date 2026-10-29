// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import PhotosScrubber, { type ScrubGroup } from './PhotosScrubber.vue';

const groups: ScrubGroup[] = [
  { key: '2026-10', count: 100, label: 'Октябрь 2026', short: '2026' },
  { key: '2026-09', count: 300, label: 'Сентябрь 2026', short: '2026' },
  { key: '2025-12', count: 600, label: 'Декабрь 2025', short: '2025' },
];

/** jsdom has no PointerEvent; a MouseEvent with a pointer type name carries clientY the same way. */
async function fire(w: VueWrapper, type: string, clientY = 0): Promise<void> {
  w.element.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));
  await nextTick();
}

function mountScrubber(extra: Record<string, unknown> = {}) {
  const w = mount(PhotosScrubber, {
    props: { groups, kind: 'date', current: null, ...extra },
    attachTo: document.body,
  });
  const el = w.element as HTMLElement;
  el.getBoundingClientRect = () =>
    ({ top: 100, left: 0, right: 56, bottom: 700, width: 56, height: 600, x: 0, y: 100, toJSON() {} }) as DOMRect;
  return w;
}

describe('PhotosScrubber', () => {
  it('scrubber click scrolls to group', async () => {
    const w = mountScrubber();
    // y = 100 + 300 = 400 -> rail fraction .5 -> second group starts at .1, size .3 => third group (starts .4)
    await fire(w, 'pointerdown', 400);
    expect(w.emitted('jump')).toHaveLength(1);
    const [key, frac] = w.emitted('jump')![0] as [string, number];
    expect(key).toBe('2025-12');
    expect(frac).toBeCloseTo((0.5 - 0.4) / 0.6, 3);
    w.unmount();
  });

  it('drag emits jumps, plain move only shows the hover label', async () => {
    const w = mountScrubber();
    await fire(w, 'pointermove', 170);
    expect(w.emitted('jump')).toBeUndefined();
    expect(w.get('[data-testid="scrub-hover"]').text()).toBe('Сентябрь 2026');
    await fire(w, 'pointerdown', 110);
    await fire(w, 'pointermove', 300);
    expect(w.emitted('jump')!.length).toBe(2);
    await fire(w, 'pointerup');
    await fire(w, 'pointermove', 500);
    expect(w.emitted('jump')!.length).toBe(2);
    w.unmount();
  });

  it('marks the current place and uses the hover label callback', async () => {
    const w = mountScrubber({
      current: { key: '2026-09', frac: 0.5 },
      hoverLabel: (key: string, frac: number) => `${key}@${frac.toFixed(1)}`,
    });
    const top = (w.get('[data-testid="scrub-now"]').element as HTMLElement).style.top;
    expect(parseFloat(top)).toBeCloseTo((0.1 + 0.5 * 0.3) * 100, 3);
    await fire(w, 'pointermove', 100);
    expect(w.get('[data-testid="scrub-hover"]').text()).toBe('2026-10@0.0');
    w.unmount();
  });

  it('shows each year once on the rail', () => {
    const w = mountScrubber();
    const labels = w.findAll('.scrub-year').map((n) => n.text());
    expect(labels).toEqual(['2026', '2025']);
    w.unmount();
  });
  it('is a keyboard-operable slider', async () => {
    const w = mountScrubber({ current: { key: '2026-09', frac: 0.2 } });
    expect(w.attributes('role')).toBe('slider');
    expect(w.attributes('tabindex')).toBe('0');
    expect(w.attributes('aria-valuetext')).toBe('Сентябрь 2026');
    await w.trigger('keydown', { key: 'ArrowUp' });
    await w.trigger('keydown', { key: 'ArrowDown' });
    await w.trigger('keydown', { key: 'Home' });
    await w.trigger('keydown', { key: 'End' });
    await w.trigger('keydown', { key: 'PageDown' });
    await w.trigger('keydown', { key: 'PageUp' });
    expect(w.emitted('jump')).toEqual([
      ['2026-10', 0],
      ['2025-12', 0],
      ['2026-10', 0],
      ['2025-12', 0],
      ['2025-12', 0],
      ['2026-10', 0],
    ]);
    w.unmount();
  });
});
