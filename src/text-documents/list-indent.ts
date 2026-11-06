/**
 * Nesting a list item one level in or out without a Tab key.
 *
 * On a desktop Tab / Shift+Tab already do this (StarterKit's ListItem and
 * the TaskItem's own shortcuts). A phone's on-screen keyboard has no Tab, so
 * a second-level bullet or todo was impossible to make there. The document
 * view shows an arrow in the left gutter beside the caret's item instead
 * ("→" one level in; from the second level on also "←" one level out), and
 * they run exactly the commands Tab / Shift+Tab run.
 */

import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

export type ListItemType = 'listItem' | 'taskItem';

/** The item type of the innermost list item around the caret, or null outside any list. */
export function caretListItemType(state: EditorState): ListItemType | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === 'listItem' || name === 'taskItem') return name;
  }
  return null;
}

/**
 * The caret's innermost list item: its type, how deep it is (1 = a list's own
 * item, 2 = nested in another item, …; bullets and todos count alike) and the
 * document position just before it, or null outside any list.
 */
export function caretListItem(state: EditorState): { type: ListItemType; level: number; pos: number } | null {
  const { $from } = state.selection;
  let found: { type: ListItemType; depth: number } | null = null;
  let level = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name !== 'listItem' && name !== 'taskItem') continue;
    level += 1;
    found ??= { type: name, depth };
  }
  if (!found) return null;
  return { type: found.type, level, pos: $from.before(found.depth) };
}

/** Whether the caret's list item can move one level in / out right now. */
export function listIndentState(editor: Editor): { type: ListItemType | null; canIndent: boolean; canOutdent: boolean } {
  const type = caretListItemType(editor.state);
  if (!type) return { type, canIndent: false, canOutdent: false };
  return {
    type,
    canIndent: editor.can().sinkListItem(type),
    canOutdent: editor.can().liftListItem(type),
  };
}

/** One level in (`1`, what Tab does) or out (`-1`, what Shift+Tab does). */
export function moveCaretListItem(editor: Editor, direction: -1 | 1): boolean {
  const type = caretListItemType(editor.state);
  if (!type) return false;
  return direction === 1 ? editor.commands.sinkListItem(type) : editor.commands.liftListItem(type);
}
