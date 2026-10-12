import { closeTab, tabKeyForResource, type TabType } from './registry';
import { forgetHost } from './TabHost';

/**
 * A resource is gone (deleted here, or not found when its page loaded): its
 * tab leaves the list - otherwise it stays there, restored after every
 * restart, pointing at nothing.
 */
export function forgetResourceTab(type: TabType, id: string) {
  const key = tabKeyForResource(type, id);
  if (!key) return;
  closeTab(key);
  forgetHost(key);
}
