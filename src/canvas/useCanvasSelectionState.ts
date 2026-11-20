import { computed, reactive, ref } from 'vue';

export function useCanvasSelectionState() {
  const selectedNodeIds = ref<string[]>([]);
  const selectedEdgeId = ref<string | null>(null);
  const selectedDrawingIds = ref<string[]>([]);
  const selectedNodeId = computed(() => selectedNodeIds.value.length === 1 ? selectedNodeIds.value[0] : null);
  const isNodeSelected = (id: string) => selectedNodeIds.value.includes(id);

  const selBox = reactive({ active: false, startX: 0, startY: 0, curX: 0, curY: 0 });
  const selBoxStyle = computed(() => {
    if (!selBox.active) return { display: 'none' };
    const x1 = Math.min(selBox.startX, selBox.curX);
    const y1 = Math.min(selBox.startY, selBox.curY);
    const x2 = Math.max(selBox.startX, selBox.curX);
    const y2 = Math.max(selBox.startY, selBox.curY);
    return {
      display: 'block',
      left: `${x1}px`,
      top: `${y1}px`,
      width: `${x2 - x1}px`,
      height: `${y2 - y1}px`,
    };
  });

  const clearSelection = () => {
    selectedNodeIds.value = [];
    selectedDrawingIds.value = [];
    selectedEdgeId.value = null;
    selBox.active = false;
  };

  return {
    selectedNodeIds,
    selectedNodeId,
    selectedEdgeId,
    selectedDrawingIds,
    isNodeSelected,
    selBox,
    selBoxStyle,
    clearSelection,
  };
}
