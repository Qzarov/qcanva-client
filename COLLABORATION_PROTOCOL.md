# Canvas Server Collaboration Protocol

Этот документ фиксирует целевую migration path для перехода от текущего hybrid realtime (`canvas-op` + `canvas-update`) к серверно-упорядоченной модели совместного редактирования.

## Цели

- Сервер является единственным `source of truth`
- У каждой принятой операции есть глобальный порядок
- Клиент не может молча перетереть чужие изменения полным snapshot'ом
- При рассинхроне есть явный `resync`-путь
- Архитектура остаётся совместимой с будущим `op log`, history и точечным переходом к OT/CRDT

## Статус

Первый рабочий срез уже реализован:

- `Canvas.revision` добавлен;
- `GET /api/canvas/:id` возвращает `revision`;
- `canvas-op` переведён на `baseRevision + clientOpId`;
- сервер шлёт `canvas-op-ack` / `canvas-op-reject`;
- fallback `canvas-update` тоже стал revision-aware;
- добавлен `POST /api/canvas/:id/resync`;
- фронт делает forced `resync` при `revision_mismatch`;
- добавлена таблица `canvas_operations`;
- подтверждённые `canvas-op` пишутся в op log;
- добавлен `GET /api/canvas/:id/operations?limit=50` для истории и дебага.
- добавлена таблица `canvas_checkpoints`;
- создаётся checkpoint на `revision 0` и затем каждые `25` ревизий;
- добавлен `GET /api/canvas/:id/checkpoints?limit=20` для отладки snapshot strategy.
- добавлен `GET /api/canvas/telemetry` с in-memory counters по sync событиям и reject reason.

Следующий слой работ:

- telemetry по reject/resync;
- формализация conflict policy;
- более строгий recovery и selective retry.

## Текущее состояние

Сейчас модель выглядит так:

- `canvas-op` нужен для быстрого realtime UX
- `canvas-update` отправляет полный state и сохраняет его в БД
- БД хранит последний snapshot, а не последовательность операций

Главная проблема:

- два клиента могут увидеть корректный realtime локально;
- но при близких по времени full-state сохранениях последний snapshot становится истиной и может затереть чужое изменение.

## Целевая модель

Базовая идея:

- клиент загружает `canvas` вместе с `revision`;
- клиент отправляет `canvas-op` только относительно известной ему ревизии;
- сервер проверяет `baseRevision`, применяет операцию к каноническому состоянию, увеличивает `revision`;
- сервер рассылает уже подтверждённую версию операции всем клиентам;
- при рассинхроне клиент делает `resync`.

## Изменения в данных

### Canvas

Нужно расширить сущность `Canvas`:

```ts
type Canvas = {
  id: string;
  title: string;
  data: string;
  revision: number;
  isPublic: boolean;
  visibility: 'private' | 'authenticated' | 'public';
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};
```

Правила:

- `revision` начинается с `0` для нового canvas;
- каждая принятая сервером mutating operation увеличивает `revision` на `1`;
- `title`, `visibility`, `share` можно позже тоже перевести на ту же модель, но на первом этапе достаточно покрыть graph operations.

### CanvasOperation

Нужна отдельная таблица для журнала операций:

```ts
type CanvasOperation = {
  id: string;
  canvasId: string;
  revision: number;
  clientOpId: string;
  userId: string;
  type: string;
  payload: string;
  createdAt: Date;
};
```

Минимальные инварианты:

- `(canvasId, revision)` уникален;
- `clientOpId` используется для дедупликации повторно присланной клиентом операции;
- `payload` хранит сериализованное тело операции.
- на текущем этапе в таблицу пишутся только подтверждённые `canvas-op`, а не legacy `canvas-update`.

### CanvasCheckpoint

Нужна отдельная таблица для периодических snapshot checkpoints:

```ts
type CanvasCheckpoint = {
  id: string;
  canvasId: string;
  revision: number;
  data: string;
  createdAt: Date;
};
```

Политика на текущем этапе:

- checkpoint создаётся при создании canvas на `revision = 0`;
- затем checkpoint создаётся каждые `25` ревизий;
- checkpoint хранит полный snapshot канваса на соответствующей ревизии;
- checkpoint нужен для ускорения replay/history/debug, а не для realtime sync.

## REST contract

### GET /api/canvas/:id

Ответ должен включать актуальную ревизию:

```json
{
  "canvas": {
    "id": "canvas-id",
    "title": "Untitled",
    "data": "{\"nodes\":[],\"edges\":[]}",
    "revision": 42,
    "visibility": "private"
  },
  "role": "owner"
}
```

