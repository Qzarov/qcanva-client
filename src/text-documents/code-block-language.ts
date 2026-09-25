/**
 * The code block, showing (and choosing) its language.
 *
 * CodeBlockLowlight already stores a `language` attribute and highlights by
 * it (auto-detecting when it's unset) - it just never showed it. This adds
 * a small picker in the block's top-right corner: "Auto", "Plain text" and
 * the grammars registered in code-highlighting.ts. Picking one writes the
 * node attribute, so it syncs, saves and undoes like any other edit; a
 * change arriving any other way (a collaborator, undo) updates the picker.
 * A language a document already carries that isn't in the list (an alias
 * like "js", or one we don't bundle) is kept and shown as-is rather than
 * silently displayed as Auto. Read-only editors show it disabled.
 *
 * Chrome only: the picker lives in the node view's DOM, never in the
 * document; `getHTML()`/the backend see the same `<pre><code class=
 * "language-x">` as before.
 */

import CodeBlockLowlight, { type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight';
import type { Node as PMNode } from '@tiptap/pm/model';

export const CODE_LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string | null }> = [
  // label null = the localized "Plain text" label from the options.
  { value: 'plaintext', label: null },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
];

export interface CodeBlockLanguageLabels {
  auto: string;
  plaintext: string;
  /** Accessible name of the picker. */
  choose: string;
}

export interface CodeBlockWithLanguageOptions extends CodeBlockLowlightOptions {
  labels: CodeBlockLanguageLabels;
}

export const CodeBlockWithLanguage = CodeBlockLowlight.extend<CodeBlockWithLanguageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as CodeBlockLowlightOptions),
      labels: { auto: 'Auto', plaintext: 'Plain text', choose: 'Code language' },
    };
  },

  addNodeView() {
    const { labels, languageClassPrefix } = this.options;
    const nodeType = this.name;

    return ({ node, editor, getPos }) => {
      let current: PMNode = node;
      const dom = document.createElement('div');
      dom.className = 'text-doc-code-block';

      const select = document.createElement('select');
      select.className = 'text-doc-code-language';
      select.dataset.codeLanguage = '';
      select.contentEditable = 'false';
      select.setAttribute('aria-label', labels.choose);
      select.title = labels.choose;

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.appendChild(code);
      dom.append(select, pre);

      const option = (value: string, text: string) => {
        const el = document.createElement('option');
        el.value = value;
        el.textContent = text;
        return el;
      };

      const render = () => {
        const value = (current.attrs.language as string | null) || '';
        const known = value === '' || CODE_LANGUAGE_OPTIONS.some((o) => o.value === value);
        select.replaceChildren(
          option('', labels.auto),
          ...CODE_LANGUAGE_OPTIONS.map((o) => option(o.value, o.label ?? labels.plaintext)),
          ...(known ? [] : [option(value, value)]),
        );
        select.value = value;
        select.disabled = !editor.isEditable;
        code.className = value ? `${languageClassPrefix}${value}` : '';
      };
      render();

      select.addEventListener('change', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos !== 'number' || !editor.isEditable) return;
        const language = select.value || null;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language }));
      });

      return {
        dom,
        contentDOM: code,
        update(updated: PMNode) {
          if (updated.type.name !== nodeType) return false;
          current = updated;
          render();
          return true;
        },
        // The picker is ours: ProseMirror must not treat clicks/keys in it
        // as editing, nor its DOM changes as document mutations.
        stopEvent: (event: Event) => select.contains(event.target as Node),
        ignoreMutation: (mutation: { target: Node; type: string }) =>
          mutation.type !== 'selection' && select.contains(mutation.target),
      };
    };
  },
});
