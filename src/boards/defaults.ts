import type { BoardData } from './types';

export function createBoardDefaults(): BoardData {
  return {
    version: 1,
    columns: ['К выполнению', 'В работе', 'Готово'].map((title, position) => ({
      id: `column-${position + 1}`,
      title,
      position,
    })),
    cards: [],
    labels: [],
  };
}
