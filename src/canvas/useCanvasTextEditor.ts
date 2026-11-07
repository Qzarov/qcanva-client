import { computed, nextTick, ref, watch, type Ref } from 'vue';

export interface CanvasTextNode {
  id: string;
  type: string;
  text?: string;
}

interface TextSyncStatus {
  kind: 'synced' | 'saving' | 'offline' | 'failed';
  label: string;
}

interface CanvasTextEditorOptions<T extends CanvasTextNode> {
  nodes: Ref<T[]>;
  readonly: () => boolean;
  isMobileLayout: Ref<boolean>;
  editorRefs: Ref<HTMLTextAreaElement[]>;
  fullscreenEditorRef: Ref<HTMLTextAreaElement | null>;
  getTextSyncStatus: () => TextSyncStatus;
  t: (key: any) => string;
  emitNodeEditStart: (id: string) => void;
  emitNodeUpdate: (id: string, text: string | undefined) => void;
  scheduleChange: () => void;
  registerBackHandler: (handler: () => boolean) => () => void;
}

export function useCanvasTextEditor<T extends CanvasTextNode>(options: CanvasTextEditorOptions<T>) {
  const editingNodeId = ref<string | null>(null);
  const textHistory = ref<{ past: string[]; future: string[]; current: string }>({ past: [], future: [], current: '' });
  const textDirty = ref(false);
  const canUndoText = computed(() => !!editingNodeId.value && textHistory.value.past.length > 0);
  const canRedoText = computed(() => !!editingNodeId.value && textHistory.value.future.length > 0);
  const resetTextHistory = (text: string) => { textHistory.value = { past: [], future: [], current: text }; };

  watch(() => options.nodes.value.find((node) => node.id === editingNodeId.value)?.text, (text) => {
    if (editingNodeId.value && (text ?? '') !== textHistory.value.current) resetTextHistory(text ?? '');
  }, { flush: 'sync' });

  const textSaveStatus = computed(() => {
    const status = options.getTextSyncStatus();
    if (status.kind === 'offline' || status.kind === 'failed') return { ...status, label: status.label || options.t('syncOffline') };
    return textDirty.value ? { kind: 'saving' as const, label: options.t('syncSaving') } : status;
  });

  const focusTextEditor = () => {
    const textarea = options.isMobileLayout.value ? options.fullscreenEditorRef.value : options.editorRefs.value[0];
    textarea?.focus();
  };

  const onEditEnd = () => {
    if (editingNodeId.value) {
      const node = options.nodes.value.find((item) => item.id === editingNodeId.value);
      if (node) emitTextUpdate(node);
    }
    editingNodeId.value = null;
    options.scheduleChange();
  };

  const startTextEditing = (node: T) => {
    if (editingNodeId.value && editingNodeId.value !== node.id) onEditEnd();
    resetTextHistory(node.text ?? '');
    options.emitNodeEditStart(node.id);
    editingNodeId.value = node.id;
    nextTick(focusTextEditor);
  };

  const openTextEditor = (id: string | null | undefined) => {
    const node = options.nodes.value.find((item) => item.id === id);
    if (!node || node.type !== 'text' || options.readonly()) return;
    startTextEditing(node);
  };

  const isTextNode = (id: string | null | undefined) => options.nodes.value.some((node) => node.id === id && node.type === 'text');

  let editSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const lastEmittedText = new Map<string, string | undefined>();
  const emitTextUpdate = (node: T) => {
    if (editSaveTimer) {
      clearTimeout(editSaveTimer);
      editSaveTimer = null;
    }
    textDirty.value = false;
    if (lastEmittedText.get(node.id) === node.text) return;
    lastEmittedText.set(node.id, node.text);
    options.emitNodeUpdate(node.id, node.text);
  };

  const scheduleTextUpdate = (node: T) => {
    textDirty.value = true;
    if (editSaveTimer) clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(() => emitTextUpdate(node), 500);
  };

  const onEditInput = (event: Event, node: T) => {
    const text = (event.target as HTMLTextAreaElement).value;
    if (text === node.text) return;
    textHistory.value.past.push(node.text ?? '');
    if (textHistory.value.past.length > 100) textHistory.value.past.shift();
    textHistory.value.future = [];
    textHistory.value.current = text;
    node.text = text;
    scheduleTextUpdate(node);
    options.scheduleChange();
  };

  const stepTextHistory = (redo: boolean) => {
    const node = options.nodes.value.find((item) => item.id === editingNodeId.value);
    if (!node || options.readonly()) return;
    const from = redo ? textHistory.value.future : textHistory.value.past;
    const to = redo ? textHistory.value.past : textHistory.value.future;
    if (!from.length) return;
    to.push(node.text ?? '');
    const text = from.pop()!;
    textHistory.value.current = text;
    node.text = text;
    scheduleTextUpdate(node);
    options.scheduleChange();
    nextTick(focusTextEditor);
  };

  const undoText = () => stepTextHistory(false);
  const redoText = () => stepTextHistory(true);
  const onTextEditorKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (event.shiftKey || key === 'y') redoText(); else undoText();
  };

  const fullscreenEditingNode = computed<T | null>(() => {
    if (!options.isMobileLayout.value || !editingNodeId.value) return null;
    return options.nodes.value.find((node) => node.id === editingNodeId.value && node.type === 'text') ?? null;
  });

  const closeTextEditor = () => {
    options.fullscreenEditorRef.value?.blur();
    onEditEnd();
  };

  let unregisterEditorBack: (() => void) | null = null;
  watch(() => !!fullscreenEditingNode.value, (open) => {
    if (open && !unregisterEditorBack) {
      unregisterEditorBack = options.registerBackHandler(() => {
        closeTextEditor();
        return true;
      });
    } else if (!open && unregisterEditorBack) {
      unregisterEditorBack();
      unregisterEditorBack = null;
    }
  });

  const dispose = () => {
    if (editSaveTimer) clearTimeout(editSaveTimer);
    unregisterEditorBack?.();
    unregisterEditorBack = null;
  };

  return {
    editingNodeId,
    textDirty,
    textSaveStatus,
    canUndoText,
    canRedoText,
    undoText,
    redoText,
    onTextEditorKeydown,
    fullscreenEditingNode,
    openTextEditor,
    closeTextEditor,
    onEditInput,
    onEditEnd,
    startTextEditing,
    focusTextEditor,
    isTextNode,
    dispose,
  };
}
