# Canvas Ruler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Совместная линейка: зажать указатель, измерять расстояние, отпустить и скрыть результат через 3 секунды; масштаб и единицы задаёт владелец.

**Architecture:** Постоянные настройки вынесены из canvas.data в поля Canvas. Временные измерения проходят через отдельные Socket.IO события и серверное in-memory состояние без canvas-op/revision. Отдельные composables и overlay обслуживают жесты, сроки жизни и рендеринг, не обновляя слой изображений.

**Tech Stack:** Vue3/TypeScript, NestJS/Socket.IO, TypeORM/better-sqlite3, Vitest/Jest/Playwright. Новые продуктовые зависимости не нужны.

**Spec:** `docs/superpowers/specs/2026-10-03-canvas-ruler-design.md` в frontend-репозитории.

## Global Constraints

- Frontend: `/home/qzarov/Devin/pet/canvas-server-front`, dirty `dev`; сохранить предыдущие этапы1–4.
- Backend: `/home/qzarov/Devin/pet/canvas-server-back`, чистая `feat/obsidian-manual-sync`; до редактирования согласовать отдельный worktree и проверить базу ветки.
- На вебе и мобильном один жест: зажать и вести; отпускание фиксирует, TTL3000мс.
- `RULER_FINISH_TTL_MS = 3000`, throttle50мс, heartbeat1000мс, lease6000мс — именованные константы.
- По умолчанию плагин выключен; метры и `metersPerCanvasUnit = 0.01`.
- Все участники с доступом, включая read/guest, могут измерять. Только владелец меняет включение, единицы и масштаб; password-access не владелец.
- 1фут = 0.3048м; смена единицы сохраняет физический масштаб. Подпись2десятичных знака.
- Нет новых нод, content changes, revision, истории или чата от измерений/настроек.
- Отдельный overlay вне canvas-world, pointer-events:none; никаких присваиваний canvasData от сообщений линейки.
- Backend DTO/WS: только конечные координаты с модулем≤10^9; конечный положительный масштаб и конечные преобразования.
- Не реализовывать отложенные мигание картинок, музыку и расширенный текст; не менять схему JSON Canvas/документов.
- Никаких commit/push/deploy или миграций на рабочей/продовой БД в этом исполнении. Проверки миграции только в памяти/временной БД.
- Предпочтение исполнения: inline/native с одним независимым итоговым review; требует подтверждения пользователя вместе с планом.

## Review Focus

1. Событие finish после отложенного move или старый clear/таймер после нового жеста: новая линия не исчезает, старая не воскресает. Тесты Task2/3.
2. Перемещение камеры/resize viewport и отпускание вне ноды: мировое начало не прыгает, финальная точка соответствует указателю. Тесты Task4.
3. Доступ отозван или плагин выключен во время активного жеста: следующий пакет не транслируется, активные линии очищены. Тесты Task2/6.
4. Старый клиент/snapshot/Obsidian сохраняет canvas.data: настройки линейки не теряются, revision не меняется от настроек. Тесты Task1/6.
5. Ошибка сохранения или гонка HTTP ответа с WS обновлением: UI не показывает неподтверждённый масштаб, поздний ответ не откатывает новые настройки. Тесты Task5.

## File Structure

Пути B относительны backend-репозиторию, F — frontend.

- B `src/canvas/ruler-contract.ts`: DTO/types/constants/validation временных сообщений.
- B `src/canvas/ruler-state.ts`: состояние измерений, версии событий, TTL/lease и очистка; без БД/Socket.IO.
- B `src/canvas/canvas-ruler.service.ts`: настройки и доступ; обработка сообщений и уведомления в проверенную комнату.
- B существующие Canvas entity/service/controller/gateway/module, plugin registry/service и TypeORM config: узкие места интеграции.
- B миграция `src/db/migrations/1790985600000-add-canvas-ruler-settings.ts`: две новые колонки.
- F `src/canvas/ruler.ts`: frontend contract/constants/математика; контракт совпадает с backend и проверяется literal fixtures.
- F `src/composables/useCanvasRuler.ts`: settings, remote states, throttle, heartbeat, expiry, disconnect cleanup.
- F `src/canvas/useRulerGesture.ts`: Pointer Events/capture и расчёт world points через callbacks камеры.
- F `src/canvas/CanvasRulerOverlay.vue`: экранная SVG линия, точки и HTML подпись, без жестов/сети.
- F `src/components/CanvasRulerSettings.vue`: owner-only форма; остальные видят значения.
- F существующие CanvasView/CanvasLoader/useCanvasSocket/api/i18n: wiring и кнопка режима.
- Тесты располагаются рядом с соответствующими модулями. Browser fixture — только в F `tests/support/`, не в product classes.

