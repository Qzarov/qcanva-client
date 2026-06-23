# Система плагинов для canvas-server — дизайн

Дата: 2026-06-23
Репозитории: `canvas-server-back` (NestJS/TypeORM/sql.js), `canvas-server-front` (Vue 3)
Ветка: `dev`

## Цель

Дать возможность включать/отключать отдельный функционал через «плагины». Концептуально похоже на
публичные документы: у фичи есть состояние, которым управляет пользователь. Первый плагин — **бросок
дайсов** (dice) в чате канваса.

## Ключевые решения (зафиксировано в брейншторме)

1. **Scope: per-account.** Пользователь включает плагины для себя; действуют на всех его ресурсах.
2. **Семантика в коллаборации: «каждый за себя».** Включённые плагины *действующего* пользователя
   гейтят его собственный UI и его действия. Дайсы: вижу кнопку и могу бросать, если *у меня* плагин
   включён; результат уходит в общий чат обычным сообщением с `rollData`.
3. **Каталог: встроенный реестр в коде.** Список доступных плагинов задан константой на бэке и фронте.
   В БД хранится только состояние «юзер X включил плагин Y».
4. **UI управления: отдельная страница `/plugins`** со списком карточек-плагинов и тоглами.
5. **По умолчанию: выключен (opt-in).** Нет записи → плагин выключен.
6. **Поверхности (surface):** плагин объявляет, к какому контексту относится — `canvas-chat`
   | `document` | `html`. Дайсы = `canvas-chat`. (Документ/HTML-плагины появятся позже; модель
   их уже поддерживает.)

### Принятые дефолты (не выносились на отдельный вопрос)

- **Гейтинг на сервере, не только в UI.** Прятать кнопку на фронте недостаточно — сокет-ивент
  `chat-roll` можно отправить напрямую. Сервер тоже проверяет, что у действующего юзера дайсы включены.
- **Отрисовка карточки броска в чате не гейтится.** `rollData`-сообщение уже существует и
  пришло всем участникам; `ChatPanel` показывает карточку независимо от плагинов *зрителя*. Плагин
  гейтит *способность бросать*, а не показ чужих бросков.
- **Гости (анонимные на публичных канвасах) плагинов не имеют** (нет аккаунта → нет записей →
  всё выключено). Следствие: анонимный редактор публичного канваса не увидит дайсы. Для v1 приемлемо.

## Архитектура

```
Реестр (код, бэк+фронт)         Состояние (БД)              Гейтинг
┌──────────────────────┐        ┌──────────────────┐       фронт: скрыть UI
│ PLUGINS = [           │        │ user_plugin       │       бэк:  отклонить
│  {id:'dice',          │  +     │ (userId,pluginId, │  ==>  действие
│   surface:'canvas-chat│        │  enabled)         │
│   name, description}] │        └──────────────────┘
└──────────────────────┘
```

## Бэкенд (`canvas-server-back`)

### Сущность и миграция

- `src/entities/user-plugin.entity.ts` — `UserPlugin`:
  - `id: string` (uuid PK)
  - `userId: string`
  - `pluginId: string`
  - `enabled: boolean`
  - `createdAt`, `updatedAt`
  - Уникальный индекс `(userId, pluginId)`.
- `src/db/migrations/1764800000000-add-user-plugin.ts` — создаёт таблицу `user_plugin`
  (мягкая, down не дропает данные сверх таблицы). Регистрируется в `src/db/typeorm.config.ts`
  (и в массив `entities`, и в массив `migrations`).

### Реестр плагинов

- `src/plugins/plugin-registry.ts`:
  ```ts
  export type PluginSurface = "canvas-chat" | "document" | "html";
  export interface PluginDef { id: string; name: string; description: string; surface: PluginSurface; }
  export const PLUGINS: PluginDef[] = [
    { id: "dice", name: "Бросок дайсов",
      description: "Кнопка броска кубиков (d4–d100) в чате канваса.",
      surface: "canvas-chat" },
  ];
  export const PLUGIN_IDS = new Set(PLUGINS.map(p => p.id));
  ```
  Единственный источник правды о доступных плагинах на бэке.

### Сервис

- `src/plugins/plugins.service.ts` — `PluginsService`:
  - `listForUser(userId): Promise<Array<PluginDef & { enabled: boolean }>>` — реестр, смерженный
    с состоянием (нет записи → `enabled: false`).
  - `setEnabled(userId, pluginId, enabled): Promise<void>` — валидирует `pluginId` по `PLUGIN_IDS`
    (иначе `BadRequestException`), upsert строки `user_plugin`.
  - `isEnabled(userId, pluginId): Promise<boolean>` — для серверного гейтинга.

### Контроллер

- `src/plugins/plugins.controller.ts` — `@UseGuards(JwtAuthGuard) @Controller("plugins")`:
  - `GET /plugins` → `listForUser(req.user.id)`.
  - `PUT /plugins/:id` body `{ enabled: boolean }` (DTO с `class-validator`) →
    `setEnabled(req.user.id, id, enabled)`; вернуть обновлённый список или `{ ok: true }`.

### Модуль

- `src/plugins/plugins.module.ts` — регистрирует `TypeOrmModule.forFeature([UserPlugin])`,
  `PluginsService`, `PluginsController`; **экспортирует `PluginsService`**.
