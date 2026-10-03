import { describe, expect, it, vi } from 'vitest';
import {
  RECENT_VIEW_STORAGE_KEY,
  parseRecentViewMode,
  readRecentViewMode,
  writeRecentViewMode,
} from './recent-view';

describe('recent dashboard view preference', () => {
  it('defaults to the grid and accepts only supported modes', () => {
    expect(parseRecentViewMode(null)).toBe('grid');
    expect(parseRecentViewMode('grid')).toBe('grid');
    expect(parseRecentViewMode('list')).toBe('list');
    expect(parseRecentViewMode('tiles')).toBe('grid');
  });

  it('uses the agreed key and survives unavailable storage', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
    };

    expect(readRecentViewMode(storage)).toBe('grid');
    expect(() => writeRecentViewMode(storage, 'list')).not.toThrow();

    const writableStorage = { setItem: vi.fn() };
    writeRecentViewMode(writableStorage, 'list');
    expect(writableStorage.setItem).toHaveBeenCalledWith(RECENT_VIEW_STORAGE_KEY, 'list');
  });
});