## Execution Setup

- [x] Прочитать спецификацию; проверить AGENTS.md, ветки, git status и существующие worktrees обоих репозиториев.
- [x] После выбора пользователя: backend isolated worktree от согласованного HEAD; frontend продолжить в текущем dev с сохранением предыдущих изменений. Не создавать/не переключать worktree без согласования.
- [x] Запустить baseline: F `npm run test:unit`; B `npm test -- --runInBand`. Expected: exit0; перечислить существующие сбои до исправлений, не скрывать их.
- [x] Создать ledger именно этого плана по executing-plans; записать реальные абсолютные пути F/B и BASE каждого репозитория. Отступление «без коммитов» фиксировать как согласованное ограничение.

### Task 1: Persistent owner settings and plugin registration

**Files:** B create `src/canvas/canvas-ruler.service.ts`, `src/canvas/canvas-ruler.service.spec.ts`, migration above and its spec; modify `src/entities/canvas.entity.ts`, `src/canvas/canvas.service.ts`, `src/canvas/canvas.controller.ts`, `src/canvas/canvas.module.ts`, `src/plugins/plugin-registry.ts`, `src/plugins/plugins.service.ts`, `src/db/typeorm.config.ts`, corresponding existing specs.

**Interfaces:**
- Produces `RulerSettings = { enabled:boolean; unit:'m'|'ft'; metersPerCanvasUnit:number }`.
- `CanvasRulerService.getSettings(canvasId:string, user?:AuthUser):Promise<RulerSettings>` resolves id/slug through normal canvas access.
- `CanvasRulerService.setSettings(canvasId:string,user:AuthUser,settings:{unit:'m'|'ft';metersPerCanvasUnit:number}):Promise<RulerSettings>` owner-only, under existing canvas lock.
- `CanvasService.setRulerSettings(canvasId:string,user:AuthUser,settings:{unit:'m'|'ft';metersPerCanvasUnit:number}):Promise<{unit:'m'|'ft';metersPerCanvasUnit:number}>` is the narrow public owner-only writer wrapping private withCanvasLock; CanvasRulerService delegates to it rather than reaching into private lock state. Sanitized authorized canvas reads expose the two persisted ruler fields for settings composition.
- `PluginsService.onChange(callback:(change:{resourceType:PluginResourceType;resourceId:string;pluginId:string;enabled:boolean})=>void|Promise<void>):()=>void`; notify after successful save, failed listeners do not undo saved state.
- GET `/canvas/:id` adds `canvas.rulerSettings`; PUT `/canvas/:id/ruler-settings` returns RulerSettings. Controller delegates; CanvasService's content flows never persist transient ruler state.

- [x] Write failing tests: defaults/off, m/ft, positive fractional scale, reject0/negative/nonfinite/overflow; role owner vs edit/read/guest/password; original data/revision/history unchanged; old content update retains settings; duplicate copies scale/unit but plugin off.
  Representative assertions with isolated repositories:
  ```ts
  expect(await service.getSettings('canvas-1', reader)).toEqual({ enabled:false,unit:'m',metersPerCanvasUnit:0.01 });
  await expect(service.setSettings('canvas-1', editor, {unit:'ft',metersPerCanvasUnit:0.01})).rejects.toThrow(ForbiddenException);
  expect(storedCanvas.revision).toBe(7);
  expect(storedCanvas.data).toBe(originalData);
  ```
