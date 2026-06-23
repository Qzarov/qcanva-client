# Canvas Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователям включать/отключать функционал через per-account плагины; первый плагин — бросок дайсов (dice) в чате канваса.

**Architecture:** Встроенный реестр плагинов в коде (бэк+фронт) + таблица `user_plugin` хранит состояние «юзер включил плагин». Гейтинг и на фронте (скрыть UI), и на бэке (отклонить сокет-действие). Семантика «каждый за себя»: включённые плагины действующего юзера гейтят его UI/действия.

**Tech Stack:** Бэк — NestJS 11, TypeORM (sql.js), jest. Фронт — Vue 3 (Options API + composables), vue-router, vitest.

## Global Constraints

- Обе репы: ветка **dev**, коммитить фичи туда (не в main).
- Бэк: `canvas-server-back` по пути `/home/qzaro/nocode/pet/canvas-server-back`. Тест: `npm test`. Сборка: `npm run build`.
- Фронт: `canvas-server-front` по пути `/home/qzaro/nocode/pet/canvas-server-front`. Тест: `npm run test:unit`. Сборка: `npm run build` (включает `vue-tsc -b`).
- Entity и migrations регистрируются ВРУЧНУЮ в `src/db/typeorm.config.ts` (оба массива).
- Иконки — Lucide / inline SVG, **не эмодзи** (правило пользователя).
- Реестр плагинов — единственный источник правды о доступных плагинах; в БД только состояние.
- Дайсы по умолчанию выключены (opt-in). Гости (нет аккаунта) — плагинов не имеют.
- Карточка броска в `ChatPanel.vue` НЕ гейтится (показ чужих бросков всегда).

---

## File Structure

**Бэкенд (`canvas-server-back`):**
- Create `src/plugins/plugin-registry.ts` — реестр (типы + `PLUGINS` + `PLUGIN_IDS`).
- Create `src/entities/user-plugin.entity.ts` — сущность состояния.
- Create `src/db/migrations/1764800000000-add-user-plugin.ts` — таблица `user_plugin`.
- Modify `src/db/typeorm.config.ts` — зарегистрировать entity + migration.
- Create `src/plugins/plugins.service.ts` — бизнес-логика (+ `.spec.ts`).
- Create `src/plugins/plugins.controller.ts` — REST API.
- Create `src/plugins/plugins.module.ts` — модуль (экспортирует сервис).
- Modify `src/app.module.ts` — подключить `PluginsModule`.
- Modify `src/canvas/canvas.module.ts` — импортировать `PluginsModule`.
- Modify `src/canvas/canvas.gateway.ts` — инжект `PluginsService` + гейтинг `chat-roll` (+ `.spec.ts`).

**Фронтенд (`canvas-server-front`):**
- Modify `src/api/client.ts` — экспорт `plugins`.
- Create `src/composables/usePlugins.ts` — singleton-стейт (+ `.test.ts`).
- Create `src/views/PluginsView.vue` — страница `/plugins` (+ `.test.ts`).
- Modify `src/router/index.ts` — роут `/plugins`.
- Modify `src/views/DashboardView.vue` — ссылка на `/plugins` в юзер-меню + сброс плагинов при логауте.
- Modify `src/views/CanvasView.vue` — гейтинг dice-тулбара и `rollDice`.

---

## Task 1: Plugin registry (бэк)

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugin-registry.ts`
- Test: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugin-registry.spec.ts`

**Interfaces:**
- Produces:
  - `type PluginSurface = "canvas-chat" | "document" | "html"`
  - `interface PluginDef { id: string; name: string; description: string; surface: PluginSurface }`
  - `const PLUGINS: PluginDef[]`
  - `const PLUGIN_IDS: Set<string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/plugins/plugin-registry.spec.ts
import { PLUGINS, PLUGIN_IDS } from "./plugin-registry";

describe("plugin-registry", () => {
  it("contains the dice plugin on the canvas-chat surface", () => {
    const dice = PLUGINS.find((p) => p.id === "dice");
    expect(dice).toBeDefined();
    expect(dice?.surface).toBe("canvas-chat");
    expect(dice?.name.length).toBeGreaterThan(0);
  });

  it("PLUGIN_IDS mirrors PLUGINS ids", () => {
    expect(PLUGIN_IDS.has("dice")).toBe(true);
    expect(PLUGIN_IDS.size).toBe(PLUGINS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugin-registry.spec.ts`
