# Task 5 report — frontend board contract and realtime sync

## RED

Ran:

```text
npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts --exclude '.claude/**'
```

Result: expected failure before implementation — `./operations` and
`./useBoardSocket` could not be resolved.

The API contract test also failed as expected before the client update:
`TypeError: interactiveTemplates.snapshot is not a function`.

## GREEN

Ran:

```text
npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts src/api/client.test.ts --exclude '.claude/**'
```

Result: 3 files, 19 tests passed.

Ran:

```text
npm run build
```

Result: `vue-tsc -b && vite build` completed successfully.

## Delivered files

- `src/boards/types.ts`, `defaults.ts`, `operations.ts`, and reducer tests.
- `src/composables/useBoardSocket.ts` and socket tests.
- `src/api/client.ts` and API contract coverage for snapshots and sharing.

Commit: `feat(boards): add board client state and realtime socket`.

## Contract notes

The board types and operation reducer mirror the backend. The socket uses
`/boards-ws`, applies local operations optimistically, retains a pre-operation
snapshot per pending operation, requests an HTTP snapshot on a revision gap,
and only retries still-valid card/column moves after a rejection. Revocation
clears board state and marks synchronization as `forbidden`.

## Concerns

No known blockers. The visual board editor and access UI remain intentionally
out of scope for Task 6.

## Fix round 1 — realtime reconciliation

### RED

Added focused socket regressions for acknowledgement-then-broadcast, revision
gap snapshot recovery, valid and invalid queued-move replay after a rejection,
and disconnect cleanup. Before the fix, the matching self broadcast requested
a snapshot and later local operations were emitted before the earlier one was
acknowledged.

### GREEN

Ran:

```text
npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts src/api/client.test.ts --exclude '.claude/**'
```

Result: 3 files, 24 tests passed.

Ran `npm run build`; `vue-tsc -b && vite build` completed successfully.

The socket now records acknowledged self operation IDs, serializes outbound
operations, and reconstructs/replays only later valid moves after a rejected
operation's fresh snapshot.

## Fix round 2 — rejection replay ordering

### RED

The added rejection tests initially showed that a `revision_mismatch` replayed
only later queued moves, while an unmatched reject cleared every unrelated
pending operation.

### GREEN

`revision_mismatch` now retries the rejected valid card/column move first,
then queues later valid moves behind it. A reject without a matching client
operation ID requests a fresh snapshot without clearing unrelated pending
operations.

Verification:

```text
npx vitest run src/boards/operations.test.ts src/composables/useBoardSocket.test.ts src/api/client.test.ts --exclude '.claude/**'
```

Result: 3 files, 25 tests passed. `npm run build` also completed successfully.

## Fix round 3 — retain optimistic projection on unmatched rejects

### RED

The unmatched-reject regression retained its pending count but failed the
visible-state assertion: snapshot replacement moved the pending card back to
its server position.

### GREEN

Fresh snapshots now replay every retained, still-applicable pending operation
in order before exposing the synchronized state. Operations that no longer
apply are removed from the pending map. The unmatched-reject test verifies the
card stays in its optimistic column after snapshot recovery.

Verification: the focused board suite passed 25 tests and `npm run build`
completed successfully.
