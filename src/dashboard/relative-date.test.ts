import { describe, expect, it } from 'vitest';
import { formatRelativeDate } from './relative-date';

const NOW = new Date('2026-05-26T14:53:00');

describe('formatRelativeDate', () => {
  it('shows "just now" for anything under a minute old', () => {
    expect(formatRelativeDate(new Date('2026-05-26T14:52:40').toISOString(), 'en', NOW)).toBe('just now');
    expect(formatRelativeDate(new Date('2026-05-26T14:52:40').toISOString(), 'ru', NOW)).toBe('только что');
  });

  it('shows minutes ago under an hour old', () => {
    expect(formatRelativeDate(new Date('2026-05-26T14:41:00').toISOString(), 'en', NOW)).toBe('12 min ago');
    expect(formatRelativeDate(new Date('2026-05-26T14:41:00').toISOString(), 'ru', NOW)).toBe('12 мин назад');
  });

  it('shows "Today · HH:MM" for the same calendar day, an hour or more ago', () => {
    expect(formatRelativeDate(new Date('2026-05-26T09:05:00').toISOString(), 'en', NOW)).toBe('Today · 09:05');
    expect(formatRelativeDate(new Date('2026-05-26T09:05:00').toISOString(), 'ru', NOW)).toBe('Сегодня · 09:05');
  });

  it('shows "Yesterday · HH:MM" for the previous calendar day', () => {
    expect(formatRelativeDate(new Date('2026-05-25T18:42:00').toISOString(), 'en', NOW)).toBe('Yesterday · 18:42');
    expect(formatRelativeDate(new Date('2026-05-25T18:42:00').toISOString(), 'ru', NOW)).toBe('Вчера · 18:42');
  });

  it('falls back to an absolute compact date beyond yesterday', () => {
    expect(formatRelativeDate(new Date('2026-05-20T14:53:00').toISOString(), 'en', NOW)).toBe('20 May · 14:53');
    expect(formatRelativeDate(new Date('2026-05-20T14:53:00').toISOString(), 'ru', NOW)).toBe('20 мая · 14:53');
  });

  it('treats a future timestamp (clock skew) as "just now" instead of a negative duration', () => {
    expect(formatRelativeDate(new Date('2026-05-26T14:53:30').toISOString(), 'en', NOW)).toBe('just now');
  });

  it('returns an empty string for a missing or invalid timestamp rather than throwing', () => {
    expect(formatRelativeDate('', 'en', NOW)).toBe('');
    expect(formatRelativeDate(undefined as unknown as string, 'en', NOW)).toBe('');
  });
});
