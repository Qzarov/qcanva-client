import type { UiLocale } from '../composables/useI18n';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Compact card date: relative for anything from the last day, an absolute
 * "25 May · 14:53"-style fallback beyond that. `now` is injectable so tests
 * don't depend on the system clock.
 */
export function formatRelativeDate(iso: string, locale: UiLocale, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Math.max(0, now.getTime() - then.getTime());

  if (diffMs < MINUTE_MS) {
    return locale === 'ru' ? 'только что' : 'just now';
  }
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return locale === 'ru' ? `${minutes} мин назад` : `${minutes} min ago`;
  }
  if (isSameCalendarDay(then, now)) {
    return `${locale === 'ru' ? 'Сегодня' : 'Today'} · ${formatTime(then)}`;
  }
  if (isSameCalendarDay(then, addDays(now, -1))) {
    return `${locale === 'ru' ? 'Вчера' : 'Yesterday'} · ${formatTime(then)}`;
  }
  // Russian day+month formatting is genitive ("20 мая") and already day-first,
  // so it can be asked for directly; en-US's combined form comes out
  // month-first ("May 20"), so the day is placed by hand instead.
  const day = locale === 'ru'
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(then)
    : `${then.getDate()} ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(then)}`;
  return `${day} · ${formatTime(then)}`;
}
