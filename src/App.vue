<template>
  <!-- Keyed on the PATH for the routes that need it, and only those: see
       router/view-remount.ts for which, and for why keying every route made
       slugged canvases and html documents remount right after opening. -->
  <router-view v-slot="{ Component, route }">
    <component :is="Component" :key="viewKeyFor(route)" />
  </router-view>
  <ToastContainer />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ToastContainer from './components/ToastContainer.vue';
import { viewKeyFor } from './router/view-remount';

export default defineComponent({
  components: { ToastContainer },
  setup() {
    return { viewKeyFor };
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
