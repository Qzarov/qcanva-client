// @vitest-environment jsdom
//
// Real TipTap editor with the document view's code block extension.

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeBlockWithLanguage, CODE_LANGUAGE_OPTIONS } from './code-block-language';
import { lowlight } from './code-highlighting';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string, editable = true): Editor {
  editor = new Editor({
    editable,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockWithLanguage.configure({ lowlight, labels: { auto: 'Auto', plaintext: 'Plain text', choose: 'Code language' } }),
    ],
    content,
  });
  return editor;
}

const picker = (ed: Editor) => ed.view.dom.querySelector('select[data-code-language]') as HTMLSelectElement;
const language = (ed: Editor) => ed.state.doc.firstChild!.attrs.language;

describe('code block language picker', () => {
  it('shows the block\'s language, "Auto" when none is set', () => {
    const ed = makeEditor('<pre><code class="language-python">print(1)</code></pre>');
    expect(picker(ed).value).toBe('python');
    ed.commands.setContent('<pre><code>x = 1</code></pre>');
    expect(picker(ed).value).toBe('');
    expect(picker(ed).selectedOptions[0]!.textContent).toBe('Auto');
  });

  it('writes the chosen language into the node (so it syncs, saves and undoes like any edit)', () => {
    const ed = makeEditor('<pre><code>const a = 1</code></pre>');
    const select = picker(ed);
    select.value = 'typescript';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(language(ed)).toBe('typescript');

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(language(ed)).toBeNull();
  });

  it('follows a language change made elsewhere (a collaborator, undo)', () => {
    const ed = makeEditor('<pre><code>SELECT 1</code></pre>');
    ed.commands.updateAttributes('codeBlock', { language: 'sql' });
    expect(picker(ed).value).toBe('sql');
  });

  it('keeps an unlisted language a document already has, instead of silently showing Auto', () => {
    const ed = makeEditor('<pre><code class="language-js">let x</code></pre>');
    expect(picker(ed).value).toBe('js');
    expect(Array.from(picker(ed).options).map((o) => o.value)).toContain('js');
  });

  it('offers Auto, Plain text and every registered language', () => {
    const ed = makeEditor('<pre><code>x</code></pre>');
    const values = Array.from(picker(ed).options).map((o) => o.value);
    expect(values).toEqual(['', ...CODE_LANGUAGE_OPTIONS.map((o) => o.value)]);
    for (const option of CODE_LANGUAGE_OPTIONS) expect(lowlight.registered(option.value)).toBe(true);
  });

  it('is shown but disabled in a read-only editor', () => {
    const ed = makeEditor('<pre><code class="language-css">a{}</code></pre>', false);
    expect(picker(ed).disabled).toBe(true);
    expect(picker(ed).value).toBe('css');
  });

  it('keeps the code itself editable text inside <code>', () => {
    const ed = makeEditor('<pre><code class="language-json">{}</code></pre>');
    const code = ed.view.dom.querySelector('pre code')!;
    expect(code.textContent).toBe('{}');
    expect(picker(ed).closest('pre code')).toBeNull();
  });
});
