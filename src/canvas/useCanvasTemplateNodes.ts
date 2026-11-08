import { onUnmounted } from 'vue';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import type { CanvasTemplateNode } from './useCanvasDndTemplate';

export interface CanvasTemplateCanvasNode extends CanvasTemplateNode {
  type: 'template';
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasTemplateCenter {
  x: number;
  y: number;
}

interface CanvasTemplateNodeOptions {
  readonly: () => boolean;
  center: () => CanvasTemplateCenter;
  snap: (value: number) => number;
  genId: () => string;
  pushUndo: () => void;
  addNode: (node: CanvasTemplateCanvasNode) => void;
  selectNode: (id: string) => void;
  emitBoardOpen: (boardId: string) => void;
}

export function useCanvasTemplateNodes(options: CanvasTemplateNodeOptions) {
  const addTemplateNode = (node: CanvasTemplateCanvasNode) => {
    options.pushUndo();
    options.addNode(node);
    options.selectNode(node.id);
  };

  const addDndCharacterTemplate = (data: Record<string, unknown> = {}) => {
    if (options.readonly()) return;
    const center = options.center();
    const { activeTab: _activeTab, ...templateData } = { ...createDndCharacterSheet(), ...data };
    addTemplateNode({
      id: options.genId(),
      type: 'template',
      templateId: 'dnd-character',
      templateData,
      x: options.snap(center.x - 550),
      y: options.snap(center.y - 380),
      width: 1100,
      height: 760,
    });
  };

  const addBoardPreview = ({ boardId, title }: { boardId: string; title?: string }) => {
    if (options.readonly() || !boardId) return;
    const center = options.center();
    addTemplateNode({
      id: options.genId(),
      type: 'template',
      templateId: 'trello-board-preview',
      templateData: title ? { boardId, title } : { boardId },
      x: options.snap(center.x - 360),
      y: options.snap(center.y - 190),
      width: 720,
      height: 380,
    });
  };

  const boardPreviewId = (node: CanvasTemplateNode): string => {
    const boardId = node.templateData?.boardId;
    return typeof boardId === 'string' ? boardId : '';
  };

  let suppressedBoardPreviewClickId: string | null = null;
  let clearSuppressedBoardPreviewClickTimer: ReturnType<typeof setTimeout> | null = null;

  const emitOpenBoardPreview = (boardId: string) => {
    if (boardId) options.emitBoardOpen(boardId);
  };

  const suppressBoardPreviewClick = (boardId: string) => {
    if (!boardId) return;
    suppressedBoardPreviewClickId = boardId;
    if (clearSuppressedBoardPreviewClickTimer) clearTimeout(clearSuppressedBoardPreviewClickTimer);
    clearSuppressedBoardPreviewClickTimer = setTimeout(() => {
      suppressedBoardPreviewClickId = null;
      clearSuppressedBoardPreviewClickTimer = null;
    }, 0);
  };

  const openBoardPreview = (boardId: string) => {
    if (suppressedBoardPreviewClickId === boardId) {
      suppressedBoardPreviewClickId = null;
      return;
    }
    emitOpenBoardPreview(boardId);
  };

  const importDndCharacter = (data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Файл карточки имеет неверный формат');
    const record = data as Record<string, unknown>;
    const source = record.templateData && typeof record.templateData === 'object'
      ? record.templateData as Record<string, unknown>
      : record;
    addDndCharacterTemplate(source);
  };

  onUnmounted(() => {
    if (clearSuppressedBoardPreviewClickTimer) clearTimeout(clearSuppressedBoardPreviewClickTimer);
  });

  return {
    addDndCharacterTemplate,
    addBoardPreview,
    importDndCharacter,
    boardPreviewId,
    suppressBoardPreviewClick,
    emitOpenBoardPreview,
    openBoardPreview,
  };
}
