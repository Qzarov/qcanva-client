# Trello-like Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить совместно редактируемый интерактивный шаблон `trello-board` с полной канбан-доской в дашборде и read-only превью на канвасе.

**Architecture:** Доска остаётся интерактивным шаблоном, но получает типизированный JSON-снимок, ревизию и собственные права доступа. Отдельный Socket.IO namespace применяет мелкие операции к снимку и рассылает их участникам комнаты `board:<id>`; движок канваса не обобщается. Канвасная нода хранит только ID доски, а компонент превью получает и слушает её данные самостоятельно.

**Tech Stack:** Backend: NestJS, TypeORM/sql.js, Socket.IO, Jest. Frontend: Vue 3, Vue Router, Vitest, `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-08-28-trello-board-design.md`

## Global Constraints

- Рабочие репозитории: `/home/qzaro/nocode/pet/canvas-server-back` и `/home/qzaro/nocode/pet/canvas-server-front`, ветка `dev`.
- Первая версия: колонки, карточки, метки, сроки, исполнители, чек-листы, realtime и доступ. Не добавлять вложения, комментарии, журнал, уведомления, фильтры, поиск, архив и автоматизации.
- Стартовые колонки: «К выполнению», «В работе», «Готово».
- Исполнитель — текст или участник доски. При отзыве доступа сохранить имя и очистить `assigneeUserId`.
- Только owner настраивает доступ и удаляет доску; edit меняет содержимое; read не может менять данные через UI, REST или socket.
- Нода канваса хранит только `boardId` и параметры отображения.
- Каждая задача идёт по циклу TDD: тест → подтверждённое падение → минимальная реализация → зелёный тест → коммит.

---

## File Structure

**Backend**

- Create `src/interactive-templates/board.types.ts` and `.spec.ts` — модель, нормализация и чистый reducer операций.
- Create `src/entities/interactive-template-permission.entity.ts` — явные права шаблона.
- Create migration `src/db/migrations/1766800000000-add-board-revision-and-template-permissions.ts`.
- Modify `interactive-template.entity.ts`, `typeorm.config.ts`, `interactive-templates.module.ts` — регистрация revision, entity и gateway.
- Modify `interactive-templates.service.ts` and create `.spec.ts` — CRUD, права, снимки и атомарное применение операций.
- Modify controller and create controller spec — endpoints снимка и доступа.
- Create `boards.gateway.ts` and `.spec.ts` — realtime-комната.

**Frontend**

- Create `src/boards/types.ts`, `defaults.ts`, `operations.ts` and test — зеркальный контракт и оптимистичный reducer.
- Create `src/composables/useBoardSocket.ts` and test — подключение, ревизии, pending-операции и resync.
- Create `src/components/board/BoardEditor.vue`, `BoardColumn.vue`, `BoardCard.vue`, `BoardCardDialog.vue`, `BoardShareDialog.vue` and tests.
- Create `src/components/board/BoardPreview.vue` and test.
- Create `src/views/BoardTemplateView.vue` and test.
- Modify `src/api/client.ts`, `src/router/index.ts`, `src/views/DashboardView.vue`, `src/views/CanvasView.vue`, `src/components/CanvasLoader.vue` and existing tests.

