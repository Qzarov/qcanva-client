/**
 * Selecting several dashboard items for one action (move, pin, delete):
 * an item is known by its type and id, the same key the dashboard looks
 * items up by.
 */
export const selectionKey = (item: { type: string; id: string }): string => `${item.type}:${item.id}`;

/** `selected` with `key` added, or taken out if it was there. */
export function toggleSelection(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
}

/**
 * Shift-click: every key from `anchor` to `target` in the order the items
 * are on screen, added to what is already selected. Without the anchor on
 * screen only `target` is added.
 */
export function selectRange(selected: readonly string[], onScreen: readonly string[], anchor: string, target: string): string[] {
  const from = onScreen.indexOf(anchor);
  const to = onScreen.indexOf(target);
  const range = from < 0 || to < 0
    ? [target]
    : onScreen.slice(Math.min(from, to), Math.max(from, to) + 1);
  return [...selected, ...range.filter((key) => !selected.includes(key))];
}

/** All of `onScreen` added to what is already selected. */
export function selectAll(selected: readonly string[], onScreen: readonly string[]): string[] {
  return [...selected, ...onScreen.filter((key, index) => !selected.includes(key) && onScreen.indexOf(key) === index)];
}
