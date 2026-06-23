import { ref, watch, type Ref } from 'vue';

export interface AttachedNode {
  id: string;
  label: string;
}

export interface ChatNodeAttachOptions {
  /** Getter for the canvas's currently selected node id (reactive source). */
  selectedNodeId: () => string | null | undefined;
  /** Resolve a human label for a node id. */
  getNodeLabel: (id: string) => string;
  /** The chat panel's open state — toggled when entering/leaving pick mode. */
  chatOpen: Ref<boolean>;
}

/**
 * Attaching a node to a chat message.
 *
 * Desktop has the canvas next to the chat, so a node can be selected first and
 * attached directly. On mobile the chat is a full-screen sheet that hides the
 * canvas, so there is no way to select a node while the chat is open. To make
 * attaching work everywhere, pressing attach with nothing selected enters a
 * "pick a node" mode: the chat closes to reveal the canvas, and the next node
 * the user selects is attached and the chat reopens.
 */
export function useChatNodeAttach(opts: ChatNodeAttachOptions) {
  const attachedNode = ref<AttachedNode | null>(null);
  const picking = ref(false);

  const attachById = (id: string) => {
    attachedNode.value = { id, label: opts.getNodeLabel(id) || 'Нода' };
  };

  const attach = () => {
    const id = opts.selectedNodeId();
    if (id) {
      // A node is already selected (typical on desktop) — attach it right away.
      attachById(id);
      return;
    }
    // Nothing selected — reveal the canvas and wait for the user to tap a node.
    picking.value = true;
    opts.chatOpen.value = false;
  };

  const cancelPick = () => {
    picking.value = false;
    opts.chatOpen.value = true;
  };

  const clear = () => {
    attachedNode.value = null;
  };

  // While picking, the first node the user selects gets attached; reopen the chat.
  watch(
    () => opts.selectedNodeId(),
    (id) => {
      if (picking.value && id) {
        attachById(id);
        picking.value = false;
        opts.chatOpen.value = true;
      }
    },
  );

  return { attachedNode, picking, attach, cancelPick, clear };
}
