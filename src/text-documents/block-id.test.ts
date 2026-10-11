// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { afterEach, describe, expect, it } from 'vitest';
import { ySyncPluginKey } from 'y-prosemirror';
import { BlockId } from './block-id';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string): Editor {
  editor = new Editor({ extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), BlockId], content });
  return editor;
}

function blockIds(ed: Editor): string[] {
  const ids: string[] = [];
  ed.state.doc.descendants((node) => {
    if ('blockId' in node.attrs) ids.push(node.attrs.blockId as string);
  });
  return ids;
}

describe('BlockId', () => {
  it('gives every block a distinct id after the first change', () => {
    const ed = makeEditor('<p>a</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>t</p></li></ul>');
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p>b</p>');
    const ids = blockIds(ed);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids.every((id) => /^[a-z0-9]+-[a-z0-9]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the first half of a split paragraph and gives the second a new id', () => {
    const ed = makeEditor('<p data-block-id="keep-me">hello world</p>');
    ed.commands.setTextSelection(6);
    ed.commands.splitBlock();
    const [first, second] = blockIds(ed);
    expect(first).toBe('keep-me');
    expect(second).not.toBe('keep-me');
    expect(second).toBeTruthy();
  });

  it('re-ids a pasted copy of a block', () => {
    const ed = makeEditor('<p data-block-id="orig">x</p>');
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p data-block-id="orig">copy</p>');
    const ids = blockIds(ed);
    expect(ids.filter((id) => id === 'orig')).toHaveLength(1);
  });

  it('gives no ids for content that arrived through Yjs, and gives them with the next own edit', () => {
    const ed = makeEditor('');
    // What y-prosemirror dispatches for a loaded document or a collaborator's
    // change: marked as a change that came FROM Yjs.
    const remote = ed.state.tr.insertText('loaded', 1).setMeta(ySyncPluginKey, { isChangeOrigin: true });
    ed.view.dispatch(remote);
    expect(blockIds(ed).filter(Boolean)).toEqual([]);

    ed.commands.insertContentAt(ed.state.doc.content.size, '<p>typed</p>');
    const ids = blockIds(ed);
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
  });

  it('renders data-block-id', () => {
    const ed = makeEditor('<p data-block-id="b1">x</p>');
    expect(ed.getHTML()).toContain('data-block-id="b1"');
  });
});
