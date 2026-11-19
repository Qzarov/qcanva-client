import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useDrivePresentation } from './useDrivePresentation';

describe('useDrivePresentation', () => {
  it('sorts folders first and calculates slice counts from folder metadata', () => {
    const folderInfo = ref({
      folder: { id: 'folder-1', name: 'Projects', role: 'editor' },
      path: [{ id: 'root', name: 'Drive' }],
      counts: { folders: 2, docs: 3, files: 4, media: 5 },
    } as any);
    const items = ref([{ kind: 'file', id: 'file-1' }, { kind: 'folder', id: 'folder-2' }] as any);
    const searchResults = ref([] as any[]);
    const presentation = useDrivePresentation({
      folderInfo,
      items,
      searchResults,
      isSearching: computed(() => false),
    });

    expect(presentation.displayedItems.value.map((item) => item.kind)).toEqual(['folder', 'file']);
    expect(presentation.getSliceCount('all')).toBe(14);
    expect(presentation.getSliceCount('media')).toBe(5);
    expect(presentation.breadcrumbTrail.value).toEqual([{ id: 'root', name: 'Drive' }]);
    expect(presentation.folderRoleLabel.value).toBeTruthy();
  });
});
