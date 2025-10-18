<template>
  <div ref="canvasContainer" class="canvas-container"></div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from "vue";
import Konva from "konva";

export default defineComponent({
  name: "Canvas",
  setup() {
    const canvasContainer = ref<HTMLDivElement | null>(null);

    onMounted(() => {
      if (canvasContainer.value) {
        const stage = new Konva.Stage({
          container: canvasContainer.value,
          width: window.innerWidth,
          height: window.innerHeight,
        });

        const layer = new Konva.Layer();
        stage.add(layer);

        // Пример добавления прямоугольника на Canvas
        const rect = new Konva.Rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: "red",
          draggable: true,
        });

        layer.add(rect);
        layer.draw();
      }
    });

    return {
      canvasContainer,
    };
  },
});
</script>
