import { describe, expect, it } from 'vitest';
import { applyBoardOperation } from './operations';
import type { BoardData } from './types';

const boardFixture: BoardData = {
  version: 1,
  columns: [
    { id: 'todo', title: 'To do', position: 0 },
    { id: 'done', title: 'Done', position: 1 },
  ],
  cards: [
    {
      id: 'c1', columnId: 'todo', position: 0, title: 'Ship it', description: '', dueAt: null,
      labelIds: [], assigneeName: null, assigneeUserId: null, checklist: [],
    },
  ],
  labels: [],
};

describe('applyBoardOperation', () => {
  it('moves a card to its requested column without mutating the prior snapshot', () => {
    const result = applyBoardOperation(boardFixture, {
      type: 'card-move', cardId: 'c1', columnId: 'done', position: 0,
    });

    expect(result.cards.find((card) => card.id === 'c1')).toMatchObject({ columnId: 'done', position: 0 });
    expect(boardFixture.cards[0]?.columnId).toBe('todo');
  });

  it('refuses a card move to an absent column', () => {
    expect(() => applyBoardOperation(boardFixture, {
      type: 'card-move', cardId: 'c1', columnId: 'missing', position: 0,
    })).toThrow('not_found');
  });
});
