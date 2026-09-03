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

## Production deploy

На сервере фронтенд-копия находится в `/var/www/canvas.qzarov.pro/front/repo`.
Запускайте из неё:

```bash
bash scripts/deploy-production.sh
```

Скрипт обновляет `dev`, запускает тесты и сборку, затем атомарно переключает
путь nginx `/var/www/canvas.qzarov.pro/front/dist` на новый release. Хранятся
только активная и одна предыдущая сборки. Для отката:

```bash
bash scripts/deploy-production.sh rollback
```

## Android

Android-приложение собрано на Capacitor и использует тот же Vue-код, что и веб-версия. Для синхронизации веб-ресурсов с нативным проектом:

```bash
npm run android:sync
npm run android:open
```

В Android Studio выберите устройство или эмулятор и запустите `app`. Для debug APK можно выполнить `npm run android:build:debug`; он будет лежать в `android/app/build/outputs/apk/debug/`. Нужны Android Studio (Android SDK) и JDK 21. Перед каждым нативным релизом запускайте `npm run android:sync`: production API уже задан как `https://canvas.qzarov.pro/api` в `.env.production`.

## Changelog

### 2026-05-03 — UX-аудит: обратная связь, шорткаты, мобильная верстка

**Обработка ошибок API (критичное)**
- Все пустые `catch {}` в CanvasView заменены на toast-уведомления: сохранение канваса, загрузка пермишенов, история, embed-picker.
- AdminView: `alert()` заменены на toast-уведомления для смены ролей и настроек истории.

**Обратная связь на действия (критичное)**
- Share/revoke: success/error тосты при расшаривании и отзыве доступа.
- Visibility/public edit: success-тосты с откатом состояния при ошибке.
- History access: success-тост при изменении настроек.
- Save title: error-тост при ошибке сохранения.

**Горячие клавиши (высокое)**
- Добавлен диалог «Keyboard Shortcuts» (кнопка в топбаре). Документирует все 14 шорткатов: Ctrl+Z/Shift+Z, Ctrl+C/V/D/A, Delete, Escape, double-click, Shift+click, Ctrl+Scroll, middle mouse, right-click, drag from edge.

**Видимость точек подключения (высокое)**
- Точки подключения нод теперь видны при выделении ноды (`opacity: 0.6` вместо `0.25`).
- На тач-устройствах точки увеличены до 28px и показываются с `opacity: 0.8`.

**Мобильная верстка (высокое)**
- Топбар: flex-wrap, уменьшенные шрифты и padding на экранах < 640px.
- Node toolbar: переезжает вниз экрана на мобилке, увеличенные кнопки для тач.
- Share/history/embed панели: full-width на мобилке.
- Shortcuts dialog: адаптивная ширина.
