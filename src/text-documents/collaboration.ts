import Collaboration from '@tiptap/extension-collaboration';
import { ySyncPluginKey } from 'y-prosemirror';

/** Keep ProseMirror's required empty paragraph out of an emptied Yjs fragment. */
export default Collaboration.extend({
  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? [];
    const syncPlugin = plugins.find((plugin) => plugin.spec.key === ySyncPluginKey);
    const createView = syncPlugin?.spec.view;
    if (syncPlugin && createView) {
      syncPlugin.spec.view = (view) => {
        const pluginView = createView(view);
        const update = pluginView.update;
        if (update) {
          pluginView.update = (currentView, previousState) => {
            // After undo removes the first edit, Yjs is empty but PM must
            // display a paragraph. Upstream sync remembers that content was
            // edited and writes this placeholder even on a focus/selection
            // transaction. That untracked insertion survives redo, duplicating
            // the paragraph (or clearing redo if captured as a new edit).
            const syncState = ySyncPluginKey.getState(currentView.state);
            if (syncState?.type.length === 0 && currentView.state.doc.eq(previousState.doc)) return;
            update.call(pluginView, currentView, previousState);
          };
        }
        return pluginView;
      };
    }
    return plugins;
  },
});
