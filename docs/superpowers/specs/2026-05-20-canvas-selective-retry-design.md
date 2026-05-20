# Canvas Selective Retry Design

## Goal

Avoid full resync for safe stale-operation rejects. When the server rejects a local operation with `revision_mismatch`, the client should retry only operations that are safe to replay against the current revision.

## Scope

This slice is frontend-only. It does not change server conflict policy or WebSocket payloads. It only changes how the client responds to `canvas-op-reject`.

## Retry Rules

Retry is allowed only when all conditions are true:

- reject reason is `revision_mismatch`;
- the rejected operation is still available locally;
- the operation has not already been retried;
- the operation type is one of `nodes-move`, `node-resize`, `node-update`, `edge-update`;
- the server provided a numeric `serverRevision`.

Retry is not allowed for:

- `node-add`, `node-delete`, `edge-add`, `edge-delete`;
- `target_missing`, `forbidden`, `invalid_op`, `timeout`;
- missing operation metadata;
- second reject of the same logical operation.

## Behavior

For retryable rejects, the client resends the same operation once with `baseRevision = serverRevision`. The UI records a warning/info sync event and does not immediately resync.

For non-retryable rejects, the existing behavior remains: mark conflict, show reason-specific notice, and resync.

## Implementation

Add a pure helper under `src/canvas/syncRetry.ts`:

- `isRetryableCanvasOp(op)`;
- `shouldRetryCanvasReject(reject, pendingOp)`.

Extend `useCanvasSocket`:

- pending op metadata includes original op and retry count;
- `sendOp(op, options?)` can accept `baseRevision`, `clientOpId`, and `retryOf`;
- `canvas-op-reject` callback receives the rejected operation metadata before it is removed.

`CanvasView` uses the helper to decide retry vs resync.

## Tests

Add unit tests for retry policy:

- retry `node-update` on first `revision_mismatch`;
- do not retry deletes/adds;
- do not retry `target_missing`;
- do not retry an operation already retried once.

Run frontend unit tests and build.
