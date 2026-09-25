import { describe, expect, it } from 'vitest';
import { descendantFolderIds, folderIdByResourceKey, folderPaths } from './folder-paths';

const folder = (id: string, name: string, parentId: string | null = null, items: Record<string, Array<{ id: string }>> = {}) => ({
  id, name, parentId, items,
});

describe('folderPaths', () => {
  it('gives every folder its full path from the root', () => {
    const paths = folderPaths([folder('a', 'Work'), folder('b', 'Plans', 'a'), folder('c', '2026', 'b'), folder('d', 'Home')]);
    expect(paths.get('a')).toBe('Work');
    expect(paths.get('b')).toBe('Work / Plans');
    expect(paths.get('c')).toBe('Work / Plans / 2026');
    expect(paths.get('d')).toBe('Home');
  });

  it('treats a parent it cannot see as the root, and survives a cycle', () => {
    const paths = folderPaths([folder('x', 'Shared child', 'not-visible'), folder('p', 'P', 'q'), folder('q', 'Q', 'p')]);
    expect(paths.get('x')).toBe('Shared child');
    expect(paths.get('p')).toBeTruthy();
    expect(paths.get('q')).toBeTruthy();
  });
});

describe('folderIdByResourceKey', () => {
  it('maps each filed resource to its folder, across all resource kinds and both API shapes', () => {
    const map = folderIdByResourceKey([
      folder('a', 'Work', null, { canvases: [{ id: 'c1' }], htmlDocuments: [{ id: 'h1' }], textDocuments: [{ id: 't1' }] }),
      { id: 'b', name: 'Flat', parentId: null, canvases: [{ id: 'c2' }], textDocuments: [{ id: 't2' }] },
    ]);
    expect(map.get('canvas:c1')).toBe('a');
    expect(map.get('html-document:h1')).toBe('a');
    expect(map.get('text-document:t1')).toBe('a');
    expect(map.get('canvas:c2')).toBe('b');
    expect(map.get('text-document:t2')).toBe('b');
    expect(map.get('canvas:nope')).toBeUndefined();
  });
});

describe('descendantFolderIds', () => {
  it('lists every folder below one (not itself), however deep', () => {
    const folders = [folder('a', 'A'), folder('b', 'B', 'a'), folder('c', 'C', 'b'), folder('d', 'D')];
    expect([...descendantFolderIds(folders, 'a')].sort()).toEqual(['b', 'c']);
    expect([...descendantFolderIds(folders, 'd')]).toEqual([]);
  });

  it('terminates on a cycle', () => {
    expect([...descendantFolderIds([folder('p', 'P', 'q'), folder('q', 'Q', 'p')], 'p')]).toEqual(['q']);
  });
});
