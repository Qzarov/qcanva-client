<template>
  <div>
    <div ref="canvasContainer" class="canvas-container"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from "vue";
import Konva from "konva";
import type { Group } from "konva/lib/Group";
import type { Shape, ShapeConfig } from "konva/lib/Shape";

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
            let shape: Group | Shape<ShapeConfig>;
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
              const textWidth = obj.width || 200;  // если ширина не задана, установим по умолчанию 200px
              const textHeight = obj.height || 50; // если высота не задана, установим по умолчанию 50px

              x = obj.x - centerX - textWidth / 2;
              y = obj.y + centerY - textHeight / 2;

              // Создаем рамку для текста (обводку)
              const borderRect = new Konva.Rect({
                x: x,
                y: y,
                width: textWidth,
                height: textHeight,
                stroke: "white", // Цвет рамки
                strokeWidth: borderWidth, // Толщина рамки
                draggable: true, // Возможность перетаскивать рамку
                cornerRadius: 10, // Скругление углов рамки
              });

              const text = new Konva.Text({
                x,
                y,
                text: obj.text,
                fontSize: 16,
                width: textWidth,  // устанавливаем ширину
                height: textHeight,  // устанавливаем высоту
                fill: "white",
                align: "left",  // Выравнивание текста по центру
                verticalAlign: "middle",  // Выравнивание текста по вертикали
                padding: 10,  // Добавляем отступы, чтобы текст не был прижат к границам
                draggable: true,
              });

              // Связываем текст и рамку, чтобы они перемещались вместе
              borderRect.on("dragmove", () => {
                // Синхронизируем позицию рамки с текстом
                text.position({
                  x: borderRect.x(),
                  y: borderRect.y(),
                });
                layer.batchDraw();
              });

              text.on("dragmove", () => {
                // Синхронизируем позицию рамки с текстом
                borderRect.position({
                  x: text.x(),
                  y: text.y(),
                });
                layer.batchDraw();
              });

              // Добавляем рамку и текст на слой
              layer.add(borderRect);
              layer.add(text);
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