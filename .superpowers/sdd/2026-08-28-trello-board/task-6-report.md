# Task 6 report — board editor and access UI

## RED

Added behavior-first tests for cross-column native drag/drop, reader control
removal, owner-only access management, card metadata, required column-card
disposition, card fields, participant/free-text assignees, and checklist
operations.

Ran:

```text
npx vitest run src/components/board/BoardEditor.test.ts src/views/BoardTemplateView.test.ts --exclude '.claude/**'
```

Initial result: expected failure because `BoardEditor.vue`,
`BoardCardDialog.vue`, and `BoardTemplateView.vue` did not exist.

A later realtime regression test also failed as expected: replacing a card prop
after a checklist operation reset an unsaved title from
`Несохранённый заголовок` to the persisted title. The dialog now resets only
when the card ID changes, preserving unsaved fields during same-card updates.

## GREEN

Ran the required verification command:

```text
npx vitest run src/components/board/BoardEditor.test.ts src/views/BoardTemplateView.test.ts --exclude '.claude/**' && npm run build
```

Result: 2 files, 12 tests passed. `vue-tsc -b && vite build` completed
successfully with 308 modules transformed.

Ran the complete frontend suite:

```text
npx vitest run --exclude '.claude/**'
```

Result: 30 files, 152 tests passed.

## Delivered

- `BoardEditor`, `BoardColumn`, and `BoardCard` with native in-memory
  drag/drop, column/card operations, overdue styling, labels, assignee, and
  checklist progress.
- `BoardCardDialog` with title, description, date/time, labels,
  participant/free-text assignee, and independently emitted checklist
  operations.
- Required delete-or-move disposition before removing a non-empty column.
- Reader-safe rendering that omits every mutation and drag control.
- `BoardShareDialog` backed by permissions/share/revoke endpoints and exposed
  only to owners.
- `BoardTemplateView` owning template-type dispatch, snapshot/socket lifecycle,
  sync/error states, participants, title saving, and board operation dispatch.
- `/templates/:id` now uses the fetched template type: `trello-board` opens the
  collaborative board while `dnd-character` continues through the existing
  D&D editor.

## Scope and concerns

No new drag/drop dependency was added. Pre-existing edits to
`CanvasLoader.vue`, `CanvasLoader.touch.test.ts`, and `.claude/` were not
modified or staged. No known blockers remain.

## Fix round 1 — board mutation completeness and realtime-safe dialog state

### RED

Added regressions for all blocking review findings. The focused run initially
reported 9 failures:

- no label add/update/remove controls and no card-remove action;
- assigned users unavailable to editors, with unrelated saves clearing
  `assigneeUserId`;
- stale board data and role surviving a failed route load;
- same-card remote fields/checklist entries not merging into the dialog;
- save overwriting untouched remote fields;
- drag payload surviving `dragend` and no end-of-board column drop target.

### GREEN

- The board toolbar now manages labels even when the board starts with none,
  and the card dialog emits `card-remove`.
- Editor participant choices are derived only from assignments already visible
  in board data. The owner-only permissions endpoint remains owner-only, and a
  current assignee is retained unless the user explicitly changes it.
- Route loads clear socket `data` and `role` before fetching the next resource.
- The card dialog tracks dirty scalar/checklist fields, merges remote values
  into untouched fields, preserves local edits, and emits only locally changed
  card fields on save.
- Native drag state clears on `dragend`; columns can be dropped at the board's
  trailing target.

Verification:

```text
npx vitest run src/components/board/BoardEditor.test.ts src/views/BoardTemplateView.test.ts --exclude '.claude/**'
```

Result: 2 files, 21 tests passed.

```text
npx vitest run --exclude '.claude/**' && npm run build
```

Result: 30 files, 161 tests passed; `vue-tsc -b && vite build` completed
successfully with 308 modules transformed.
