import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const languagesReady = new PluginKey('qcanvaCodeLanguagesReady');

/** Preserve upstream paste/decoration plugins, adding a metadata-only refresh. */
export function withLazyCodeHighlighting(plugins: Plugin[], nodeName: string, ensureLanguages: () => Promise<void>): Plugin[] {
  // CodeBlockLowlight@2.27.2 appends its decoration plugin AFTER the base
  // CodeBlock plugins (including VS Code paste). Keep that exact plugin/key.
  const highlightPlugin = plugins[plugins.length - 1];
  const highlightState = highlightPlugin?.spec.state;
  if (!highlightPlugin || !highlightState) return plugins;
  highlightPlugin.spec.state = {
    ...highlightState,
    apply(transaction, decorations, oldState, newState) {
      if (transaction.getMeta(languagesReady)) {
        return highlightState.init({ schema: newState.schema, plugins: newState.plugins }, newState);
      }
      return highlightState.apply(transaction, decorations, oldState, newState);
    },
  };

  const hasCode = (doc: Node): boolean => {
    let found = false;
    doc.descendants((node) => {
      if (node.type.name === nodeName) found = true;
      return !found;
    });
    return found;
  };

  return [...plugins, new Plugin({
    view(view) {
      let destroyed = false;
      let requested = false;
      const request = () => {
        if (requested || !hasCode(view.state.doc)) return;
        requested = true;
        void Promise.resolve().then(ensureLanguages).then(() => {
          if (destroyed || !hasCode(view.state.doc)) return;
          // No document steps: never touches text, block ids, selection, undo
          // history or Yjs. Upstream's plugin normally refreshes on docChanged
          // only, so setting arbitrary metadata alone would not re-highlight.
          // Do not set addToHistory=false: y-prosemirror uses that metadata
          // to stopCapturing even when a transaction has no document steps.
          view.dispatch(view.state.tr.setMeta(languagesReady, true));
        }).catch(() => {
          // The code remains readable; retry after the next document change.
          requested = false;
        });
      };
      request();
      return {
        update(_view, previousState) {
          if (view.state.doc !== previousState.doc) request();
        },
        destroy() { destroyed = true; },
      };
    },
  })];
}
