import { computed } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';

/**
 * Query parameter carrying the canvas a document was opened from, so the
 * document's "back" button returns to that canvas instead of the dashboard.
 */
export const CANVAS_ORIGIN_QUERY = 'fromCanvas';

export type ResourceBackTarget = { to: RouteLocationRaw; label: string };

const DASHBOARD_TARGET: ResourceBackTarget = { to: { name: 'dashboard' }, label: 'Назад' };

/**
 * Resolve where "back" should go. The value comes from the URL, so it is only
 * ever used as a single canvas id path segment — never as a raw destination.
 */
export function resolveBackTarget(fromCanvas: unknown): ResourceBackTarget {
  const canvasId = typeof fromCanvas === 'string' ? fromCanvas.trim() : '';
  if (!canvasId || canvasId.includes('/') || canvasId.includes('\\')) {
    return DASHBOARD_TARGET;
  }
  return { to: `/canvas/${encodeURIComponent(canvasId)}`, label: 'Назад к канвасу' };
}

export function useResourceBackTarget() {
  const route = useRoute();
  // route.query is always present with a real router, but stay defensive so a
  // partially-shaped route can never break rendering of the whole page.
  const backTarget = computed(() => resolveBackTarget(route.query?.[CANVAS_ORIGIN_QUERY]));
  return { backTarget };
}
