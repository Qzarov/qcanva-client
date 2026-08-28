export type BoardColumn = { id: string; title: string; position: number };

export type BoardChecklistItem = { id: string; title: string; completed: boolean; position: number };

export type BoardCard = {
  id: string;
  columnId: string;
  position: number;
  title: string;
  description: string;
  dueAt: string | null;
  labelIds: string[];
  assigneeName: string | null;
  assigneeUserId: string | null;
  checklist: BoardChecklistItem[];
};

export type BoardLabel = { id: string; title: string; color: string };
export type BoardData = { version: 1; columns: BoardColumn[]; cards: BoardCard[]; labels: BoardLabel[] };

export type BoardOperation =
  | { type: 'column-add'; column: BoardColumn }
  | { type: 'column-update'; columnId: string; title: string }
  | { type: 'column-move'; columnId: string; position: number }
  | { type: 'column-remove'; columnId: string; disposition?: { kind: 'delete-cards' } | { kind: 'move-cards'; targetColumnId: string } }
  | { type: 'card-add'; card: BoardCard }
  | { type: 'card-update'; cardId: string; changes: Partial<BoardCard> }
  | { type: 'card-move'; cardId: string; columnId: string; position: number }
  | { type: 'card-remove'; cardId: string }
  | { type: 'label-add' | 'label-update' | 'label-remove' | 'checklist-add' | 'checklist-update' | 'checklist-remove' | 'checklist-move'; [key: string]: unknown };

export type BoardRole = 'owner' | 'read' | 'edit';
export type BoardParticipant = { userId: string; name: string };

export class BoardOperationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'BoardOperationError';
  }
}
