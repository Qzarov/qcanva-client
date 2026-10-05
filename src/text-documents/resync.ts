import * as Y from 'yjs';

export type MergeServerStateResult =
  | { kind: 'merged'; missing: Uint8Array | null }
  | { kind: 'diverged' };

/**
 * Merges the server's full state into `doc` and returns the update the server
 * is missing (local edits it never received), or null when it has everything.
 *
 * Applying the server state is always safe: Yjs ignores structs it already
 * has, and filling a gap also releases any remote updates that were parked in
 * `pendingStructs` waiting for it.
 *
 * The one exception is a server state with no history in common with `doc`:
 * a REST/MCP content replace or a history restore rebuilds the document from
 * scratch. Merging two unrelated docs keeps both, i.e. duplicates the whole
 * text, so that case is reported as `diverged` and nothing is applied.
 */
export function mergeServerState(doc: Y.Doc, serverState: Uint8Array, origin: unknown): MergeServerStateResult {
  const local = Y.decodeStateVector(Y.encodeStateVector(doc));
  const server = Y.decodeStateVector(Y.encodeStateVectorFromUpdate(serverState));
  const ownClient = doc.clientID;
  const sharedHistory = [...local.keys()].some((client) => client !== ownClient && server.has(client));
  const localHasForeignHistory = [...local.keys()].some((client) => client !== ownClient);
  if (localHasForeignHistory && server.size > 0 && !sharedHistory) return { kind: 'diverged' };

  Y.applyUpdate(doc, serverState, origin);

  const missing = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(serverState));
  // A state-vector diff always carries the doc's whole delete set, so "has a
  // delete set" does not mean "has a change". Apply it to a copy of the
  // server state and compare snapshots to tell a real change from a no-op.
  const serverDoc = new Y.Doc({ gc: false });
  Y.applyUpdate(serverDoc, serverState);
  const before = Y.snapshot(serverDoc);
  Y.applyUpdate(serverDoc, missing);
  const changed = !Y.equalSnapshots(before, Y.snapshot(serverDoc));
  serverDoc.destroy();
  return { kind: 'merged', missing: changed ? missing : null };
}

/** True when `doc` holds remote updates it cannot integrate yet (a missed update). */
export function hasPendingUpdates(doc: Y.Doc): boolean {
  return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}
