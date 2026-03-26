<script lang="ts">
import { defineComponent } from "vue";
import CanvasLoader from "./components/CanvasLoader.vue";

export default defineComponent({
  name: "App",
  components: {
    CanvasLoader,
  },
});
</script>

<template>
  <div id="app">
    <CanvasLoader />
  </div>
</template>

<style>
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
