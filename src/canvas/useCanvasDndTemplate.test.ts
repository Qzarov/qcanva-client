import { describe, expect, it, vi } from 'vitest';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import { useCanvasDndTemplate, type CanvasTemplateNode, type CanvasTemplateUpdateOp } from './useCanvasDndTemplate';

const makeHarness = (readonly = false) => {
  const operations: CanvasTemplateUpdateOp[] = [];
  const rolls: unknown[] = [];
  const pushUndo = vi.fn();
  const controller = useCanvasDndTemplate({
    readonly: () => readonly,
    genId: () => 'generated-id',
    pushUndo,
    emitOp: (operation) => operations.push(operation),
    emitRoll: (roll) => rolls.push(roll),
  });
  const node: CanvasTemplateNode = {
    id: 'node-1',
    templateId: 'dnd-character',
    templateData: createDndCharacterSheet() as unknown as Record<string, unknown>,
  };
  return { controller, node, operations, rolls, pushUndo };
};

describe('useCanvasDndTemplate', () => {
  it('keeps editing locked until interaction starts and emits node updates', () => {
    const { controller, node, operations, pushUndo } = makeHarness();

    controller.setDndIdentity(node, 'name', 'Мира');
    expect(operations).toHaveLength(0);

    controller.enterDndInteraction(node);
    controller.setDndIdentity(node, 'name', 'Мира');
    expect(pushUndo).toHaveBeenCalledOnce();
    expect(operations).toHaveLength(1);
    expect(node.templateData?.identity).toMatchObject({ name: 'Мира' });
  });

  it('keeps the active tab local and rolls from the normalized sheet', () => {
    const { controller, node, operations, rolls } = makeHarness();
    controller.enterDndInteraction(node);

    controller.setDndTab(node, 'notes');
    expect(controller.dndSheet(node).activeTab).toBe('notes');
    expect(operations).toHaveLength(0);

    controller.rollTemplateAbility(node, 'strength');
    expect(rolls).toEqual([{ nodeId: 'node-1', label: 'Новый персонаж: STRENGTH', modifier: 0 }]);
  });

  it('does not enter interaction or emit changes in readonly mode', () => {
    const { controller, node, operations, pushUndo, rolls } = makeHarness(true);
    controller.enterDndInteraction(node);
    controller.setDndCombat(node, 'currentHp', '1');
    controller.rollTemplateAbility(node, 'strength');
    expect(controller.isDndInteracting(node)).toBe(false);
    expect(operations).toHaveLength(0);
    expect(pushUndo).not.toHaveBeenCalled();
    expect(rolls).toHaveLength(0);
  });
});
