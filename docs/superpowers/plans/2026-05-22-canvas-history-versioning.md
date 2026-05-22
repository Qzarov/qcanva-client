# Canvas History Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-facing canvas revision preview and restore backed by operation-log reconstruction.

**Architecture:** Backend reconstructs historical snapshots from checkpoints plus operation log and exposes read/restore REST endpoints. Frontend extends the existing canvas history panel with selectable revisions, compact preview, and restore action.

**Tech Stack:** NestJS, TypeORM, Jest, Vue 3, TypeScript, Vitest.

---

## Task 1: Backend Historical Snapshot API

**Files:**
- Modify: `canvas-server-back/src/canvas/canvas.service.ts`
- Modify: `canvas-server-back/src/canvas/canvas.controller.ts`
- Modify: `canvas-server-back/src/canvas/canvas.service.spec.ts`

- [ ] Add failing Jest tests for reconstructing a revision and restoring it as a new revision.
- [ ] Run `npm test -- --runInBand src/canvas/canvas.service.spec.ts` and verify the new tests fail.
- [ ] Implement `getHistorySnapshot` and `restoreHistorySnapshot` in `CanvasService`.
- [ ] Add `GET /canvas/:id/history/:revision/snapshot` and `POST /canvas/:id/history/:revision/restore`.
- [ ] Run `npm test -- --runInBand src/canvas/canvas.service.spec.ts` and verify green.
- [ ] Run `npm run build`.
- [ ] Commit backend changes with `git add src/canvas/canvas.service.ts src/canvas/canvas.controller.ts src/canvas/canvas.service.spec.ts && git commit -m "feat: add canvas history snapshots"`.

## Task 2: Frontend API Client

**Files:**
- Modify: `canvas-server-front/src/api/client.ts`
- Modify: `canvas-server-front/src/api/client.test.ts`

- [ ] Add failing Vitest coverage for `canvas.historySnapshot` and `canvas.restoreHistorySnapshot`.
- [ ] Run `npm run test:unit -- src/api/client.test.ts` and verify the new tests fail.
- [ ] Implement the two API helpers.
- [ ] Run `npm run test:unit -- src/api/client.test.ts` and verify green.
- [ ] Commit frontend API changes with `git add src/api/client.ts src/api/client.test.ts && git commit -m "feat: add canvas history API client"`.

## Task 3: Frontend History Preview And Restore

**Files:**
- Modify: `canvas-server-front/src/views/CanvasView.vue`

- [ ] Add selectable history state: selected entry, selected snapshot, preview loading, restore loading.
- [ ] Load a snapshot when a history item is clicked.
- [ ] Render a compact preview summary with revision, op type, user, timestamp, node count, and edge count.
- [ ] Add a restore button for editor/owner that calls the restore helper, reloads the canvas, and refreshes history.
- [ ] Run `npm run build`.
- [ ] Commit frontend UI changes with `git add src/views/CanvasView.vue && git commit -m "feat: preview and restore canvas history"`.

## Task 4: Docs, TODO, Verification, Merge

**Files:**
- Modify: `canvas-server-front/TODO.md`
- Modify: `canvas-server-front/docs/superpowers/plans/2026-05-22-canvas-history-versioning.md`

- [ ] Mark user-facing history/versioning TODO complete.
- [ ] Run backend `npm test -- --runInBand` and `npm run build`.
- [ ] Run frontend `npm run test:unit` and `npm run build`.
- [ ] Commit docs/TODO changes.
- [ ] Merge backend branch to `dev`, rerun backend verification.
- [ ] Merge frontend branch to `dev`, rerun frontend verification.