- Подключить `PluginsModule` в `src/app.module.ts`.
- Импортировать `PluginsModule` в `CanvasModule`, чтобы `CanvasGateway` мог инжектить `PluginsService`.

### Гейтинг дайсов в gateway

- `src/canvas/canvas.gateway.ts`, обработчик `@SubscribeMessage("chat-roll")` (≈ строки 308–332):
  - До `chatService.createRoll(...)`: если `client.isGuest` ИЛИ
    `!(await pluginsService.isEnabled(client.userId, "dice"))` → `client.emit("chat-error", { reason: "plugin-disabled" })` и `return`.
  - Остальная логика без изменений.
  - `createRoll()` в `canvas-chat.service.ts` не трогаем.

## Фронтенд (`canvas-server-front`)

### API-клиент

- `src/api/client.ts`, новый экспорт рядом с `canvas`/`htmlDocuments`:
  ```ts
  export const plugins = {
    list: () => request<Array<{ id: string; name: string; description: string; surface: string; enabled: boolean }>>('/plugins'),
    setEnabled: (id: string, enabled: boolean) =>
      request<any>(`/plugins/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  };
  ```

### Composable (singleton-стейт)

- `src/composables/usePlugins.ts` — по паттерну `useToast` (module-level reactive singleton):
  - `enabledPluginIds: Ref<Set<string>>`
  - `isEnabled(id: string): boolean`
  - `loadPlugins(): Promise<void>` — `GET /plugins`, заполнить `enabledPluginIds`.
  - `ensureLoaded(): Promise<void>` — загрузить один раз (кэш на сессию).
  - `setEnabled(id, enabled)` — оптимистично обновить стейт + `plugins.setEnabled`.
  - `reset()` — очистка при логауте.

### Страница `/plugins`

- `src/views/PluginsView.vue` + роут `{ path: '/plugins', name: 'plugins', meta: { requiresAuth: true } }`
  в `src/router/index.ts`.
- Карточки плагинов: название, описание, бейдж surface, тогл (вкл/выкл) → `usePlugins.setEnabled`.
- Иконки — **Lucide**, не эмодзи.
- Ссылка на страницу из юзер-меню в `DashboardView.vue`.

### Гейтинг дайсов

- `src/views/CanvasView.vue`:
  - На mount: `usePlugins.ensureLoaded()`.
  - Dice-тулбар (≈ строки 413–435): `v-if="role !== 'read' && isEnabled('dice')"`.
  - `rollDice()` (≈ 1658–1665): guard `if (!isEnabled('dice')) return;`.
- `src/components/ChatPanel.vue`: **без изменений** — карточка броска показывается всегда.

## Поток данных

1. Логин → (lazy) `usePlugins.ensureLoaded()` → `GET /plugins` → `enabledPluginIds`.
2. На `/plugins` юзер включает дайсы → `PUT /plugins/dice {enabled:true}` → стейт обновлён →
   в открытом канвасе dice-тулбар появляется реактивно.
3. Бросок → сокет `chat-roll` → бэк проверяет `isEnabled(userId,'dice')` → `createRoll()` →
   `chat-message` всем участникам.
4. Плагин выключен → тулбара нет; прямой `chat-roll` → бэк отклоняет (`chat-error`).

## Обработка ошибок / краевые случаи

- Неизвестный `pluginId` в `PUT /plugins/:id` → `BadRequestException` (400).
- `chat-roll` при выключенном плагине/госте → `chat-error { reason: 'plugin-disabled' }`, без падения.
- Существующие `rollData`-сообщения видны у всех (display-only, не гейтится).
- Тогл применяется реактивно — перезагрузка канваса не нужна.
- Логаут → `usePlugins.reset()` (иначе стейт протечёт между аккаунтами).

## Тестирование

### Бэк (jest)

- `PluginsService`: `listForUser` мержит реестр с состоянием (нет записи → enabled:false);
  `setEnabled` upsert (вкл, затем выкл — одна строка); `setEnabled` с неизвестным id → бросает;
  `isEnabled` корректен.
- `PluginsController`: `PUT` с невалидным id → 400; happy-path тогл.
- Gateway `chat-roll`: отклоняет при выключенном дайсе и для гостя; пропускает при включённом.

### Фронт (vitest)

- `usePlugins`: `isEnabled` до/после `loadPlugins`; `setEnabled` оптимистично меняет стейт; `reset`.
- `PluginsView`: рендер карточек, тогл вызывает `plugins.setEnabled`.
- `CanvasView` (или вынести условие в чистую функцию): dice-тулбар скрыт при выключенном плагине,
  показан при включённом и роли != read.

## Объём первого PR

Всё сразу: инфраструктура плагинов (entity + миграция + реестр + сервис + контроллер + модуль),
страница `/plugins`, интеграция дайсов (гейтинг фронт+бэк). Ветка `dev` в обоих репозиториях.

## Вне объёма (YAGNI)

- Динамический каталог плагинов в БД, админка каталога.
- Плагины уровня канваса/документа как ресурса, шаринг плагинов, слаги.
- Плагины для `document`/`html` (модель готова, конкретных пока нет).
- Гейтинг отрисовки чужих бросков у зрителя.
