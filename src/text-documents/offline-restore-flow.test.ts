// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  clearAllTextDocLocalCopies,
  isLocalCopyOrigin,
  openLocalCopy,
  type LocalCopy,
} from './offline-store';
import { mergeServerState } from './resync';

function delay(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('offline-restore-flow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllTextDocLocalCopies();
  });

  it('simulates view order of operations: persist -> restore & resync -> diverged clear -> empty', async () => {
    const userKey = 'test-user-1';
    const docId = 'doc-flow-123';

    // 1. Session 1: establish server snapshot S0 and make local offline edits.
    const serverDoc0 = new Y.Doc();
    serverDoc0.getText('default').insert(0, 'Hello server');
    const S0 = Y.encodeStateAsUpdate(serverDoc0);

    const clientDoc1 = new Y.Doc();
    const res1 = await openLocalCopy(clientDoc1, { userKey, docId, serverState: S0 });
    expect(res1.outcome).toBe('empty');

    // View applies initial server snapshot
    Y.applyUpdate(clientDoc1, S0, 'remote');

    // User makes offline edits
    clientDoc1.getText('default').insert(12, ' + offline edit');
    expect(clientDoc1.getText('default').toString()).toBe('Hello server + offline edit');

    // Wait for y-indexeddb to persist to fake-indexeddb
    await delay();
    await res1.copy?.persistence.destroy();
    clientDoc1.destroy();

    // 2. Session 2: reload / re-open view.
    const clientDoc2 = new Y.Doc();
    let unsentLocal = false;
    let localCopy: LocalCopy | null = null;

    // View calls openLocalCopy before applying server snapshot
    const res2 = await openLocalCopy(clientDoc2, { userKey, docId, serverState: S0 });
    expect(res2.outcome).toBe('restored');
    expect(res2.hasLocalOnlyChanges).toBe(true);
    localCopy = res2.copy;
    if (res2.hasLocalOnlyChanges) {
      unsentLocal = true;
    }
    expect(unsentLocal).toBe(true);
    expect(isLocalCopyOrigin(localCopy, localCopy?.persistence)).toBe(true);
    expect(isLocalCopyOrigin(localCopy, 'local')).toBe(false);

    // View then applies server snapshot with origin 'remote'
    Y.applyUpdate(clientDoc2, S0, 'remote');
    expect(clientDoc2.getText('default').toString()).toBe('Hello server + offline edit');

    // Room state arrives on socket (re)join with server state S0
    const merged = mergeServerState(clientDoc2, S0, 'remote');
    expect(merged.kind).toBe('merged');
    if (merged.kind !== 'merged') {
      throw new Error('expected merged');
    }
    expect(merged.missing).not.toBeNull();

    // Verify missing update applies cleanly to server doc yielding offline edit
    const serverDocAfterResync = new Y.Doc();
    Y.applyUpdate(serverDocAfterResync, S0);
    Y.applyUpdate(serverDocAfterResync, merged.missing!);
    expect(serverDocAfterResync.getText('default').toString()).toBe('Hello server + offline edit');

    // 3. Same session: server content replaced or history restored (unrelated Y.Doc state S1)
    const serverDocReplaced = new Y.Doc();
    serverDocReplaced.getText('default').insert(0, 'Replaced version content');
    const S1 = Y.encodeStateAsUpdate(serverDocReplaced);

    const mergedReplaced = mergeServerState(clientDoc2, S1, 'remote');
    expect(mergedReplaced.kind).toBe('diverged');

    // Diverged branch in onRoomState clears localCopy and drops the reference
    await localCopy?.clear();
    localCopy = null;

    clientDoc2.destroy();
    serverDoc0.destroy();
    serverDocAfterResync.destroy();
    serverDocReplaced.destroy();

    // 4. Session 3: opening docId again reports 'empty' because localCopy.clear() emptied IndexedDB
    const clientDoc3 = new Y.Doc();
    const res3 = await openLocalCopy(clientDoc3, { userKey, docId, serverState: S1 });
    expect(res3.outcome).toBe('empty');
    expect(res3.hasLocalOnlyChanges).toBe(false);

    await res3.copy?.persistence.destroy();
    clientDoc3.destroy();
  });
});
