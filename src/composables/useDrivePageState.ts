import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { DriveOrder, DriveSlice, DriveSort } from '../api/drive';

export function useDrivePageState() {
  const route = useRoute();
  const currentFolderId = computed<string>(() => {
    const raw = route.params.folderId;
    if (!raw || Array.isArray(raw)) return 'root';
    return String(raw);
  });
  const activeSlice = ref<DriveSlice>('all');
  const activeSort = ref<DriveSort>('name');
  const activeOrder = ref<DriveOrder>('asc');
  const viewMode = ref<'grid' | 'list'>('grid');
  const loading = ref(true);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const mobileSearchOpen = ref(false);
  return { route, currentFolderId, activeSlice, activeSort, activeOrder, viewMode, loading, loadingMore, error, mobileSearchOpen };
}