Expected: FAIL — `Cannot find module './plugin-registry'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/plugins/plugin-registry.ts
export type PluginSurface = "canvas-chat" | "document" | "html";

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  surface: PluginSurface;
}

export const PLUGINS: PluginDef[] = [
  {
    id: "dice",
    name: "Бросок дайсов",
    description: "Кнопка броска кубиков (d4–d100) в чате канваса.",
    surface: "canvas-chat",
  },
];

export const PLUGIN_IDS = new Set<string>(PLUGINS.map((p) => p.id));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugin-registry.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back
git add src/plugins/plugin-registry.ts src/plugins/plugin-registry.spec.ts
git commit -m "feat(plugins): plugin registry with dice plugin"
```

---

## Task 2: UserPlugin entity + migration + registration (бэк)

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/entities/user-plugin.entity.ts`
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/db/migrations/1764800000000-add-user-plugin.ts`
- Modify: `/home/qzaro/nocode/pet/canvas-server-back/src/db/typeorm.config.ts`

**Interfaces:**
- Produces: `class UserPlugin { id: string; userId: string; pluginId: string; enabled: boolean; createdAt: Date; updatedAt: Date }`

Эта задача — схема/конфиг; верифицируется компиляцией (`npm run build`), а поведенчески — тестами Task 3.

- [ ] **Step 1: Create the entity**

```ts
// src/entities/user-plugin.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Index(["userId", "pluginId"], { unique: true })
@Entity()
export class UserPlugin {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  pluginId: string;

  @Column({ default: false })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the migration**

```ts
// src/db/migrations/1764800000000-add-user-plugin.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserPlugin1764800000000 implements MigrationInterface {
  name = "AddUserPlugin1764800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_plugin" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "pluginId" varchar NOT NULL,
        "enabled" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_plugin_user_plugin" ON "user_plugin" ("userId", "pluginId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_plugin_user_plugin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_plugin"`);
  }
}
```

- [ ] **Step 3: Register entity + migration in typeorm.config.ts**

In `src/db/typeorm.config.ts`:

Add import near the other entity imports (after line 21 `import { CanvasMessage } ...`):
```ts
import { UserPlugin } from "../entities/user-plugin.entity";
```

Add migration import near the other migration imports (after the `AddCanvasMessageRoll1764700000000` import):
```ts
import { AddUserPlugin1764800000000 } from "./migrations/1764800000000-add-user-plugin";
```

Add `UserPlugin,` as the last item of the `entities: [...]` array (after `CanvasMessage,`).

Add `AddUserPlugin1764800000000,` as the last item of the `migrations: [...]` array (after `AddCanvasMessageRoll1764700000000,`).

- [ ] **Step 4: Verify it compiles**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back
git add src/entities/user-plugin.entity.ts src/db/migrations/1764800000000-add-user-plugin.ts src/db/typeorm.config.ts
git commit -m "feat(plugins): user_plugin entity + migration"
```

---

## Task 3: PluginsService (бэк)

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugins.service.ts`
- Test: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugins.service.spec.ts`

**Interfaces:**
- Consumes: `PLUGINS`, `PLUGIN_IDS`, `PluginDef` (Task 1); `UserPlugin` (Task 2).
- Produces:
  - `listForUser(userId: string): Promise<Array<PluginDef & { enabled: boolean }>>`
  - `setEnabled(userId: string, pluginId: string, enabled: boolean): Promise<void>`
  - `isEnabled(userId: string, pluginId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```ts
// src/plugins/plugins.service.spec.ts
import { BadRequestException } from "@nestjs/common";
import { PluginsService } from "./plugins.service";

function makeRepo(initial: any[] = []) {
  const rows = [...initial];
  return {
    rows,
    find: jest.fn(async ({ where }: any) => rows.filter((r) => r.userId === where.userId)),
    findOne: jest.fn(async ({ where }: any) =>
      rows.find((r) => r.userId === where.userId && r.pluginId === where.pluginId) ?? null,
    ),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (row: any) => {
      const i = rows.findIndex((r) => r.userId === row.userId && r.pluginId === row.pluginId);
      if (i >= 0) rows[i] = { ...rows[i], ...row };
      else rows.push(row);
      return row;
    }),
  };
}

