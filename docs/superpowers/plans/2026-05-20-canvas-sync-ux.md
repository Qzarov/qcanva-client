# Canvas Sync UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible pending/confirmed/rejected sync events and reason-specific resync feedback to the canvas editor.

**Architecture:** Keep sync event state in a framework-independent helper under `src/canvas/syncEvents.ts`, then integrate it into `CanvasView.vue`. Extend `useCanvasSocket.ts` with an acknowledgement callback without changing the server protocol.

**Tech Stack:** Vue 3, TypeScript, Vitest, Socket.IO client, existing CanvasView topbar and toast/notice UI.

---

## Task 1: Sync Event Store

**Files:**
- Create: `src/canvas/syncEvents.ts`
- Create: `src/canvas/syncEvents.test.ts`

- [ ] Write failing tests for pending/confirmed/rejected/limit/resync events.
- [ ] Run `npm run test:unit -- src/canvas/syncEvents.test.ts` and verify red.
- [ ] Implement `createSyncEventStore`, `syncReasonLabel`, and event types.
- [ ] Run `npm run test:unit -- src/canvas/syncEvents.test.ts` and verify green.
- [ ] Commit with `git add src/canvas/syncEvents.ts src/canvas/syncEvents.test.ts && git commit -m "feat: add canvas sync event store"`.

## Task 2: Socket Ack Callback

**Files:**
- Modify: `src/composables/useCanvasSocket.ts`

- [ ] Add an `onAck(cb)` callback setter.
- [ ] Invoke it from `canvas-op-ack` after removing the pending op and updating revision.
- [ ] Preserve existing `pendingOpsCount` behavior.
- [ ] Run `npm run build`.
- [ ] Commit with `git add src/composables/useCanvasSocket.ts && git commit -m "feat: expose canvas op ack callback"`.

## Task 3: CanvasView Sync UI

**Files:**
- Modify: `src/views/CanvasView.vue`
- Modify: `src/style.css`

- [ ] Add `syncEventStore`, `syncEvents`, `latestSyncReason`, and popover state.
- [ ] Record pending event when `sendOp(op)` returns `clientOpId`.
- [ ] Record confirmed event on `onAck`.
- [ ] Record rejected/timeout/resync lifecycle events in reject and resync handlers.
- [ ] Add reason-specific notice text.
- [ ] Make the topbar sync badge clickable and show a compact popover with recent sync events.
- [ ] Add CSS for the popover and event statuses.
- [ ] Run `npm run build`.
- [ ] Commit with `git add src/views/CanvasView.vue src/style.css && git commit -m "feat: show canvas sync event feedback"`.

## Task 4: TODO And Final Verification

**Files:**
- Modify: `TODO.md`

- [ ] Mark the sync status badge, reject/resync banner, and pending/confirmed TODO items as done.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run build`.
- [ ] Commit with `git add TODO.md && git commit -m "docs: mark canvas sync ux complete"`.
