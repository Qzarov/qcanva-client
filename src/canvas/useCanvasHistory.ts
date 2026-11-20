import { computed, ref, type Ref } from 'vue';
import type { Drawing } from './drawing';

interface CanvasHistoryOptions<N, E> {
  nodes: Ref<N[]>;
  edges: Ref<E[]>;
  drawings: Ref<Drawing[]>;
  scheduleChange: (forceSnapshot?: boolean) => void;
  clearSelection: () => void;
}

interface Snapshot {
  nodes: string;
  edges: string;
  drawings: string;
}

export function useCanvasHistory<N, E>(options: CanvasHistoryOptions<N, E>) {
  const undoStack = ref<Snapshot[]>([]);
  const redoStack = ref<Snapshot[]>([]);
  const MAX_HISTORY = 50;
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  const takeSnapshot = (): Snapshot => ({
    nodes: JSON.stringify(options.nodes.value),
    edges: JSON.stringify(options.edges.value),
    drawings: JSON.stringify(options.drawings.value),
  });

  const pushUndo = () => {
    undoStack.value.push(takeSnapshot());
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
    redoStack.value = [];
    options.scheduleChange();
  };

  const undo = () => {
    if (!undoStack.value.length) return;
    redoStack.value.push(takeSnapshot());
    const snapshot = undoStack.value.pop()!;
    options.nodes.value = JSON.parse(snapshot.nodes);
    options.edges.value = JSON.parse(snapshot.edges);
    options.drawings.value = JSON.parse(snapshot.drawings);
    options.clearSelection();
    options.scheduleChange(true);
  };

  const redo = () => {
    if (!redoStack.value.length) return;
    undoStack.value.push(takeSnapshot());
    const snapshot = redoStack.value.pop()!;
    options.nodes.value = JSON.parse(snapshot.nodes);
    options.edges.value = JSON.parse(snapshot.edges);
    options.drawings.value = JSON.parse(snapshot.drawings);
    options.clearSelection();
    options.scheduleChange(true);
  };

  return { canUndo, canRedo, pushUndo, undo, redo };
}