### POST /api/canvas

Новый canvas создаётся с `revision: 0`.

### POST /api/canvas/:id/resync

Можно сделать и `GET`, но `POST` удобен, если позже потребуется передавать диагностический контекст клиента.

Пример ответа:

```json
{
  "canvas": {
    "id": "canvas-id",
    "data": "{\"nodes\":[],\"edges\":[]}",
    "revision": 42
  }
}
```

Назначение:

- полный recovery после `revision_mismatch`;
- recovery после reconnect;
- fallback для legacy/full-state пути.

### GET /api/canvas/:id/operations?limit=50

Возвращает последние подтверждённые операции для canvas в порядке возрастания `revision`.

Пример ответа:

```json
[
  {
    "id": "op-row-id",
    "canvasId": "canvas-id",
    "revision": 43,
    "clientOpId": "01HSXYZ...",
    "userId": "user-1",
    "type": "nodes-move",
    "op": {
      "type": "nodes-move",
      "moves": [{ "id": "node-1", "x": 120, "y": 340 }]
    },
    "createdAt": "2026-04-17T10:00:00.000Z"
  }
]
```

### GET /api/canvas/:id/checkpoints?limit=20

Возвращает последние checkpoint snapshots без полного `data`, только метаданные:

```json
[
  {
    "id": "checkpoint-row-id",
    "canvasId": "canvas-id",
    "revision": 50,
    "createdAt": "2026-04-17T10:20:00.000Z",
    "sizeBytes": 18342
  }
]
```

### GET /api/canvas/telemetry

Возвращает in-memory telemetry counters по событиям синхронизации.

Пример ответа:

```json
{
  "startedAt": "2026-04-17T10:00:00.000Z",
  "counters": [
    { "key": "global:op_ack", "value": 12 },
    { "key": "global:reject:revision_mismatch", "value": 3 },
    { "key": "canvas:canvas-id:resync", "value": 2 }
  ]
}
```

Назначение:

- видеть частоту `resync` и `reject`;
- быстро замечать проблемные canvas;
- проверять, что новая sync-модель ведёт себя ожидаемо.

## WebSocket contract

Namespace остаётся `/canvas-ws`.

### join-canvas

Клиент отправляет:

```json
{
  "canvasId": "canvas-id"
}
```

Сервер в ответ дополнительно может прислать состояние room:

```json
{
  "canvasId": "canvas-id",
  "revision": 42
}
```

Это не заменяет REST initial load, но помогает при reconnect.

### canvas-op: client -> server

Новый payload:

```json
{
  "clientOpId": "01HSXYZ...",
  "baseRevision": 42,
  "op": {
    "type": "nodes-move",
    "nodeId": "node-1",
    "x": 120,
    "y": 340
  }
}
```

Поля:

- `clientOpId`: уникальный id операции на клиенте;
- `baseRevision`: ревизия, поверх которой клиент строил операцию;
- `op`: доменная операция canvas.

### canvas-op-ack: server -> sender

Если операция принята:

```json
{
  "clientOpId": "01HSXYZ...",
  "revision": 43,
  "op": {
    "type": "nodes-move",
    "nodeId": "node-1",
    "x": 120,
    "y": 340
  }
}
```

Назначение:

- подтвердить optimistic update;
- обновить локальный `currentRevision`;
- снять pending-статус операции.

### canvas-op: server -> room

Сервер рассылает уже подтверждённую сервером операцию:

```json
{
  "clientOpId": "01HSXYZ...",
  "revision": 43,
  "userId": "user-1",
  "op": {
    "type": "nodes-move",
    "nodeId": "node-1",
    "x": 120,
    "y": 340
  }
}
```

Важно:

- клиенты применяют не “сырой локальный op другого клиента”, а серверно-упорядоченный op с ревизией;
- если ожидаемая следующая ревизия не совпала, клиент не пытается гадать и идёт в `resync`.

### canvas-op-reject: server -> sender

Если операция не принята:

```json
{
  "clientOpId": "01HSXYZ...",
  "reason": "revision_mismatch",
  "serverRevision": 45
}
```

Допустимые `reason` на первом этапе:

- `revision_mismatch`
- `forbidden`
- `invalid_op`
- `target_missing`

Правила клиента:

- `revision_mismatch` -> немедленный `resync`;
- `target_missing` -> обычно `resync`, потому что локальная модель уже устарела;
- `forbidden` -> показать ошибку и откатить optimistic state;
- `invalid_op` -> логировать как баг клиента.

