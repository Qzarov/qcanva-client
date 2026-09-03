<template>
  <router-view />
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