- [x] Run B `npm test -- --runInBand canvas-ruler.service plugin-registry plugins.service`. Expected: new behavior fails, not unrelated fixture/import errors. Add declarations only if needed to reach meaningful RED.
- [x] Implement registry `ruler`, entity defaults, PUT DTO validation, locked owner write, permitted GET, duplicate fields. Avoid dependency cycle: CanvasRulerService injects CanvasService/PluginsService; CanvasService does not inject CanvasRulerService. Existing getOne/controller composes settings after findOne; WS join composes separately.
- [x] Implement additive migration; memory SQLite test creates old canvas table/row, runs up and verifies preserved row plus0.01/m defaults. Register migration. Down must not rebuild/delete user's table; follow existing non-destructive migration pattern.
- [x] Plugin listener tests: correct resource only, no notification on failed write, unsubscribe, listener rejection doesn't report a successfully persisted setting as failed.
- [x] Run focused tests plus B `npm test -- --runInBand` and `npm run build`. Expected: exit0, no failing suites. Record task completion without commit.

### Task 2: Authoritative temporary measurement room state

**Files:** B create `src/canvas/ruler-contract.ts`, `src/canvas/ruler-state.ts`, `src/canvas/ruler-state.spec.ts`, `src/canvas/canvas-ruler.gateway.spec.ts`; modify service/gateway/module and existing `src/canvas/canvas-gateway-roll.spec.ts` constructor fixtures.

**Interfaces:**
- Consumes Task1 getSettings/setSettings and plugin change subscription.
- `Point={x:number;y:number}`; `RulerUpdate={gestureId:number;sequence:number;start:Point;end:Point;phase:'dragging'|'finished'}`. Both IDs positive safe integers; gestureId increases for a connection.
- `RulerMeasurement=RulerUpdate & {socketId:string;userId:string;userName:string;color:string;expiresAt:number|null}`.
- `RulerActor={socketId:string;userId:string;userName:string;color:string}` — только проверенное членство комнаты.
- `RulerState={settings:RulerSettings;measurements:RulerMeasurement[];serverTime:number}`.
- `RulerRoomState.apply(actor:RulerActor,update:RulerUpdate,now:number):RulerMeasurement|null`, `clear(socketId:string,gestureId:number):boolean`, `snapshot(now:number):RulerMeasurement[]`, `removeSocket(socketId:string):void`, `clearAll():void`. Actor identity populated only from server room membership, not payload.
- Gateway handlers `handleRulerUpdate(client:AuthSocket,data:RulerUpdate)`, `handleRulerClear(client,data:{gestureId:number})`; emit `ruler-update`, `ruler-clear`, `ruler-state`, `ruler-settings`, `ruler-error`.
- `ruler-clear` server payload `{socketId,gestureId}`; full room reset sends `ruler-state` with empty measurements. Settings/state carry serverTime.

- [x] RED tests with fake clock: two users independent, final end wins, expires at3000 not2999, replacement survives previous expiry, lower gestureId/sequence ignored, finished gesture rejects later dragging, clear tombstone rejects late resurrection, heartbeat refreshes6000 lease, disconnect clears, snapshot omits expired state.
  ```ts
  const actor = {socketId:'a',userId:'u1',userName:'A',color:'#a882ff'};
  state.apply(actor, {gestureId:1,sequence:2,start:{x:0,y:0},end:{x:300,y:400},phase:'finished'}, 1000);
  expect(state.snapshot(3999)).toHaveLength(1);
  expect(state.snapshot(4000)).toHaveLength(0);
  ```
- [x] Run B `npm test -- --runInBand ruler-state canvas-ruler.gateway`. Expected: missing state behavior RED, not constructor fixture failures.
- [x] Implement bounded one-record-per-socket state and per-connected-socket tombstone/version tracking. Serialize async handling per socket so permission lookups cannot reorder accepted messages. Finish is terminal; new higher gestureId replaces it. Remove tombstones when connection leaves.
- [x] Gateway security RED tests: unauthorised/no member, wrong room, plugin off, access revoked, read and public guest allowed, malformed payload, author spoof ignored, rate>20 movement updates/second suppressed, finish/clear still delivered. No op/persistence callback invoked.
- [x] Implement trusted actor lookup from existing canvasUsers; require current access and enabled plugin, cap payload and coordinates. No browser-provided room/identity. Validate new gestures and monotonically numbered movement; final phase bypasses movement throttle but repeated finish cannot extend expiry.
- [x] Subscribe to plugin change in gateway lifecycle; broadcast settings and clear on disable. On successful settings PUT publish ruler-settings only. Join emits ruler-state; leave/disconnect cleans; timers cleaned on module destruction. Re-check access for updates without changing normal cursor/op handling.
- [x] Run focused B tests, full `npm test -- --runInBand`, `npm run build`. Expected: exit0; pre-existing dice and join tests still pass. Ledger, no commit.

