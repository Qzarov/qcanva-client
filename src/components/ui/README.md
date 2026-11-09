# UI primitives

Полный инженерный контракт находится в
[`docs/code-conventions.md`](../../docs/code-conventions.md).

These components own repeated application chrome, not resource-specific
content. Use the smallest primitive that fits the interaction:

- `UiButton` for labelled actions;
- `UiBadge` for compact status, role and count labels;
- `UiToast` for transient success, error and info notifications;
- `UiCard` for semantic glass/elevated content surfaces;
- `UiIconButton` for icon-only actions with a required accessible label;
- `UiModal` for backdrop, focusable dialog surface and Escape/backdrop close.
- `UiInput` and `UiTextarea` for controlled text fields with forwarded field
  refs only when a consumer needs a documented imperative behavior;
- `UiMenu` and `UiSegmentedControl` for repeated menu and mode-switch chrome;
- `UiEmptyState` for repeated empty, error and retry states.

Keep domain classes on the component while migrating (`btn-primary`,
`dashboard-selection-icon`, and similar) so a slice can adopt a primitive
without changing its visual contract. Remove those compatibility classes only
after every consumer has moved to the primitive styles.

Every new primitive needs a small typed API, keyboard and focus behavior, and a
component test for its emitted events and ARIA state. Do not put resource cards,
canvas tools or page-specific data loading here.

`UiMenu` owns the panel and sheet behavior; consumers provide the trigger and
content. `UiSegmentedControl` owns active/pressed semantics while option attrs
keep established domain selectors during migration.
