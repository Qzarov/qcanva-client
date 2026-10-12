import type CanvasLoader from '../components/CanvasLoader.vue';

/**
 * Transitional public boundary, limited to members used by CanvasView and
 * MobileNodeToolbar. Pick validates every name against the real component;
 * signatures follow its implementation instead of drifting in a second copy.
 * Vue's instance type already unwraps the setup refs for external consumers.
 */
export type CanvasLoaderApi = Pick<InstanceType<typeof CanvasLoader>,
  // Selection, node presentation and editing.
  | 'selectedNodeId' | 'selectedNodeIds' | 'selectedEdgeId'
  | 'editingNodeId' | 'isManipulatingNode' | 'clearSelection'
  | 'isTextNode' | 'isImageNode' | 'isGroupNode' | 'openTextEditor'
  | 'getNodeLabel' | 'getNodeTitle' | 'setNodeTitle'
  | 'getNodeColor' | 'setNodeColor' | 'getNodeFillStyle' | 'toggleNodeFillStyle'
  | 'fontColors' | 'getNodeFontColor' | 'setNodeFontColor'
  | 'getNodeFontColorSwatch' | 'isNodeFontColorActive'
  | 'getNodeAlign' | 'setNodeAlign' | 'getNodeFirstLineAlign' | 'setNodeFirstLineAlign'
  | 'borderStyles' | 'getNodeBorderStyle' | 'setNodeBorderStyle'
  | 'getNodeBorderWidth' | 'setNodeBorderWidth' | 'getNodeBorderColor' | 'setNodeBorderColor'
  | 'isNodeTransparent' | 'toggleNodeTransparent' | 'getNodeShape' | 'toggleNodeShape'
  | 'isNodePositionLocked' | 'toggleNodePositionLock'
  | 'areSelectedNodesPositionLocked' | 'toggleSelectedNodesPositionLock'
  | 'isNodeHidden' | 'toggleNodeHidden' | 'areSelectedNodesHidden' | 'toggleSelectedNodesHidden'
  | 'bringSelectionForward' | 'sendSelectionBackward' | 'bringSelectionToFront' | 'sendSelectionToBack'
  | 'duplicateSelection' | 'deleteSelection'
  // Drawing and edge controls.
  | 'selectedDrawingIds' | 'selectedDrawingObj' | 'selectedDrawingScreenRect'
  | 'drawTool' | 'drawColor' | 'drawWidth' | 'setDrawTool' | 'setDrawColor' | 'setDrawWidth'
  | 'setSelectedDrawingColor' | 'setSelectedDrawingWidth'
  | 'duplicateSelectedDrawing' | 'deleteSelectedDrawing'
  | 'isSelectedDrawingHidden' | 'toggleSelectedDrawingHidden'
  | 'onEdgeToggleStyle' | 'onEdgeCycleArrow'
  // Navigation, insertion, history and collaboration.
  | 'addMenuEntries' | 'runAddMenuEntry' | 'addCanvasEmbed' | 'addDocumentEmbed'
  | 'addBoardPreview' | 'addDndCharacterTemplate'
  | 'focusNode' | 'searchNodes' | 'resetView' | 'onExportCanvas'
  | 'canUndo' | 'canRedo' | 'undo' | 'redo'
  | 'getCanvasData' | 'applyRemoteData' | 'applyRemoteOp'
>;

export type CanvasTextAlignment = Parameters<CanvasLoaderApi['setNodeAlign']>[1];