describe("PluginsService", () => {
  it("listForUser merges registry with state (no row => disabled)", async () => {
    const repo = makeRepo();
    const service = new PluginsService(repo as never);
    const list = await service.listForUser("u1");
    const dice = list.find((p) => p.id === "dice");
    expect(dice).toBeDefined();
    expect(dice?.enabled).toBe(false);
  });

  it("setEnabled upserts a single row (enable then disable)", async () => {
    const repo = makeRepo();
    const service = new PluginsService(repo as never);
    await service.setEnabled("u1", "dice", true);
    expect(await service.isEnabled("u1", "dice")).toBe(true);
    await service.setEnabled("u1", "dice", false);
    expect(await service.isEnabled("u1", "dice")).toBe(false);
    expect(repo.rows.filter((r) => r.userId === "u1" && r.pluginId === "dice").length).toBe(1);
  });

  it("setEnabled rejects an unknown plugin id", async () => {
    const repo = makeRepo();
    const service = new PluginsService(repo as never);
    await expect(service.setEnabled("u1", "nope", true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("isEnabled is false when no row exists", async () => {
    const repo = makeRepo();
    const service = new PluginsService(repo as never);
    expect(await service.isEnabled("u1", "dice")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugins.service.spec.ts`
Expected: FAIL — `Cannot find module './plugins.service'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/plugins/plugins.service.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserPlugin } from "../entities/user-plugin.entity";
import { PLUGINS, PLUGIN_IDS, PluginDef } from "./plugin-registry";

@Injectable()
export class PluginsService {
  constructor(
    @InjectRepository(UserPlugin)
    private readonly repo: Repository<UserPlugin>,
  ) {}

  async listForUser(userId: string): Promise<Array<PluginDef & { enabled: boolean }>> {
    const rows = await this.repo.find({ where: { userId } });
    const enabled = new Set(rows.filter((r) => r.enabled).map((r) => r.pluginId));
    return PLUGINS.map((p) => ({ ...p, enabled: enabled.has(p.id) }));
  }

  async setEnabled(userId: string, pluginId: string, enabled: boolean): Promise<void> {
    if (!PLUGIN_IDS.has(pluginId)) {
      throw new BadRequestException("Unknown plugin");
    }
    let row = await this.repo.findOne({ where: { userId, pluginId } });
    if (!row) {
      row = this.repo.create({ userId, pluginId, enabled });
    } else {
      row.enabled = enabled;
    }
    await this.repo.save(row);
  }

  async isEnabled(userId: string, pluginId: string): Promise<boolean> {
    const row = await this.repo.findOne({ where: { userId, pluginId } });
    return !!row?.enabled;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugins.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back
git add src/plugins/plugins.service.ts src/plugins/plugins.service.spec.ts
git commit -m "feat(plugins): PluginsService (list/set/isEnabled)"
```

---

## Task 4: PluginsController + module + app wiring (бэк)

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugins.controller.ts`
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugins.module.ts`
- Modify: `/home/qzaro/nocode/pet/canvas-server-back/src/app.module.ts`
- Test: `/home/qzaro/nocode/pet/canvas-server-back/src/plugins/plugins.controller.spec.ts`

**Interfaces:**
- Consumes: `PluginsService` (Task 3).
- Produces: `class PluginsModule` (exports `PluginsService`); REST `GET /plugins`, `PUT /plugins/:id`.

- [ ] **Step 1: Write the failing test**

```ts
// src/plugins/plugins.controller.spec.ts
import { PluginsController } from "./plugins.controller";

describe("PluginsController", () => {
  const req = { user: { id: "u1" } } as never;

  it("GET /plugins delegates to listForUser", async () => {
    const service = { listForUser: jest.fn().mockResolvedValue([{ id: "dice", enabled: false }]) };
    const ctrl = new PluginsController(service as never);
    const res = await ctrl.list(req);
    expect(service.listForUser).toHaveBeenCalledWith("u1");
    expect(res).toEqual([{ id: "dice", enabled: false }]);
  });

  it("PUT /plugins/:id toggles then returns updated list", async () => {
    const service = {
      setEnabled: jest.fn().mockResolvedValue(undefined),
      listForUser: jest.fn().mockResolvedValue([{ id: "dice", enabled: true }]),
    };
    const ctrl = new PluginsController(service as never);
    const res = await ctrl.setEnabled(req, "dice", { enabled: true });
    expect(service.setEnabled).toHaveBeenCalledWith("u1", "dice", true);
    expect(res).toEqual([{ id: "dice", enabled: true }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugins.controller.spec.ts`
Expected: FAIL — `Cannot find module './plugins.controller'`.

- [ ] **Step 3: Create controller**

```ts
// src/plugins/plugins.controller.ts
import { Body, Controller, Get, Param, Put, Request, UseGuards } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/request.types";
import { PluginsService } from "./plugins.service";

class SetPluginDto {
  @IsBoolean()
  enabled: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller("plugins")
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.plugins.listForUser(req.user.id);
  }

  @Put(":id")
  async setEnabled(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: SetPluginDto,
  ) {
    await this.plugins.setEnabled(req.user.id, id, dto.enabled);
    return this.plugins.listForUser(req.user.id);
  }
}
```

- [ ] **Step 4: Create module**

```ts
// src/plugins/plugins.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserPlugin } from "../entities/user-plugin.entity";
import { AuthModule } from "../auth/auth.module";
import { PluginsService } from "./plugins.service";
import { PluginsController } from "./plugins.controller";

@Module({
  imports: [TypeOrmModule.forFeature([UserPlugin]), AuthModule],
  controllers: [PluginsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}
```

- [ ] **Step 5: Wire into app.module.ts**

In `src/app.module.ts`: add import near the other module imports:
```ts
import { PluginsModule } from "./plugins/plugins.module";
```
Add `PluginsModule,` to the `imports: [...]` array (e.g. right after `StorageModule,`).

- [ ] **Step 6: Run test + build**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/plugins/plugins.controller.spec.ts && npm run build`
Expected: tests PASS (2), build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back
git add src/plugins/plugins.controller.ts src/plugins/plugins.module.ts src/plugins/plugins.controller.spec.ts src/app.module.ts
git commit -m "feat(plugins): REST controller + module, wired into app"
```

---

## Task 5: Gate dice in gateway (бэк)

**Files:**
- Modify: `/home/qzaro/nocode/pet/canvas-server-back/src/canvas/canvas.module.ts`
- Modify: `/home/qzaro/nocode/pet/canvas-server-back/src/canvas/canvas.gateway.ts` (constructor ~line 64; `handleChatRoll` ~lines 308–332)
- Test: `/home/qzaro/nocode/pet/canvas-server-back/src/canvas/canvas-gateway-roll.spec.ts`

**Interfaces:**
- Consumes: `PluginsService.isEnabled` (Task 3); `PluginsModule` (Task 4).
- Produces: `handleChatRoll` rejects with `chat-error { reason: "plugin-disabled" }` when the acting user is a guest or has dice disabled.

- [ ] **Step 1: Write the failing test**

```ts
// src/canvas/canvas-gateway-roll.spec.ts
import { CanvasGateway } from "./canvas.gateway";

function makeGateway(isEnabled: boolean, isGuest = false) {
  const chatService = {
    createRoll: jest.fn().mockResolvedValue({
      id: "m1", canvasId: "c1", userId: "u1", authorName: "A", text: "Бросок d20: 7",
      createdAt: new Date(), replyToId: null, replyToAuthor: null, replyToText: null,
      nodeId: null, nodeLabel: null, rollData: "{}",
    }),
  };
  const pluginsService = { isEnabled: jest.fn().mockResolvedValue(isEnabled) };
  const gateway = new CanvasGateway(
    {} as never, // canvasService
    {} as never, // canvasTelemetry
    chatService as never,
    pluginsService as never,
  );
  const emitted: any[] = [];
  const client: any = {
    canvasId: "c1",
    userId: isGuest ? "guest:abc" : "u1",
    isGuest,
    authUser: isGuest ? undefined : { id: "u1" },
    emit: (event: string, payload: any) => emitted.push({ event, payload }),
  };
  const roomEmit = jest.fn();
  (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
  return { gateway, chatService, pluginsService, client, emitted, roomEmit };
}

describe("CanvasGateway dice gating", () => {
  it("rolls when dice plugin is enabled", async () => {
    const t = makeGateway(true);
    await t.gateway.handleChatRoll(t.client, { sides: 20, count: 1, modifier: 0 });
    expect(t.chatService.createRoll).toHaveBeenCalled();
    expect(t.roomEmit).toHaveBeenCalledWith("chat-message", expect.objectContaining({ id: "m1" }));
  });

  it("rejects with plugin-disabled when dice plugin is off", async () => {
    const t = makeGateway(false);
    await t.gateway.handleChatRoll(t.client, { sides: 20, count: 1, modifier: 0 });
    expect(t.chatService.createRoll).not.toHaveBeenCalled();
    expect(t.emitted).toEqual([{ event: "chat-error", payload: { reason: "plugin-disabled" } }]);
  });

  it("rejects guests regardless of plugin state", async () => {
    const t = makeGateway(true, true);
    await t.gateway.handleChatRoll(t.client, { sides: 20, count: 1, modifier: 0 });
    expect(t.chatService.createRoll).not.toHaveBeenCalled();
    expect(t.pluginsService.isEnabled).not.toHaveBeenCalled();
    expect(t.emitted).toEqual([{ event: "chat-error", payload: { reason: "plugin-disabled" } }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/canvas/canvas-gateway-roll.spec.ts`
Expected: FAIL — constructor has only 3 args, so 4th arg is ignored and `isEnabled` is never wired (test fails on the disabled/guest cases or on a TS arity check). Confirms the gate is not implemented yet.

- [ ] **Step 3: Inject PluginsService into the gateway constructor**

In `src/canvas/canvas.gateway.ts`, add import near the other service imports:
```ts
import { PluginsService } from "../plugins/plugins.service";
```
Change the constructor (currently lines ~64–68) to:
```ts
  constructor(
    private canvasService: CanvasService,
    private canvasTelemetry: CanvasTelemetryService,
    private chatService: CanvasChatService,
    private pluginsService: PluginsService,
  ) {}
```

- [ ] **Step 4: Add the gate at the top of `handleChatRoll`**

In `handleChatRoll` (the `@SubscribeMessage("chat-roll")` handler), immediately after the existing `if (!client.canvasId) return;` line, insert:
```ts
    if (client.isGuest || !client.userId || !(await this.pluginsService.isEnabled(client.userId, "dice"))) {
      void client.emit("chat-error", { reason: "plugin-disabled" });
      return;
    }
```
Leave the rest of the handler unchanged.

- [ ] **Step 5: Import PluginsModule into CanvasModule**

In `src/canvas/canvas.module.ts`, add import:
```ts
import { PluginsModule } from "../plugins/plugins.module";
```
Add `PluginsModule,` to the `imports: [...]` array (after `StorageModule,`).

- [ ] **Step 6: Run test + full backend suite + build**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/canvas/canvas-gateway-roll.spec.ts && npm test && npm run build`
Expected: new tests PASS (3); full suite PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back
git add src/canvas/canvas.gateway.ts src/canvas/canvas.module.ts src/canvas/canvas-gateway-roll.spec.ts
git commit -m "feat(plugins): gate chat-roll behind dice plugin (server-side)"
```

---

## Task 6: Frontend API client + usePlugins composable

**Files:**
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/api/client.ts` (add `plugins` export near `htmlDocuments`, ~line 307)
- Create: `/home/qzaro/nocode/pet/canvas-server-front/src/composables/usePlugins.ts`
- Test: `/home/qzaro/nocode/pet/canvas-server-front/src/composables/usePlugins.test.ts`

**Interfaces:**
- Produces (client):
  - `plugins.list(): Promise<Array<{ id: string; name: string; description: string; surface: string; enabled: boolean }>>`
  - `plugins.setEnabled(id: string, enabled: boolean): Promise<any>`
- Produces (composable) `usePlugins()` returning:
  - `enabledPluginIds: Ref<Set<string>>`
  - `isEnabled(id: string): boolean`
  - `loadPlugins(): Promise<void>`
  - `ensureLoaded(): Promise<void>`
  - `setEnabled(id: string, enabled: boolean): Promise<void>`
  - `reset(): void`

- [ ] **Step 1: Add the `plugins` API client export**

In `src/api/client.ts`, add after the `htmlDocuments` export block (around line 307, keep file style):
```ts
export const plugins = {
  list: () =>
    request<Array<{ id: string; name: string; description: string; surface: string; enabled: boolean }>>(
      '/plugins',
    ),
  setEnabled: (id: string, enabled: boolean) =>
    request<any>(`/plugins/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
};
```

- [ ] **Step 2: Write the failing test**

```ts
// src/composables/usePlugins.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/client", () => ({
  plugins: {
    list: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

import { plugins as api } from "../api/client";
import { usePlugins } from "./usePlugins";

describe("usePlugins", () => {
  beforeEach(() => {
    usePlugins().reset();
    vi.clearAllMocks();
  });

  it("isEnabled is false before load", () => {
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });

  it("loadPlugins fills enabled ids", async () => {
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins();
    expect(usePlugins().isEnabled("dice")).toBe(true);
  });

  it("setEnabled optimistically updates state and calls the api", async () => {
    (api.setEnabled as any).mockResolvedValue(undefined);
    await usePlugins().setEnabled("dice", true);
    expect(usePlugins().isEnabled("dice")).toBe(true);
    expect(api.setEnabled).toHaveBeenCalledWith("dice", true);
  });

  it("setEnabled rolls back on api failure", async () => {
    (api.setEnabled as any).mockRejectedValue(new Error("boom"));
    await expect(usePlugins().setEnabled("dice", true)).rejects.toThrow("boom");
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });

  it("reset clears state", async () => {
    (api.list as any).mockResolvedValue([
      { id: "dice", name: "D", description: "", surface: "canvas-chat", enabled: true },
    ]);
    await usePlugins().loadPlugins();
    usePlugins().reset();
    expect(usePlugins().isEnabled("dice")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/composables/usePlugins.test.ts`
Expected: FAIL — cannot resolve `./usePlugins`.

- [ ] **Step 4: Write the composable**

```ts
// src/composables/usePlugins.ts
import { ref } from 'vue';
import { plugins as pluginsApi } from '../api/client';

const enabledPluginIds = ref<Set<string>>(new Set());
let loaded = false;
let inflight: Promise<void> | null = null;

export function usePlugins() {
  async function loadPlugins(): Promise<void> {
    const list = await pluginsApi.list();
    enabledPluginIds.value = new Set(list.filter((p) => p.enabled).map((p) => p.id));
    loaded = true;
  }

  function ensureLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (!inflight) {
      inflight = loadPlugins().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function isEnabled(id: string): boolean {
    return enabledPluginIds.value.has(id);
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const next = new Set(enabledPluginIds.value);
    if (enabled) next.add(id);
    else next.delete(id);
    enabledPluginIds.value = next;
    try {
      await pluginsApi.setEnabled(id, enabled);
    } catch (e) {
      const rollback = new Set(enabledPluginIds.value);
      if (enabled) rollback.delete(id);
      else rollback.add(id);
      enabledPluginIds.value = rollback;
      throw e;
    }
  }

  function reset(): void {
    enabledPluginIds.value = new Set();
    loaded = false;
    inflight = null;
  }

  return { enabledPluginIds, isEnabled, loadPlugins, ensureLoaded, setEnabled, reset };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/composables/usePlugins.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-front
git add src/api/client.ts src/composables/usePlugins.ts src/composables/usePlugins.test.ts
git commit -m "feat(plugins): api client + usePlugins composable"
```

---

## Task 7: PluginsView page + route + dashboard link

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-front/src/views/PluginsView.vue`
- Test: `/home/qzaro/nocode/pet/canvas-server-front/src/views/PluginsView.test.ts`
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/router/index.ts`
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/views/DashboardView.vue` (user-menu popover ~lines 21–29; `logout` handler ~line 1751)

**Interfaces:**
- Consumes: `plugins.list`/`plugins.setEnabled` (Task 6); `usePlugins` (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// src/views/PluginsView.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../api/client", () => ({
  plugins: {
    list: vi.fn().mockResolvedValue([
      { id: "dice", name: "Бросок дайсов", description: "desc", surface: "canvas-chat", enabled: false },
    ]),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  },
}));

import { plugins as api } from "../api/client";
import PluginsView from "./PluginsView.vue";

describe("PluginsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a card per plugin from the API", async () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true } } });
    await flushPromises();
    expect(w.text()).toContain("Бросок дайсов");
    expect(w.findAll(".plugin-card").length).toBe(1);
  });

  it("toggling a plugin calls setEnabled", async () => {
    const w = mount(PluginsView, { global: { stubs: { "router-link": true } } });
    await flushPromises();
    await w.get(".plugin-toggle").trigger("click");
    expect(api.setEnabled).toHaveBeenCalledWith("dice", true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/views/PluginsView.test.ts`
Expected: FAIL — cannot resolve `./PluginsView.vue`.

- [ ] **Step 3: Create the view**

```vue
<!-- src/views/PluginsView.vue -->
<template>
  <div class="plugins-page">
    <header class="plugins-head">
      <router-link to="/" class="plugins-back" title="На дашборд">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>Назад</span>
      </router-link>
      <h1 class="plugins-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 7.5V5a2 2 0 0 0-2-2h-1a2 2 0 0 1-4 0h-1a2 2 0 0 0-2 2v3H2.5a2 2 0 0 0 0 4H4v3a2 2 0 0 0 2 2h3a2 2 0 0 1 4 0h3a2 2 0 0 0 2-2v-3h2.5a2 2 0 0 0 0-4z"/></svg>
        Plugins
      </h1>
    </header>

    <p v-if="error" class="plugins-error">{{ error }}</p>

    <div class="plugins-list">
      <div v-for="p in items" :key="p.id" class="plugin-card">
        <div class="plugin-info">
          <div class="plugin-name">{{ p.name }}</div>
          <div class="plugin-desc">{{ p.description }}</div>
          <span class="plugin-surface">{{ surfaceLabel(p.surface) }}</span>
        </div>
        <button
          class="plugin-toggle"
          :class="{ on: p.enabled }"
          :disabled="busyId === p.id"
          role="switch"
          :aria-checked="p.enabled"
          @click="toggle(p)"
        >
          <span class="plugin-toggle-knob"></span>
        </button>
      </div>
      <div v-if="!items.length && !error" class="plugins-empty">Плагинов пока нет</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { plugins as pluginsApi } from '../api/client';
import { usePlugins } from '../composables/usePlugins';

interface PluginItem { id: string; name: string; description: string; surface: string; enabled: boolean }

const items = ref<PluginItem[]>([]);
const error = ref('');
const busyId = ref('');
const { setEnabled } = usePlugins();

const surfaceLabel = (s: string) =>
  s === 'canvas-chat' ? 'Чат канваса' : s === 'document' ? 'Документ' : s === 'html' ? 'HTML' : s;

const load = async () => {
  try {
    items.value = await pluginsApi.list();
  } catch (e: any) {
    error.value = e?.message || 'Не удалось загрузить плагины';
  }
};

const toggle = async (p: PluginItem) => {
  const next = !p.enabled;
  busyId.value = p.id;
  try {
    await setEnabled(p.id, next);
    p.enabled = next;
  } catch (e: any) {
    error.value = e?.message || 'Не удалось сохранить';
  } finally {
    busyId.value = '';
  }
};

onMounted(load);
</script>

<style scoped>
.plugins-page { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.plugins-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.plugins-back { display: inline-flex; align-items: center; gap: 6px; color: var(--dark-text-muted, #98a2b3); text-decoration: none; font-size: 13px; }
.plugins-back:hover { color: #fff; }
.plugins-title { display: flex; align-items: center; gap: 8px; font-size: 22px; margin: 0; }
.plugins-error { color: #ff9da1; font-size: 13px; margin-bottom: 12px; }
.plugins-list { display: flex; flex-direction: column; gap: 12px; }
.plugin-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; border: 1px solid var(--dark-neutral-border, #313442); border-radius: 12px; background: var(--dark-input-bg, rgba(255,255,255,0.03)); }
.plugin-info { min-width: 0; }
.plugin-name { font-weight: 600; font-size: 15px; }
.plugin-desc { font-size: 13px; opacity: 0.7; margin-top: 2px; }
.plugin-surface { display: inline-block; margin-top: 8px; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dark-neutral-border, #313442); opacity: 0.8; }
.plugin-toggle { flex-shrink: 0; width: 46px; height: 26px; border-radius: 999px; border: 1px solid var(--dark-neutral-border, #313442); background: rgba(255,255,255,0.08); position: relative; cursor: pointer; transition: background 0.15s; }
.plugin-toggle.on { background: var(--color-brands, #4dabf7); }
.plugin-toggle:disabled { opacity: 0.5; cursor: default; }
.plugin-toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
.plugin-toggle.on .plugin-toggle-knob { transform: translateX(20px); }
.plugins-empty { opacity: 0.6; font-size: 13px; text-align: center; padding: 24px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/views/PluginsView.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route**

In `src/router/index.ts`, add to the `routes` array (after the `admin` route):
```ts
    {
      path: '/plugins',
      name: 'plugins',
      component: () => import('../views/PluginsView.vue'),
      meta: { requiresAuth: true },
    },
```

- [ ] **Step 6: Add the dashboard user-menu link (Lucide icon, no emoji)**

In `src/views/DashboardView.vue`, inside the user popover (`<div v-if="openControlMenu === 'user'" ...>`), add this `router-link` directly before the existing Settings link:
```html
              <router-link to="/plugins" class="card-menu-item">
                <span class="menu-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 7.5V5a2 2 0 0 0-2-2h-1a2 2 0 0 1-4 0h-1a2 2 0 0 0-2 2v3H2.5a2 2 0 0 0 0 4H4v3a2 2 0 0 0 2 2h3a2 2 0 0 1 4 0h3a2 2 0 0 0 2-2v-3h2.5a2 2 0 0 0 0-4z"/></svg>
                </span>
                <span>Plugins</span>
              </router-link>
```

- [ ] **Step 7: Reset plugin state on logout**

In `src/views/DashboardView.vue`:
- Add the import at the top of the `<script>` (near the other composable imports):
```ts
import { usePlugins } from '../composables/usePlugins';
```
- Inside `setup()`, near other composable calls, add:
```ts
    const { reset: resetPlugins } = usePlugins();
```
- In the `logout` handler (currently `clearToken(); router.push('/login');`), add `resetPlugins();` as the first line:
```ts
    const logout = () => {
      resetPlugins();
      clearToken();
      router.push('/login');
    };
```

- [ ] **Step 8: Verify build + full front suite**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npm run build && npm run test:unit`
Expected: build succeeds (vue-tsc clean); all tests PASS.

- [ ] **Step 9: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-front
git add src/views/PluginsView.vue src/views/PluginsView.test.ts src/router/index.ts src/views/DashboardView.vue
git commit -m "feat(plugins): /plugins page, route, dashboard link, logout reset"
```

---

## Task 8: Gate the dice toolbar in CanvasView

**Files:**
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/views/CanvasView.vue`
  - imports ~line 795–801; `setup()` ~line 815; dice state ~lines 833–837; dice toolbar template ~line 413; `rollDice` ~line 1659; `onMounted` ~line 1631; `return {...}` of setup ~line 1233.

**Interfaces:**
- Consumes: `usePlugins` (Task 6) — `isEnabled`, `ensureLoaded`.

CanvasView не покрыт unit-тестами в репозитории и тяжело монтируется (сокеты/canvas). Верифицируем гейтинг сборкой + полным прогоном существующих тестов + ручным смоук-тестом (шаги 5–6). Это сознательный выбор: полный mount-тест CanvasView вне текущего тестового паттерна проекта.

- [ ] **Step 1: Import and wire usePlugins in setup()**

In `src/views/CanvasView.vue`, add near the `useCanvasSocket` import (~line 801):
```ts
import { usePlugins } from '../composables/usePlugins';
```
Inside `setup()` (near where other composables/refs are created, e.g. just before the dice state block ~line 833), add:
```ts
    const { isEnabled: isPluginEnabled, ensureLoaded: ensurePluginsLoaded } = usePlugins();
    const diceEnabled = computed(() => isPluginEnabled('dice'));
```
(`computed` is already imported on line 795.)

- [ ] **Step 2: Load plugin state on mount**

In the existing `onMounted(() => { ... })` (~line 1631), add as the first line of the callback body:
```ts
      void ensurePluginsLoaded();
```

- [ ] **Step 3: Expose `diceEnabled` from setup()**

In the `return { ... }` object of `setup()` (~line 1233 / the big return near line 1668), add `diceEnabled,` alongside the other dice exports (`toggleDice`, `rollDice`, `diceOpen`, ...). Search for `rollDice,` in the return and add `diceEnabled,` next to it.

- [ ] **Step 4: Gate the dice toolbar template + rollDice guard**

In the template, change the dice toolbar opening tag (line ~413) from:
```html
      <div v-if="role !== 'read'" ref="diceToolbarRef" class="dice-toolbar" @pointerdown.stop @click.stop>
```
to:
```html
      <div v-if="role !== 'read' && diceEnabled" ref="diceToolbarRef" class="dice-toolbar" @pointerdown.stop @click.stop>
```

In `rollDice` (~line 1659), add a guard as the first line:
```ts
    const rollDice = () => {
      if (!diceEnabled.value) return;
      sendRoll(diceSides.value, diceCount.value, diceModifier.value);
      diceOpen.value = false;
      if (!chatOpen.value) void openChat();
    };
```

- [ ] **Step 5: Verify build + full front suite**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npm run build && npm run test:unit`
Expected: build succeeds (vue-tsc clean); all existing tests PASS.

- [ ] **Step 6: Manual smoke test**

Start back + front dev servers. As a logged-in user:
1. Open a canvas you own → dice toolbar (d20 die button, left edge) is ABSENT.
2. Go to `/plugins`, enable "Бросок дайсов".
3. Return to the canvas (no reload needed if same tab; reload is fine) → dice toolbar is PRESENT; rolling posts a roll card to chat.
4. Disable the plugin on `/plugins` → toolbar disappears.

- [ ] **Step 7: Commit**

```bash
cd /home/qzaro/nocode/pet/canvas-server-front
git add src/views/CanvasView.vue
git commit -m "feat(plugins): gate dice toolbar behind dice plugin (frontend)"
```

---

## Task 9: Final verification + push

- [ ] **Step 1: Full backend suite + build**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npm test && npm run build`
Expected: all PASS, build OK.

- [ ] **Step 2: Full frontend suite + build**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npm run test:unit && npm run build`
Expected: all PASS, build OK.

- [ ] **Step 3: Push both repos to dev**

```bash
cd /home/qzaro/nocode/pet/canvas-server-back && git push origin dev
cd /home/qzaro/nocode/pet/canvas-server-front && git push origin dev
```

Deploy — отдельным шагом по запросу пользователя (бэк: миграция применится на старте при `migrationsRun`; не забыть собрать back и front на проде).

---

## Self-Review Notes

- **Spec coverage:** entity/migration (Task 2), реестр (Task 1), сервис (Task 3), контроллер+модуль (Task 4), серверный гейтинг + гость (Task 5), api+composable (Task 6), страница/роут/меню/логаут-сброс (Task 7), фронт-гейтинг дайсов (Task 8). Решение «карточка броска не гейтится» — `ChatPanel.vue` сознательно не трогаем. Решение «гейтинг на сервере» — Task 5. Дефолт opt-in — `enabled DEFAULT (0)` + `isEnabled` false без строки.
- **Типы согласованы:** `listForUser`/`setEnabled`/`isEnabled` идентичны между Task 3 (определение), Task 4 (контроллер), Task 5 (gateway). `usePlugins` API идентичен между Task 6 (определение) и Task 7/8 (потребители): `isEnabled`, `ensureLoaded`, `setEnabled`, `reset`.
- **Гейтинг рендера:** vue-router lazy import у `/plugins`; meta.requiresAuth как у соседних защищённых роутов.
