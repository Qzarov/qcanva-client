/**
 * A text document added to a kanban board as a card. Fake board server, no backend needed.
 */

import { expect, test, type Page } from '@playwright/test';
import type { BoardData } from '../src/boards/types';
import { serveBoard } from './support/fake-board-server';

const SHOTS = process.env.SHOT_DIR;

const board = (): BoardData => ({
  version: 1,
  columns: [{ id: 'todo', title: 'К выполнению', position: 0 }, { id: 'doing', title: 'В работе', position: 1 }, { id: 'done', title: 'Готово', position: 2 }],
  labels: [{ id: 'l-doc', title: 'Документация', color: '#3b82f6' }],
  cards: [
    { id: 'c1', columnId: 'todo', position: 0, title: 'Починить вход', description: '', dueAt: null, labelIds: [], assigneeName: null, assigneeUserId: null, checklist: [] },
    { id: 'c2', columnId: 'todo', position: 1, title: 'ТЗ (старое имя)', description: '', dueAt: null, labelIds: ['l-doc'], assigneeName: 'Лена', assigneeUserId: null, checklist: [], documentId: 'doc-spec' },
  ],
});
const documents = () => [
  { id: 'doc-spec', title: 'ТЗ на новый вход в приложение' },
  { id: 'doc-notes', title: 'Заметки встречи' },
  { id: 'doc-plan', title: 'План релиза 2.0' },
];

async function openBoard(page: Page, options: { width?: number; theme?: 'dark' | 'light'; role?: 'owner' | 'read' } = {}) {
  await page.setViewportSize({ width: options.width ?? 1280, height: 800 });
  const server = await serveBoard(page, { id: 'board-1', title: 'Проект', data: board() }, { role: options.role, documents: documents() });
  await page.addInitScript((theme) => {
    localStorage.setItem('qcanva:theme:v1', theme);
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', name: 'Ярослав', role: 'user' }));
  }, options.theme ?? 'dark');
  await page.goto('/templates/board-1');
  await expect(page.locator('[data-card-id="c1"]')).toBeVisible();
  return server;
}

