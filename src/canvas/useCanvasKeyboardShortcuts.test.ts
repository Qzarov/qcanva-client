// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts';

const key = (value: string, extra: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { key: value, ...extra });

describe('useCanvasKeyboardShortcuts', () => {
  it('routes editing shortcuts and keeps text fields native', () => {
    const calls = Object.fromEntries(['undo', 'redo', 'copy', 'paste', 'duplicate', 'selectAll', 'clear', 'delete'].map((name) => [name, vi.fn()]));
    const controller = useCanvasKeyboardShortcuts({
      rulerActive: () => false,
      isEditableTarget: (target) => target === 'input',
      isAddMenuOpen: () => false,
      closeAddMenu: vi.fn(),
      isDrawingActive: () => false,
      cancelDrawing: vi.fn(),
      undo: calls.undo,
      redo: calls.redo,
      copySelection: calls.copy,
      pasteSelection: calls.paste,
      duplicateSelection: calls.duplicate,
      canCopy: () => true,
      canPaste: () => true,
      canDuplicate: () => true,
      selectAll: calls.selectAll,
      clearSelection: calls.clear,
      isEditing: () => false,
      deleteSelection: calls.delete,
      canDelete: () => true,
    });

    controller.onKeyDown(key('z', { ctrlKey: true }));
    controller.onKeyDown(key('z', { ctrlKey: true, shiftKey: true }));
    controller.onKeyDown(key('c', { ctrlKey: true }));
    controller.onKeyDown(key('v', { ctrlKey: true }));
    controller.onKeyDown(key('d', { ctrlKey: true }));
    controller.onKeyDown(key('a', { ctrlKey: true }));
    controller.onKeyDown(key('Delete'));
    expect(calls.undo).toHaveBeenCalledOnce();
    expect(calls.redo).toHaveBeenCalledOnce();
    expect(calls.copy).toHaveBeenCalledOnce();
    expect(calls.paste).toHaveBeenCalledOnce();
    expect(calls.duplicate).toHaveBeenCalledOnce();
    expect(calls.selectAll).toHaveBeenCalledOnce();
    expect(calls.delete).toHaveBeenCalledOnce();

    const inputEvent = key('c', { ctrlKey: true });
    Object.defineProperty(inputEvent, 'target', { value: 'input' });
    controller.onKeyDown(inputEvent);
    expect(calls.copy).toHaveBeenCalledOnce();
  });

  it('prioritizes menu and drawing Escape handling', () => {
    const closeMenu = vi.fn();
    const cancelDrawing = vi.fn();
    let menuOpen = true;
    let drawing = false;
    const controller = useCanvasKeyboardShortcuts({
      rulerActive: () => false,
      isEditableTarget: () => false,
      isAddMenuOpen: () => menuOpen,
      closeAddMenu: () => { menuOpen = false; closeMenu(); },
      isDrawingActive: () => drawing,
      cancelDrawing: () => { drawing = false; cancelDrawing(); },
      undo: vi.fn(), redo: vi.fn(), copySelection: vi.fn(), pasteSelection: vi.fn(), duplicateSelection: vi.fn(),
      canCopy: () => false, canPaste: () => false, canDuplicate: () => false,
      selectAll: vi.fn(), clearSelection: vi.fn(), isEditing: () => false, deleteSelection: vi.fn(), canDelete: () => false,
    });
    controller.onKeyDown(key('Escape'));
    expect(closeMenu).toHaveBeenCalledOnce();
    drawing = true;
    controller.onKeyDown(key('Escape'));
    expect(cancelDrawing).toHaveBeenCalledOnce();
  });
});
