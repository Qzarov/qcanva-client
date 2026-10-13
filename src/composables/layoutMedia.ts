import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

/**
 * The app's named layout rules, in one place. They differ on purpose: each is
 * where its own UI stops fitting, not one "mobile" width for everything.
 * CSS can't read these, so the stylesheets repeat the same media text -
 * layoutMedia.test.ts fails when a rule here and its CSS twin drift apart.
 *
 * Screen size and input are separate questions: a tablet is wide and touch,
 * a narrow desktop window is small and mouse. Ask `COARSE_POINTER` for touch.
 */
export const BREAKPOINTS = {
  /** The canvas's phone layout: `.mobile-only` UI, bottom node toolbar, full-screen text editor. */
  canvasCompact: 640,
  /** Pages and panels go single-column: documents, settings, the D&D sheet. */
  phone: 760,
  /** The dashboard feed drops to two fixed columns and card menus become sheets. */
  dashboardPhone: 720,
  /** The dashboard sidebar becomes a drawer. */
  dashboardDrawer: 768,
  /** The document outline docks beside the text instead of opening over it. */
  outlineDocked: 1100,
} as const;

/** A phone held sideways is as short as it is narrow upright: the canvas treats both as compact. */
const CANVAS_LANDSCAPE_MAX_HEIGHT = 500;

export const LAYOUT = {
  canvasCompact: `(max-width: ${BREAKPOINTS.canvasCompact}px), (max-height: ${CANVAS_LANDSCAPE_MAX_HEIGHT}px) and (orientation: landscape)`,
  /** Exactly the complement of `canvasCompact`. */
  canvasWide: `(min-width: ${BREAKPOINTS.canvasCompact + 1}px) and (min-height: ${CANVAS_LANDSCAPE_MAX_HEIGHT + 1}px), (min-width: ${BREAKPOINTS.canvasCompact + 1}px) and (orientation: portrait)`,
  phone: `(max-width: ${BREAKPOINTS.phone}px)`,
  dashboardPhone: `(max-width: ${BREAKPOINTS.dashboardPhone}px)`,
  dashboardDrawer: `(max-width: ${BREAKPOINTS.dashboardDrawer}px)`,
  /** Exactly the complement of `dashboardDrawer`. */
  dashboardSidebarDocked: `(min-width: ${BREAKPOINTS.dashboardDrawer + 1}px)`,
  outlineDocked: `(min-width: ${BREAKPOINTS.outlineDocked}px)`,
} as const;

/** A finger is the main way in (a phone or a tablet), whatever the screen size. */
export const COARSE_POINTER = '(pointer: coarse)';

function mediaList(query: string): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  } catch {
    return null;
  }
}

/** Whether `query` matches right now; `false` where there is nothing to ask (tests, server). */
export function matchesMedia(query: string): boolean {
  return Boolean(mediaList(query)?.matches);
}

/** Follows `query`; stops listening when the calling component or scope goes away. */
export function useMediaQuery(query: string): Ref<boolean> {
  const list = mediaList(query);
  const matches = ref(Boolean(list?.matches));
  if (!list) return matches;
  const update = () => { matches.value = Boolean(list.matches); };
  list.addEventListener?.('change', update);
  if (getCurrentScope()) onScopeDispose(() => list.removeEventListener?.('change', update));
  return matches;
}
