import { LAYOUT } from '../composables/layoutMedia';

/**
 * How many cards a feed section shows before "Show all": whole rows of the
 * card grid, not a fixed count. Mirrors the grid in style.css:
 * `.dashboard .dash-grid` / `.dashboard-recents-grid` auto-fill 210px columns
 * with a 12px gap, and a fixed 2 columns at max-width 720px. In list view a
 * section shows as many rows as the grid would have cards, so switching the
 * view doesn't change what is listed.
 */
export const FEED_CARD_MIN_WIDTH = 210;
export const FEED_CARD_GAP = 12;
export const FEED_PHONE_QUERY = LAYOUT.dashboardPhone;
export const FEED_PHONE_COLUMNS = 2;
/** Before the feed has been measured (or with no layout at all, as in tests). */
export const FEED_FALLBACK_COLUMNS = 4;

export type FeedRowSection = 'recent' | 'shared' | 'interactive' | 'public';

/** One row for each section, four for Public. */
export const FEED_SECTION_ROWS: Record<FeedRowSection, number> = {
  recent: 1,
  shared: 1,
  interactive: 1,
  public: 4,
};

export function feedColumnCount(width: number, phone: boolean): number {
  if (phone) return FEED_PHONE_COLUMNS;
  if (!(width > 0)) return FEED_FALLBACK_COLUMNS;
  return Math.max(1, Math.floor((width + FEED_CARD_GAP) / (FEED_CARD_MIN_WIDTH + FEED_CARD_GAP)));
}

export function feedSectionLimit(section: FeedRowSection, columns: number): number {
  return Math.max(1, columns) * FEED_SECTION_ROWS[section];
}
