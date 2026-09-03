import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';

/**
 * Query parameter carrying the canvas a document was opened from, so the
 * document's "back" button returns to that canvas instead of the dashboard.
 */
export const CANVAS_ORIGIN_QUERY = 'fromCanvas';
export const DASHBOARD_FOLDER_QUERY = 'folder';

export type ResourceBackTarget = { to: RouteLocationRaw; label: string };

const DASHBOARD_TARGET: ResourceBackTarget = { to: { name: 'dashboard' }, label: 'Назад' };

function dashboardTarget(folderId: unknown): ResourceBackTarget {
  const folder = typeof folderId === 'string' ? folderId.trim() : '';
  if (!folder || folder.includes('/') || folder.includes('\\')) return DASHBOARD_TARGET;
  return {
    to: { name: 'dashboard', query: { [DASHBOARD_FOLDER_QUERY]: folder } },
    label: 'Назад',
  };
}

/**
 * Resolve where "back" should go. The value comes from the URL, so it is only
 * ever used as a single canvas id path segment — never as a raw destination.
 */
export function resolveBackTarget(fromCanvas: unknown, folderId?: unknown): ResourceBackTarget {
  const canvasId = typeof fromCanvas === 'string' ? fromCanvas.trim() : '';
  if (!canvasId || canvasId.includes('/') || canvasId.includes('\\')) {
    return dashboardTarget(folderId);
  }
  return { to: `/canvas/${encodeURIComponent(canvasId)}`, label: 'Назад к канвасу' };
}

export function useResourceBackTarget(folderId?: MaybeRefOrGetter<unknown>) {
  const route = useRoute();
  // route.query is always present with a real router, but stay defensive so a
  // partially-shaped route can never break rendering of the whole page.
  const backTarget = computed(() => resolveBackTarget(
    route.query?.[CANVAS_ORIGIN_QUERY],
    folderId === undefined ? undefined : toValue(folderId),
  ));
  return { backTarget };
}
