# Canvas Server Frontend

Веб-редактор Obsidian Canvas файлов с авторизацией, шерингом и совместным доступом.

## Возможности

### Редактор
- Рендеринг `.canvas` файлов (формат Obsidian / JSON Canvas)
- Типы нод: текст (Markdown + callouts), ссылки, группы с цветами
- Стрелки (edges): bezier-кривые, лейблы, стили (solid/dashed/dotted, 6 цветов)
- Pan & zoom (мышь, колёсико, touch/pinch)
- Drag & drop, ресайз, snap to grid (24px)
- Контекстное меню (цвет, дублировать, удалить)
- Мультиселект (Shift/Ctrl + клик, рамка)
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Copy/paste (Ctrl+C/V)
- Minimap
- Экспорт/импорт `.canvas` файлов

### Совместное редактирование (Real-time)
- Операционная синхронизация (operation-based) — отправка гранулярных операций вместо полного состояния
- Типы операций: `nodes-move`, `node-resize`, `node-add`, `node-delete`, `node-update`, `edge-add`, `edge-delete`, `edge-update`
- Одновременное редактирование разных нод/стрелок без конфликтов
- Курсоры других пользователей в реальном времени
- Автосохранение полного состояния в БД (debounced)

### Авторизация и шеринг
- Регистрация / вход (JWT)
- Dashboard со списком canvas (свои + расшаренные)
- Создание / удаление canvas
- Шеринг по email (чтение / редактирование)
- Public canvas (просмотр без авторизации)

## Стек

- Vue 3 + TypeScript + Vue Router
- Vite
- Marked.js (Markdown)
- Socket.IO (real-time sync)
- DOM + SVG (без canvas-библиотек)

## Запуск

```bash
npm install
npm run dev
```

Бэкенд: `canvas-server` на порту 3000.

## Сборка

```bash
npm run build
```
