import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useChatNodeAttach } from './useChatNodeAttach';

function setup(initialSelected: string | null = null) {
  const selectedNodeId = ref<string | null>(initialSelected);
  const chatOpen = ref(true);
  const labels: Record<string, string> = { A: 'Node A', B: 'Node B' };
  const att = useChatNodeAttach({
    selectedNodeId: () => selectedNodeId.value,
    getNodeLabel: (id) => labels[id] ?? '',
    chatOpen,
  });
  return { selectedNodeId, chatOpen, att };
}

describe('useChatNodeAttach', () => {
  it('attaches the currently selected node immediately (chat stays open)', () => {
    const { chatOpen, att } = setup('A');
    att.attach();
    expect(att.attachedNode.value).toEqual({ id: 'A', label: 'Node A' });
    expect(att.picking.value).toBe(false);
    expect(chatOpen.value).toBe(true);
  });

  it('enters pick mode and closes the chat when nothing is selected', () => {
    const { chatOpen, att } = setup(null);
    att.attach();
    expect(att.picking.value).toBe(true);
    expect(att.attachedNode.value).toBe(null);
    expect(chatOpen.value).toBe(false);
  });

  it('attaches the node picked during pick mode and reopens the chat', async () => {
    const { selectedNodeId, chatOpen, att } = setup(null);
    att.attach();
    expect(att.picking.value).toBe(true);

    // user taps a node on the now-visible canvas → selection changes
    selectedNodeId.value = 'B';
    await nextTick();

    expect(att.attachedNode.value).toEqual({ id: 'B', label: 'Node B' });
    expect(att.picking.value).toBe(false);
    expect(chatOpen.value).toBe(true);
  });

  it('ignores a deselect (null) while picking and keeps waiting', async () => {
    const { selectedNodeId, att } = setup(null);
    att.attach();
    selectedNodeId.value = null; // tap on empty canvas
    await nextTick();
    expect(att.picking.value).toBe(true);
    expect(att.attachedNode.value).toBe(null);
  });

  it('does not attach on selection changes when not picking', async () => {
    const { selectedNodeId, att } = setup(null);
    selectedNodeId.value = 'A';
    await nextTick();
    expect(att.attachedNode.value).toBe(null);
  });

  it('cancelPick exits pick mode and reopens the chat', () => {
    const { chatOpen, att } = setup(null);
    att.attach();
    att.cancelPick();
    expect(att.picking.value).toBe(false);
    expect(chatOpen.value).toBe(true);
  });

  it('clear removes the attached node', () => {
    const { att } = setup('A');
    att.attach();
    att.clear();
    expect(att.attachedNode.value).toBe(null);
  });
});
