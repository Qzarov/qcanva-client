import type { Page } from '@playwright/test';
import { characterSheetTitle } from '../../src/dnd/characterSheet';
import { applySheetOperation, type SheetOperation } from '../../src/dnd/sheetOperations';

export type FakeSheetTemplate = {
  id: string;
  title: string;
  templateType: 'dnd-character';
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const NAMESPACE = '/character-sheets-ws';

/**
 * Serves one character sheet the way the backend does: the REST read, and
 * the /character-sheets-ws socket (spoken at the engine.io/socket.io wire
 * level through routeWebSocket). Operations are applied with the same
 * applySheetOperation the app uses, so `current()` is what the server would
 * have stored - and a page.reload() sees it.
 */
export async function serveCharacterSheet(page: Page, initial: FakeSheetTemplate, role: 'owner' | 'edit' | 'read' = 'owner') {
  let template = initial;
  let revision = 0;

  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === `/api/interactive-templates/${template.id}`) return route.fulfill({ json: { ...template, role } });
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
      if (event === 'join-sheet') {
        emit('sheet-room-state', { sheetId: template.id, data: template.data, revision, role, appliedClientOpIds: [] });
      } else if (event === 'sheet-op') {
        if (role === 'read') {
          emit('sheet-op-reject', { clientOpId: payload.clientOpId, reason: 'forbidden' });
          return;
        }
        const op = payload.op as SheetOperation;
        const data = applySheetOperation(template.data, op);
        revision += 1;
        template = { ...template, data, title: characterSheetTitle(data) };
        emit('sheet-op-applied', { clientOpId: payload.clientOpId, op, revision, userId: 'test-user' });
      }
    });
  });

  return () => template;
}
