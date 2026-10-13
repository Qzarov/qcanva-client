import type { MessageKey } from '../composables/useI18n';

export type NodeActionKey =
  | 'edit-text' | 'fill' | 'text-color' | 'border-color' | 'border-style'
  | 'alignment' | 'duplicate' | 'lock' | 'layer-up' | 'layer-down'
  | 'bring-front' | 'send-back' | 'hide' | 'image-title'
  | 'delete' | 'undo' | 'redo'
  | 'edge-style' | 'edge-arrow'
  | 'drawing-duplicate' | 'drawing-delete' | 'drawing-color' | 'drawing-stroke-width';

export type NodeAction = {
  key: NodeActionKey;
  /** A message key: the component translates it (see useI18n). */
  labelKey: MessageKey;
  handler: () => void;
  disabled?: boolean;
  danger?: boolean;
  // true = this action opens a sub-section in the toolbar rather than executing directly
  isSectionToggle?: boolean;
};

export type SelectionKind = 'node' | 'multi-node' | 'edge' | 'drawing' | 'multi-drawing' | 'mixed' | 'none';

export function getSelectionKind(p: {
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedDrawingIds: string[];
}): SelectionKind {
  const hasNodes = p.selectedNodeIds.length > 0;
  const hasDrawings = p.selectedDrawingIds.length > 0;
  if (hasNodes && hasDrawings) return 'mixed';
  if (p.selectedNodeIds.length > 1) return 'multi-node';
  if (p.selectedNodeIds.length === 1) return 'node';
  if (p.selectedEdgeId) return 'edge';
  if (p.selectedDrawingIds.length > 1) return 'multi-drawing';
  if (p.selectedDrawingIds.length === 1) return 'drawing';
  return 'none';
}

export type BuildActionsParams = {
  kind: SelectionKind;
  isLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isOwner: boolean;
  isReadonly: boolean;
  // Single text node: offer the explicit "edit text" action (mobile edits text
  // only through it, never by tapping the card).
  isTextNode?: boolean;
  handlers: {
    editText?: () => void;
    duplicate: () => void;
    delete: () => void;
    toggleLock: () => void;
    layerUp: () => void;
    layerDown: () => void;
    bringFront: () => void;
    sendBack: () => void;
    undo: () => void;
    redo: () => void;
    toggleHide: () => void;
    // section toggles — no-op handlers, component handles the toggle
    fillSection: () => void;
    textColorSection: () => void;
    borderColorSection: () => void;
    borderStyleSection: () => void;
    alignSection: () => void;
    imageTitleSection: () => void;
    // edge-specific
    edgeToggleStyle: () => void;
    edgeCycleArrow: () => void;
    // drawing-specific
    drawingDuplicate: () => void;
    drawingDelete: () => void;
    drawingColorSection: () => void;
    drawingStrokeWidthSection: () => void;
  };
};

/**
 * Returns a priority-ordered action list for the current selection.
 * Pure function: testable without DOM.
 * The first MAX_VISIBLE_ACTIONS are shown in the icon row; the rest go under ⋯.
 */
