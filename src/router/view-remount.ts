import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * Which views must be REMOUNTED when the path changes under them.
 *
 * Vue Router reuses one component instance across a same-route parameter
 * change (/docs/a -> /docs/b). For most views that is right and cheap. For a
 * text document it is wrong: the instance holds an editor, a Y.Doc and a
 * websocket built in `setup()` for one specific document, and none of it is
 * rebuilt by a parameter change - so "continue on a new page" would navigate
 * to the new document and leave the old one on screen.
 *
 * This is deliberately a NARROW list rather than a key on `<router-view>`
 * itself. Keying globally looks equivalent and is not: CanvasView,
 * HtmlDocumentView and TextDocumentView all canonicalise their own URL right
 * after loading (`if (route.params.id !== preferred) router.replace(...)`,
 * swapping the id for the slug), so a global key makes every slugged resource
 * remount immediately after it opens - tearing down and rebuilding the editor
 * for a visible flash and a refetch. On production that is roughly 40% of
 * canvases and of html documents, two views that have no business being
 * touched by a text-document change. They stay on the previous behaviour and
 * keep driving their own reloads from watchers.
 *
 * The same cost remains for a text document that HAS a slug: it canonicalises
 * too, so it remounts once right after opening. That is accepted, not
 * overlooked - it is one instance of a cost text documents must pay anyway to
 * get a correct navigation between two documents, and it is bounded to this
 * one view.
 */
export const REMOUNT_ON_PATH_CHANGE: ReadonlySet<string> = new Set(['text-document']);

/**
 * The `key` for the routed component, or `undefined` to leave Vue's default
 * reuse alone.
 *
 * PATH, never fullPath: the dashboard carries its filters in the query, and
 * keying on those would remount it on every filter click.
 */
export function viewKeyFor(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>,
): string | undefined {
  const name = typeof route.name === 'string' ? route.name : '';
  return REMOUNT_ON_PATH_CHANGE.has(name) ? route.path : undefined;
}
