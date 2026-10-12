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
- Лист персонажа D&D 5e: характеристики, навыки, бой, состояния, оружие, броски,
  спасброски от смерти, отдых, заклинания с ячейками и каталогом SRD, броски в чат
  подключённого канваса —
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

Требуется Node.js 22.12+ (Capacitor CLI 8 требует Node.js 22+), npm и запущенный backend.

```bash
npm install
npm run dev
```

Клиент ходит в API по `VITE_API_URL`; без неё — на `http://localhost:3001/api`
(порт `canvas-server-back` по умолчанию). Для другого адреса создайте `.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001/api
```

Переменная подставляется Vite при запуске или сборке; после изменения production URL нужна пересборка. Изображения загружаются через backend в MinIO/S3: PNG, JPEG, WebP и GIF до 50 MiB. Настройка хранилища — в [README backend](https://github.com/Qzarov/canvas-server-back#локальный-запуск).

## Сборка и тесты

```bash
npm run build        # проверка типов (vue-tsc) и сборка
npm run test:unit    # юнит- и компонентные тесты (Vitest)
npx playwright test  # браузерные тесты из tests/ (поднимают dev-сервер сами)
```

`npm run test:visual` прогоняет только визуальные тесты тем,
`npm run test:visual:update` обновляет их снимки.

## Маршруты

| URL | Назначение |
| --- | --- |
| `/` | Стартовая страница |
| `/dashboard` | Ресурсы и папки |
| `/login`, `/register` | Авторизация |
| `/canvas/:id` | Canvas по UUID или slug |
| `/edit/html/:id` | HTML-редактор по UUID или slug |
| `/docs/:id` | Текстовый документ по UUID или slug |
| `/templates/:id` | Доска или лист персонажа |
| `/html-docs` | Переход на dashboard с фильтром HTML |
| `/html-settings` | Настройки HTML-генерации |
| `/plugins` | Плагины |
| `/admin` | Администрирование |

## Ветки и релизы

- `dev` — сюда попадает работа до релиза.
- `main` — то, что работает на проде; релизные теги ставятся с неё.
- Тег `v*` запускает сборку Android — см. [`docs/release-tagging.md`](docs/release-tagging.md).
- История версий — в [GitHub Releases](https://github.com/Qzarov/qcanva-client/releases).

## План работ

План ведём в двух местах, и они должны совпадать:

- [`docs/roadmap.html`](docs/roadmap.html) в этой репе;
- документ «QCanva roadmap» в самой QCanva: https://qcanva.qzarov.pro/html/qcanva-roadmap.

Когда фича уходит в работу, она переносится в раздел «В работе». Когда её влили и выкатили, она переезжает в раздел «Реализовано за <неделя>»: в группу (`<details class="week-group">`) с платформами, кратким описанием, датой и коммитами. Это значит «передано на проверку», а не «принято»: галочку ставит владелец, агент их не ставит. Новую неделю и её группы добавляют в «Содержание». Что сознательно отложили, записывается в «Бэклог», чтобы не потерять. Правка роадмапа идёт в обоих местах одновременно; главная версия и отметки — в QCanva.

Готовая работа сразу вливается в `dev` из своей ветки, не дожидаясь пачки фич.

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

В Android доступны вкладки открытых ресурсов; в браузере эта возможность выключена по умолчанию. Детали — в [плане вкладок](docs/app-tabs-plan.md).

## Документация

- [`docs/character-sheet-roadmap.md`](docs/character-sheet-roadmap.md) — карточка персонажа D&D: что есть и план
- [`docs/character-sheet-style.md`](docs/character-sheet-style.md) — визуальный стиль карточки персонажа: токены, правила, эталонные снимки
- [`docs/character-sheet-edit-modes.md`](docs/character-sheet-edit-modes.md) — спецификация: режимы «Игра» и «Настройка», отмена и история изменений листа
- [`docs/app-tabs-plan.md`](docs/app-tabs-plan.md) — план вкладок в Android-приложении: переключение между ресурсами без перезагрузки
- [`docs/release-tagging.md`](docs/release-tagging.md) — релизные теги и версии
- [`docs/google-play-release.md`](docs/google-play-release.md) — публикация в Google Play
- [`COLLABORATION_PROTOCOL.md`](COLLABORATION_PROTOCOL.md) — протокол совместного редактирования канваса
- [`docs/roadmap.html`](docs/roadmap.html) — роадмап: что в работе и что отложено (см. «План работ»)
- `docs/superpowers/` — проектные спеки и планы по отдельным фичам
- [`TODO.md`](TODO.md) — чек-лист возможностей канваса

## Лицензия

Copyright (C) 2025–2026 Yaroslav Paroshin (Qzarov).

QCanva client распространяется под лицензией **GNU Affero General Public License v3.0** (`AGPL-3.0-only`), полный текст — в файле [`LICENSE`](LICENSE).

Каталог заклинаний (`src/dnd/spellCatalog.data.ts`) содержит материалы System Reference
Document 5.1 («SRD 5.1») компании Wizards of the Coast LLC, доступного по адресу
<https://dnd.wizards.com/resources/systems-reference-document>. SRD 5.1 распространяется
по лицензии [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode).
Взята только механика заклинаний; русские названия и краткая суть написаны для этого
проекта. Как каталог собирается — в `scripts/spell-catalog/build.py`.

Коротко: код можно свободно использовать, изучать, изменять и распространять. Если вы запускаете изменённую версию как сетевой сервис (сайт, SaaS), вы обязаны предоставить её пользователям исходный код своих изменений на тех же условиях.