for (const theme of ['dark', 'light'] as const) {
  test(`a document card shows the document's current name and opens it (${theme})`, async ({ page }) => {
    await openBoard(page, { theme });
    const card = page.locator('[data-card-id="c2"]');
    // The name the document has now, not the one the card was linked under.
    await expect(card.locator('h3 span')).toHaveText('ТЗ на новый вход в приложение');
    await expect(card.locator('svg').first()).toBeVisible();
    const open = card.getByRole('button', { name: 'Открыть документ' });
    const cardBox = (await card.boundingBox())!;
    const openBox = (await open.boundingBox())!;
    expect(openBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(openBox.x + openBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    // An ordinary card has no such button.
    await expect(page.locator('[data-card-id="c1"]').getByRole('button', { name: 'Открыть документ' })).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-doc-card-${theme}.png` });

    await open.click();
    await page.waitForURL(/\/docs\/doc-spec$/);
  });
}

test('a document is added as a card from the column, found by name', async ({ page }) => {
  const server = await openBoard(page);
  const column = page.locator('[data-column-id="doing"]');
  await column.getByRole('button', { name: 'Добавить документ как карточку' }).click();
  const picker = page.getByRole('dialog', { name: 'Документ на доску' });
  await expect(picker.locator('.board-doc-list button')).toHaveCount(3);
  await expect(picker.locator('[data-doc-id="doc-spec"] small')).toHaveText('уже на доске');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-doc-picker.png` });

  await picker.getByLabel('Найти документ').fill('релиз');
  await expect(picker.locator('.board-doc-list button')).toHaveText(['План релиза 2.0']);
  await picker.locator('[data-doc-id="doc-plan"]').click();
  await expect(picker).toHaveCount(0);

  const added = column.locator('.board-card');
  await expect(added).toHaveCount(1);
  await expect(added.locator('h3 span')).toHaveText('План релиза 2.0');
  await expect.poll(() => server().cards.find((card) => card.documentId === 'doc-plan')).toMatchObject({ columnId: 'doing', title: 'План релиза 2.0' });
  // The card was added, not opened: nothing asks for a title.
  await expect(page.getByRole('dialog', { name: 'Карточка доски' })).toHaveCount(0);
});

test('a new document is created and added in one step, and Escape closes the picker', async ({ page }) => {
  const server = await openBoard(page);
  await page.locator('[data-column-id="done"]').getByRole('button', { name: 'Добавить документ как карточку' }).click();
  const picker = page.getByRole('dialog', { name: 'Документ на доску' });
  await expect(picker.getByRole('button', { name: 'Создать и добавить' })).toBeDisabled();
  await picker.getByLabel('Название нового документа').fill('Ретро спринта');
  await picker.getByRole('button', { name: 'Создать и добавить' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('[data-column-id="done"] .board-card h3 span')).toHaveText('Ретро спринта');
  expect(server.documents.at(-1)).toMatchObject({ title: 'Ретро спринта' });
  await expect.poll(() => server().cards.some((card) => card.documentId === server.documents.at(-1)!.id)).toBe(true);

  await page.locator('[data-column-id="done"]').getByRole('button', { name: 'Добавить документ как карточку' }).click();
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  expect(server().cards).toHaveLength(3);
});

test('the card\'s dialog names the document and can unlink it', async ({ page }) => {
  const server = await openBoard(page);
  await page.locator('[data-card-id="c2"]').click();
  const dialog = page.getByRole('dialog', { name: 'Карточка доски' });
  const block = dialog.getByTestId('card-document');
  await expect(block.locator('strong')).toHaveText('ТЗ на новый вход в приложение');
  await expect(dialog.getByTestId('card-title')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-doc-dialog.png` });

  await block.getByRole('button', { name: 'Отвязать' }).click();
  await expect(block).toHaveCount(0);
  await expect(dialog.getByTestId('card-title')).toHaveValue('ТЗ на новый вход в приложение');
  await expect.poll(() => server().cards.find((card) => card.id === 'c2')).toMatchObject({ documentId: null, title: 'ТЗ на новый вход в приложение' });
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.locator('[data-card-id="c2"]').getByRole('button', { name: 'Открыть документ' })).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`document cards and the column's buttons fit a phone (${width}px)`, async ({ page }) => {
    await openBoard(page, { width });
    const column = page.locator('[data-column-id="todo"]');
    const columnBox = (await column.boundingBox())!;
    for (const control of [column.getByTestId('add-card'), column.getByTestId('add-document-card'), page.locator('[data-card-id="c2"]'), page.locator('[data-card-id="c2"]').getByRole('button', { name: 'Открыть документ' })]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(columnBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(columnBox.x + columnBox.width + 1);
    }
    // The two "add" buttons share one row.
    const addCard = (await column.getByTestId('add-card').boundingBox())!;
    const addDocument = (await column.getByTestId('add-document-card').boundingBox())!;
    expect(Math.abs(addCard.y - addDocument.y)).toBeLessThanOrEqual(2);
    await column.getByTestId('add-document-card').click();
    const picker = page.getByRole('dialog', { name: 'Документ на доску' });
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    for (const control of await picker.getByRole('button').all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-doc-phone-${width}.png` });
  });
}

test('a reader can open the document but not add or unlink one', async ({ page }) => {
  await openBoard(page, { role: 'read' });
  await expect(page.getByTestId('add-document-card')).toHaveCount(0);
  await page.locator('[data-card-id="c2"]').click();
  const dialog = page.getByRole('dialog', { name: 'Карточка доски' });
  await expect(dialog.getByTestId('card-document-open')).toBeVisible();
  await expect(dialog.getByTestId('card-document-unlink')).toHaveCount(0);
});
