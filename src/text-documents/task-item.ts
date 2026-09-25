/**
 * TaskItem whose checkbox never focuses the editor.
 *
 * The stock node view toggles a todo with
 * `editor.chain().focus(undefined, { scrollIntoView: false })...` - on a
 * phone that focus opens the keyboard, and the browser then scrolls to
 * wherever the (unrelated) caret happens to be, so ticking a todo made the
 * page jump. Ticking a box is not typing: the toggle is dispatched here
 * directly, with no focus and no selection change.
 *
 * How: a CAPTURING `change` listener on the item's own <li> runs before the
 * stock listener on the checkbox itself, handles the toggle and stops the
 * event there. A nested item's change also passes through its parents' <li>
 * in the capture phase - each one only claims its OWN checkbox.
 *
 * A read-only editor is left to the stock handler, which reverts the box.
 *
 * Also `preventDefault`s the checkbox's `pointerdown`: the stock view only
 * does that for `mousedown`, so on touch the tap focused the surrounding
 * contenteditable. (This replaces an earlier plugin that looked for
 * `li[data-type="taskItem"]` - an attribute the node view's <li> never has,
 * so it never fired.) The click that follows still toggles the box.
 */

import type { NodeViewRenderer } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';

export const QuietTaskItem = TaskItem.extend({
  addNodeView() {
    // TaskItem always defines a node view; extending it is the only reason
    // this exists, so a missing one would be a broken upgrade, not a case.
    const stock = this.parent?.() as NodeViewRenderer;

    return (props) => {
      const nodeView = stock(props);
      const item = nodeView.dom as HTMLElement;
      const box = item.querySelector(':scope > label > input[type="checkbox"]');
      if (!(box instanceof HTMLInputElement)) return nodeView;

      box.addEventListener('pointerdown', (event) => event.preventDefault());
      item.addEventListener(
        'change',
        (event) => {
          if (event.target !== box) return;
          const { editor, getPos } = props;
          if (!editor.isEditable) return;
          event.stopPropagation();
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos !== 'number') return;
          const node = editor.state.doc.nodeAt(pos);
          if (!node) return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: box.checked }));
        },
        true,
      );
      return nodeView;
    };
  },
});
