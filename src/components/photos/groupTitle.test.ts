import { describe, expect, it } from 'vitest';
import type { FeedItem } from '../../api/photos';
import {
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

  it('folder shows the last path segment and the full path as secondary', () => {
    const g = { key: 'f1', folder: { name: 'Алтай', path: ['Поездки', 'Алтай'] } };
    expect(groupTitle('folder', g, 'month', 'ru')).toEqual({
      title: 'Алтай',
      secondary: 'Поездки / Алтай',
      isFolder: true,
    });
    const top = groupTitle('folder', { key: 'f2', folder: { name: 'Камера', path: ['Камера'] } }, 'month', 'ru');
    expect(top.secondary).toBeUndefined();
    expect(groupTitle('folder', { key: 'root' }, 'month', 'ru').title).toBe('Корень диска');
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
