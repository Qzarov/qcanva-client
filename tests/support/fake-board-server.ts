import type { Page } from '@playwright/test';
import { applyBoardOperation } from '../../src/boards/operations';
import type { BoardData, BoardOperation } from '../../src/boards/types';

/**
 * A kanban board's backend for browser tests: the REST answers the page asks
 * for and the board's socket (raw socket.io frames over the namespace
 * `/boards-ws`), with operations applied by the app's own reducer. Text
 * documents are served too, for cards that stand for a document.
 */
export type FakeDocument = { id: string; title: string };
export type FakeBoardServer = (() => BoardData) & { documents: FakeDocument[]; operations: BoardOperation[] };

const NAMESPACE = '/boards-ws';

export async function serveBoard(
  page: Page,
  board: { id: string; title: string; data: BoardData },
  options: { role?: 'owner' | 'edit' | 'read'; documents?: FakeDocument[] } = {},
): Promise<FakeBoardServer> {
  const role = options.role ?? 'owner';
  const documents = [...(options.documents ?? [])];
  const operations: BoardOperation[] = [];
  let data = board.data;
  let revision = 0;

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === `/api/interactive-templates/${board.id}`) {
      return route.fulfill({ json: { id: board.id, title: board.title, templateType: 'trello-board', data, createdAt: '', updatedAt: '', role } });
    }
    if (path === `/api/interactive-templates/${board.id}/snapshot`) {
      return route.fulfill({
        json: {
          template: { id: board.id, title: board.title, templateType: 'trello-board', data, createdAt: '', updatedAt: '' },
          role, revision, participants: [{ userId: 'test-user', name: 'Ярослав' }],
        },
      });
    }
    if (path === `/api/interactive-templates/${board.id}/share`) return route.fulfill({ json: [] });
    if (path === '/api/text-documents' && request.method() === 'POST') {
      const created = { id: `doc-new-${documents.length + 1}`, title: String(request.postDataJSON()?.title ?? '') };
      documents.push(created);
      return route.fulfill({ json: created });
    }
    if (path === '/api/text-documents') return route.fulfill({ json: { documents } });
    const single = /^\/api\/text-documents\/([^/]+)$/.exec(path);
    if (single) {
      const found = documents.find((doc) => doc.id === decodeURIComponent(single[1]!));
      return found ? route.fulfill({ json: { document: found, role: 'owner' } }) : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    return route.fulfill({ json: {} });
  });

  await page.routeWebSocket('**/socket.io/**', (ws) => {
    const emit = (event: string, payload: unknown) => ws.send(`42${NAMESPACE},${JSON.stringify([event, payload])}`);
    ws.send(`0${JSON.stringify({ sid: 'fake', upgrades: [], pingInterval: 25000, pingTimeout: 60000, maxPayload: 1000000 })}`);
    ws.onMessage((message) => {
      const text = String(message);
      if (text.startsWith(`40${NAMESPACE}`)) {
        ws.send(`40${NAMESPACE},${JSON.stringify({ sid: 'fake-socket' })}`);
        return;
      }
      if (!text.startsWith(`42${NAMESPACE},`)) return;
      const [event, payload] = JSON.parse(text.slice(`42${NAMESPACE},`.length)) as [string, any];
      if (event === 'join-board') {
        emit('board-room-state', { data, revision, role, participants: [{ userId: 'test-user', name: 'Ярослав' }] });
      } else if (event === 'board-op') {
        if (role === 'read') {
          emit('board-op-reject', { clientOpId: payload.clientOpId, reason: 'forbidden' });
          return;
        }
        const op = payload.op as BoardOperation;
        data = applyBoardOperation(data, op);
        operations.push(op);
        revision += 1;
        emit('board-op-ack', { clientOpId: payload.clientOpId, revision });
        emit('board-op-applied', { clientOpId: payload.clientOpId, op, revision });
      }
    });
  });

  return Object.assign(() => data, { documents, operations });
}
