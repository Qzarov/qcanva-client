interface CanvasKeyboardOptions {
  rulerActive: () => boolean;
  isEditableTarget: (target: EventTarget | null) => boolean;
  isAddMenuOpen: () => boolean;
  closeAddMenu: () => void;
  isDrawingActive: () => boolean;
  cancelDrawing: () => void;
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  canCopy: () => boolean;
  canPaste: () => boolean;
  canDuplicate: () => boolean;
  selectAll: () => void;
  clearSelection: () => void;
  isEditing: () => boolean;
  deleteSelection: () => void;
  canDelete: () => boolean;
}

export function useCanvasKeyboardShortcuts(options: CanvasKeyboardOptions) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (options.rulerActive()) return;
    if (options.isEditableTarget(event.target)) return;

    if (event.key === 'Escape' && options.isAddMenuOpen()) {
      options.closeAddMenu();
      return;
    }
    if (event.key === 'Escape' && options.isDrawingActive()) {
      options.cancelDrawing();
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      options.undo();
      return;
    }
    if (modifier && (event.key === 'Z' || (event.key === 'z' && event.shiftKey))) {
      event.preventDefault();
      options.redo();
      return;
    }
    if (modifier && event.key === 'c' && options.canCopy()) {
      event.preventDefault();
      options.copySelection();
      return;
    }
    if (modifier && event.key === 'v' && options.canPaste()) {
      event.preventDefault();
      options.pasteSelection();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'd' && options.canDuplicate()) {
      event.preventDefault();
      options.duplicateSelection();
      return;
    }
    if (modifier && event.key === 'a') {
      event.preventDefault();
      options.selectAll();
      return;
    }
    if (event.key === 'Escape') {
      options.clearSelection();
      return;
    }
    if (options.isEditing()) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && options.canDelete()) {
      event.preventDefault();
      options.deleteSelection();
    }
  };

  return { onKeyDown };
}
