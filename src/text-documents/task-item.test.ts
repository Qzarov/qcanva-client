// @vitest-environment jsdom
//
// Real TipTap editor with the document view's todo extensions.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuietTaskItem } from './task-item';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(editable = true): Editor {
  editor = new Editor({
    editable,
    extensions: [StarterKit, TaskList, QuietTaskItem.configure({ nested: true })],
    content:
      '<p>Top</p><ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="false"><p>Outer</p>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Inner</p></li></ul>' +
      '</li>' +
      '<li data-type="taskItem" data-checked="false"><p>Second</p></li>' +
      '</ul>',
  });
  return editor;
}

function checkedStates(ed: Editor): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem') out[node.firstChild?.textContent ?? ''] = node.attrs.checked;
  });
  return out;
}

function checkbox(ed: Editor, label: string): HTMLInputElement {
  const li = Array.from(ed.view.dom.querySelectorAll('li')).find(
    (el) => el.querySelector(':scope > div > p')?.textContent === label,
  );
  const box = li?.querySelector(':scope > label input[type="checkbox"]');
  if (!(box instanceof HTMLInputElement)) throw new Error(`no checkbox for ${label}`);
  return box;
}

function tick(box: HTMLInputElement) {
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('QuietTaskItem', () => {
  it('toggles the todo without focusing the editor (no keyboard, no scroll to the caret)', () => {
    const ed = makeEditor();
    const focusSpy = vi.spyOn(ed.view, 'focus');
    const commandFocusSpy = vi.spyOn(ed.commands, 'focus');
    const selectionBefore = ed.state.selection.toJSON();

    tick(checkbox(ed, 'Second'));

    expect(checkedStates(ed)).toEqual({ Outer: false, Inner: false, Second: true });
    expect(focusSpy).not.toHaveBeenCalled();
    expect(commandFocusSpy).not.toHaveBeenCalled();
    expect(ed.state.selection.toJSON()).toEqual(selectionBefore);
  });

  it('toggles only the nested item whose box was ticked', () => {
    const ed = makeEditor();
    tick(checkbox(ed, 'Inner'));
    expect(checkedStates(ed)).toEqual({ Outer: false, Inner: true, Second: false });
    tick(checkbox(ed, 'Outer'));
    expect(checkedStates(ed)).toEqual({ Outer: true, Inner: true, Second: false });
  });

  it('can be unticked again, and a tick is undoable', () => {
    const ed = makeEditor();
    tick(checkbox(ed, 'Outer'));
    expect(checkedStates(ed).Outer).toBe(true);
    ed.commands.undo();
    expect(checkedStates(ed).Outer).toBe(false);
    tick(checkbox(ed, 'Outer'));
    tick(checkbox(ed, 'Outer'));
    expect(checkedStates(ed).Outer).toBe(false);
  });

  it('keeps a press on the box from focusing the editable', () => {
    const ed = makeEditor();
    const press = new Event('pointerdown', { bubbles: true, cancelable: true });
    checkbox(ed, 'Second').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it('leaves a read-only editor unchanged (the stock handler reverts the box)', () => {
    const ed = makeEditor(false);
    const box = checkbox(ed, 'Second');
    tick(box);
    expect(checkedStates(ed).Second).toBe(false);
    expect(box.checked).toBe(false);
  });
});
