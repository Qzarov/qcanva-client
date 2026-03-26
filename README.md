# Canvas Server

Веб-просмотрщик и редактор Obsidian Canvas файлов (.canvas) с возможностью шеринга по ссылке.

## Возможности

- Рендеринг `.canvas` файлов (формат Obsidian / JSON Canvas)
- Типы нод: текст (с Markdown), ссылки, группы с цветами
- Стрелки (edges) между нодами — безье-кривые с наконечниками
- Цветовая палитра Obsidian (6 цветов)
- Pan (перетаскивание канваса) и zoom (колёсико мыши, pinch)
- Перетаскивание блоков (drag & drop)
- Адаптация под тач-устройства
- Авто-подгонка контента под экран

## Стек

- Vue 3 + TypeScript
- Vite
- Marked.js (Markdown)
- DOM + SVG (без canvas-библиотек)

## Запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
npm run preview
```
