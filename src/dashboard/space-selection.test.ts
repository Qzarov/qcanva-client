import { describe, expect, it } from 'vitest';
import type { SpaceFeedItem } from '../api/spaces';
import {
  canEditSpaceRole,
  isMovableSpaceItem,
  isSpaceItemOwnedBy,
  partitionDeletableSpaceItems,
  partitionMovableSpaceItems,
  spaceItemOwnerId,
  toFolderResourceType,
} from './space-selection';

function makeItem(overrides: Partial<SpaceFeedItem> = {}): SpaceFeedItem {
  return {
    key: 'q:text-document:doc-1',
    sourceId: 'src-1',
    origin: 'qspace',
    kind: 'text-document',
    id: 'doc-1',
    path: null,
    name: 'Notes',
    mime: 'text/html',
    mediaType: null,
    size: null,
    updatedAt: '2026-11-20T10:00:00Z',
    addedBy: { id: 'user-1', name: 'Me' },
    owner: { id: 'user-1', name: 'Me' },
    previewUrl: null,
    ...overrides,
  };
}

describe('space-selection helpers', () => {
  it('resolves ownerId from owner first and falls back to addedBy when hub omits owner', () => {
    expect(spaceItemOwnerId(makeItem({ owner: { id: 'owner-2', name: 'Bob' }, addedBy: { id: 'user-1', name: 'Me' } }))).toBe('owner-2');
    expect(spaceItemOwnerId(makeItem({ owner: undefined, addedBy: { id: 'user-1', name: 'Me' } }))).toBe('user-1');
  });

  it('allows editing only for owner and editor roles', () => {
    expect(canEditSpaceRole('owner')).toBe(true);
    expect(canEditSpaceRole('editor')).toBe(true);
    expect(canEditSpaceRole('viewer')).toBe(false);
    expect(canEditSpaceRole(null)).toBe(false);
    expect(canEditSpaceRole(undefined)).toBe(false);
  });

  it('recognizes own qspace items with an id as owned and movable for owner/editor only', () => {
    const ownDoc = makeItem();
    const ownFile = makeItem({ key: 'q:file:f-1', kind: 'file', id: 'f-1', name: 'doc.pdf', size: 1024 });
    const otherDoc = makeItem({ key: 'q:canvas:c-2', kind: 'canvas', id: 'c-2', owner: { id: 'user-2', name: 'Other' }, addedBy: { id: 'user-2', name: 'Other' } });
    const ownYandex = makeItem({ key: 'y:src-y:/a.jpg', origin: 'yandex', kind: 'file', id: null, path: '/a.jpg' });

    expect(isSpaceItemOwnedBy(ownDoc, 'user-1')).toBe(true);
    expect(isSpaceItemOwnedBy(ownFile, 'user-1')).toBe(true);
    expect(isSpaceItemOwnedBy(otherDoc, 'user-1')).toBe(false);
    expect(isSpaceItemOwnedBy(ownYandex, 'user-1')).toBe(false);
    expect(isSpaceItemOwnedBy(ownDoc, '')).toBe(false);

    expect(isMovableSpaceItem(ownDoc, 'owner', 'user-1')).toBe(true);
    expect(isMovableSpaceItem(ownFile, 'editor', 'user-1')).toBe(true);
    expect(isMovableSpaceItem(ownDoc, 'viewer', 'user-1')).toBe(false);
    expect(isMovableSpaceItem(otherDoc, 'owner', 'user-1')).toBe(false);
    expect(isMovableSpaceItem(ownYandex, 'owner', 'user-1')).toBe(false);
  });

  it('maps SpaceFeedItem kinds to ResourceType', () => {
    expect(toFolderResourceType('canvas')).toBe('canvas');
    expect(toFolderResourceType('html-document')).toBe('html-document');
    expect(toFolderResourceType('text-document')).toBe('text-document');
    expect(toFolderResourceType('board')).toBe('interactive-template');
    expect(toFolderResourceType('sheet')).toBe('interactive-template');
    expect(toFolderResourceType('interactive-template')).toBe('interactive-template');
  });

  it('partitions movable and deletable space items and counts skipped ones', () => {
    const ownDoc = makeItem();
    const ownFile = makeItem({ key: 'q:file:f-1', kind: 'file', id: 'f-1', name: 'doc.pdf' });
    const otherFile = makeItem({ key: 'q:file:f-2', kind: 'file', id: 'f-2', owner: { id: 'user-2', name: 'Other' } });
    const yandex = makeItem({ key: 'y:src-y:/pic.jpg', origin: 'yandex', kind: 'file', id: null, path: '/pic.jpg' });

    expect(partitionMovableSpaceItems([ownDoc, ownFile, otherFile, yandex], 'editor', 'user-1')).toEqual({
      movable: [ownDoc, ownFile],
      skipped: 2,
    });
    expect(partitionMovableSpaceItems([ownDoc, ownFile], 'viewer', 'user-1')).toEqual({
      movable: [],
      skipped: 2,
    });

    expect(partitionDeletableSpaceItems([ownDoc, ownFile, otherFile, yandex], 'owner', 'user-1')).toEqual({
      docs: [ownDoc],
      files: [ownFile],
      skipped: 2,
    });
    expect(partitionDeletableSpaceItems([ownDoc, ownFile], 'viewer', 'user-1')).toEqual({
      docs: [],
      files: [],
      skipped: 2,
    });
  });
});
