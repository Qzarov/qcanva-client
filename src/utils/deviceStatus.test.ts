// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  filesPluralKey,
  formatBytes,
  formatRelativeTime,
  effectiveFolderMode,
  topFolderStatus,
  syncStateKey,
  countKeptFolders,
  formatDuration,
  formatFiles,
  plainError,
  pendingSplit,
  rootFilesStatus,
} from './deviceStatus';
import { useI18n } from '../composables/useI18n';

const { t, setLocale } = useI18n();

describe('syncStateKey', () => {
  it('maps the agent states and treats anything else as no data', () => {
    for (const state of ['synced', 'syncing', 'paused', 'error'] as const) {
      expect(syncStateKey({ syncStatus: { state } })).toBe(state);
    }
    expect(syncStateKey({ syncStatus: { state: 'logged_out' } })).toBe('logged_out');
    expect(syncStateKey({ syncStatus: null })).toBe('nodata');
    expect(syncStateKey({})).toBe('nodata');
    expect(syncStateKey({ syncStatus: { state: 'weird' } })).toBe('nodata');
  });
});

describe('syncStateKey: waiting for offline devices', () => {
  it('knows the waiting state', () => {
    expect(syncStateKey({ syncStatus: { state: 'waiting', pendingFiles: 2, blockedFiles: 2 } })).toBe('waiting');
  });
  it('shows syncing as waiting when every pending file is blocked, but not when some still move', () => {
    expect(syncStateKey({ syncStatus: { state: 'syncing', pendingFiles: 4, blockedFiles: 4 } })).toBe('waiting');
    expect(syncStateKey({ syncStatus: { state: 'syncing', pendingFiles: 4, blockedFiles: 9 } })).toBe('waiting');
    expect(syncStateKey({ syncStatus: { state: 'syncing', pendingFiles: 4, blockedFiles: 1 } })).toBe('syncing');
    // Older agents send no blocked counts.
    expect(syncStateKey({ syncStatus: { state: 'syncing', pendingFiles: 4 } })).toBe('syncing');
    expect(syncStateKey({ syncStatus: { state: 'syncing', pendingFiles: 0, blockedFiles: 0 } })).toBe('syncing');
  });
  it('splits pending into moving and blocked, clamping blocked to pending', () => {
    expect(pendingSplit({ syncStatus: { state: 'syncing', pendingFiles: 5, pendingBytes: 500, blockedFiles: 2, blockedBytes: 200 } })).toEqual({
      files: 5, bytes: 500, blockedFiles: 2, blockedBytes: 200, movingFiles: 3, movingBytes: 300,
    });
    expect(pendingSplit({ syncStatus: { state: 'syncing', pendingFiles: 2, pendingBytes: 50, blockedFiles: 7, blockedBytes: 99 } })).toMatchObject({
      blockedFiles: 2, blockedBytes: 50, movingFiles: 0, movingBytes: 0,
    });
    expect(pendingSplit({})).toMatchObject({ files: 0, blockedFiles: 0, movingFiles: 0 });
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

const rule = (folderId: string | null, mode: 'full' | 'on_demand' | 'none', extra = {}) => ({
  folderId,
  name: folderId,
  mode,
  ...extra,
});

describe('effectiveFolderMode', () => {
  it('uses the own rule first', () => {
    const device = { defaultMode: 'full' as const, folders: [rule(null, 'none'), rule('a', 'on_demand')] };
    expect(effectiveFolderMode(device, 'a')).toEqual({ mode: 'on_demand', reason: 'own' });
  });

  it('falls back to the root rule: root none means not synced', () => {
    const device = { defaultMode: 'full' as const, folders: [rule(null, 'none'), rule('a', 'full')] };
    expect(effectiveFolderMode(device, 'b')).toEqual({ mode: 'none', reason: 'root' });
  });

  it('falls back to the device default without a root rule', () => {
    expect(effectiveFolderMode({ defaultMode: 'on_demand', folders: [] }, 'a')).toEqual({
      mode: 'on_demand',
      reason: 'default',
    });
    expect(effectiveFolderMode({ defaultMode: 'full', folders: [rule('b', 'none')] }, 'a')).toEqual({
      mode: 'full',
      reason: 'default',
    });
  });
});

describe('topFolderStatus', () => {
  it('has no data when the hub sends no folders field', () => {
    expect(topFolderStatus({}, 'a')).toBeNull();
  });

  it('reports full, on demand and none from the effective mode', () => {
    const device = {
      defaultMode: 'full' as const,
      folders: [rule(null, 'none'), rule('a', 'full'), rule('b', 'on_demand')],
    };
    expect(topFolderStatus(device, 'a')?.status).toBe('full');
    expect(topFolderStatus(device, 'b')?.status).toBe('on_demand');
    expect(topFolderStatus(device, 'c')?.status).toBe('none');
  });

  it('is partial when a nested rule is synced more than a none folder (via topFolderId)', () => {
    const device = {
      defaultMode: 'full' as const,
      folders: [
        rule(null, 'none'),
        rule('deep', 'full', { topFolderId: 'work', path: ['Work', '2026', 'Reports'] }),
      ],
    };
    const st = topFolderStatus(device, 'work')!;
    expect(st.status).toBe('partial');
    expect(st.mode).toBe('none');
    expect(st.reason).toBe('root');
    expect(st.nested).toEqual([{ folderId: 'deep', mode: 'full', path: ['Work', '2026', 'Reports'] }]);
  });

  it('is partial for an on-demand folder with a full rule inside, but not with a none rule inside', () => {
    const base = [rule(null, 'none'), rule('work', 'on_demand')];
    const full = { folders: [...base, rule('x', 'full', { topFolderId: 'work', path: ['Work', 'X'] })] };
    const none = { folders: [...base, rule('x', 'none', { topFolderId: 'work', path: ['Work', 'X'] })] };
    expect(topFolderStatus(full, 'work')?.status).toBe('partial');
    expect(topFolderStatus(none, 'work')?.status).toBe('on_demand');
  });

  it('a full folder stays full even with nested rules', () => {
    const device = {
      folders: [rule('work', 'full'), rule('x', 'on_demand', { topFolderId: 'work', path: ['Work', 'X'] })],
    };
    const st = topFolderStatus(device, 'work')!;
    expect(st.status).toBe('full');
    expect(st.nested).toHaveLength(1);
  });

  it('an older hub without topFolderId gives no partial', () => {
    const device = { folders: [rule(null, 'none'), rule('deep', 'full')] };
    const st = topFolderStatus(device, 'work')!;
    expect(st.status).toBe('none');
    expect(st.nested).toEqual([]);
  });

  it('a rule of another top-level folder does not count', () => {
    const device = {
      folders: [rule(null, 'none'), rule('deep', 'full', { topFolderId: 'other', path: ['Other', 'D'] })],
    };
    expect(topFolderStatus(device, 'work')?.status).toBe('none');
  });
});

describe('formatDuration', () => {
  it('speaks in plain units, rounded up to the minute and to hours/days after', () => {
    setLocale('en');
    expect(formatDuration(20_000, 'en', t)).toBe('less than a minute');
    expect(formatDuration(150_000, 'en', t)).toBe('3 minutes');
    expect(formatDuration(2 * 3600_000, 'en', t)).toBe('2 hours');
    expect(formatDuration(3 * 86400_000, 'en', t)).toBe('3 days');
  });

  it('uses ru plural forms', () => {
    setLocale('ru');
    expect(formatDuration(20_000, 'ru', t)).toBe('меньше минуты');
    expect(formatDuration(60_000, 'ru', t)).toBe('1 минута');
    expect(formatDuration(150_000, 'ru', t)).toBe('3 минуты');
    expect(formatDuration(10 * 60_000, 'ru', t)).toBe('10 минут');
    expect(formatDuration(2 * 3600_000, 'ru', t)).toBe('2 часа');
    setLocale('en');
  });
});

describe('formatFiles', () => {
  it('picks the plural form of the language', () => {
    setLocale('ru');
    expect([1, 2, 5, 21, 11].map((n) => formatFiles(n, 'ru', t))).toEqual([
      '1 файл',
      '2 файла',
      '5 файлов',
      '21 файл',
      '11 файлов',
    ]);
    setLocale('en');
    expect([1, 2].map((n) => formatFiles(n, 'en', t))).toEqual(['1 file', '2 files']);
  });
});

describe('countKeptFolders', () => {
  const device = {
    defaultMode: 'full' as const,
    folders: [
      { folderId: null, name: null, mode: 'none' as const },
      { folderId: 'a', name: 'A', mode: 'full' as const },
      { folderId: 'b', name: 'B', mode: 'on_demand' as const },
      { folderId: 'c2', name: 'C2', mode: 'full' as const, topFolderId: 'c', path: ['C', 'C2'] },
    ],
  };

  it('counts folders kept in full; partial ones apart; on-demand and server-only are not kept', () => {
    expect(countKeptFolders(device, ['a', 'b', 'c', 'd'])).toEqual({ total: 4, full: 1, partial: 1 });
  });

  it('is null when the hub sent no rules', () => {
    expect(countKeptFolders({ defaultMode: 'full' }, ['a'])).toBeNull();
  });
});

describe('plainError', () => {
  it('translates the obvious agent errors and passes the rest through', () => {
    setLocale('en');
    expect(plainError('write failed: No space left on device (os error 28)', t)).toBe('The disk is full');
    expect(plainError('Permission denied (os error 13)', t)).toBe('No access to the Q Space folder');
    expect(plainError('connection refused', t)).toBe('Cannot reach the server');
    expect(plainError('weird failure 42', t)).toBe('weird failure 42');
    expect(plainError(null, t)).toBe('');
  });
});

describe('rootFilesStatus', () => {
  it('uses node.rootFiles if explicitly set', () => {
    expect(rootFilesStatus({ rootFiles: 'full', folders: [{ folderId: null, name: null, mode: 'none' }] })).toEqual({
      status: 'full',
      mode: 'full',
      reason: 'own',
    });
    expect(rootFilesStatus({ rootFiles: 'on_demand', folders: [{ folderId: null, name: null, mode: 'full' }] })).toEqual({
      status: 'on_demand',
      mode: 'on_demand',
      reason: 'own',
    });
  });

  it('falls back to the device root rule when rootFiles is null or absent', () => {
    expect(rootFilesStatus({ rootFiles: null, folders: [{ folderId: null, name: null, mode: 'none' }] })).toEqual({
      status: 'none',
      mode: 'none',
      reason: 'root',
    });
    expect(rootFilesStatus({ folders: [{ folderId: null, name: null, mode: 'full' }] })).toEqual({
      status: 'full',
      mode: 'full',
      reason: 'root',
    });
  });

  it('falls back to defaultMode when no root rule and no rootFiles', () => {
    expect(rootFilesStatus({ defaultMode: 'on_demand', folders: [] })).toEqual({
      status: 'on_demand',
      mode: 'on_demand',
      reason: 'default',
    });
  });
});