export function buildNodeActions(p: BuildActionsParams): NodeAction[] {
  const r = p.isReadonly;

  if (p.kind === 'none') return [];

  if (p.kind === 'edge') {
    return [
      { key: 'edge-style', labelKey: 'lineStyle', handler: p.handlers.edgeToggleStyle, disabled: r },
      { key: 'edge-arrow', labelKey: 'arrowType', handler: p.handlers.edgeCycleArrow, disabled: r },
      { key: 'delete', labelKey: 'delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'drawing') {
    return [
      { key: 'drawing-color', labelKey: 'color', handler: p.handlers.drawingColorSection, isSectionToggle: true, disabled: r },
      { key: 'drawing-stroke-width', labelKey: 'width', handler: p.handlers.drawingStrokeWidthSection, isSectionToggle: true, disabled: r },
      { key: 'drawing-duplicate', labelKey: 'duplicate', handler: p.handlers.drawingDuplicate, disabled: r },
      { key: 'drawing-delete', labelKey: 'delete', handler: p.handlers.drawingDelete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'multi-drawing' || p.kind === 'mixed') {
    return [
      { key: 'drawing-color', labelKey: 'color', handler: p.handlers.drawingColorSection, isSectionToggle: true, disabled: r },
      { key: 'drawing-stroke-width', labelKey: 'width', handler: p.handlers.drawingStrokeWidthSection, isSectionToggle: true, disabled: r },
      { key: 'drawing-duplicate', labelKey: 'duplicate', handler: p.handlers.drawingDuplicate, disabled: r },
      { key: 'delete', labelKey: 'delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'multi-node') {
    return [
      { key: 'layer-up', labelKey: 'layerUp', handler: p.handlers.layerUp, disabled: r },
      { key: 'layer-down', labelKey: 'layerDown', handler: p.handlers.layerDown, disabled: r },
      { key: 'lock', labelKey: p.isLocked ? 'toolbarUnlock' : 'toolbarLock', handler: p.handlers.toggleLock, disabled: r },
      { key: 'duplicate', labelKey: 'duplicate', handler: p.handlers.duplicate, disabled: r },
      { key: 'delete', labelKey: 'delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  // Keep common settings on the icon row; object operations live in overflow.
  const editText: NodeAction[] = p.isTextNode && !r && p.handlers.editText
    ? [{ key: 'edit-text', labelKey: 'toolbarEdit', handler: p.handlers.editText }]
    : [];
  const textSettings = p.isTextNode !== false;
  return [
    ...editText,
    ...(!textSettings ? [{ key: 'image-title' as NodeActionKey, labelKey: 'toolbarTitle' as MessageKey, handler: p.handlers.imageTitleSection, isSectionToggle: true, disabled: r }] : []),
    { key: 'fill', labelKey: 'background', handler: p.handlers.fillSection, isSectionToggle: true, disabled: r },
    ...(textSettings ? [{ key: 'text-color' as NodeActionKey, labelKey: 'textColor' as MessageKey, handler: p.handlers.textColorSection, isSectionToggle: true, disabled: r }] : []),
    ...(!textSettings ? [{ key: 'border-color' as NodeActionKey, labelKey: 'borderColor' as MessageKey, handler: p.handlers.borderColorSection, isSectionToggle: true, disabled: r }] : []),
    { key: 'border-style', labelKey: 'border', handler: p.handlers.borderStyleSection, isSectionToggle: true, disabled: r },
    ...(textSettings ? [{ key: 'alignment' as NodeActionKey, labelKey: 'alignment' as MessageKey, handler: p.handlers.alignSection, isSectionToggle: true, disabled: r }] : []),
    { key: 'duplicate', labelKey: 'duplicate', handler: p.handlers.duplicate, disabled: r },
    { key: 'lock', labelKey: p.isLocked ? 'toolbarUnlock' : 'toolbarLock', handler: p.handlers.toggleLock, disabled: r },
    { key: 'delete', labelKey: 'delete', handler: p.handlers.delete, danger: true, disabled: r },
    // overflow items
    ...(textSettings ? [{ key: 'border-color' as NodeActionKey, labelKey: 'borderColor' as MessageKey, handler: p.handlers.borderColorSection, isSectionToggle: true, disabled: r }] : []),
    { key: 'layer-up', labelKey: 'layerUp', handler: p.handlers.layerUp, disabled: r },
    { key: 'layer-down', labelKey: 'layerDown', handler: p.handlers.layerDown, disabled: r },
    { key: 'bring-front', labelKey: 'bringToFront', handler: p.handlers.bringFront, disabled: r },
    { key: 'send-back', labelKey: 'sendToBack', handler: p.handlers.sendBack, disabled: r },
    ...(p.isOwner ? [{ key: 'hide' as NodeActionKey, labelKey: 'hide' as MessageKey, handler: p.handlers.toggleHide, disabled: r }] : []),
  ];
}

export const MAX_VISIBLE_ACTIONS = 5;
