<template>
  <div>
    <div ref="canvasContainer" class="canvas-container"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from "vue";
import Konva from "konva";

export default defineComponent({
  name: "CanvasLoader",
  setup() {
    const canvasContainer = ref<HTMLDivElement | null>(null);

    // Функция для загрузки .canvas файла из public
    const loadCanvas = async () => {
      try {
        const response = await fetch("/example.canvas");
        const fileContent = await response.text();
        const parsedData = JSON.parse(fileContent);

        // Проверка на наличие массива объектов
        if (!parsedData.nodes || !Array.isArray(parsedData.nodes)) {
          console.error("Ошибка: файл .canvas не содержит правильной структуры!");
          return;
        }

        if (canvasContainer.value) {
          const stage = new Konva.Stage({
            container: canvasContainer.value,
            width: window.innerWidth,
            height: window.innerHeight,
          });

          const layer = new Konva.Layer();
          stage.add(layer);

          const stageWidth = stage.width();
          const stageHeight = stage.height();

          // Центр канваса
          const centerX = stageWidth / 2;
          const centerY = stageHeight / 2;

          // Перебираем объекты в parsedData и добавляем их на слой
          parsedData.nodes.forEach((obj: any) => {
            console.log(`parsed obj:`, obj)
            let shape;
            const borderColor = obj?.borderColor || "black";  // Цвет обводки, если не указан - чёрный
            const borderWidth = obj?.borderWidth || 2; // Толщина обводки, если не указана - 2px

            // Вычисление сдвигов для центрирования
            let x = obj.x;
            let y = obj.y;

            if (obj.type === "rect") {
              x = centerX - obj.width / 2;
              y = centerY - obj.height / 2;
              shape = new Konva.Rect({
                x,
                y,
                width: obj.width,
                height: obj.height,
                fill: obj.fill || "gray",
                stroke: borderColor,  // Добавляем обводку
                strokeWidth: borderWidth,  // Толщина обводки
                draggable: true,
              });
            } else if (obj.type === "circle") {
              // Для круга центрируем по радиусу
              x = centerX - obj.radius;
              y = centerY - obj.radius;
              shape = new Konva.Circle({
                x,
                y,
                radius: obj.radius,
                fill: obj.fill || "blue",
                stroke: borderColor,  // Добавляем обводку
                strokeWidth: borderWidth,  // Толщина обводки
                draggable: true,
              });
            } else if (obj.type === "text") {
              // Для текста центрируем по высоте и ширине текста
              const textWidth = obj.text.length * 10; // примерный расчет ширины текста
              const textHeight = 20; // высота текста
              x = centerX - textWidth / 2;
              y = centerY - textHeight / 2;
              shape = new Konva.Text({
                x,
                y,
                text: obj.text,
                fontSize: 16,
                fill: obj.fill || "black",
                stroke: borderColor,  // Добавляем обводку
                strokeWidth: borderWidth,  // Толщина обводки
              });
            }

            if (shape) {
              layer.add(shape);
            }
          });

          layer.draw();
          console.log(`layer has been drawen`)
        }
  } catch (error) {
    console.error("Ошибка при загрузке или парсинге файла .canvas:", error);
  }
};

    onMounted(() => {
      loadCanvas();
    });

    return {
      canvasContainer,
    };
  },
});
</script>

<style scoped>
.canvas-container {
  border: 1px solid #ccc;
  margin-top: 20px;
}
</style>