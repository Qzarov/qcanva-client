/**
 * In-app handling of the Android system Back button.
 *
 * main.ts's Capacitor backButton listener asks these handlers first - the
 * most recently registered one first - and only falls back to its own
 * routing ("resource -> dashboard", then "exit?") when none of them handled
 * it. That lets a screen whose navigation is component state rather than
 * routes (the dashboard's folders) step back within itself instead of
 * offering to close the app.
 */

import { useViewActivity } from './useViewActivity';

/** Returns true when it handled the Back press. */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** True if some registered handler took care of the Back press. */
export function runBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!()) return true;
  }
  return false;
}

/**
 * Registers `handler` while the calling component is on screen: mounted, and
 * in tab mode also not asleep in a background tab - a hidden page must not
 * answer the system Back.
 */
export function useBackHandler(handler: BackHandler): void {
  let unregister: (() => void) | null = null;
  useViewActivity({
    onShow: () => { unregister = registerBackHandler(handler); },
    onHide: () => { unregister?.(); unregister = null; },
  });
}
