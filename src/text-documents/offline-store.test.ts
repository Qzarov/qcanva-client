// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import {
  clearAllTextDocLocalCopies,
  isLocalCopyOrigin,
  openLocalCopy,
  textDocDbName,
  TEXT_DOC_DB_PREFIX,
} from './offline-store';
import { mergeServerState } from './resync';

function textOf(doc: Y.Doc, field = 't'): string {
  return doc.getText(field).toString();
}

function delay(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('offline-store', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllTextDocLocalCopies();
  });

  it('(a) scopes database names per user and per doc so a second user does not see text', async () => {
    const user1DocA = textDocDbName('user1', 'docA');
    const user2DocA = textDocDbName('user2', 'docA');
    const user1DocB = textDocDbName('user1', 'docB');

    expect(user1DocA).toBe(`${TEXT_DOC_DB_PREFIX}user1:docA`);
    expect(user2DocA).toBe(`${TEXT_DOC_DB_PREFIX}user2:docA`);
    expect(user1DocB).toBe(`${TEXT_DOC_DB_PREFIX}user1:docB`);
    expect(user1DocA).not.toBe(user2DocA);
    expect(user1DocA).not.toBe(user1DocB);

    // User 1 opens docA and writes text
    const doc1 = new Y.Doc();
    const res1 = await openLocalCopy(doc1, { userKey: 'user1', docId: 'docA', serverState: null });
    expect(res1.outcome).toBe('empty');
    doc1.getText('t').insert(0, 'user 1 private text');
    await delay();
    await res1.copy?.persistence.destroy();
    doc1.destroy();

    // User 2 opens docA with no server state; must get 'empty' and see no text from user 1
    const doc2 = new Y.Doc();
    const res2 = await openLocalCopy(doc2, { userKey: 'user2', docId: 'docA', serverState: null });
    expect(res2.outcome).toBe('empty');
    expect(res2.hasLocalOnlyChanges).toBe(false);
    expect(textOf(doc2)).toBe('');
    await res2.copy?.persistence.destroy();
    doc2.destroy();
  });

  it('(b) restores unsent offline edits on reload and computes the missing update for the server', async () => {
    // Session 1: server doc with base text (S0)
    const serverDoc = new Y.Doc();
    serverDoc.getText('t').insert(0, 'base text');
    const S0 = Y.encodeStateAsUpdate(serverDoc);

    // Client doc applies S0 (origin 'remote'), opens local copy, makes an extra local edit offline
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, S0, 'remote');
    const res1 = await openLocalCopy(clientDoc, { userKey: 'user1', docId: 'doc-reload', serverState: S0 });
    expect(res1.copy).not.toBeNull();
    clientDoc.getText('t').insert(9, ' + local edit');

    // Wait a tick for IDB writes, then destroy doc (simulating reload)
    await delay();
    await res1.copy?.persistence.destroy();
    clientDoc.destroy();

    // Session 2: NEW Y.Doc opening with serverState=S0
    const newDoc = new Y.Doc();
    const res2 = await openLocalCopy(newDoc, { userKey: 'user1', docId: 'doc-reload', serverState: S0 });
    expect(res2.outcome).toBe('restored');
    expect(res2.hasLocalOnlyChanges).toBe(true);
    expect(textOf(newDoc)).toBe('base text + local edit');

    // Reconnect resync computes the missing update
    const mergeResult = mergeServerState(newDoc, S0, 'remote');
    expect(mergeResult.kind).toBe('merged');
    if (mergeResult.kind !== 'merged' || !mergeResult.missing) {
      throw new Error('expected missing update from mergeServerState');
    }

    // Applying missing to a fresh copy of the server doc yields the offline edit
    const freshServerDoc = new Y.Doc();
    Y.applyUpdate(freshServerDoc, S0);
    Y.applyUpdate(freshServerDoc, mergeResult.missing);
    expect(textOf(freshServerDoc)).toBe('base text + local edit');

    await res2.copy?.persistence.destroy();
    newDoc.destroy();
    freshServerDoc.destroy();
    serverDoc.destroy();
  });

  it('(c) reports diverged and clears stored database when server history was replaced', async () => {
    // Session 1: establish local content
    const serverDoc0 = new Y.Doc();
    serverDoc0.getText('t').insert(0, 'base text');
    const S0 = Y.encodeStateAsUpdate(serverDoc0);

    const clientDoc1 = new Y.Doc();
    Y.applyUpdate(clientDoc1, S0, 'remote');
    const res1 = await openLocalCopy(clientDoc1, { userKey: 'user1', docId: 'doc-diverged', serverState: S0 });
    clientDoc1.getText('t').insert(9, ' + local');
    await delay();
    await res1.copy?.persistence.destroy();
    clientDoc1.destroy();
    serverDoc0.destroy();

    // Server content replaced by an unrelated doc state S1 (different Y.Doc, no shared history)
    const serverDoc1 = new Y.Doc();
    serverDoc1.getText('t').insert(0, 'unrelated replacement content');
    const S1 = Y.encodeStateAsUpdate(serverDoc1);

    const clientDoc2 = new Y.Doc();
    const res2 = await openLocalCopy(clientDoc2, { userKey: 'user1', docId: 'doc-diverged', serverState: S1 });
    expect(res2.outcome).toBe('diverged');
    expect(res2.hasLocalOnlyChanges).toBe(false);
    expect(textOf(clientDoc2)).toBe('');

    await res2.copy?.persistence.destroy();
    clientDoc2.destroy();

    // The stored DB is gone; a later openLocalCopy with the same serverState gives 'empty'
    const clientDoc3 = new Y.Doc();
    const res3 = await openLocalCopy(clientDoc3, { userKey: 'user1', docId: 'doc-diverged', serverState: S1 });
    expect(res3.outcome).toBe('empty');
    expect(res3.hasLocalOnlyChanges).toBe(false);
    expect(textOf(clientDoc3)).toBe('');

    await res3.copy?.persistence.destroy();
    clientDoc3.destroy();
    serverDoc1.destroy();
  });

  it('(d) LocalCopy.clear() removes data and clearAllTextDocLocalCopies() leaves unrelated DBs intact', async () => {
    // LocalCopy.clear() removes data and is idempotent
    const docD = new Y.Doc();
    const resD = await openLocalCopy(docD, { userKey: 'u1', docId: 'doc-clear', serverState: null });
    docD.getText('t').insert(0, 'data to clear');
    await delay();
    expect(resD.copy).not.toBeNull();
    await resD.copy!.clear();
    await resD.copy!.clear(); // idempotent check
    docD.destroy();

    const docDCheck = new Y.Doc();
    const resDCheck = await openLocalCopy(docDCheck, { userKey: 'u1', docId: 'doc-clear', serverState: null });
    expect(resDCheck.outcome).toBe('empty');
    expect(textOf(docDCheck)).toBe('');
    await resDCheck.copy?.persistence.destroy();
    docDCheck.destroy();

    // Populate multiple user/doc databases
    const docUserA = new Y.Doc();
    const resA = await openLocalCopy(docUserA, { userKey: 'userA', docId: 'docA', serverState: null });
    docUserA.getText('t').insert(0, 'userA text');

    const docUserB = new Y.Doc();
    const resB = await openLocalCopy(docUserB, { userKey: 'userB', docId: 'docB', serverState: null });
    docUserB.getText('t').insert(0, 'userB text');

    // Create an unrelated database that does not use the text doc prefix
    const unrelatedDoc = new Y.Doc();
    const unrelatedPersistence = new IndexeddbPersistence('other-unrelated-db', unrelatedDoc);
    await unrelatedPersistence.whenSynced;
    unrelatedDoc.getText('t').insert(0, 'unrelated persistent text');

    await delay();
    await resA.copy?.persistence.destroy();
    docUserA.destroy();
    await resB.copy?.persistence.destroy();
    docUserB.destroy();
    await unrelatedPersistence.destroy();
    unrelatedDoc.destroy();

    // Verify localStorage registry contains the keys
    const registryKey = 'qcanva:textdoc:v1:index';
    const storedRegistry = JSON.parse(localStorage.getItem(registryKey) || '[]');
    expect(storedRegistry).toContain(textDocDbName('userA', 'docA'));
    expect(storedRegistry).toContain(textDocDbName('userB', 'docB'));

    // Clear all text doc local copies
    await clearAllTextDocLocalCopies();

    // Registry key removed
    expect(localStorage.getItem(registryKey)).toBeNull();

    // Both text doc databases are now empty
    const checkA = new Y.Doc();
    const resCheckA = await openLocalCopy(checkA, { userKey: 'userA', docId: 'docA', serverState: null });
    expect(resCheckA.outcome).toBe('empty');
    expect(textOf(checkA)).toBe('');
    await resCheckA.copy?.persistence.destroy();
    checkA.destroy();

    const checkB = new Y.Doc();
    const resCheckB = await openLocalCopy(checkB, { userKey: 'userB', docId: 'docB', serverState: null });
    expect(resCheckB.outcome).toBe('empty');
    expect(textOf(checkB)).toBe('');
    await resCheckB.copy?.persistence.destroy();
    checkB.destroy();

    // Unrelated database must remain intact
    const checkUnrelated = new Y.Doc();
    const checkUnrelatedPersistence = new IndexeddbPersistence('other-unrelated-db', checkUnrelated);
    await checkUnrelatedPersistence.whenSynced;
    expect(textOf(checkUnrelated)).toBe('unrelated persistent text');
    await checkUnrelatedPersistence.clearData();
    checkUnrelated.destroy();
  });

  it('(e) is a no-op when nothing is stored', async () => {
    const emptyDoc = new Y.Doc();
    const res = await openLocalCopy(emptyDoc, { userKey: 'freshUser', docId: 'freshDoc', serverState: null });
    expect(res.outcome).toBe('empty');
    expect(res.hasLocalOnlyChanges).toBe(false);
    expect(textOf(emptyDoc)).toBe('');
    await res.copy?.persistence.destroy();
    emptyDoc.destroy();

    await expect(clearAllTextDocLocalCopies()).resolves.toBeUndefined();
  });

  it('correctly identifies local copy origin with isLocalCopyOrigin', async () => {
    const doc = new Y.Doc();
    const res = await openLocalCopy(doc, { userKey: 'u', docId: 'd', serverState: null });
    expect(isLocalCopyOrigin(res.copy, res.copy?.persistence)).toBe(true);
    expect(isLocalCopyOrigin(res.copy, 'remote')).toBe(false);
    expect(isLocalCopyOrigin(res.copy, null)).toBe(false);
    expect(isLocalCopyOrigin(res.copy, undefined)).toBe(false);
    expect(isLocalCopyOrigin(null, undefined)).toBe(false);
    expect(isLocalCopyOrigin(null, 'remote')).toBe(false);
    await res.copy?.persistence.destroy();
    doc.destroy();
  });

  it('handles unavailable IndexedDB gracefully without throwing', async () => {
    const origIndexedDB = globalThis.indexedDB;
    try {
      // @ts-expect-error simulating environment where indexedDB is undefined
      delete globalThis.indexedDB;
      const doc = new Y.Doc();
      const res = await openLocalCopy(doc, { userKey: 'u', docId: 'd', serverState: null });
      expect(res.copy).toBeNull();
      expect(res.outcome).toBe('unavailable');
      expect(res.hasLocalOnlyChanges).toBe(false);
      doc.destroy();
    } finally {
      globalThis.indexedDB = origIndexedDB;
    }
  });
});