### Task 3: Frontend math and realtime session lifecycle

**Files:** F create `src/canvas/ruler.ts`, `src/canvas/ruler.test.ts`, `src/composables/useCanvasRuler.ts`, `src/composables/useCanvasRuler.test.ts`; modify `src/composables/useCanvasSocket.ts`, `src/composables/useCanvasSocket.test.ts`.

**Interfaces:**
- Consumes exact Task2 WS shapes/events and Task1 settings.
- `worldDistance(start:Point,end:Point):number`; `distanceInUnit(start,end,settings):number`; `canvasUnitsPerSelectedUnit(settings):number`; `settingsFromScale(unit:'m'|'ft',canvasUnits:number):{unit;metersPerCanvasUnit}`; `screenToWorld(point,rectOrigin,camera):Point`, `worldToScreen(point,camera):Point`.
- useCanvasSocket exposes `sendRulerUpdate(update:RulerUpdate):void`, `sendRulerClear(gestureId:number):void`, and callback setters `onRulerState`, `onRulerUpdate`, `onRulerClear`, `onRulerSettings`, `onRulerError`. Existing socket owns actual connection; avoid second socket. Ruler error cancels the refused shared gesture and reports via existing toast; no fake success.
- `useCanvasRuler({connected,sendUpdate,sendClear})` exposes readonly settings/measurements, `setInitialSettings(settings)`, `begin(point)`, `move(point)`, `finish(point)`, `cancel()`, `receiveState(state)`, `receiveUpdate(measurement)`, `receiveClear(payload)`, `receiveSettings({settings,serverTime})`.

- [x] Write math RED: literal3–4–5 fixture→5m at0.01;→16.404199475ft; unit switch preserves canonical scale; pan/zoom screen inversion; invalid scales/coordinates rejected. Hand-compute expected points, not through same helper.
- [x] Run F `npm run test:unit -- src/canvas/ruler.test.ts`. Expected: behavior RED. Implement small pure helpers and mirrored contract/constants, then same command GREEN.
- [x] Session RED with fake timers: final endpoint flushes throttled move, TTL3000/2999, old clear/old timer doesn't clear next gesture, stale move can't revive finished, initial/late snapshot, heartbeat1000, lease presentation, disconnect cleanup, reconnect no stale replay, final phase not volatile.
- [x] Run F `npm run test:unit -- src/composables/useCanvasRuler.test.ts src/composables/useCanvasSocket.test.ts`. Expected: behavior RED; keep real session composable, fake only external socket/clock.
- [x] Implement20Hz movement transport plus rAF local updates, pending-move cancellation on finish, immediate final/clear. Snapshot/settings update without content mutation. Register event callbacks before wsConnect. Read serverTime offset, remote TTL uses server expiresAt; local finish never remains visible beyond its local3s due to delayed echo.
- [x] Socket callbacks remove expired/cleared states by gesture identity; disable/unmount resets session and timers. Do not buffer ruler events through disconnect; use existing connected state and fresh ruler-state after reconnect.
- [x] Run focused tests and full F `npm run test:unit`. Expected: exit0. Update older socket mocks only where the new consumer uses its new methods; mocks still model actual API. Ledger, no commit.

### Task 4: Pointer gesture and independent rendering

**Files:** F create `src/canvas/useRulerGesture.ts`, `src/canvas/useRulerGesture.test.ts`, `src/canvas/CanvasRulerOverlay.vue`, `src/canvas/CanvasRulerOverlay.test.ts`, `src/components/CanvasLoader.ruler.test.ts`; modify `src/components/CanvasLoader.vue`.

