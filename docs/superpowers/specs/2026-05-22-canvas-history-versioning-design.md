# Canvas History Versioning Design

## Goal

Turn the existing canvas operation history into a user-facing versioning feature. Users should be able to inspect a previous canvas revision and restore it as a new revision without mutating historical operation rows.

## Scope

This slice covers canvas documents only. Manual two-client sync testing remains blocked, so the feature must be verified through backend reconstruction tests, frontend API/client tests, typecheck, and build.

In scope:
- reconstruct a canvas snapshot for a selected revision using the nearest checkpoint plus later operations;
- expose a REST endpoint for one historical revision snapshot;
- expose a restore endpoint that writes the selected historical snapshot as a new canvas revision;
- add a read-only preview and restore action to the existing canvas history panel.

Out of scope:
- visual diff between revisions;
- branching history;
- replay animation;
- manual multi-client realtime scenarios;
- HTML document collaboration.

## Backend Design

Add two service methods to `CanvasService`:
- `getHistorySnapshot(canvasId, user, revision)` checks normal canvas read access plus history visibility, then returns `{ revision, canvas: { id, title, data, revision } }` for the requested historical revision.
- `restoreHistorySnapshot(canvasId, user, revision)` requires edit access, reconstructs that revision, writes the data through the existing snapshot update path, and returns the updated canvas with the new current revision.

Reconstruction uses the latest checkpoint with `checkpoint.revision <= targetRevision`, then applies operation log rows in ascending revision order until the target revision. If no checkpoint exists, it starts from an empty `{ nodes: [], edges: [] }` snapshot and applies operations from revision `1`.

The operation application should reuse the existing canvas operation semantics so history preview matches live state. Missing target revision returns `404`.

## Frontend Design

Extend the existing `CanvasView` history panel:
- clicking a history row loads the reconstructed revision snapshot;
- the preview renders in a disabled/read-only canvas preview area;
- owner/editor can restore the selected revision;
- after restore, the main canvas reloads/resyncs and history refreshes.

The initial implementation can render preview data as a compact JSON-like summary rather than embedding the full editor twice. It must still show revision, timestamp, operation type, and counts of nodes/edges so the user can verify they selected the right revision.

## Testing

Backend:
- unit test reconstructing a target revision from a checkpoint and later operations;
- unit test restore creates a new current revision and operation history entry through snapshot update behavior;
- full backend test suite and build.

Frontend:
- API client tests for `canvas.historySnapshot` and `canvas.restoreHistorySnapshot`;
- unit-level helper coverage if snapshot summary logic is extracted;
- full frontend unit suite and build.

