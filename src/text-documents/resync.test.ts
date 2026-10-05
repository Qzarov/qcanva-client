import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { hasPendingUpdates, mergeServerState } from './resync';

function textOf(doc: Y.Doc) {
  return doc.getText('t').toString();
}

describe('mergeServerState', () => {
  it('fills a missed update and releases updates parked behind it', () => {
    const author = new Y.Doc();
    const updates: Uint8Array[] = [];
    author.on('update', (update: Uint8Array) => updates.push(update));
    author.getText('t').insert(0, 'one ');
    author.getText('t').insert(4, 'two ');
    author.getText('t').insert(8, 'three');

    const reader = new Y.Doc();
    Y.applyUpdate(reader, updates[0]!);
    Y.applyUpdate(reader, updates[2]!);
    expect(textOf(reader)).toBe('one ');
    expect(hasPendingUpdates(reader)).toBe(true);

    const result = mergeServerState(reader, Y.encodeStateAsUpdate(author), 'remote');

    expect(result).toEqual({ kind: 'merged', missing: null });
    expect(textOf(reader)).toBe('one two three');
    expect(hasPendingUpdates(reader)).toBe(false);
  });

  it('returns the local edits the server never received', () => {
    const server = new Y.Doc();
    server.getText('t').insert(0, 'shared');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    client.getText('t').insert(6, ' local');
    server.getText('t').insert(0, 'remote ');

    const result = mergeServerState(client, Y.encodeStateAsUpdate(server), 'remote');

    expect(result.kind).toBe('merged');
    if (result.kind !== 'merged' || !result.missing) throw new Error('expected missing update');
    Y.applyUpdate(server, result.missing);
    expect(textOf(server)).toBe('remote shared local');
    expect(textOf(client)).toBe('remote shared local');
  });

  it('reports a local-only delete as missing', () => {
    const server = new Y.Doc();
    server.getText('t').insert(0, 'abcdef');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    client.getText('t').delete(0, 3);

    const result = mergeServerState(client, Y.encodeStateAsUpdate(server), 'remote');

    if (result.kind !== 'merged' || !result.missing) throw new Error('expected missing update');
    Y.applyUpdate(server, result.missing);
    expect(textOf(server)).toBe('def');
  });

  it('returns null when the server already has every local change, deletes included', () => {
    const server = new Y.Doc();
    server.getText('t').insert(0, 'abcdef');
    server.getText('t').delete(0, 2);
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));

    expect(mergeServerState(client, Y.encodeStateAsUpdate(server), 'remote')).toEqual({ kind: 'merged', missing: null });
  });

  it('refuses to merge a server state rebuilt from scratch', () => {
    const original = new Y.Doc();
    original.getText('t').insert(0, 'old text');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(original));
    const replaced = new Y.Doc();
    replaced.getText('t').insert(0, 'new text');

    const result = mergeServerState(client, Y.encodeStateAsUpdate(replaced), 'remote');

    expect(result).toEqual({ kind: 'diverged' });
    expect(textOf(client)).toBe('old text');
  });
});
