import { isAuthenticated, recentResources } from '../api/client';

export type RecentResourceType = 'canvas' | 'html-document' | 'text-document' | 'interactive-template';

/** Same resource marked again within this window is the same visit (a resync re-runs load). */
const REPEAT_WINDOW_MS = 30_000;
let lastMarked: { key: string; at: number } | null = null;

/**
 * Records that the signed-in user opened a resource - wherever it was opened
 * from (the dashboard, a link, a canvas embed, a mention, the Android app) -
 * so Recents are the same on every device. It used to be recorded only by a
 * click on the dashboard itself.
 *
 * `id` must be the resource's real id, never a slug: the server keys entries
 * by it. Fire-and-forget: a failed write never blocks opening the resource,
 * and an anonymous viewer of a public link has no Recents to write to.
 */
export function markResourceOpened(type: RecentResourceType, id: string | null | undefined): void {
  // Even a synchronous failure here must never break opening the resource.
  try {
    if (!id || !isAuthenticated()) return;
    const key = `${type}:${id}`;
    const now = Date.now();
    if (lastMarked && lastMarked.key === key && now - lastMarked.at < REPEAT_WINDOW_MS) return;
    lastMarked = { key, at: now };
    void Promise.resolve(recentResources.markOpened(type, id)).catch(() => {});
  } catch {
    // Nothing to do: Recents are a convenience, the resource is what matters.
  }
}

/** Test hook: forget the last marked resource. */
export function resetRecentResourceMarks(): void {
  lastMarked = null;
}
