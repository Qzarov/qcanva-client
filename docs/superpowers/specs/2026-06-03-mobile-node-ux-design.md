# Мобильный UX нод канваса — дизайн

**Дата:** 2026-06-03
**Репозиторий:** canvas-server-front (ветка `feat/mobile-node-ux` от `dev`)
**Статус:** утверждён к имплементации

## Цель

Две мобильные UX-доработки канваса:
1. **Скрывать меню редактирования ноды во время манипуляции** — при перетаскивании (и растягивании) ноды панель редактирования перекрывает ноду и мешает; она должна исчезать на время манипуляции и возвращаться при отпускании.
2. **Удобное растягивание нод на мобиле** — сейчас resize-хэндлы реагируют только на `@mousedown`, на touch не работают вовсе (касание хэндла просто тащит ноду). Добавить touch-поддержку ресайза и сделать хэндлы удобными для пальца.

## Контекст кода

- **Движок канваса:** `src/components/CanvasLoader.vue` (~3200 строк). Отдаёт наружу через возврат из `setup` состояние (`selectedNodeId`, `editingNodeId`, …) и методы; родитель (`CanvasView.vue`) читает их через `canvasRef`.
- **Меню редактирования** живёт в `src/views/CanvasView.vue`: «node-toolbar» (стиль/цвет/границы, ~стр.171) и «mobile block settings» (~стр.224). Оба показываются по условию `canvasRef?.selectedNodeId && !canvasRef?.editingNodeId`.
- **Touch:** `onTouchStart/onTouchMove/onTouchEnd` на корне канваса. Одиночный палец по ноде → нода сразу выделяется (появляется тулбар) и праймится drag; после порога `TAP_MOVE_THRESHOLD` (8px) `touchDragging=true` и ставится `dragNodeId`.
- **Resize:** 8 div-хэндлов (`resize-handle-br|bl|tr|tl|r|l|t|b`), привязаны только к `@mousedown.stop="onResizeStart($event, node, 'br')"`. Resize-математика — внутри общего move-хэндлера, читает `lastPointer`, `resizeNodeId`, `resizeHandle`, `resizeStart`, `camera`, `MIN_NODE_SIZE`, `snap()`.
- **Touch/mobile-детекта в JS нет.** Размеры хэндлов делаем через CSS `@media (pointer: coarse)`.

## Решения (из брейншторма)

- Меню прячем **на время перетаскивания** (и ресайза), возвращаем при отпускании.
- На мобиле — **4 угловых хэндла, крупнее** (стороны скрыты), зона нажатия ~44px.
- Активация ресайза — **хэндлы видны при выделении** (как на десктопе), тянешь пальцем за хэндл.
- Touch-обработка хэндлов — **делегирование через `onTouchStart`** (определяем `closest('.resize-handle')` + `data-handle`), а не отдельные `@touchstart` на каждом хэндле.

## Фича 1 — скрытие меню во время манипуляции

**CanvasLoader.vue:**
- Добавить computed `isManipulatingNode = computed(() => !!dragNodeId.value || !!resizeNodeId.value)`.
- Вернуть его из `setup` (в общий объект возврата, рядом с `selectedNodeId`/`editingNodeId`).

**CanvasView.vue:**
- В `v-if` обоих меню добавить `&& !canvasRef?.isManipulatingNode`:
  - node-toolbar: `v-if="canvasRef?.selectedNodeId && !canvasRef?.editingNodeId && !canvasRef?.isManipulatingNode"`
  - mobile block-settings: то же условие.

**Поведение:** `dragNodeId` ставится только после порога движения, поэтому тап-выделение оставляет меню видимым; начало drag/resize → меню исчезает; отпускание (drag/resize завершён, оба ref сброшены) → меню возвращается. Применяется одинаково на desktop/mobile (на десктопе безвредно — меню и так редко перекрывает).

## Фича 2 — touch-ресайз нод

**Разметка (CanvasLoader template):** на каждый resize-хэндл добавить `data-handle="br"` (и т.д.) — чтобы touch-делегирование знало направление. `@mousedown.stop="onResizeStart(...)"` остаётся для мыши.