### canvas-resync: client -> server

Опциональный WS-вариант поверх REST:

```json
{
  "canvasId": "canvas-id",
  "knownRevision": 42
}
```

Ответ:

```json
{
  "canvasId": "canvas-id",
  "revision": 45,
  "canvasData": "{\"nodes\":[],\"edges\":[]}"
}
```

На первом этапе достаточно REST endpoint. WS-resync нужен только если захочется сделать recovery полностью в сокетном контуре.

## Клиентская модель состояния

Минимальное состояние на фронте:

```ts
type CollaborationState = {
  currentRevision: number;
  pendingOps: Map<string, PendingOp>;
  isResyncing: boolean;
};
```

Где:

```ts
type PendingOp = {
  clientOpId: string;
  baseRevision: number;
  op: unknown;
  createdAt: number;
};
```

Правила:

- локальное изменение сначала применяется optimistically;
- операция кладётся в `pendingOps`;
- после `canvas-op-ack` удаляется из `pendingOps`, `currentRevision` обновляется;
- если прилетела серверная операция с неожиданной ревизией, клиент делает `resync`;
- во время `resync` локальные новые mutating actions лучше временно блокировать.

## Правила применения операций

На первом этапе достаточно простых правил:

- операции по разным нодам и рёбрам могут применяться параллельно;
- для одной и той же ноды используем `last-writer-wins` на уровне поля;
- конфликт `delete vs update` решаем через reject/resync;
- конфликт `delete vs move` решаем через reject/resync;
- `edge-add` разрешается только если source/target ещё существуют в текущей серверной ревизии;
- если таргет объекта уже не существует, сервер не пытается “воскресить” его неявно.

Это ещё не полноценный OT/CRDT, но уже корректная ревизионная модель.

## Переходный режим

Чтобы не ломать текущий клиент сразу:

### Шаг 1

- оставить текущий `canvas-update`;
- добавить `revision` в REST ответ;
- добавить новый формат `canvas-op`.

### Шаг 2

- новый клиент отправляет `canvas-op` с `baseRevision`;
- сервер начинает подтверждать/reject'ить операции;
- `canvas-update` остаётся только как fallback checkpoint.

### Шаг 3

- после стабилизации нового клиента убрать legacy full-state sync из realtime-контура;
- полный snapshot оставить только для initial load, resync и periodic checkpoint.

## Минимальные изменения на backend

### Сущности

- добавить `revision` в `Canvas`;
- добавить `CanvasOperation`.

### CanvasService

Нужны новые методы:

- `getCanvasWithRevision(canvasId, userId)`
- `applyOperation(canvasId, userId, baseRevision, clientOpId, op)`
- `resync(canvasId, userId)`

`applyOperation` должен:

1. проверить доступ;
2. загрузить canvas и его `revision`;
3. сравнить `baseRevision` с текущей ревизией;
4. применить операцию к `data`;
5. увеличить `revision`;
6. сохранить новый snapshot;
7. записать op в `canvas_operations`;
8. вернуть `{ revision, op, clientOpId }`.

### CanvasGateway

Нужно поменять поведение:

- `handleCanvasOp` перестаёт быть простым broadcast;
- операция сначала проходит через `CanvasService.applyOperation`;
- отправителю уходит `canvas-op-ack` или `canvas-op-reject`;
- в room уходит подтверждённая сервером операция с новой ревизией.

## Минимальные изменения на frontend

### API client

Добавить:

- `canvas.resync(id)`

### useCanvasSocket

Нужно расширить:

- хранение `currentRevision`;
- генерация `clientOpId`;
- `sendOp(op, baseRevision, clientOpId)`;
- обработка `canvas-op-ack`;
- обработка `canvas-op-reject`;
- явный `resync()` flow.

### CanvasView

Нужно обновить:

- initial load должен сохранять `revision`;
- `onCanvasOp` должен отправлять ops через revision-aware контракт;
- `saveData` перестаёт быть главным способом синхронизации коллаборации;
- при `isResyncing` UI должен либо показывать blocking overlay, либо временно блокировать mutating actions.

## Что пока не делаем

- не переводим весь canvas сразу на CRDT;
- не решаем collaborative text editing внутри текстовой ноды на уровне посимвольных merge;
- не строим сложный offline-first replication;
- не делаем merge “любой ценой” при любой гонке.

## Почему это не тупик

После этого шага становится проще добавлять:

- history;
- diff;
- audit;
- replay;
- selective retry;
- отдельную более умную модель для text nodes;
- CRDT/OT только там, где он действительно нужен.
