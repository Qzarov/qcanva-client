# QCanva — клиент

Веб- и Android-клиент QCanva: рабочее пространство с канвасами в формате
Obsidian / JSON Canvas, документами, досками и листами персонажей, с совместным
редактированием в реальном времени. Работает на [qcanva.qzarov.pro](https://qcanva.qzarov.pro).
Бэкенд — [canvas-server-back](https://github.com/Qzarov/canvas-server-back).

## Возможности

### Канвас
- Формат Obsidian / JSON Canvas, импорт и экспорт `.canvas`
- Ноды: текст (Markdown и callouts), ссылки, изображения, группы, встроенные документы,
  превью досок, карточка персонажа
- Стрелки с подписями и стилями, рисование от руки, линейка с масштабом
- Pan и zoom (мышь, колёсико, touch и pinch), мультивыделение, привязка к сетке, миникарта
- Undo / redo, копирование и вставка, история ревизий с восстановлением
- Чат канваса и плагины (например, кубики)
- На телефоне — режимы «рука / курсор / рисование» и полноэкранный редактор текста ноды

### Документы
- Текстовые документы в стиле Notion (Tiptap + Yjs): заголовки со сворачиванием,
  оглавление, таблицы, туду-листы, callouts, подсветка кода, упоминания и обратные ссылки
- HTML-документы: визуальный редактор, исходный код, экспорт, история

### Доски и шаблоны
- Trello-доски с колонками и карточками
- Лист персонажа D&D 5e: характеристики, навыки, бой, состояния, оружие, броски —
  см. [состояние и план](docs/character-sheet-roadmap.md)

### Дашборд и доступ
- Лента «Недавние», вложенные папки, теги, поиск, фильтр по типу, публичные материалы
- Доступ по e-mail (просмотр или редактирование), видимость «приватный / для вошедших /
  публичный», доступ по паролю, своя ссылка (slug), запросы доступа
- Светлая и тёмная темы, русский и английский интерфейс

### Совместная работа
- Канвас и доски: сервер упорядочивает операции (ревизии, подтверждение и отклонение,
  пересинхронизация) — см. [`COLLABORATION_PROTOCOL.md`](COLLABORATION_PROTOCOL.md)
- Текстовые документы: Yjs
- Листы персонажей: полевые операции, одновременные изменения HP складываются
- Курсоры и присутствие других участников

## Стек

- Vue 3, TypeScript, Vue Router, Vite
- Socket.IO, Yjs, Tiptap 2
- Canvas рисуется на DOM + SVG, без canvas-библиотек
- Capacitor 8 для Android
- Vitest и Playwright для тестов

## Запуск

```bash
npm install
npm run dev
```

Клиент ходит в API по `VITE_API_URL`; без неё — на `http://localhost:3001/api`
(порт `canvas-server-back` по умолчанию).

## Сборка и тесты

```bash
npm run build        # проверка типов (vue-tsc) и сборка
npm run test:unit    # юнит- и компонентные тесты (Vitest)
npx playwright test  # браузерные тесты из tests/ (поднимают dev-сервер сами)
```

`npm run test:visual` прогоняет только визуальные тесты тем,
`npm run test:visual:update` обновляет их снимки.

## Ветки и релизы

- `dev` — сюда попадает работа до релиза.
- `main` — то, что работает на проде; релизные теги ставятся с неё.
- Тег `v*` запускает сборку Android — см. [`docs/release-tagging.md`](docs/release-tagging.md).
- История версий — в [GitHub Releases](https://github.com/Qzarov/qcanva-client/releases).

## Production deploy

На сервере сайт лежит в `/var/www/qcanva.qzarov.pro/` (оба домена,
`qcanva.qzarov.pro` и `canvas.qzarov.pro`, отдаются из него):

```text
/var/www/qcanva.qzarov.pro/
├── front/
│   ├── repo/            # git-копия этого репозитория (ветка main)
│   ├── releases/        # собранные релизы
│   ├── dist -> releases/<текущий>        # отсюда отдаёт nginx
│   └── dist.previous -> releases/<прошлый>
└── back/                # canvas-server-back (pm2-процесс canvas-back)
```

Запускайте из `front/repo`:

```bash
cd /var/www/qcanva.qzarov.pro/front/repo
bash scripts/deploy-production.sh
```

Скрипт подтягивает `main` (ветка задаётся `DEPLOY_BRANCH`; если копия стоит на другой
ветке, он остановится, а не подтянет её молча), сверяет схему документа с бэкендом
(`../../back`, см. `scripts/check-schema-contract.sh`), запускает тесты и сборку, затем
атомарно переключает `front/dist` на новый release. Хранятся только активная
и одна предыдущая сборки. Для отката:

```bash
bash scripts/deploy-production.sh rollback
```

Веб и теги не связаны: можно задеплоить веб без тега и наоборот.

## Android

Android-приложение собрано на Capacitor и использует тот же Vue-код, что и веб-версия. Для синхронизации веб-ресурсов с нативным проектом:

```bash
npm run android:sync
npm run android:open
```

В Android Studio выберите устройство или эмулятор и запустите `app`. Для debug APK можно выполнить `npm run android:build:debug`; он будет лежать в `android/app/build/outputs/apk/debug/`. Нужны Android Studio (Android SDK) и JDK 21. Перед каждым нативным релизом запускайте `npm run android:sync`: production API уже задан как `https://qcanva.qzarov.pro/api` в `.env.production`.

Релизная сборка собирается в GitHub Actions по тегу `v*` — см. [`docs/release-tagging.md`](docs/release-tagging.md); публикация в Google Play — [`docs/google-play-release.md`](docs/google-play-release.md).

## Документация

- [`docs/character-sheet-roadmap.md`](docs/character-sheet-roadmap.md) — карточка персонажа D&D: что есть и план
- [`docs/character-sheet-style.md`](docs/character-sheet-style.md) — визуальный стиль карточки персонажа: токены, правила, эталонные снимки
- [`docs/release-tagging.md`](docs/release-tagging.md) — релизные теги и версии
- [`docs/google-play-release.md`](docs/google-play-release.md) — публикация в Google Play
- [`COLLABORATION_PROTOCOL.md`](COLLABORATION_PROTOCOL.md) — протокол совместного редактирования канваса
- `docs/superpowers/` — проектные спеки и планы по отдельным фичам
- [`TODO.md`](TODO.md) — чек-лист возможностей канваса

## Лицензия

Copyright (C) 2025–2026 Yaroslav Paroshin (Qzarov).

QCanva client распространяется под лицензией **GNU Affero General Public License v3.0** (`AGPL-3.0-only`), полный текст — в файле [`LICENSE`](LICENSE).

Коротко: код можно свободно использовать, изучать, изменять и распространять. Если вы запускаете изменённую версию как сетевой сервис (сайт, SaaS), вы обязаны предоставить её пользователям исходный код своих изменений на тех же условиях.