**Рефактор resize под общий ввод:**
- Ввести тип указателя `PointerLike = { clientX: number; clientY: number; button?: number }`.
- `onResizeStart(p: PointerLike, node, handle)` — обобщить с `MouseEvent` на `PointerLike` (читает `clientX/clientY`; ветка `button === 1` (pan) только для мыши — при touch `button` undefined, ветка не срабатывает).
- Вынести resize-математику из move-хэндлера в функцию `applyResize()` (без аргументов: читает существующие `lastPointer`/`resizeNodeId`/`resizeStart`/`resizeHandle`/`camera`). Вызывать из существующего pointer-move и из `onTouchMove`.

**Touch-обработчики (CanvasLoader):**
- `onTouchStart` (одиночный палец): **до** ветки node-drag проверить `const handleEl = (e.target as HTMLElement)?.closest('.resize-handle')`. Если есть, нода выделена и `!props.readonly`:
  - взять `nodeId` из `closest('[data-node-id]')`, `handle` из `handleEl.dataset.handle`, найти ноду;
  - вызвать `onResizeStart({ clientX: t.clientX, clientY: t.clientY }, node, handle)`;
  - выставить флаг `touchResizing = true`, `return` (не праймить drag/pan).
- `onTouchMove` (одиночный палец): если `resizeNodeId.value` (или `touchResizing`) — обновить `lastPointer.x/y` из touch и вызвать `applyResize()`; `return` (не выполнять drag/pan).
- `onTouchEnd`: если был resize (`touchResizing && resizeNodeId.value`) — финализировать **точно как** в `onPanEnd` (CanvasLoader ~стр.1929) и touch-drag (block `nodes-move` в `onTouchEnd`):
  ```js
  if (touchResizing && resizeNodeId.value) {
    const n = nodes.value.find((nd) => nd.id === resizeNodeId.value);
    if (n) emitOp({ type: 'node-resize', id: n.id, x: n.x, y: n.y, width: n.width, height: n.height });
  }
  resizeNodeId.value = null;
  touchResizing = false;
  ```
  Добавить рядом с существующим сбросом `dragNodeId.value = null; touchDragging = false; …`. `stopAutoPan()` уже вызывается в начале `onTouchEnd`.

**CSS (`@media (pointer: coarse)`):**
- Показывать только угловые хэндлы: `.resize-handle-r, .resize-handle-l, .resize-handle-t, .resize-handle-b { display: none; }`.
- Углы: увеличить хит-область до ~44px (через прозрачный `::before` или padding с отрицательным смещением), визуальный маркер можно оставить ~14–18px. `touch-action: none` на хэндлах, чтобы браузер не перехватывал жест.

## Затронутые файлы

- `src/components/CanvasLoader.vue` — `isManipulatingNode`; `data-handle` на хэндлах; `PointerLike`; обобщённый `onResizeStart`; вынесенный `applyResize()`; touch-ветки resize в `onTouchStart/Move/End`; CSS `@media (pointer: coarse)`.
- `src/views/CanvasView.vue` — условия `v-if` двух меню.

## Тестирование

- **Unit (vitest, уже в проекте):** вынести resize-математику так, чтобы её ядро проверялось тестом — given `resizeStart`, `handle`, смещение указателя и `camera` → корректные `x/y/width/height` с учётом `MIN_NODE_SIZE`. Тест на `isManipulatingNode` (drag/resize → true, иначе false). Если чистое выделение математики из компонента затруднено — вынести её в маленький модуль `src/canvas/resizeMath.ts` и тестировать его (заодно улучшает изоляцию).
- **Сборка:** `vue-tsc --noEmit` (типобезопасность `PointerLike`/обобщённого `onResizeStart`).
- **Ручная проверка:** мобильный эмулятор/девайс — (1) drag ноды прячет меню и возвращает; (2) тап-выделение меню не прячет; (3) ресайз пальцем за угловой хэндл работает, стороны скрыты, попадание удобное; (4) ресайз тоже прячет меню; (5) desktop-мышь не сломана (resize + меню как было).

## Границы (что НЕ входит)

- Не меняем десктопное поведение (мышь-resize, тулбар) кроме общего скрытия меню при манипуляции.
- Не вводим отдельный режим/кнопку «размер» (отклонено в брейншторме).
- Не трогаем backend, синк-протокол (`node-resize` уже существует), pinch-zoom, edges.
- Не трогаем второй чекаут в `pet/`.
