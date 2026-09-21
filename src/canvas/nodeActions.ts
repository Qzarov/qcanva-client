export type NodeActionKey =
  | 'fill' | 'text-color' | 'border-color' | 'border-style'
  | 'alignment' | 'duplicate' | 'lock' | 'layer-up' | 'layer-down'
  | 'bring-front' | 'send-back' | 'hide' | 'image-title'
  | 'delete' | 'undo' | 'redo'
  | 'edge-style' | 'edge-arrow'
  | 'drawing-duplicate' | 'drawing-delete' | 'drawing-color';

export type NodeAction = {
  key: NodeActionKey;
  label: string;
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
  handlers: {
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
      { key: 'edge-style', label: 'Line style', handler: p.handlers.edgeToggleStyle, disabled: r },
      { key: 'edge-arrow', label: 'Arrow type', handler: p.handlers.edgeCycleArrow, disabled: r },
      { key: 'delete', label: 'Delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'drawing') {
    return [
      { key: 'drawing-color', label: 'Color', handler: p.handlers.drawingColorSection, isSectionToggle: true, disabled: r },
      { key: 'drawing-duplicate', label: 'Duplicate', handler: p.handlers.drawingDuplicate, disabled: r },
      { key: 'drawing-delete', label: 'Delete', handler: p.handlers.drawingDelete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'multi-drawing' || p.kind === 'mixed') {
    return [
      { key: 'drawing-duplicate', label: 'Duplicate', handler: p.handlers.drawingDuplicate, disabled: r },
      { key: 'delete', label: 'Delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  if (p.kind === 'multi-node') {
    return [
      { key: 'layer-up', label: 'Bring forward', handler: p.handlers.layerUp, disabled: r },
      { key: 'layer-down', label: 'Send backward', handler: p.handlers.layerDown, disabled: r },
      { key: 'lock', label: p.isLocked ? 'Unlock' : 'Lock', handler: p.handlers.toggleLock, disabled: r },
      { key: 'duplicate', label: 'Duplicate', handler: p.handlers.duplicate, disabled: r },
      { key: 'delete', label: 'Delete', handler: p.handlers.delete, danger: true, disabled: r },
    ];
  }

  // Single node — priority order: color sections first (most-used on mobile), then direct actions
  return [
    { key: 'fill', label: 'Background', handler: p.handlers.fillSection, isSectionToggle: true, disabled: r },
    { key: 'text-color', label: 'Text color', handler: p.handlers.textColorSection, isSectionToggle: true, disabled: r },
    { key: 'duplicate', label: 'Duplicate', handler: p.handlers.duplicate, disabled: r },
    { key: 'lock', label: p.isLocked ? 'Unlock' : 'Lock', handler: p.handlers.toggleLock, disabled: r },
    { key: 'delete', label: 'Delete', handler: p.handlers.delete, danger: true, disabled: r },
    // overflow items
    { key: 'border-color', label: 'Border color', handler: p.handlers.borderColorSection, isSectionToggle: true, disabled: r },
    { key: 'border-style', label: 'Border', handler: p.handlers.borderStyleSection, isSectionToggle: true, disabled: r },
    { key: 'alignment', label: 'Alignment', handler: p.handlers.alignSection, isSectionToggle: true, disabled: r },
    { key: 'image-title', label: 'Title', handler: p.handlers.imageTitleSection, isSectionToggle: true, disabled: r },
    { key: 'layer-up', label: 'Bring forward', handler: p.handlers.layerUp, disabled: r },
    { key: 'layer-down', label: 'Send backward', handler: p.handlers.layerDown, disabled: r },
    { key: 'bring-front', label: 'Bring to front', handler: p.handlers.bringFront, disabled: r },
    { key: 'send-back', label: 'Send to back', handler: p.handlers.sendBack, disabled: r },
    ...(p.isOwner ? [{ key: 'hide' as NodeActionKey, label: 'Hide/Show', handler: p.handlers.toggleHide, disabled: r }] : []),
    { key: 'undo', label: 'Undo', handler: p.handlers.undo, disabled: !p.canUndo },
    { key: 'redo', label: 'Redo', handler: p.handlers.redo, disabled: !p.canRedo },
  ];
}

export const MAX_VISIBLE_ACTIONS = 5;
