<script lang="ts">
import { defineComponent } from "vue";
import CanvasLoader from "./components/CanvasLoader.vue";

export default defineComponent({
  name: "App",
  components: {
    CanvasLoader
  }
});
</script>

<template>
  <div id="app">
    <!-- Шапка -->
    <header class="header">
      <h1>Рендеринг Canvas</h1>
    </header>

    <!-- Контейнер для Canvas -->
    <div class="canvas-container">
      <!-- Компонент CanvasLoader рендерит Canvas -->
      <CanvasLoader />
    </div>
  </div>
</template>

<style>
#app {
  text-align: center;
}

/* Шапка страницы */
.header {
  background-color: #333;
  color: white;
  text-align: center;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 10; /* Чтобы шапка была всегда сверху */
}

/* Контейнер для Canvas */
.canvas-container {
  margin-top: 50px; /* Сдвигаем на высоту шапки */
  height: calc(100vh - 80px); /* Остальную часть экрана забирает Canvas */
}

h1 {
  margin: 20px 0;
}
</style>