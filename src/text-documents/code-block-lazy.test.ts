// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { flushPromises } from '@vue/test-utils';
import { createLowlight } from 'lowlight';
import { Slice } from '@tiptap/pm/model';
import javascript from 'highlight.js/lib/languages/javascript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { yUndoPluginKey } from 'y-prosemirror';
import Collaboration from './collaboration';
import { CodeBlockWithLanguage } from './code-block-language';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) if (!editor.isDestroyed) editor.destroy();
  for (const doc of documents.splice(0)) doc.destroy();
});

function pendingLanguages() {
  const lowlight = createLowlight();
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  const ensureLanguages = vi.fn(() => pending.then(() => { lowlight.register({ javascript }); }));
  return { lowlight, ensureLanguages, resolve, reject };
}

function makeEditor(loader: ReturnType<typeof pendingLanguages>, content: string, doc?: Y.Doc, editable = true) {
  const editor = new Editor({
    editable,
    content,
    extensions: [
      StarterKit.configure({ codeBlock: false, history: doc ? false : undefined }),
      CodeBlockWithLanguage.configure({ lowlight: loader.lowlight, ensureLanguages: loader.ensureLanguages }),
      ...(doc ? [Collaboration.configure({ document: doc })] : []),
    ],
  });
  editors.push(editor);
  return editor;
}

describe('lazy code block highlighting', () => {
  it('does not request languages for a document without code, then highlights its first code block', async () => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, '<p>plain</p>');
    expect(loader.ensureLanguages).not.toHaveBeenCalled();
    editor.commands.setContent('<pre><code class="language-javascript">const value = 42;</code></pre>');
    expect(editor.view.dom.textContent).toContain('const value = 42;');
    loader.resolve();
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });

  it('highlights an initially loaded code block in a read-only editor without rewriting it', async () => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, '<pre><code class="language-js">const value = 42;</code></pre>', undefined, false);
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    loader.resolve();
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.isEditable).toBe(false);
  });

  it('does not publish a Yjs change or add an undo step when languages arrive', async () => {
    const loader = pendingLanguages();
    const doc = new Y.Doc();
    documents.push(doc);
    const editor = makeEditor(loader, '', doc);
    editor.commands.insertContent('<pre><code class="language-javascript">const value = 42;</code></pre>');
    editor.commands.setTextSelection(2);
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    const manager = yUndoPluginKey.getState(editor.state)!.undoManager;
    // Keep the same capture window regardless of CPU contention in the suite.
    manager.captureTimeout = Number.POSITIVE_INFINITY;
    const undoDepth = manager.undoStack.length;
    const beforeUpdate = Y.encodeStateAsUpdate(doc);
    loader.resolve();
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(manager.undoStack).toHaveLength(undoDepth);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(beforeUpdate);
    editor.commands.insertContent('!');
    expect(manager.undoStack).toHaveLength(undoDepth);
    editor.commands.undo();
    expect(editor.getText()).toBe('');
  });

  it.each(['', 'js', 'rust'])('keeps auto/alias/unknown language behavior for %s', async (language) => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, `<pre><code${language ? ` class="language-${language}"` : ''}>const value = 42;</code></pre>`);
    const before = editor.getJSON();
    loader.resolve();
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.getJSON()).toEqual(before);
  });

  it('keeps text readable on failure and retries after another edit', async () => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, '<pre><code class="language-javascript">const value = 42;</code></pre>');
    await flushPromises();
    loader.reject(new Error('offline'));
    await flushPromises();
    expect(editor.getText()).toBe('const value = 42;');
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull();
    loader.ensureLanguages.mockImplementation(async () => { loader.lowlight.register({ javascript }); });
    editor.commands.insertContent(' ');
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.getText()).toContain('const value = 42;');
  });

  it('does not dispatch into a destroyed editor when the import finishes', async () => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, '<pre><code>const value = 42;</code></pre>');
    const before = editor.getJSON();
    editor.destroy();
    loader.resolve();
    await flushPromises();
    expect(editor.isDestroyed).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it('retains the parent VS Code paste handler and its detected language', async () => {
    const loader = pendingLanguages();
    const editor = makeEditor(loader, '<p></p>');
    const event = new Event('paste');
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) =>
      type === 'text/plain' ? 'const value = 42;\r\nconsole.log(value);'
        : type === 'vscode-editor-data' ? JSON.stringify({ mode: 'js' }) : '',
    } });
    const handled = editor.view.someProp('handlePaste', handler => handler(editor.view, event as ClipboardEvent, Slice.empty));
    expect(handled).toBe(true);
    expect(editor.state.doc.firstChild?.attrs.language).toBe('js');
    expect(editor.getText()).toBe('const value = 42;\nconsole.log(value);');
    loader.resolve();
    await flushPromises();
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });
});
