import { describe, expect, it } from 'vitest';
import { childFolderCounts, folderLatestChange } from './folder-stats';

const folders = [
  { id: 'trips', parentId: null, updatedAt: '2026-10-01T10:00:00.000Z', items: [{ updatedAt: '2026-11-01T10:00:00.000Z' }] },
  { id: 'photos', parentId: 'trips', updatedAt: '2026-10-02T10:00:00.000Z', items: [] },
  { id: 'raw', parentId: 'photos', updatedAt: null, items: [{ updatedAt: '2026-11-05T10:00:00.000Z' }] },
  { id: 'docs', parentId: 'trips', updatedAt: '2026-10-03T10:00:00.000Z' },
  { id: 'work', parentId: null, items: [] },
];

describe('folder tile stats', () => {
  it('counts direct subfolders only', () => {
    const counts = childFolderCounts(folders);
    expect(counts.get('trips')).toBe(2);
    expect(counts.get('photos')).toBe(1);
    expect(counts.get('raw')).toBeUndefined();
    expect(counts.get('work')).toBeUndefined();
  });

  it('takes the latest change from the folder, its documents and any subfolder below', () => {
    const latest = folderLatestChange(folders);
    expect(latest.get('trips')).toBe('2026-11-05T10:00:00.000Z');
    expect(latest.get('photos')).toBe('2026-11-05T10:00:00.000Z');
    expect(latest.get('docs')).toBe('2026-10-03T10:00:00.000Z');
    // Nothing with a date: no time to show.
    expect(latest.has('work')).toBe(false);
  });

  it('survives a parent cycle in broken data', () => {
    const latest = folderLatestChange([
      { id: 'a', parentId: 'b', updatedAt: '2026-11-01T00:00:00.000Z' },
      { id: 'b', parentId: 'a', updatedAt: '2026-11-02T00:00:00.000Z' },
    ]);
    expect(latest.get('a')).toBeDefined();
    expect(latest.get('b')).toBeDefined();
  });
});