**Interfaces:**
- Consumes Task3 math/session functions.
- `useRulerGesture({viewport,active,camera,begin,move,finish,cancel})` exposes capture-phase pointer handlers and `cancelGesture()`. camera is readonly world transform; session callbacks take world Point.
- CanvasLoader new props `rulerActive:boolean`, `rulerMeasurements:RulerMeasurement[]`, `rulerSettings:RulerSettings`; emits `ruler-begin`, `ruler-move`, `ruler-finish`, `ruler-cancel`. No ruler payload in getCanvasData/change/op.
- Overlay props measurements/settings/camera/viewportSize; renders screen-coordinate lines, endpoint circles and bounded labels. Root sibling of canvas-world with own compositor layer.

- [x] RED integration tests with real CanvasLoader: pointerdown over image/text/group starts anchor, pointermove changes only measurement, pointerup captured outside fixes final endpoint, no node selection/move/op/change; pure movement without pressed pointer does not measure.
- [x] RED gesture tests: button0 only, capture lifecycle, pointercancel/lostcapture/blur, second touch cancels and releases capture for existing pinch flow; wheel/middle-button preserve camera, actual transform changes recompute active endpoint from last screen pointer; label clamps after viewport resize.
- [x] Run F `npm run test:unit -- src/canvas/useRulerGesture.test.ts src/canvas/CanvasRulerOverlay.test.ts src/components/CanvasLoader.ruler.test.ts`. Expected: behavior RED.
- [x] Implement capture handlers before legacy mouse/touch handlers. During active primary ruler gesture suppress compatibility mouse and node drag/contextmenu/selection handlers, without changing existing gestures when inactive. Deliberate capture release after normal pointerup must not cancel finished state via lostpointercapture.
- [x] Render overlay outside world layer using worldToScreen and screen-space label offsets; clamp label to viewport. Data-testid/aria labels describe real rendered measurements, not implementation-private scaffolding. Themes use existing tokens.
- [x] Run focused tests and existing CanvasLoader touch/resize/connections/remoteSync tests, then full F unit suite. Expected: exit0; no image DOM replacement or src changes during ruler gestures. Ledger, no commit.

### Task 5: Canvas controls and owner configuration

**Files:** F create `src/components/CanvasRulerSettings.vue`, `src/components/CanvasRulerSettings.test.ts`, `src/views/CanvasView.ruler.test.ts`; modify `src/views/CanvasView.vue`, `src/api/client.ts`, `src/composables/useI18n.ts`, `src/style.css`, existing CanvasView mobileBack/mobilePolish tests.

**Interfaces:**
- Consumes Task1 API, Task3 session, Task4 props/events.
- `canvas.setRulerSettings(id:string,settings:{unit:'m'|'ft';metersPerCanvasUnit:number}):Promise<RulerSettings>`.
- Settings component props `{settings:RulerSettings;isOwner:boolean;busy:boolean}`, emits `save` with normalized canonical settings. Parent persists; invalid input never sends API request.
- CanvasView local `rulerActive`, `toggleRuler()`, `closeRuler()`; forwards session data and events to CanvasLoader. No addition to persisted mobile mode singleton required: ruler is exclusive temporary mode that exits to Hand on mobile.

- [x] RED UI tests: enabled/off per-canvas, read/guest usable, owner-only form and exact normalized request, m/ft switch preserves physical scale, error keeps prior authoritative setting, no requests on invalid value.
- [x] RED race tests: WS settings arrives while owner save pending; late HTTP success/error does not overwrite a newer authoritative value. Do not optimistically change room-wide scale before server validation.
- [x] RED controls: close edit/add/dice/draw panels on entry, deactivate ruler on selecting another tool/opening incompatible panel; Esc and Back stop ruler without leaving canvas; disable cancels immediately; repeat gestures while mode active work; reopen resets mode.
- [x] Run F `npm run test:unit -- src/components/CanvasRulerSettings.test.ts src/views/CanvasView.ruler.test.ts src/views/CanvasView.mobileBack.test.ts src/views/CanvasView.mobilePolish.test.ts`. Expected: behavior RED, then GREEN after minimal wiring.
- [x] Implement topbar tool button visible web/mobile with icon/aria-pressed; settings entry for owner in existing plugin panel, read-only values for other roles. RU/EN text; save/invalid/offline messaging uses existing toast style. Existing plugin toggle path updates session from server-authoritative ruler settings events.
- [x] Superdesign UI workflow at this approved execution stage: inspect resume/auth and target context, preserve current controls/tokens. Do not create external project or spend on design generation until user opts in if no usable design connection; record fallback to existing UI components. No broad UI redesign.
- [x] Run focused tests plus full F unit suite and `npm run build`. Expected: exit0. Ledger, no commit.

