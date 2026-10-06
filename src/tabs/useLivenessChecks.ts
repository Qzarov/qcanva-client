import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useViewActivity } from '../composables/useViewActivity';
import type { LivenessResult } from '../composables/useCharacterSheetSocket';
import { tabsEnabled } from './flag';
import { useTab } from './tabContext';

/** How often the page on screen re-checks its socket. Sleeping pages are checked when shown. */
export const LIVENESS_INTERVAL_MS = 30_000;

/**
 * When to check that a page's socket is really alive (docs/app-tabs-plan.md,
 * "Проверки связи"): when the page is shown, when the app comes back from the
 * background, when the network returns, and every 30 s for the page on
 * screen. Tab mode only - without it pages never sleep and nothing changes.
 * `onStale` runs when the server is ahead and the page must resync itself.
 */
export function useLivenessChecks(probe: () => Promise<LivenessResult>, onStale?: () => void) {
  if (!tabsEnabled()) return;
  const tab = useTab();
  let timer: ReturnType<typeof setInterval> | null = null;
  let appListener: PluginListenerHandle | null = null;
  let running = false;

  const check = async () => {
    if (running) return;
    running = true;
    try {
      const result = await probe();
      if (result === 'reconnecting') tab.setStatus('reconnecting');
      if (result === 'stale') onStale?.();
    } finally {
      running = false;
    }
  };
  const onOnline = () => { void check(); };

  useViewActivity({
    onShow: () => {
      void check();
      timer = setInterval(() => { void check(); }, LIVENESS_INTERVAL_MS);
      window.addEventListener('online', onOnline);
      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); })
          .then((handle) => { appListener = handle; });
      }
    },
    onHide: () => {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener('online', onOnline);
      void appListener?.remove();
      appListener = null;
    },
  });
}
