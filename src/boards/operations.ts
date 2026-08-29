import type { BoardCard, BoardChecklistItem, BoardData, BoardLabel, BoardOperation } from './types';
import { BoardOperationError } from './types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const requiredId = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new BoardOperationError('invalid_id');
  return value;
};
const clamp = (position: number, length: number): number =>
  Number.isFinite(position) ? Math.max(0, Math.min(Math.trunc(position), length)) : length;

export function normalizeBoardData(input: Partial<BoardData> | null | undefined): BoardData {
  if (!input || input.version !== 1) throw new BoardOperationError('invalid_version');
  const columns = Array.isArray(input.columns) ? clone(input.columns) : [];
  const cards = Array.isArray(input.cards) ? clone(input.cards) : [];
  const labels = Array.isArray(input.labels) ? clone(input.labels) : [];
  columns.forEach((column) => { requiredId(column?.id); if (typeof column.title !== 'string') throw new BoardOperationError('invalid_column'); });
  cards.forEach((card) => {
    requiredId(card?.id); requiredId(card?.columnId);
    if (!Array.isArray(card.checklist)) card.checklist = [];
    if (!Array.isArray(card.labelIds)) card.labelIds = [];
    card.checklist.forEach((item) => requiredId(item?.id));
  });
  labels.forEach((label) => requiredId(label?.id));
  renumber(columns);
  for (const column of columns) renumber(cards.filter((card) => card.columnId === column.id));
  for (const card of cards) renumber(card.checklist);
  return { version: 1, columns, cards, labels };
}

function renumber(items: Array<{ position: number }>): void {
  items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  items.forEach((item, index) => { item.position = index; });
}
function reindex(items: Array<{ position: number }>): void {
  items.forEach((item, index) => { item.position = index; });
}
function find<T extends { id: string }>(items: T[], id: unknown, code = 'not_found'): T {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new BoardOperationError(code);
  return item;
}
function cardsIn(data: BoardData, columnId: string): BoardCard[] {
  return data.cards.filter((card) => card.columnId === columnId);
}
function sortCardsByBoardOrder(data: BoardData): void {
  const columnOrder = new Map(data.columns.map((column, index) => [column.id, index]));
  data.cards.sort((a, b) =>
    (columnOrder.get(a.columnId) ?? Number.MAX_SAFE_INTEGER) - (columnOrder.get(b.columnId) ?? Number.MAX_SAFE_INTEGER)
    || a.position - b.position);
}

export function applyBoardOperation(source: BoardData, operation: BoardOperation): BoardData {
  const data = normalizeBoardData(source);
  switch (operation.type) {
    case 'column-add': {
      requiredId(operation.column?.id);
      if (data.columns.some((column) => column.id === operation.column.id)) throw new BoardOperationError('duplicate_id');
      const column = clone(operation.column);
      const columnIndex = clamp(column.position, data.columns.length);
      column.position = columnIndex;
      data.columns.splice(columnIndex, 0, column);
      reindex(data.columns);
      break;
    }
    case 'column-update': find(data.columns, operation.columnId).title = operation.title; break;
    case 'column-move': {
      const column = find(data.columns, operation.columnId);
      data.columns.splice(data.columns.indexOf(column), 1);
      data.columns.splice(clamp(operation.position, data.columns.length), 0, column);
      reindex(data.columns);
      break;
    }
    case 'column-remove': {
      const column = find(data.columns, operation.columnId);
      const cards = cardsIn(data, column.id);
      if (cards.length && !operation.disposition) throw new BoardOperationError('column_disposition_required');
      if (operation.disposition?.kind === 'move-cards') {
        const target = find(data.columns, operation.disposition.targetColumnId);
        if (target.id === column.id) throw new BoardOperationError('invalid_target_column');
        cards.forEach((card) => { card.columnId = target.id; });
        renumber(cardsIn(data, target.id));
      }
      data.cards = data.cards.filter((card) => card.columnId !== column.id);
      data.columns.splice(data.columns.indexOf(column), 1);
      renumber(data.columns);
      break;
    }
    case 'card-add': {
      const card = clone(operation.card);
      requiredId(card.id); find(data.columns, card.columnId);
      if (data.cards.some((entry) => entry.id === card.id)) throw new BoardOperationError('duplicate_id');
      data.cards.push(card);
      const siblings = cardsIn(data, card.columnId).filter((entry) => entry.id !== card.id);
      const cardIndex = clamp(card.position, siblings.length);
      card.position = cardIndex;
      siblings.splice(cardIndex, 0, card);
      reindex(siblings);
      sortCardsByBoardOrder(data);
      break;
    }
    case 'card-update': Object.assign(find(data.cards, operation.cardId), clone(operation.changes)); break;
    case 'card-move': {
      const card = find(data.cards, operation.cardId);
      find(data.columns, operation.columnId);
      const old = card.columnId;
      card.columnId = operation.columnId;
      const siblings = cardsIn(data, operation.columnId).filter((entry) => entry.id !== card.id);
      siblings.splice(clamp(operation.position, siblings.length), 0, card);
      reindex(siblings);
      renumber(cardsIn(data, old));
      break;
    }
    case 'card-remove': {
      const card = find(data.cards, operation.cardId);
      data.cards.splice(data.cards.indexOf(card), 1);
      renumber(cardsIn(data, card.columnId));
      break;
    }
    case 'label-add': {
      const label = clone(operation.label as BoardLabel);
      requiredId(label?.id);
      if (data.labels.some((entry) => entry.id === label.id)) throw new BoardOperationError('duplicate_id');
      data.labels.push(label);
      break;
    }
    case 'label-update': Object.assign(find(data.labels, operation.labelId), clone(operation.changes)); break;
    case 'label-remove': {
      const label = find(data.labels, operation.labelId);
      data.labels.splice(data.labels.indexOf(label), 1);
      data.cards.forEach((card) => { card.labelIds = card.labelIds.filter((id) => id !== label.id); });
      break;
    }
    case 'checklist-add': {
      const card = find(data.cards, operation.cardId);
      const item = clone(operation.item as BoardChecklistItem);
      requiredId(item?.id);
      card.checklist.splice(clamp(item.position, card.checklist.length), 0, item);
      reindex(card.checklist);
      break;
    }
    case 'checklist-update': {
      const card = find(data.cards, operation.cardId);
      Object.assign(find(card.checklist, operation.checklistId), clone(operation.changes));
      break;
    }
    case 'checklist-remove': {
      const card = find(data.cards, operation.cardId);
      const item = find(card.checklist, operation.checklistId);
      card.checklist.splice(card.checklist.indexOf(item), 1);
      reindex(card.checklist);
      break;
    }
    case 'checklist-move': {
      const card = find(data.cards, operation.cardId);
      const item = find(card.checklist, operation.checklistId);
      card.checklist.splice(card.checklist.indexOf(item), 1);
      card.checklist.splice(clamp(operation.position as number, card.checklist.length), 0, item);
      reindex(card.checklist);
      break;
    }
  }
  return data;
}
