import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import { driveApi, type DriveItem, type DriveSlice } from '../api/drive';
import { useI18n } from './useI18n';

export function useDriveSearch(options: {
  folderId: ComputedRef<string>;
  slice: Ref<DriveSlice>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
}) {
  const searchQuery = ref('');
  const debouncedQuery = ref('');
  const searchAllDrive = ref(false);
  const searchResults = ref<DriveItem[]>([]);
  const searchNextCursor = ref<string | null>(null);
  const isSearching = computed(() => debouncedQuery.value.length > 0);
  const { t } = useI18n();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function performSearch() {
    if (!debouncedQuery.value) {
      searchResults.value = [];
      searchNextCursor.value = null;
      return;
    }
    options.loading.value = true;
    try {
      const scopeFolder = searchAllDrive.value || options.folderId.value === 'root' ? undefined : options.folderId.value;
      const res = await driveApi.search({ q: debouncedQuery.value, slice: options.slice.value, folderId: scopeFolder });
      searchResults.value = res.items;
      searchNextCursor.value = res.nextCursor;
    } catch (error: any) {
      options.error.value = error.message || t('driveSearchFailed');
    } finally {
      options.loading.value = false;
    }
  }

  function clearSearch() {
    searchQuery.value = '';
    debouncedQuery.value = '';
    searchResults.value = [];
    searchNextCursor.value = null;
  }

  watch(searchQuery, (value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { debouncedQuery.value = value.trim(); }, 300);
  });

  watch([debouncedQuery, searchAllDrive], () => {
    if (debouncedQuery.value) void performSearch();
    else {
      searchResults.value = [];
      searchNextCursor.value = null;
    }
  });

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });

  return { searchQuery, debouncedQuery, searchAllDrive, searchResults, searchNextCursor, isSearching, performSearch, clearSearch };
}
