<template>
  <!-- In tab mode the tabs button sits next to Back; otherwise just Back, as always. -->
  <span v-if="tabMode" class="back-group">
    <router-link :to="to" class="back-btn" :aria-label="label" :title="label">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </router-link>
    <TabsButton />
  </span>
  <router-link v-else :to="to" class="back-btn" :aria-label="label" :title="label">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </router-link>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import TabsButton from './tabs/TabsButton.vue';
import { tabsEnabled } from '../tabs/flag';

export default defineComponent({
  name: 'BackButton',
  components: { TabsButton },
  props: {
    to: { type: Object as PropType<RouteLocationRaw>, required: true },
    label: { type: String, default: 'Back' },
  },
  setup() {
    return { tabMode: tabsEnabled() };
  },
});
</script>

<style scoped>
.back-group { display: inline-flex; align-items: center; gap: 8px; flex: none; }
</style>
