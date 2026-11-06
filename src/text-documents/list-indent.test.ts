// @vitest-environment jsdom
//
// Real TipTap editor with the document view's list extensions.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { afterEach, describe, expect, it } from 'vitest';
import { QuietTaskItem } from './task-item';
import { caretListItem, caretListItemType, listIndentState, moveCaretListItem } from './list-indent';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string): Editor {
  editor = new Editor({ extensions: [StarterKit, TaskList, QuietTaskItem.configure({ nested: true })], content });
  return editor;
}

/** Puts the caret at the end of the first text block reading `text`. */
function caretIn(ed: Editor, text: string) {
  let target = -1;
  ed.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) target = pos + node.nodeSize - 1;
  });
  if (target < 0) throw new Error(`no block "${text}"`);
  ed.commands.setTextSelection(target);
}

describe('list nesting without Tab', () => {
  it('nests a bullet under the one above it, and moves it back out', () => {
    const ed = makeEditor('<ul><li><p>One</p></li><li><p>Two</p></li></ul>');
    caretIn(ed, 'Two');

    expect(listIndentState(ed)).toEqual({ type: 'listItem', canIndent: true, canOutdent: true });
    expect(moveCaretListItem(ed, 1)).toBe(true);
    expect(ed.getHTML()).toBe('<ul><li><p>One</p><ul><li><p>Two</p></li></ul></li></ul>');

    expect(moveCaretListItem(ed, -1)).toBe(true);
    expect(ed.getHTML()).toBe('<ul><li><p>One</p></li><li><p>Two</p></li></ul>');
  });

  it('nests a todo under the todo above it', () => {
    const ed = makeEditor(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>One</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>Two</p></li></ul>',
    );
    caretIn(ed, 'Two');

    expect(caretListItemType(ed.state)).toBe('taskItem');
    expect(moveCaretListItem(ed, 1)).toBe(true);

    const outer = ed.state.doc.firstChild!.firstChild!;
    expect(outer.childCount).toBe(2);
    expect(outer.lastChild!.type.name).toBe('taskList');
    expect(outer.lastChild!.textContent).toBe('Two');
  });

  it('cannot nest the first item, which has nothing above it to go under', () => {
    const ed = makeEditor('<ul><li><p>One</p></li><li><p>Two</p></li></ul>');
    caretIn(ed, 'One');
    expect(listIndentState(ed).canIndent).toBe(false);
  });

  it('offers nothing outside a list', () => {
    const ed = makeEditor('<p>Plain</p>');
    caretIn(ed, 'Plain');
    expect(listIndentState(ed)).toEqual({ type: null, canIndent: false, canOutdent: false });
    expect(moveCaretListItem(ed, 1)).toBe(false);
    expect(caretListItem(ed.state)).toBeNull();
  });

  it('tells how deep the caret\'s item is, bullets and todos alike, and where it starts', () => {
    const ed = makeEditor(
      '<ul><li><p>One</p><ul><li><p>Two</p>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Three</p></li></ul>' +
        '</li></ul></li></ul>',
    );
    caretIn(ed, 'One');
    expect(caretListItem(ed.state)).toMatchObject({ type: 'listItem', level: 1 });
    caretIn(ed, 'Two');
    expect(caretListItem(ed.state)).toMatchObject({ type: 'listItem', level: 2 });
    caretIn(ed, 'Three');
    const three = caretListItem(ed.state)!;
    expect(three).toMatchObject({ type: 'taskItem', level: 3 });
    expect(ed.state.doc.nodeAt(three.pos)?.type.name).toBe('taskItem');
    expect(ed.state.doc.nodeAt(three.pos)?.textContent).toBe('Three');
  });
});