### Task 1: Board domain contract and reducer

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/interactive-templates/board.types.ts`
- Test: `/home/qzaro/nocode/pet/canvas-server-back/src/interactive-templates/board.types.spec.ts`

**Interfaces produced:**

    type BoardData = { version: 1; columns: BoardColumn[]; cards: BoardCard[]; labels: BoardLabel[] };
    type BoardOperation =
      | { type: "column-add"; column: BoardColumn }
      | { type: "column-update"; columnId: string; title: string }
      | { type: "column-move"; columnId: string; position: number }
      | { type: "column-remove"; columnId: string; disposition?: { kind: "delete-cards" } | { kind: "move-cards"; targetColumnId: string } }
      | { type: "card-add"; card: BoardCard }
      | { type: "card-update"; cardId: string; changes: Partial<BoardCard> }
      | { type: "card-move"; cardId: string; columnId: string; position: number }
      | { type: "card-remove"; cardId: string }
      | { type: "label-add" | "label-update" | "label-remove" | "checklist-add" | "checklist-update" | "checklist-remove" | "checklist-move"; [key: string]: unknown };

- [ ] **Step 1: Write failing tests**

    it("creates the three Russian default columns", () => {
      expect(createBoardDefaults().columns.map((column) => column.title))
        .toEqual(["К выполнению", "В работе", "Готово"]);
    });

    it("moves a card and renumbers positions", () => {
      const next = applyBoardOperation(boardWithCards(), {
        type: "card-move", cardId: "card-a", columnId: "done", position: 0,
      });
      expect(next.cards.find((card) => card.id === "card-a"))
        .toMatchObject({ columnId: "done", position: 0 });
    });

    it("rejects removal of a populated column without disposition", () => {
      expect(() => applyBoardOperation(boardWithCards(), {
        type: "column-remove", columnId: "todo",
      })).toThrow("column_disposition_required");
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/board.types.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal reducer**

Export `createBoardDefaults`, `normalizeBoardData`, `applyBoardOperation` and `BoardOperationError`. Clone before mutation, clamp insert positions, and renumber every affected column/checklist from zero after move/remove. Normalization must default missing lists to `[]` and reject malformed mandatory IDs. Column removal must either delete its cards or move them to a valid target column.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/board.types.spec.ts`

Expected: PASS; add examples for label removal, arbitrary/participant assignees and checklist order.

- [ ] **Step 5: Commit**

    cd /home/qzaro/nocode/pet/canvas-server-back
    git add src/interactive-templates/board.types.ts src/interactive-templates/board.types.spec.ts
    git commit -m "feat(boards): add board data and operation reducer"

### Task 2: Persist revisions and template permissions

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/entities/interactive-template-permission.entity.ts`
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/db/migrations/1766800000000-add-board-revision-and-template-permissions.ts`
- Modify: `interactive-template.entity.ts`, `typeorm.config.ts`, `interactive-templates.module.ts`
- Test: `src/db/typeorm.config.spec.ts`

**Interfaces produced:**

    class InteractiveTemplatePermission {
      id: string; templateId: string; userId: string; role: PermissionRole;
    }
    // Unique(templateId, userId); owner remains InteractiveTemplate.ownerId.
    InteractiveTemplate.revision: number;

- [ ] **Step 1: Write a failing registration test**

    expect(dataSourceOptions.entities).toContain(InteractiveTemplatePermission);
    expect(dataSourceOptions.migrations).toContain(AddBoardRevisionAndTemplatePermissions1766800000000);

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/db/typeorm.config.spec.ts`

Expected: FAIL because entity/migration are absent. If config has no exported options, export them rather than booting a DB in the test.

- [ ] **Step 3: Implement schema**

Add non-null `revision integer NOT NULL DEFAULT 0` to `interactive_template`. Create `interactive_template_permission` with cascade foreign keys to template and user plus a unique `(templateId,userId)` index. Entity uses `PermissionRole.READ` by default. Register entity and migration in both TypeORM arrays, and include the permission repository in the module.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/db/typeorm.config.spec.ts && npm run build`

Expected: PASS and successful build.

- [ ] **Step 5: Commit**

    git add src/entities/interactive-template-permission.entity.ts src/entities/interactive-template.entity.ts src/db/migrations/1766800000000-add-board-revision-and-template-permissions.ts src/db/typeorm.config.ts src/interactive-templates/interactive-templates.module.ts src/db/typeorm.config.spec.ts
    git commit -m "feat(boards): persist revisions and access permissions"

### Task 3: Board CRUD, sharing and authorized snapshots

