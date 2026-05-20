# Canvas Sync UX Design

## Goal

Make realtime canvas sync state understandable while users edit. The UI should show whether changes are pending, confirmed, resyncing, rejected, or offline, and it should explain why a recovery/resync happened.

## Scope

This slice is frontend-only. It does not change the WebSocket protocol, server conflict policy, retry policy, or operation payload format.

## User Experience

The existing topbar sync badge remains the primary signal:

- `Saving`: one or more local operations are pending or a snapshot save is running.
- `Synced`: connected and no local operations are pending.
- `Resyncing`: the client is fetching the authoritative snapshot.
- `Conflict`: the latest operation was rejected and recovery is active or recently happened.
- `Offline`: websocket is disconnected.

The badge title should include the current revision, pending count, and the latest sync reason when available.

Clicking the badge opens a compact sync popover showing the latest local sync events. Events include:

- pending operation sent.
- operation confirmed.
- operation rejected.
- timeout fallback.
- resync started.
- resync completed.
- resync failed.

Each event has a readable label, status, optional reject reason, and timestamp.

## Data Model

Add a small frontend helper for sync event state:

- `SyncEventStatus`: `pending | confirmed | rejected | info | warning`.
- `SyncEvent`: id, status, label, optional reason, optional revision, timestamp.
- `createSyncEventStore(limit = 5)`: records events, updates existing events by id, exposes the latest reason and bounded list.

The helper is framework-independent TypeScript so it can be unit-tested without mounting Vue.

## Canvas Integration

`useCanvasSocket.sendOp` already returns `clientOpId`; `CanvasView` should use it to add a pending event. The socket composable should expose an `onAck` callback for operation acknowledgements, so `CanvasView` can mark the matching event confirmed.

Reject handling should mark the matching operation rejected when `clientOpId` exists and show reason-specific text:

- `revision_mismatch`: parallel edit changed the revision.
- `target_missing`: the edited object no longer exists.
- `forbidden`: current user cannot apply the change.
- `invalid_op`: the operation payload was rejected.
- `timeout`: realtime acknowledgement timed out.

Resync should add start/completed/failed events.

## Error Handling

If an operation times out, the UI should show warning status and keep the existing full snapshot fallback. If resync fails, the sync badge should remain conflict-like until the next successful load/resync.

## Tests

Add unit tests for the sync event store:

- records pending and confirms the same event id.
- records rejected event with readable latest reason.
- limits event list length.
- records resync lifecycle events.

Run frontend unit tests and build.
