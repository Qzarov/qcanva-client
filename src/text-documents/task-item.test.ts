// @vitest-environment jsdom
//
// Real TipTap editor with the document view's todo extensions.

import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuietTaskItem, parseCheckedAt, taskListProgress } from './task-item';

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

function taskAttrs(ed: Editor, label: string): Record<string, unknown> {
  let attrs: Record<string, unknown> = {};
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem' && node.firstChild?.textContent === label) attrs = node.attrs;
  });
  return attrs;
}

function itemLi(ed: Editor, label: string): HTMLElement {
  const li = Array.from(ed.view.dom.querySelectorAll('li')).find(
    (el) => el.querySelector(':scope > div > p')?.textContent === label,
  );
  if (!(li instanceof HTMLElement)) throw new Error(`no item ${label}`);
  return li;
}

describe('QuietTaskItem meta', () => {
  it('stamps when a todo was ticked, and clears it when unticked', () => {
    const ed = makeEditor();
    tick(checkbox(ed, 'Second'));
    const checkedAt = taskAttrs(ed, 'Second').checkedAt;
    expect(typeof checkedAt).toBe('string');
    expect(Math.abs(Date.parse(checkedAt as string) - Date.now())).toBeLessThan(5000);

    tick(checkbox(ed, 'Second'));
    expect(taskAttrs(ed, 'Second').checkedAt).toBeNull();
  });

  it('shows when it was ticked next to a ticked todo only', () => {
    const ed = makeEditor();
    const meta = () => itemLi(ed, 'Second').querySelector(':scope > .task-item-meta') as HTMLElement;
    expect(meta().hidden).toBe(true);
    tick(checkbox(ed, 'Second'));
    expect(meta().hidden).toBe(false);
    expect(meta().textContent).not.toBe('');
    tick(checkbox(ed, 'Second'));
    expect(meta().hidden).toBe(true);
  });

  it('does not carry the tick time into an item split off a ticked one', () => {
    const ed = makeEditor();
    tick(checkbox(ed, 'Second'));
    let end = 0;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'Second') end = pos + node.nodeSize - 1;
    });
    ed.chain().setTextSelection(end).splitListItem('taskItem').run();
    const items: Array<Record<string, unknown>> = [];
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'taskItem') items.push(node.attrs);
    });
    const split = items[items.length - 1]!;
    expect(split.checked).toBe(false);
    expect(split.checkedAt).toBeNull();
  });

  it('shows "done N of M" above a top-level list, counting nested todos too', () => {
    const ed = makeEditor();
    const progress = () => Array.from(ed.view.dom.querySelectorAll('.task-list-progress')).map((el) => el.textContent);
    // One counter for the outer list; the nested list is counted in it.
    expect(progress()).toEqual(['0/3']);
    tick(checkbox(ed, 'Inner'));
    expect(progress()).toEqual(['1/3']);
    tick(checkbox(ed, 'Outer'));
    tick(checkbox(ed, 'Second'));
    expect(progress()).toEqual(['3/3']);
    expect((ed.view.dom.querySelector('.task-list-progress') as HTMLElement).dataset.complete).toBe('true');
  });

  it('marks the todo the caret is in, so a ticked one unfolds for editing', () => {
    const ed = makeEditor();
    let inSecond = 0;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'Second') inSecond = pos + 1;
    });
    ed.commands.setTextSelection(inSecond);
    expect(itemLi(ed, 'Second').classList.contains('task-item-has-caret')).toBe(true);
    expect(itemLi(ed, 'Outer').classList.contains('task-item-has-caret')).toBe(false);
  });
});

describe('QuietTaskItem progress under a folded heading', () => {
  // The app's headings carry `collapsed`; StarterKit's do not - add it here.
  const HeadingCollapsedAttr = Extension.create({
    name: 'testHeadingCollapsed',
    addGlobalAttributes() {
      return [{
        types: ['heading'],
        attributes: {
          collapsed: {
            default: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-collapsed') === 'true',
            renderHTML: (attributes: Record<string, unknown>) => (attributes.collapsed ? { 'data-collapsed': 'true' } : {}),
          },
        },
      }];
    },
  });

  const foldedDoc = (editable: boolean) => {
    editor = new Editor({
      editable,
      extensions: [StarterKit, HeadingCollapsedAttr, TaskList, QuietTaskItem.configure({ nested: true })],
      content:
        '<h2 data-collapsed="true">Folded</h2>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Hidden</p></li></ul>' +
        '<h2>Open</h2>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Shown</p></li></ul>',
    });
    return editor;
  };
  const progress = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll('.task-list-progress')).map((el) => el.textContent);

  it('shows no "done N of M" for a list hidden inside a folded section', () => {
    expect(progress(foldedDoc(true))).toEqual(['0/1']);
  });

  it('keeps every counter in a read-only document, where nothing is folded away', () => {
    expect(progress(foldedDoc(false))).toEqual(['1/1', '0/1']);
  });
});

describe('parseCheckedAt / taskListProgress', () => {
  it('reads only a valid stored date', () => {
    expect(parseCheckedAt('2026-10-01T10:00:00.000Z')?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    for (const bad of [null, undefined, '', 'yesterday', 42, {}]) expect(parseCheckedAt(bad)).toBeNull();
  });

  it('counts every todo under a list', () => {
    const ed = makeEditor();
    let list: any = null;
    ed.state.doc.forEach((node) => { if (node.type.name === 'taskList') list = node; });
    expect(taskListProgress(list)).toEqual({ done: 0, total: 3 });
  });
});
