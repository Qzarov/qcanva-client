# Canvas Selective Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retry safe stale canvas operations once before falling back to full resync.

**Architecture:** Add a pure retry-policy helper, extend socket pending-op metadata, and keep CanvasView responsible for deciding whether a reject becomes retry or resync.

**Tech Stack:** Vue 3, TypeScript, Vitest, Socket.IO client.

---

## Task 1: Retry Policy Helper

**Files:**
- Create: `src/canvas/syncRetry.ts`
- Create: `src/canvas/syncRetry.test.ts`

- [x] Write tests for retryable and non-retryable reject/op combinations.
- [x] Run `npm run test:unit -- src/canvas/syncRetry.test.ts` and verify red.
- [x] Implement `isRetryableCanvasOp` and `shouldRetryCanvasReject`.
- [x] Run `npm run test:unit -- src/canvas/syncRetry.test.ts` and verify green.
- [x] Commit with `git add src/canvas/syncRetry.ts src/canvas/syncRetry.test.ts && git commit -m "feat: add canvas sync retry policy"`.

## Task 2: Socket Pending Metadata

**Files:**
- Modify: `src/composables/useCanvasSocket.ts`

- [x] Store `retryCount` and `retryOf` in pending operation metadata.
- [x] Let `sendOp` accept `baseRevision`, `clientOpId`, `retryCount`, and `retryOf` options.
- [x] Include rejected pending metadata in `onReject` callback.
- [x] Run `npm run build`.
- [x] Commit with `git add src/composables/useCanvasSocket.ts && git commit -m "feat: expose rejected canvas op metadata"`.

## Task 3: CanvasView Retry Flow

**Files:**
- Modify: `src/views/CanvasView.vue`

- [x] On `revision_mismatch`, call `shouldRetryCanvasReject`.
- [x] If retryable, resend same op once with `baseRevision = serverRevision`.
- [x] Record retry event in sync events and show non-blocking warning.
- [x] If not retryable, keep existing conflict/resync behavior.
- [x] Run `npm run build`.
- [x] Commit with `git add src/views/CanvasView.vue && git commit -m "feat: retry safe canvas sync rejects"`.

## Task 4: TODO And Verification

**Files:**
- Modify: `TODO.md`

- [x] Mark selective retry TODO item done.
- [x] Run `npm run test:unit`.
- [x] Run `npm run build`.
- [ ] Commit with `git add TODO.md && git commit -m "docs: mark canvas selective retry complete"`.
