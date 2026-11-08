import { describe, expect, it, vi } from 'vitest';
import { useCanvasNodeStyleControls, type NodeStyleTarget } from './useCanvasNodeStyleControls';

describe('useCanvasNodeStyleControls', () => {
  it('updates node styles through the shared commit boundary', () => {
    const node: NodeStyleTarget = { id: 'node-1', color: '1', shape: 'rect' };
    const commits: Array<Record<string, unknown>> = [];
    const controls = useCanvasNodeStyleControls({
      findNode: (id) => id === node.id ? node : undefined,
      pushUndo: vi.fn(),
      commit: (_node, changes) => {
        Object.assign(_node, changes);
        if (changes.color === null) _node.color = undefined;
        commits.push(changes);
      },
    });

    controls.setNodeColor(node.id, undefined);
    controls.toggleNodeShape(node.id);
    controls.toggleNodeTransparent(node.id);

    expect(commits).toEqual([{ color: null }, { shape: 'round' }, { transparent: true }]);
    expect(node.color).toBeUndefined();
    expect(controls.getNodeShape(node.id)).toBe('round');
    expect(controls.isNodeTransparent(node.id)).toBe(true);
  });

  it('keeps palette and border read models stable', () => {
    const node: NodeStyleTarget = { id: 'node-1', textAlign: 'center', borderStyle: 'dashed', borderWidth: 3, fontColor: '2' };
    const controls = useCanvasNodeStyleControls({ findNode: () => node, pushUndo: () => {}, commit: () => {} });

    expect(controls.getNodeAlign(node.id)).toBe('center');
    expect(controls.getNodeBorderStyle(node.id)).toBe('dashed');
    expect(controls.getNodeBorderWidth(node.id)).toBe(3);
    expect(controls.resolveNodeFontColor('2')).toBe('var(--content-canvas-node-text-2)');
    expect(controls.getNodeFontColorSwatch('2')).toBe('var(--content-canvas-node-text-2)');
  });
});
