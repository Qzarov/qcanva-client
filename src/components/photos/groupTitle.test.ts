import { describe, expect, it } from 'vitest';
import type { FeedItem } from '../../api/photos';
import {
  compareFolderHierarchy,
  folderHierarchySortKey,
  formatDuration,
  groupKeysForItem,
  groupTitle,
  parseDateKey,
} from './groupTitle';

describe('groupTitle', () => {
  it('formats ru dates', () => {
    expect(groupTitle('date', { key: '2026-10' }, 'month', 'ru').title).toBe('Октябрь 2026');
    expect(groupTitle('date', { key: '2024-08-17' }, 'day', 'ru').title).toBe('17 августа 2024, сб');
    expect(groupTitle('date', { key: '2025' }, 'year', 'ru').title).toBe('2025');
  });

  it('formats en dates', () => {
    expect(groupTitle('date', { key: '2026-10' }, 'month', 'en').title).toBe('October 2026');
    expect(groupTitle('date', { key: '2024-08-17' }, 'day', 'en').title).toBe('August 17, 2024, Sat');
  });

  it('falls back to the raw key for unknown date keys', () => {
    expect(groupTitle('date', { key: 'undated' }, 'month', 'ru').title).toBe('undated');
    expect(parseDateKey('undated')).toBeNull();
  });

  it('folder shows the full slash-separated path directly in title without duplicating secondary', () => {
    const g = { key: 'f1', folder: { name: 'Алтай', path: ['Поездки', 'Алтай'] } };
    expect(groupTitle('folder', g, 'month', 'ru')).toEqual({
      title: 'Поездки / Алтай',
      isFolder: true,
    });
    expect(
      groupTitle('folder', { key: 'f-day1', folder: { name: 'День 1', path: ['ОКО ЗА ОКУ', 'День 1'] } }, 'month', 'ru'),
    ).toEqual({
      title: 'ОКО ЗА ОКУ / День 1',
      isFolder: true,
    });
    const top = groupTitle('folder', { key: 'f2', folder: { name: 'Камера', path: ['Камера'] } }, 'month', 'ru');
    expect(top.secondary).toBeUndefined();
    expect(groupTitle('folder', { key: 'root' }, 'month', 'ru').title).toBe('Корень диска');
  });

  it('folderHierarchySortKey and compareFolderHierarchy keep parent folders and subfolders strictly contiguous', () => {
    expect(folderHierarchySortKey({ name: 'День 1', path: ['ОКО ЗА ОКУ', 'День 1'] })).toBe(
      'ОКО ЗА ОКУ\u0000День 1',
    );
    expect(folderHierarchySortKey({ name: 'Камера', path: [] }, 'f2')).toBe('Камера');
    expect(folderHierarchySortKey(null, 'fallback')).toBe('fallback');

    const paths = [
      ['Фотокамера'],
      ['ОКО ЗА ОКУ', 'Финал'],
      ['ОКО ЗА ОКУ', 'День 1'],
      ['МСТА 2026'],
      ['ОКО ЗА ОКУ', 'Сплав'],
      ['ОКО ЗА ОКУ'],
      ['ОКО ЗА ОКУ', 'Аня'],
    ];

    const asc = [...paths].sort((a, b) => compareFolderHierarchy(a, b, false)).map((p) => p.join(' / '));
    expect(asc).toEqual([
      'МСТА 2026',
      'ОКО ЗА ОКУ',
      'ОКО ЗА ОКУ / Аня',
      'ОКО ЗА ОКУ / День 1',
      'ОКО ЗА ОКУ / Сплав',
      'ОКО ЗА ОКУ / Финал',
      'Фотокамера',
    ]);

    const desc = [...paths].sort((a, b) => compareFolderHierarchy(a, b, true)).map((p) => p.join(' / '));
    expect(desc).toEqual([
      'Фотокамера',
      'ОКО ЗА ОКУ',
      'ОКО ЗА ОКУ / Аня',
      'ОКО ЗА ОКУ / День 1',
      'ОКО ЗА ОКУ / Сплав',
      'ОКО ЗА ОКУ / Финал',
      'МСТА 2026',
    ]);

    expect(compareFolderHierarchy(['ОКО ЗА ОКУ', 'День 2'], ['ОКО ЗА ОКУ', 'День 10'])).toBeLessThan(0);
    expect(compareFolderHierarchy(['око за оку'], ['ОКО ЗА ОКУ', 'Аня'], true)).toBeLessThan(0);
  });

  it('album and size buckets', () => {
    expect(groupTitle('album', { key: 'a1', album: { name: 'Лето' } }, 'month', 'ru').title).toBe('Лето');
    expect(groupTitle('album', { key: 'none' }, 'month', 'ru').title).toBe('Без альбома');
    expect(groupTitle('size', { key: 'gt50' }, 'month', 'ru').title).toBe('Больше 50 МБ');
    expect(groupTitle('size', { key: '10to50' }, 'month', 'ru').title).toBe('10–50 МБ');
    expect(groupTitle('size', { key: '3to10' }, 'month', 'ru').title).toBe('3–10 МБ');
    expect(groupTitle('size', { key: 'lt3' }, 'month', 'ru').title).toBe('Меньше 3 МБ');
    expect(groupTitle('size', { key: 'lt3' }, 'month', 'en').title).toBe('Under 3 MB');
  });

  it('maps an item to its group keys per level', () => {
    const item = {
      localTakenAt: '2024-08-17T10:00:00.000Z',
      takenAt: '2024-08-17T10:00:00.000Z',
      folderId: null,
      albumIds: [],
      bytes: 4_200_000,
    } as unknown as FeedItem;
    expect(groupKeysForItem(item, 'date', 'month')).toEqual(['2024-08']);
    expect(groupKeysForItem(item, 'date', 'day')).toEqual(['2024-08-17']);
    expect(groupKeysForItem(item, 'date', 'year')).toEqual(['2024']);
    expect(groupKeysForItem(item, 'folder', 'month')).toEqual(['root']);
    expect(groupKeysForItem(item, 'album', 'month')).toEqual(['none']);
    expect(groupKeysForItem(item, 'size', 'month')).toEqual(['3to10']);
  });

  it('formats video durations', () => {
    expect(formatDuration(42)).toBe('0:42');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(null)).toBe('');
  });
});
