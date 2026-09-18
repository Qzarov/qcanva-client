import { describe, expect, it } from 'vitest';
import { computeVisibleTagFitCount } from './tag-fit';

describe('computeVisibleTagFitCount', () => {
  it('shows every chip when they all fit within the container', () => {
    // reserved(40) + (30+8)*3 = 40 + 114 = 154, well under 300.
    expect(computeVisibleTagFitCount(300, 40, [30, 30, 30], 8, 40)).toBe(3);
  });

  it('renders everything before a real measurement exists (containerWidth <= 0)', () => {
    expect(computeVisibleTagFitCount(0, 40, [30, 30, 30], 8, 40)).toBe(3);
    expect(computeVisibleTagFitCount(-1, 40, [30, 30, 30], 8, 40)).toBe(3);
  });

  it('cuts off chips that do not fit, reserving room for the +N badge', () => {
    // All 5 chips would need 40 + (30+8)*5 = 230, over the 200 container -
    // so +N space must be reserved: budget = 200-40-40-8 = 112, each chip
    // costs 38 -> fits 2 (76), a 3rd (114) would exceed it.
    expect(computeVisibleTagFitCount(200, 40, [30, 30, 30, 30, 30], 8, 40)).toBe(2);
  });

  it('shows zero chips (still leaves room for "All" and "+N") when the container is very narrow', () => {
    expect(computeVisibleTagFitCount(50, 40, [30, 30], 8, 40)).toBe(0);
  });

  it('never returns a count larger than the number of chips given', () => {
    expect(computeVisibleTagFitCount(10_000, 40, [30, 30], 8, 40)).toBe(2);
  });

  it('handles an empty chip list', () => {
    expect(computeVisibleTagFitCount(300, 40, [], 8, 40)).toBe(0);
  });

  it('recomputes to fit more chips as the container grows (reactive to resize, not a one-time snapshot)', () => {
    const chips = [30, 30, 30, 30, 30];
    const atNarrow = computeVisibleTagFitCount(150, 40, chips, 8, 40);
    const atWide = computeVisibleTagFitCount(400, 40, chips, 8, 40);
    expect(atWide).toBeGreaterThan(atNarrow);
  });
});
