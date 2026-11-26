import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveApi } from '../api/drive';
import { useDriveFolderData } from './useDriveFolderData';

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolder: vi.fn(),
      getFolderItems: vi.fn(),
      search: vi.fn(),
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useDriveFolderData race guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores stale loadCurrentFolder responses and keeps loading true until the latest finishes', async () => {
    const folderId = ref('folder-a');
    const loading = ref(false);
    const loadingMore = ref(false);
    const error = ref<string | null>(null);

    const reqAInfo = deferred<any>();
    const reqAItems = deferred<any>();
    const reqBInfo = deferred<any>();
    const reqBItems = deferred<any>();

    vi.mocked(driveApi.getFolder)
      .mockReturnValueOnce(reqAInfo.promise)
      .mockReturnValueOnce(reqBInfo.promise);
    vi.mocked(driveApi.getFolderItems)
      .mockReturnValueOnce(reqAItems.promise)
      .mockReturnValueOnce(reqBItems.promise);

    const composable = useDriveFolderData({
      folderId: computed(() => folderId.value),
      slice: ref('all'),
      sort: ref('date'),
      order: ref('desc'),
      isSearching: computed(() => false),
      debouncedQuery: ref(''),
      searchAllDrive: ref(false),
      searchResults: ref([]),
      searchNextCursor: ref(null),
      performSearch: vi.fn().mockResolvedValue(undefined),
      loading,
      loadingMore,
      error,
    });

    const loadA = composable.loadCurrentFolder();
    folderId.value = 'folder-b';
    const loadB = composable.loadCurrentFolder();

    reqBInfo.resolve({ folder: { id: 'folder-b', name: 'B' }, path: [] });
    reqBItems.resolve({ items: [{ id: 'item-b' }], nextCursor: 'cur-b' });
    await loadB;

    expect(loading.value).toBe(false);
    expect(composable.items.value.map((i) => i.id)).toEqual(['item-b']);

    // Stale A resolves later — must not overwrite B or touch state
    loading.value = true;
    reqAInfo.resolve({ folder: { id: 'folder-a', name: 'A' }, path: [] });
    reqAItems.resolve({ items: [{ id: 'item-a' }], nextCursor: 'cur-a' });
    await loadA;

    expect(composable.folderInfo.value?.folder.id).toBe('folder-b');
    expect(composable.items.value.map((i) => i.id)).toEqual(['item-b']);
    expect(composable.nextCursor.value).toBe('cur-b');
    expect(loading.value).toBe(true);
  });

  it('drops stale onLoadMore response when folder reloads mid-pagination', async () => {
    const folderId = ref('folder-a');
    const loading = ref(false);
    const loadingMore = ref(false);
    const error = ref<string | null>(null);

    const loadMoreReq = deferred<any>();
    const reloadInfo = deferred<any>();
    const reloadItems = deferred<any>();

    vi.mocked(driveApi.getFolder)
      .mockResolvedValueOnce({ folder: { id: 'folder-a', name: 'A' }, path: [] } as any)
      .mockReturnValueOnce(reloadInfo.promise);
    vi.mocked(driveApi.getFolderItems)
      .mockResolvedValueOnce({ items: [{ id: 'a-1' }], nextCursor: 'cur-1' } as any)
      .mockReturnValueOnce(loadMoreReq.promise)
      .mockReturnValueOnce(reloadItems.promise);

    const composable = useDriveFolderData({
      folderId: computed(() => folderId.value),
      slice: ref('all'),
      sort: ref('date'),
      order: ref('desc'),
      isSearching: computed(() => false),
      debouncedQuery: ref(''),
      searchAllDrive: ref(false),
      searchResults: ref([]),
      searchNextCursor: ref(null),
      performSearch: vi.fn().mockResolvedValue(undefined),
      loading,
      loadingMore,
      error,
    });

    await composable.loadCurrentFolder();
    const morePromise = composable.onLoadMore();
    expect(loadingMore.value).toBe(true);

    folderId.value = 'folder-b';
    const reloadPromise = composable.loadCurrentFolder();
    expect(loadingMore.value).toBe(false);

    reloadInfo.resolve({ folder: { id: 'folder-b', name: 'B' }, path: [] });
    reloadItems.resolve({ items: [{ id: 'b-1' }], nextCursor: null });
    await reloadPromise;

    loadMoreReq.resolve({ items: [{ id: 'a-2' }], nextCursor: 'cur-2' });
    await morePromise;

    expect(composable.items.value.map((i) => i.id)).toEqual(['b-1']);
    expect(composable.nextCursor.value).toBeNull();
  });
});
