import { describe, expect, it } from 'vitest';
import { feedColumnCount, feedSectionLimit } from './feed-rows';

describe('feed rows', () => {
  it('counts the columns an auto-fill 210px / 12px-gap grid makes', () => {
    expect(feedColumnCount(210, false)).toBe(1);
    expect(feedColumnCount(431, false)).toBe(1);
    expect(feedColumnCount(432, false)).toBe(2);
    expect(feedColumnCount(976, false)).toBe(4);
    expect(feedColumnCount(1210, false)).toBe(5);
    expect(feedColumnCount(100, false)).toBe(1);
  });

  it('uses the phone grid\'s fixed 2 columns, and 4 before anything is measured', () => {
    expect(feedColumnCount(350, true)).toBe(2);
    expect(feedColumnCount(0, false)).toBe(4);
  });

  it('gives each section one row and Public four', () => {
    expect(feedSectionLimit('recent', 5)).toBe(5);
    expect(feedSectionLimit('shared', 5)).toBe(5);
    expect(feedSectionLimit('interactive', 2)).toBe(2);
    expect(feedSectionLimit('public', 5)).toBe(20);
    expect(feedSectionLimit('public', 2)).toBe(8);
  });
});
