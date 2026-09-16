import type { Editor, EditorEvents, Range } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';

/**
 * A `{from, to}` pair captured now is only valid as of this instant: in a
 * collaborative document, a co-editor's keystroke landing anywhere earlier
 * can shift it while an async gap (a network request, a closed keyboard, a
 * bottom sheet waiting on input) is in progress. Every transaction dispatched
 * on `editor` between now and `resolve()` is folded into one running
 * `Mapping` (ProseMirror's own tool for this - see
 * prosemirror-transform's `Mapping`), so `resolve()` reports where the
 * ORIGINAL range now lives rather than the stale numbers. Originally inlined
 * in `handleMentionCreatePage`; extracted so the mobile link-editor and
 * slash-command flows (which blur the editor while a bottom sheet is open)
 * can reuse the exact same guarantee.
 */
export function trackRange(editor: Editor, range: Range) {
  const mapping = new Mapping();
  const onTransaction = ({ transaction }: EditorEvents['transaction']) => {
    mapping.appendMapping(transaction.mapping);
  };
  editor.on('transaction', onTransaction);

  return {
    /** Where the originally-captured range lives now. Call before `stop()`. */
    resolve(): Range {
      return { from: mapping.map(range.from), to: mapping.map(range.to) };
    },
    stop(): void {
      editor.off('transaction', onTransaction);
    },
  };
}