**Files:**
- Modify: `/home/qzaro/nocode/pet/canvas-server-back/src/interactive-templates/interactive-templates.service.ts`
- Create: `interactive-templates.service.spec.ts`
- Modify: `interactive-templates.controller.ts`
- Create: `interactive-templates.controller.spec.ts`

**Interfaces produced:**

    getWithRole(user, id): Promise<{ template: InteractiveTemplate; role: "owner" | PermissionRole }>
    getBoardSnapshot(user, id): Promise<{ template: SerializedTemplate; role: BoardRole; revision: number }>
    share(id, ownerId, email, role): Promise<InteractiveTemplatePermission>
    revokeAccess(id, ownerId, userId): Promise<void>
    applyBoardOperation(user, id, op, baseRevision): Promise<{ data: BoardData; revision: number }>

Endpoints: `GET /interactive-templates/:id/snapshot`, `GET/POST/DELETE /interactive-templates/:id/share`; list returns own and shared items while maintaining a compatibility `templates` aggregate for current callers.

- [ ] **Step 1: Write failing service tests**

    it("allows a shared reader to read a snapshot but not edit", async () => {
      await service.share(board.id, owner.id, reader.email, PermissionRole.READ);
      await expect(service.getBoardSnapshot(reader, board.id)).resolves.toMatchObject({ role: "read" });
      await expect(service.applyBoardOperation(reader, board.id, validOp, 0)).rejects.toThrow(ForbiddenException);
    });

    it("clears revoked participant ids but retains assignee names", async () => {
      await service.revokeAccess(board.id, owner.id, editor.id);
      expect((await service.get(owner, board.id)).data.cards[0])
        .toMatchObject({ assigneeName: "Лена", assigneeUserId: null });
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/interactive-templates.service.spec.ts src/interactive-templates/interactive-templates.controller.spec.ts`

Expected: FAIL because board access methods and endpoints do not exist.

- [ ] **Step 3: Implement service/controller**

Allow `dnd-character` and `trello-board` only; initialize boards with `createBoardDefaults`. `requireRole` checks owner first, then permission. Share finds a user by email, rejects self-share and only accepts `read`/ `edit`. Revoke removes the row, clears matching `assigneeUserId` values, persists the snapshot, increments revision and notifies the gateway. The snapshot endpoint never exposes a board without a resolved role.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/interactive-templates.service.spec.ts src/interactive-templates/interactive-templates.controller.spec.ts && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

    git add src/interactive-templates/interactive-templates.service.ts src/interactive-templates/interactive-templates.service.spec.ts src/interactive-templates/interactive-templates.controller.ts src/interactive-templates/interactive-templates.controller.spec.ts
    git commit -m "feat(boards): add board access and snapshot API"

### Task 4: Realtime board operations

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/interactive-templates/boards.gateway.ts`
- Create: `/home/qzaro/nocode/pet/canvas-server-back/src/interactive-templates/boards.gateway.spec.ts`
- Modify: `interactive-templates.service.ts`, `interactive-templates.module.ts`, `test/app.e2e-spec.ts`

**Interfaces produced:**

    namespace "/boards-ws"
    join-board { boardId } -> board-room-state { data, revision, role }
    board-op { boardId, baseRevision, clientOpId, op }
    board-op-ack { clientOpId, revision }
    board-op-reject { clientOpId, reason, serverRevision }
    board-op-applied { clientOpId, op, revision }
    board-access-revoked { boardId }

- [ ] **Step 1: Write failing gateway tests**

    it("acks an editor operation and broadcasts revision 1", async () => {
      await gateway.handleJoinBoard(editorSocket, { boardId: "board-1" });
      await gateway.handleBoardOp(editorSocket, { boardId: "board-1", baseRevision: 0, clientOpId: "op-1", op: moveCard });
      expect(editorSocket.emit).toHaveBeenCalledWith("board-op-ack", { clientOpId: "op-1", revision: 1 });
      expect(server.to("board:board-1").emit).toHaveBeenCalledWith("board-op-applied", expect.objectContaining({ revision: 1 }));
    });

    it("rejects stale and reader operations without persisting", async () => {
      await gateway.handleBoardOp(readerSocket, stalePayload);
      expect(readerSocket.emit).toHaveBeenCalledWith("board-op-reject", expect.objectContaining({ reason: "forbidden" }));
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/boards.gateway.spec.ts`

Expected: FAIL because the gateway is absent.

- [ ] **Step 3: Implement gateway**

Reuse the JWT extraction pattern from `CanvasGateway`, but create a dedicated namespace and do not join canvas rooms. Authenticate and resolve role before `client.join('board:' + boardId)`. Validate client op ID, integer revision and reducer operation. Atomically persist through service; reject with `forbidden`, `revision_mismatch`, `invalid_op` or `target_missing`. On revoke, emit `board-access-revoked` to matching sockets then leave the room.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-back && npx jest src/interactive-templates/boards.gateway.spec.ts && npm test -- --runInBand`

Expected: PASS. Extend `test/app.e2e-spec.ts` with two logged-in sockets proving editor broadcast, stale rejection and reader rejection.

- [ ] **Step 5: Commit**

    git add src/interactive-templates/boards.gateway.ts src/interactive-templates/boards.gateway.spec.ts src/interactive-templates/interactive-templates.service.ts src/interactive-templates/interactive-templates.module.ts test/app.e2e-spec.ts
    git commit -m "feat(boards): synchronize board operations in realtime"

### Task 5: Frontend contract, API and realtime composable

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-front/src/boards/types.ts`, `defaults.ts`, `operations.ts`, `operations.test.ts`
- Create: `src/composables/useBoardSocket.ts`, `useBoardSocket.test.ts`
- Modify: `src/api/client.ts`

**Interfaces produced:**

    useBoardSocket(boardId) => {
      data, role, revision, pendingCount, syncStatus,
      connect(), disconnect(), sendOperation(op), requestSnapshot()
    }

- [ ] **Step 1: Write failing optimistic-sync tests**

    it("keeps an optimistic move until matching ack", () => {
      const board = useBoardSocket("board-1");
      board.data.value = boardFixture; board.revision.value = 3;
      board.sendOperation({ type: "card-move", cardId: "c1", columnId: "done", position: 0 });
      expect(board.data.value.cards.find((card) => card.id === "c1")?.columnId).toBe("done");
      socket.emitFromServer("board-op-ack", { clientOpId: board.lastClientOpId.value, revision: 4 });
      expect(board.pendingCount.value).toBe(0);
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts --exclude '.claude/**'`

Expected: FAIL because board modules do not exist.

- [ ] **Step 3: Implement client state**

Mirror backend types exactly. Extend `InteractiveTemplate.templateType` to a union and add snapshot/share API methods. Socket connects to `/boards-ws`, applies local ops optimistically and saves a `before` snapshot per client op. On remote operation, require next revision or request snapshot. On rejection restore `before`, fetch snapshot, and retry only still-valid card/column moves. On access revoke clear data and set sync state to forbidden.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts --exclude '.claude/**' && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

    git add src/boards src/composables/useBoardSocket.ts src/composables/useBoardSocket.test.ts src/api/client.ts
    git commit -m "feat(boards): add board client state and realtime socket"

### Task 6: Board editor and access UI

**Files:**
- Create: `src/components/board/BoardEditor.vue`, `BoardColumn.vue`, `BoardCard.vue`, `BoardCardDialog.vue`, `BoardShareDialog.vue`
- Test: `src/components/board/BoardEditor.test.ts`
- Create: `src/views/BoardTemplateView.vue`, `BoardTemplateView.test.ts`
- Modify: `src/router/index.ts`

**Interfaces produced:**

    <BoardEditor :data :role :participants @operation @manage-access />
    // BoardTemplateView owns loading, socket lifecycle, errors and sync status.

- [ ] **Step 1: Write failing editor tests**

    it("emits card-move on a cross-column drop", async () => {
      const wrapper = mount(BoardEditor, { props: editableBoardProps });
      await wrapper.find('[data-card-id="c1"]').trigger("dragstart");
      await wrapper.find('[data-column-id="done"]').trigger("drop");
      expect(wrapper.emitted("operation")?.[0]?.[0]).toMatchObject({ type: "card-move", cardId: "c1", columnId: "done" });
    });

    it("hides all mutation controls for readers", () => {
      const wrapper = mount(BoardEditor, { props: { ...editableBoardProps, role: "read" } });
      expect(wrapper.find('[data-testid="add-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="board-drag-handle"]').exists()).toBe(false);
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/components/board/BoardEditor.test.ts src/views/BoardTemplateView.test.ts --exclude '.claude/**'`

Expected: FAIL because components and route do not exist.

- [ ] **Step 3: Implement editor**

Use native drag events and an in-memory payload, no new drag dependency. Dialog edits title, description, date/time, labels, free-text or participant assignee, and checklist. It emits `card-update` plus checklist item operations. Show overdue when `dueAt < new Date().toISOString()` and checklist completed/total. Column deletion forces delete-cards or move-cards choice. Owner-only share dialog calls share endpoints. Add route `/templates/:id` using `BoardTemplateView` when type is board while keeping the D&D view supported.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/components/board/BoardEditor.test.ts src/views/BoardTemplateView.test.ts --exclude '.claude/**' && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

    git add src/components/board src/views/BoardTemplateView.vue src/views/BoardTemplateView.test.ts src/router/index.ts
    git commit -m "feat(boards): add collaborative board editor"

### Task 7: Dashboard creation and board listing

**Files:**
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/views/DashboardView.vue`
- Modify: `/home/qzaro/nocode/pet/canvas-server-front/src/views/DashboardView.test.ts`
- Modify: `src/api/client.ts`

- [ ] **Step 1: Write failing dashboard test**

    it("creates a board from the template picker and opens it", async () => {
      vi.mocked(interactiveTemplates.create).mockResolvedValueOnce(boardTemplate);
      const wrapper = mount(DashboardView, dashboardMountOptions);
      await wrapper.find('[data-template-type="trello-board"]').trigger("click");
      expect(interactiveTemplates.create).toHaveBeenCalledWith({ templateType: "trello-board", title: "" });
      expect(push).toHaveBeenCalledWith({ name: "interactive-template", params: { id: "board-1" } });
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/views/DashboardView.test.ts --exclude '.claude/**'`

Expected: FAIL because the picker has no board option.

- [ ] **Step 3: Implement dashboard integration**

Add a «Канбан-доска» tile with an inline SVG board icon and a description. Render type-specific resource subtitle and merge own/shared board records into template listing without breaking old `{ templates }` responses. Mark the board as `interactive-template` when opened.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/views/DashboardView.test.ts --exclude '.claude/**' && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

    git add src/views/DashboardView.vue src/views/DashboardView.test.ts src/api/client.ts
    git commit -m "feat(boards): create and list board templates"

### Task 8: Canvas read-only preview and import

**Files:**
- Create: `/home/qzaro/nocode/pet/canvas-server-front/src/components/board/BoardPreview.vue`
- Test: `src/components/board/BoardPreview.test.ts`
- Modify: `src/components/CanvasLoader.vue`, `src/components/CanvasLoader.touch.test.ts`, `src/views/CanvasView.vue`, `src/api/client.ts`

**Interfaces produced:**

    { type: "template", templateId: "trello-board-preview",
      templateData: { boardId: string; title?: string } }
    <BoardPreview boardId @open-board />

- [ ] **Step 1: Write failing preview tests**

    it("renders only three columns and opens the source without edit controls", async () => {
      const wrapper = mount(BoardPreview, { props: { boardId: "board-1" } });
      await flushPromises();
      expect(wrapper.findAll('[data-testid="preview-column"]')).toHaveLength(3);
      expect(wrapper.find('[data-testid="add-card"]').exists()).toBe(false);
      await wrapper.trigger("click");
      expect(wrapper.emitted("open-board")?.[0]).toEqual(["board-1"]);
    });

    it("adds a link node rather than copying cards", () => {
      wrapper.vm.addBoardPreview({ boardId: "board-1", title: "Релиз" });
      const node = lastNodeAdd(wrapper);
      expect(node).toMatchObject({ templateId: "trello-board-preview", templateData: { boardId: "board-1" } });
      expect(node.templateData.cards).toBeUndefined();
    });

- [ ] **Step 2: Verify red**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/components/board/BoardPreview.test.ts src/components/CanvasLoader.touch.test.ts --exclude '.claude/**'`

Expected: FAIL because preview and canvas method are absent.

- [ ] **Step 3: Implement preview**

Preview requests authorized snapshot, joins board socket read-only and rerenders after `board-op-applied`; disconnects on unmount. Render no more than three columns and three cards each, with title, labels, due date and checklist progress. Missing/deleted/forbidden states expose no board data. Canvas import routes `trello-board` to `addBoardPreview` (720×380); D&D stays unchanged. Canvas click opens the board, but frame remains selectable and draggable.

- [ ] **Step 4: Verify green**

Run: `cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run src/components/board/BoardPreview.test.ts src/components/CanvasLoader.touch.test.ts --exclude '.claude/**' && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

    git add src/components/board/BoardPreview.vue src/components/board/BoardPreview.test.ts src/components/CanvasLoader.vue src/components/CanvasLoader.touch.test.ts src/views/CanvasView.vue src/api/client.ts
    git commit -m "feat(boards): add read-only board previews to canvas"

### Task 9: Cross-repository acceptance verification

**Files:** Modify only a task-specific test/implementation file if a regression is demonstrated.

- [ ] **Step 1: Add the final black-box access test**

    it("removes a revoked editor from the board room and prevents snapshot access", async () => {
      // Owner shares -> editor joins -> owner revokes -> editor receives
      // board-access-revoked -> a new snapshot request is forbidden.
    });

- [ ] **Step 2: Verify red if the scenario exposes a gap**

Run the narrow backend or frontend test containing the acceptance scenario.

Expected: FAIL for the acceptance gap, not an infrastructure error.

- [ ] **Step 3: Apply only the demonstrated correction**

Fix the service/gateway/component boundary responsible for the failed scenario. Do not add any feature excluded by the specification.

- [ ] **Step 4: Run full verification**

    cd /home/qzaro/nocode/pet/canvas-server-back && npm test && npm run build
    cd /home/qzaro/nocode/pet/canvas-server-front && npx vitest run --exclude '.claude/**' && npm run build

Expected: all backend/frontend tests and both builds pass. Manually check in two browser sessions: live editor drag, reader is read-only, revocation removes access, and the canvas preview opens the source board.

- [ ] **Step 5: Commit a regression correction if needed**

    git add <only-files-changed-for-the-regression>
    git commit -m "fix(boards): cover access revocation edge case"

## Plan Self-Review

- Spec coverage: Tasks 1–4 implement the model, defaults, rights and realtime; Tasks 5–7 implement client state, editor, assignment and dashboard; Task 8 implements the canvas preview; Task 9 verifies all acceptance criteria.
- Placeholder scan: no unresolved product decisions or implementation placeholders remain.
- Type consistency: both layers use `BoardData`, `BoardOperation`, `BoardRole`, `boardId`, `baseRevision` and `clientOpId`; frontend types mirror the backend contract.

