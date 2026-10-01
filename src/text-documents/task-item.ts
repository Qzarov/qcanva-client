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
import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TaskItemMetaLabels = {
  /** "Done 3 of 5" above a todo list. */
  progress: (done: number, total: number) => string;
  /** When a todo was ticked, shown next to it. */
  checkedAt: (date: Date) => string;
};

export type QuietTaskItemOptions = TaskItemOptions & { labels: TaskItemMetaLabels };

const DEFAULT_LABELS: TaskItemMetaLabels = {
  progress: (done, total) => `${done}/${total}`,
  checkedAt: (date) => date.toLocaleString(),
};

/** A stored `checkedAt` as a date, or null for a missing / malformed value. */
export function parseCheckedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Ticked / total todos in a list, counting nested items too. */
export function taskListProgress(list: ProseMirrorNode): { done: number; total: number } {
  let done = 0;
  let total = 0;
  list.descendants((node) => {
    if (node.type.name !== 'taskItem') return true;
    total += 1;
    if (node.attrs.checked === true) done += 1;
    return true;
  });
  return { done, total };
}

export const taskListMetaKey = new PluginKey('taskListMeta');

/**
 * `checkedAt` is editor-only metadata: it lives in the shared Yjs document
 * (the backend's json keeps every attribute) but is deliberately NOT in the
 * document node inventory, because it is not projected into the html - the
 * html still says only whether a todo is done (`data-checked`).
 */
export const QuietTaskItem = TaskItem.extend<QuietTaskItemOptions>({
  addOptions() {
    return { ...this.parent?.() as TaskItemOptions, labels: DEFAULT_LABELS };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      checkedAt: {
        default: null,
        // A new item split off a ticked one is not ticked, so it was never ticked at all.
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-checked-at') || null,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.checkedAt ? { 'data-checked-at': attributes.checkedAt } : {},
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? [];
    const labels = () => this.options.labels;
    return [
      ...parentPlugins,
      new Plugin({
        key: taskListMetaKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            // "Done N of M" above every list that is not itself nested in a
            // todo - a nested list is counted in its parent's progress.
            state.doc.descendants((node, pos, parent) => {
              if (node.type.name !== 'taskList') return true;
              if (parent?.type.name === 'taskItem') return true;
              const { done, total } = taskListProgress(node);
              if (total === 0) return true;
              decorations.push(
                Decoration.widget(
                  pos,
                  () => {
                    const el = document.createElement('div');
                    el.className = 'task-list-progress';
                    el.contentEditable = 'false';
                    el.dataset.complete = String(done === total);
                    el.textContent = labels().progress(done, total);
                    return el;
                  },
                  { side: -1, ignoreSelection: true, key: `task-progress-${done}-${total}` },
                ),
              );
              return true;
            });
            // The todo the caret is in stays expanded even when ticked, so its
            // full text can be edited (a ticked todo is otherwise one line).
            const { $head } = state.selection;
            for (let depth = $head.depth; depth > 0; depth -= 1) {
              if ($head.node(depth).type.name === 'taskItem') {
                const from = $head.before(depth);
                decorations.push(Decoration.node(from, from + $head.node(depth).nodeSize, { class: 'task-item-has-caret' }));
                break;
              }
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addNodeView() {
    // TaskItem always defines a node view; extending it is the only reason
    // this exists, so a missing one would be a broken upgrade, not a case.
    const stock = this.parent?.() as NodeViewRenderer;
    const labels = () => this.options.labels;

    return (props) => {
      const nodeView = stock(props);
      const item = nodeView.dom as HTMLElement;
      const box = item.querySelector(':scope > label > input[type="checkbox"]');
      if (!(box instanceof HTMLInputElement)) return nodeView;

      // When the todo was ticked. Outside contentDOM, so its own text changes
      // must not read as an edit of the document (see ignoreMutation).
      const meta = document.createElement('span');
      meta.className = 'task-item-meta';
      meta.contentEditable = 'false';
      const renderMeta = (node: ProseMirrorNode) => {
        const checkedAt = node.attrs.checked === true ? parseCheckedAt(node.attrs.checkedAt) : null;
        meta.hidden = !checkedAt;
        meta.textContent = checkedAt ? labels().checkedAt(checkedAt) : '';
        meta.title = checkedAt ? checkedAt.toLocaleString() : '';
      };
      renderMeta(props.node);
      item.append(meta);

      const stockUpdate = nodeView.update?.bind(nodeView);
      nodeView.update = (node, ...rest) => {
        const updated = stockUpdate ? stockUpdate(node, ...rest) : false;
        if (updated) renderMeta(node);
        return updated;
      };
      // The stock view has no ignoreMutation; ProseMirror's own default for a
      // view with contentDOM is "don't ignore" - kept for everything but meta.
      nodeView.ignoreMutation = (mutation) =>
        mutation.type !== 'selection' && meta.contains(mutation.target as globalThis.Node);

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
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            checked: box.checked,
            checkedAt: box.checked ? new Date().toISOString() : null,
          }));
        },
        true,
      );
      return nodeView;
    };
  },
});
