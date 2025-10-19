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

              // Добавляем маркеры изменения размера
              let corners = updateCorners(borderRect);
              
              const resizeHandleCircles: Konva.Circle[] = addResizeHandles(text, borderRect, layer, corners);

              // Связываем текст и рамку, чтобы они перемещались вместе
              borderRect.on("dragmove", () => {
                // Синхронизируем позицию рамки с текстом
                text.position({
                  x: borderRect.x(),
                  y: borderRect.y(),
                });

                corners = updateCorners(borderRect);
                resizeHandleCircles.forEach((circle: Konva.Circle, index) => {
                  const corner = corners[index]
                  if (!corner) { return }

                  circle.position({
                    x: borderRect.x() + corner.x,
                    y: borderRect.y() + corner.y,
                  });
                });

                layer.batchDraw();
              });

              text.on("dragmove", () => {
                // Синхронизируем позицию рамки с текстом
                borderRect.position({
                  x: text.x(),
                  y: text.y(),
                });

                corners = updateCorners(borderRect);
                resizeHandleCircles.forEach((circle: Konva.Circle, index) => {
                  const corner = corners[index]
                  if (!corner) { return }

                  circle.position({
                    x: text.x() + corner.x,
                    y: text.y() + corner.y,
                  });
                });

                layer.batchDraw();
              });

              // Добавляем обработчик двойного клика на текст для редактирования
              text.on("dblclick", () => {
                // Создаем текстовое поле для редактирования
                const textInput = document.createElement("input");
                textInput.value = text.text();
                textInput.style.position = "absolute";
                textInput.style.left = `${stage.container().offsetLeft + text.x()}px`;
                textInput.style.top = `${stage.container().offsetTop + text.y()}px`;
                textInput.style.width = `${textWidth}px`;
                textInput.style.height = `${textHeight}px`;
                textInput.style.fontSize = `${text.fontSize()}px`;
                textInput.style.color = "white";
                textInput.style.background = "transparent";
                textInput.style.border = "none";
                textInput.style.textAlign = "center";
                textInput.style.verticalAlign = "middle";
                textInput.style.padding = "10px";
                textInput.style.outline = "none";

                // Добавляем поле на страницу
                document.body.appendChild(textInput);
                textInput.focus();

                // При потере фокуса или нажатии Enter сохраняем изменения
                textInput.addEventListener("blur", () => {
                  text.text(textInput.value);
                  layer.batchDraw();
                  document.body.removeChild(textInput);
                });
                textInput.addEventListener("keydown", (e) => {
                  if (e.key === "Enter") {
                    text.text(textInput.value);
                    layer.batchDraw();
                    document.body.removeChild(textInput);
                  }
                });
              });

              // Добавляем рамку и текст на слой
              layer.add(borderRect);
              layer.add(text);
            }
          });

          layer.draw();
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

