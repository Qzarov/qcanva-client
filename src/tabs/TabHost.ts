import { computed, defineComponent, provide, shallowReactive, watch, type Component } from 'vue';
import { routeLocationKey, useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import { tabKeyFor } from './registry';
import { createTabContext, TAB_CONTEXT } from './tabContext';

/**
 * One wrapper component per tab, each with its own name, so that
 * <KeepAlive :include> keeps exactly the tabs the registry says are live and
 * drops one by removing its name - KeepAlive's own `max` would evict with no
 * regard for unsent edits.
 *
 * The wrapper also gives the page beneath it its own route: a copy that
 * follows the real one only while this tab is on screen. A sleeping canvas
 * then never sees the navigation to another canvas and never reloads into it.
 * `useRoute()` is `inject(routeLocationKey)`, so every call below - the page,
 * AccessGate, useResourceBackTarget - picks the copy up unchanged.
 */
const hosts = new Map<string, Component>();

export const hostName = (key: string) => `TabHost_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;

export function hostFor(key: string): Component {
  const existing = hosts.get(key);
  if (existing) return existing;
  const host = defineComponent({
    name: hostName(key),
    setup(_, { slots }) {
      const real = useRoute();
      const ownsRoute = () => tabKeyFor(real) === key;
      const frozen = shallowReactive({ ...real }) as RouteLocationNormalizedLoaded;
      watch(() => real.fullPath, () => {
        if (ownsRoute()) Object.assign(frozen, real);
      });
      provide(routeLocationKey, frozen);
      provide(TAB_CONTEXT, createTabContext(key, computed(() => ownsRoute())));
      return () => slots.default?.();
    },
  });
  hosts.set(key, host);
  return host;
}

/** Forgets a closed tab's wrapper (its page is already gone from KeepAlive). */
export const forgetHost = (key: string) => { hosts.delete(key); };
