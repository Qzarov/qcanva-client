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