// Функция для добавления маркеров для изменения размера в каждом углу
function addResizeHandles(
  text: Konva.Text, 
  borderRect: Konva.Rect, 
  layer: Konva.Layer, 
  corners: {x: number, y: number}[]
) {
  const cornerRadius = 8; // Радиус маркеров для изменения размера

  const resizeHandleCircles: Konva.Circle[] = [];
  corners.forEach((corner, index) => {
    const resizeHandle = new Konva.Circle({
      x: borderRect.x() + corner.x,
      y: borderRect.y() + corner.y,
      radius: cornerRadius,
      fill: "white", // Цвет маркера
      stroke: "black", // Цвет обводки маркера
      strokeWidth: 2,
      draggable: true,
      opacity: 2, // Скрыто по умолчанию
    });

    // Логика изменения размера при перетаскивании углов
    resizeHandle.on("dragmove", () => {
      let newWidth, newHeight;

      // В зависимости от того, какой угол перетаскиваем, изменяем ширину и высоту рамки
      if (index === 0) {
        // Верхний левый угол
        newWidth = borderRect.width() - (resizeHandle.x() - borderRect.x());
        newHeight = borderRect.height() - (resizeHandle.y() - borderRect.y());

        borderRect.width(newWidth);
        borderRect.height(newHeight);

        // Перемещаем рамку в сторону перетаскиваемого угла
        borderRect.x(resizeHandle.x());
        borderRect.y(resizeHandle.y());

        text.setPosition({
          x: resizeHandle.x(),
          y: resizeHandle.y(),
        })

        // update lower left corner
        const lowerLeftCircle = resizeHandleCircles[2];
        lowerLeftCircle?.setPosition({
          x: borderRect.x(),
          y: lowerLeftCircle.y(),
        })

        // update upper right corner
        const upperRightCircle = resizeHandleCircles[1];
        upperRightCircle?.setPosition({
          x: upperRightCircle.x(),
          y: borderRect.y(),
        })

      } else if (index === 1) {
        // Верхний правый угол
        newWidth = resizeHandle.x() - borderRect.x();
        newHeight = borderRect.height() - (resizeHandle.y() - borderRect.y());

        borderRect.width(newWidth);
        borderRect.height(newHeight);

        text.setPosition({
          x: borderRect.x(),
          y: borderRect.y(),
        })

        borderRect.y(resizeHandle.y()); // Оставляем y фиксированным

        // update upper left corner
        const upperLeftCircle = resizeHandleCircles[0];
        upperLeftCircle?.setPosition({
          x: upperLeftCircle.x(),
          y: borderRect.y(),
        })

        // update lower right corner
        const lowerRightCircle = resizeHandleCircles[3];
        lowerRightCircle?.setPosition({
          x: borderRect.x() + newWidth,
          y: lowerRightCircle.y(),
        })

      } else if (index === 2) {
        // Нижний левый угол
        newWidth = borderRect.width() - (resizeHandle.x() - borderRect.x());
        newHeight = resizeHandle.y() - borderRect.y();

        borderRect.width(newWidth);
        borderRect.height(newHeight);

        text.setPosition({
          x: borderRect.x(),
          y: borderRect.y(),
        })

        // update upper left corner
        const upperLeftCircle = resizeHandleCircles[0];
        upperLeftCircle?.setPosition({
          x: borderRect.x(),
          y: upperLeftCircle.y(),
        })

        // update lower left corner
        const lowerRightCircle = resizeHandleCircles[3];
        lowerRightCircle?.setPosition({
          x: lowerRightCircle.x(),
          y: borderRect.y() + newHeight,
        })

        borderRect.x(resizeHandle.x()); // Оставляем x фиксированным
      } else if (index === 3) {
        // Нижний правый угол
        newWidth = resizeHandle.x() - borderRect.x();
        newHeight = resizeHandle.y() - borderRect.y();

        borderRect.width(newWidth);
        borderRect.height(newHeight);

        // update upper right corner
        const upperRightCircle = resizeHandleCircles[1];
        upperRightCircle?.setPosition({
          x: borderRect.x() + newWidth,
          y: upperRightCircle.y(),
        })

        // update lower left corner
        const lowerLeftCircle = resizeHandleCircles[2];
        lowerLeftCircle?.setPosition({
          x: lowerLeftCircle.x(),
          y: borderRect.y() + newHeight,
        })
      }

      // Обновляем размеры текста (синхронизация)
      text.width(newWidth);
      text.height(newHeight);

      // Перерисовываем слой
      layer.batchDraw();
    });

    // Отображаем маркеры при наведении на рамку
    // borderRect.on("mouseenter", () => {
    //   resizeHandle.opacity(1); // Показываем маркеры
    //   layer.batchDraw();
    // });

    // Прячем маркеры, когда мышь покидает рамку
    // borderRect.on("mouseleave", () => {
    //   resizeHandle.opacity(0); // Скрываем маркеры
    //   layer.batchDraw();
    // });

    // Добавляем маркер на слой
    layer.add(resizeHandle);

    resizeHandleCircles.push(resizeHandle)
  });
  return resizeHandleCircles;
};

function updateCorners(borderRect: Konva.Rect): {x: number, y: number}[] {
  return [
    { x: 0, y: 0 }, // Верхний левый
    { x: borderRect.width(), y: 0 }, // Верхний правый
    { x: 0, y: borderRect.height() }, // Нижний левый
    { x: borderRect.width(), y: borderRect.height() } // Нижний правый
  ];
}

</script>