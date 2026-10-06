<template>
  <!-- Tabs of open resources (Android app, behind a flag): pages that can
       sleep stay alive in <KeepAlive>, one named host per tab, so the include
       list decides exactly which ones. See src/tabs and docs/app-tabs-plan.md. -->
  <router-view v-if="tabMode" v-slot="{ Component, route }">
    <KeepAlive :include="liveHostNames">
      <component :is="hostOf(route)" :key="hostKey(route)">
        <component :is="Component" />
      </component>
    </KeepAlive>
  </router-view>
  <!-- Keyed on the PATH for the routes that need it, and only those: see
       router/view-remount.ts for which, and for why keying every route made
       slugged canvases and html documents remount right after opening. -->
  <router-view v-else v-slot="{ Component, route }">
    <component :is="Component" :key="viewKeyFor(route)" />
  </router-view>
  <ToastContainer />
</template>

<script lang="ts">
import { computed, defineComponent, type Component } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import ToastContainer from './components/ToastContainer.vue';
import { viewKeyFor } from './router/view-remount';
import { tabsEnabled } from './tabs/flag';
import { hostFor, hostName } from './tabs/TabHost';
import { installScrollMemory } from './tabs/scrollMemory';
import { isSleepReady, liveTabKeys, tabKeyFor, tabs } from './tabs/registry';

/** A plain pass-through for pages that are not tabs (or cannot sleep yet). */
const Passthrough: Component = { name: 'TabPassthrough', setup: (_: unknown, { slots }: any) => () => slots.default?.() };

export default defineComponent({
  components: { ToastContainer },
  setup() {
    const tabMode = tabsEnabled();
    if (tabMode) installScrollMemory();

    // Only pages that implement the sleep contract are hosted per tab and kept
    // alive; anything else gets a pass-through keyed on its path and remounts
    // on every visit, as it always has.
    const hostKey = (route: RouteLocationNormalizedLoaded) => {
      const key = isSleepReady(route) ? tabKeyFor(route) : null;
      return key ? `tab:${key}` : `page:${viewKeyFor(route) ?? String(route.name ?? route.path)}`;
    };
    const hostOf = (route: RouteLocationNormalizedLoaded) => {
      const key = isSleepReady(route) ? tabKeyFor(route) : null;
      return key ? hostFor(key) : Passthrough;
    };
    const liveHostNames = computed(() =>
      tabs.value.filter((tab) => liveTabKeys.value.has(tab.key)).map((tab) => hostName(tab.key)),
    );
    return { tabMode, viewKeyFor, hostOf, hostKey, liveHostNames };
  },
});
</script>

<style>
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--ui-page);
  color: var(--ui-text);
}
</style>
