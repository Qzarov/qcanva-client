import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import { useI18n } from './useI18n';

/**
 * Query parameter carrying the canvas a document was opened from, so the
 * document's "back" button returns to that canvas instead of the dashboard.
 */
export const CANVAS_ORIGIN_QUERY = 'fromCanvas';
export const DASHBOARD_FOLDER_QUERY = 'folder';

/**
 * The resolver stays free of the translation layer and hands back a KEY, so it
 * remains a pure function of the URL and testable without a Vue context. Only
 * `useResourceBackTarget` — which already needs one — turns it into text.
 */
export type ResourceBackTargetRoute = { to: RouteLocationRaw; labelKey: 'back' | 'backToCanvas' };
export type ResourceBackTarget = { to: RouteLocationRaw; label: string };

const DASHBOARD_TARGET: ResourceBackTargetRoute = {
  to: { name: 'dashboard' },
  labelKey: 'back',
};

function dashboardTarget(folderId: unknown): ResourceBackTargetRoute {
  const folder = typeof folderId === 'string' ? folderId.trim() : '';
  if (!folder || folder.includes('/') || folder.includes('\\')) return DASHBOARD_TARGET;
  return {
    to: { name: 'dashboard', query: { [DASHBOARD_FOLDER_QUERY]: folder } },
    labelKey: 'back',
  };
}

/**
 * Resolve where "back" should go. The value comes from the URL, so it is only
 * ever used as a single canvas id path segment — never as a raw destination.
 */
export function resolveBackTarget(fromCanvas: unknown, folderId?: unknown): ResourceBackTargetRoute {
  const canvasId = typeof fromCanvas === 'string' ? fromCanvas.trim() : '';
  if (!canvasId || canvasId.includes('/') || canvasId.includes('\\')) {
    return dashboardTarget(folderId);
  }
  return { to: `/canvas/${encodeURIComponent(canvasId)}`, labelKey: 'backToCanvas' };
}

export function useResourceBackTarget(folderId?: MaybeRefOrGetter<unknown>) {
  const route = useRoute();
  const { t } = useI18n();
  // route.query is always present with a real router, but stay defensive so a
  // partially-shaped route can never break rendering of the whole page.
  const backTarget = computed<ResourceBackTarget>(() => {
    const target = resolveBackTarget(
      route.query?.[CANVAS_ORIGIN_QUERY],
      folderId === undefined ? undefined : toValue(folderId),
    );
    return { to: target.to, label: t(target.labelKey) };
  });
  return { backTarget };
}
