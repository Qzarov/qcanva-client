import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { driveApi, type DriveFolderResponse, type DriveItem, type DriveOrder, type DriveSlice, type DriveSort } from '../api/drive';
import { useI18n } from './useI18n';

export function useDriveFolderData(options: {
  folderId: ComputedRef<string>;
  slice: Ref<DriveSlice>;
  sort: Ref<DriveSort>;
  order: Ref<DriveOrder>;
  isSearching: ComputedRef<boolean>;
  debouncedQuery: Ref<string>;
  searchAllDrive: Ref<boolean>;
  searchResults: Ref<DriveItem[]>;
  searchNextCursor: Ref<string | null>;
  performSearch: () => Promise<void>;
  loading: Ref<boolean>;
  loadingMore: Ref<boolean>;
  error: Ref<string | null>;
}) {
  const folderInfo = ref<DriveFolderResponse | null>(null);
  const items = ref<DriveItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const activeNextCursor = computed(() => options.isSearching.value ? options.searchNextCursor.value : nextCursor.value);
  const { t } = useI18n();

  async function loadCurrentFolder() {
    options.loading.value = true;
    options.error.value = null;
    try {
      const [infoRes, itemsRes] = await Promise.all([
        driveApi.getFolder(options.folderId.value),
        driveApi.getFolderItems(options.folderId.value, { slice: options.slice.value, sort: options.sort.value, order: options.order.value }),
      ]);
      folderInfo.value = infoRes;
      items.value = itemsRes.items;
      nextCursor.value = itemsRes.nextCursor;
    } catch (error: any) {
      options.error.value = error.message || t('driveFolderLoadFailed');
    } finally {
      options.loading.value = false;
    }
  }

  async function refetchItemsOnly() {
    if (options.isSearching.value) {
      await options.performSearch();
      return;
    }
    try {
      const res = await driveApi.getFolderItems(options.folderId.value, { slice: options.slice.value, sort: options.sort.value, order: options.order.value });
      items.value = res.items;
      nextCursor.value = res.nextCursor;
    } catch (error: any) {
      options.error.value = error.message || t('driveRefreshFailed');
    }
  }

  function setSlice(slice: DriveSlice) {
    if (options.slice.value === slice) return;
    options.slice.value = slice;
    void refetchItemsOnly();
  }

  function setSort(sort: DriveSort) {
    if (options.sort.value === sort) return;
    options.sort.value = sort;
    void refetchItemsOnly();
  }

  function toggleOrder() {
    options.order.value = options.order.value === 'asc' ? 'desc' : 'asc';
    void refetchItemsOnly();
  }

  async function onLoadMore() {
    if (options.loadingMore.value || !activeNextCursor.value) return;
    options.loadingMore.value = true;
    try {
      if (options.isSearching.value) {
        const scopeFolder = options.searchAllDrive.value || options.folderId.value === 'root' ? undefined : options.folderId.value;
        const res = await driveApi.search({ q: options.debouncedQuery.value, slice: options.slice.value, folderId: scopeFolder, cursor: options.searchNextCursor.value });
        options.searchResults.value = [...options.searchResults.value, ...res.items];
        options.searchNextCursor.value = res.nextCursor;
      } else {
        const res = await driveApi.getFolderItems(options.folderId.value, { slice: options.slice.value, sort: options.sort.value, order: options.order.value, cursor: nextCursor.value });
        items.value = [...items.value, ...res.items];
        nextCursor.value = res.nextCursor;
      }
    } catch (error: any) {
      options.error.value = error.message || t('driveLoadMoreItemsFailed');
    } finally {
      options.loadingMore.value = false;
    }
  }

  return { folderInfo, items, nextCursor, activeNextCursor, loadCurrentFolder, refetchItemsOnly, setSlice, setSort, toggleOrder, onLoadMore };
}