### Task 6: Two-browser verification, security and handoff

**Files:** F create `tests/canvas-ruler.spec.ts`, `tests/support/ruler-server.ts`; modify frontend Playwright setup only for this suite's local fixture lifecycle. B new gateway/permission tests from Task2 receive any uncovered integration cases.

**Interfaces:**
- Local test fixture uses the real compiled backend CanvasGateway/CanvasRulerService/PluginsService and HTTP handlers with isolated in-memory repositories and deterministic test identities; no production database or real token.
- Pass backend root explicitly via test env `RULER_TEST_BACKEND_ROOT`, default sibling repo only when validated. Start ts-node from that backend's installed dependencies; bind only127.0.0.1 at an available test port. Frontend test uses the configured API/WS origin for that port via dedicated Vite test server, not mocked WS messages.
- Memory repositories are test utilities only. Access fixtures: owner/edit/read, anonymous public viewer and unauthorised private guest. Actual gateway JWT handling and room broadcast stay real. Real CanvasService role enforcement additionally covered by B unit tests with complete repository fixtures.

- [x] Browser tests first: two contexts owner+reader, simultaneous drags, final line visible immediately at both, disappears after release without second click; late join during drag/finished, reconnect cleanup, owner settings propagated, off cancels everyone, reject unauthorised join/update.
- [x] Mouse and actual touch test contexts: drag over image, outside viewport, pan/zoom and second touch; labels visible in light/dark and small viewport. Assert rendered distance through independent literal fixture geometry.
- [x] Count HTTP image requests without Playwright routing (routing disables HTTP cache); real HTTP image fixture has immutable cache policy. Observe image DOM identity/src during ruler updates. CDP layer paint tracing compares the image world layer while only ruler moves; report GPU/real Android limitations honestly, never claim the deferred flicker fixed.
- [x] Run browser suite with local backend fixture and frontend Vite lifecycle controlled by the suite. Expected: all ruler checks pass; fixture processes/sockets/timers stop in finally. Do not contact qcanva production for these tests.
- [x] Final fresh verification: B `npm test -- --runInBand`, `npm run build`; F `npm run test:unit`, `npm run build`; F focused Playwright ruler plus minimap/block-settings/selection/mobile smoke/outline suites. Expected: exit0, report exact counts and any existing warnings/failures.
- [x] `git diff --check` in both workspaces; review complete scoped ruler diff independently once per executing-plans, with explicit preservation of earlier stages/Obsidian branch and Review Focus. Critical/Important findings get one TDD fix pass and full green suite; document minors, no silent scope expansion.
- [x] After actual implementation and verification: update only ruler task in KuCanvas plan to `✅ (веб, мобилка)` and append `Примечание:` with behaviour/test counts, no-deploy status and real-Android limitation. Read back exact change and prove unrelated content preserved; skipped tasks remain skipped.
- [x] Final handoff: implementation paths, verification evidence, remaining manual Android check, no commit/push/deploy. Only plan/spec produced at planning stage; no completion mark before code/testing.

## Planning Self-Review

- Requirements mapped: owner scale and m/ft→Task1/3/5; transient multi-user TTL→Task2/3/6; pointer drag and cancel→Task4/5; late join and reconnect→Task2/3/6; image isolation→Task4/6; migration/legacy client→Task1; docs→Task6.
- Type names and WS shapes share Task1/2 contracts; no undeclared later-task interfaces.
- Five Review Focus cases assigned concrete tests, not deferred to reviewer guessing.
- No implementation or dependency changes made while writing this plan; product scope stays the approved ruler feature.
