import { computed, inject, type ComputedRef, type InjectionKey } from 'vue';
import { closeTab, registerAlias, updateTab, type TabStatus } from './registry';

/**
 * What a page knows about the tab it lives in. Outside tab mode (the web,
 * or the flag off) every method is a no-op and the page is always active.
 */
export type TabContext = {
  key: string | null;
  /** True while this tab is the one on screen. */
  active: ComputedRef<boolean>;
  /** Another address of this resource (its real id, its slug). */
  registerAlias(alias: string): void;
  setTitle(title: string): void;
  setStatus(status: TabStatus): void;
  setUnsent(unsent: boolean): void;
  /** The resource is gone: drop this tab from the list. */
  forget(): void;
};

export const TAB_CONTEXT: InjectionKey<TabContext> = Symbol('tab-context');

const alwaysActive = computed(() => true);
const NO_TAB: TabContext = {
  key: null,
  active: alwaysActive,
  registerAlias: () => {},
  setTitle: () => {},
  setStatus: () => {},
  setUnsent: () => {},
  forget: () => {},
};

export const useTab = (): TabContext => inject(TAB_CONTEXT, NO_TAB);

/** `onForget`: what else goes with the tab (a kept-alive page's host). */
export function createTabContext(key: string, active: ComputedRef<boolean>, onForget?: () => void): TabContext {
  return {
    key,
    active,
    registerAlias: (alias) => registerAlias(key, alias),
    setTitle: (title) => updateTab(key, { title }),
    setStatus: (status) => updateTab(key, { status }),
    setUnsent: (unsent) => updateTab(key, { unsent }),
    forget: () => {
      closeTab(key);
      onForget?.();
    },
  };
}
