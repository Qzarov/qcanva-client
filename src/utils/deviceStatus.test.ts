import { describe, expect, it } from 'vitest';
import {
  filesPluralKey,
  formatBytes,
  formatRelativeTime,
  summarizeFolders,
  syncStateKey,
} from './deviceStatus';

describe('syncStateKey', () => {
  it('maps the four agent states and treats anything else as no data', () => {
    for (const state of ['synced', 'syncing', 'paused', 'error'] as const) {
      expect(syncStateKey({ syncStatus: { state } })).toBe(state);
    }
    expect(syncStateKey({ syncStatus: null })).toBe('nodata');
    expect(syncStateKey({})).toBe('nodata');
    expect(syncStateKey({ syncStatus: { state: 'weird' } })).toBe('nodata');
  });
});

describe('filesPluralKey', () => {
  it('uses ru one/few/many', () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => filesPluralKey(n, 'ru'))).toEqual([
      'one', 'few', 'many', 'many', 'one', 'few', 'many',
    ]);
  });
  it('uses en one/many(other)', () => {
    expect([1, 2, 0].map((n) => filesPluralKey(n, 'en'))).toEqual(['one', 'many', 'many']);
  });
});

describe('formatBytes', () => {
  it('formats compactly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(12 * 1024 ** 3)).toBe('12 GB');
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  it('is empty for missing or invalid dates', () => {
    expect(formatRelativeTime(null, 'en', now)).toBe('');
    expect(formatRelativeTime('nope', 'en', now)).toBe('');
  });
  it('picks the unit by distance', () => {
    expect(formatRelativeTime('2026-10-20T11:55:00.000Z', 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-10-20T09:00:00.000Z', 'en', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-10-18T12:00:00.000Z', 'en', now)).toBe('2 days ago');
    expect(formatRelativeTime('2026-10-20T11:59:50.000Z', 'en', now)).toBe('now');
  });
  it('speaks russian', () => {
    expect(formatRelativeTime('2026-10-20T11:55:00.000Z', 'ru', now)).toBe('5 минут назад');
  });
});

describe('summarizeFolders', () => {
  it('has no data when the hub sends no folders field', () => {
    expect(summarizeFolders({}).rootCaption).toBe('nodata');
  });

  it('root none: selected folders only, full before on demand, in hub order', () => {
    const v = summarizeFolders({
      folders: [
        { folderId: null, name: null, mode: 'none' },
        { folderId: 'a', name: 'Photos', mode: 'full' },
        { folderId: 'b', name: 'Archive', mode: 'on_demand' },
        { folderId: 'c', name: 'Docs', mode: 'full' },
        { folderId: 'd', name: 'Skip', mode: 'none' },
      ],
    });
    expect(v.rootCaption).toBe('selected');
    expect(v.full.map((f) => f.name)).toEqual(['Photos', 'Docs']);
    expect(v.onDemand.map((f) => f.name)).toEqual(['Archive']);
    expect(v.empty).toBe(false);
  });

  it('root none with nothing selected is empty', () => {
    expect(summarizeFolders({ folders: [{ folderId: null, name: null, mode: 'none' }] }).empty).toBe(true);
    expect(summarizeFolders({ folders: [] , defaultMode: undefined}).empty).toBe(true);
  });

  it('root full is the whole drive and hides redundant full folders', () => {
    const v = summarizeFolders({
      folders: [
        { folderId: null, name: null, mode: 'full' },
        { folderId: 'a', name: 'Photos', mode: 'full' },
        { folderId: 'b', name: 'Archive', mode: 'on_demand' },
      ],
    });
    expect(v.rootCaption).toBe('all');
    expect(v.full).toEqual([]);
    expect(v.onDemand.map((f) => f.name)).toEqual(['Archive']);
    expect(v.empty).toBe(false);
  });

  it('without a root rule the hub default mode decides', () => {
    expect(summarizeFolders({ folders: [], defaultMode: 'full' }).rootCaption).toBe('all');
    expect(summarizeFolders({ folders: [], defaultMode: 'on_demand' }).rootCaption).toBe('all_on_demand');
  });

  it('keeps a folder with a null name so the view can say it is unavailable', () => {
    const v = summarizeFolders({
      folders: [
        { folderId: null, name: null, mode: 'none' },
        { folderId: 'gone', name: null, mode: 'full' },
      ],
    });
    expect(v.full).toEqual([{ key: 'gone', name: null }]);
  });
});
