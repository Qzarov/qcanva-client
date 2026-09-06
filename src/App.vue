<template>
  <!-- Keyed on the PATH, so a navigation that stays on the same route but
       changes the resource (/docs/a -> /docs/b, which "continue on a new
       page" performs) remounts the view instead of reusing an instance still
       holding the previous document's editor, Yjs document and socket.
       Query-only changes - the dashboard's filters - keep the same path and
       so keep the same instance. -->
  <router-view v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </router-view>
  <ToastContainer />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ToastContainer from './components/ToastContainer.vue';

export default defineComponent({
  components: { ToastContainer },
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
