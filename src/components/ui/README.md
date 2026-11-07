# UI primitives

These components own repeated application chrome, not resource-specific
content. Use the smallest primitive that fits the interaction:

- `UiButton` for labelled actions;
- `UiIconButton` for icon-only actions with a required accessible label;
- `UiModal` for backdrop, focusable dialog surface and Escape/backdrop close.

Keep domain classes on the component while migrating (`btn-primary`,
`dashboard-selection-icon`, and similar) so a slice can adopt a primitive
without changing its visual contract. Remove those compatibility classes only
after every consumer has moved to the primitive styles.
