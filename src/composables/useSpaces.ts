import { ref } from 'vue';
import { isAuthenticated } from '../api/client';
import { spacesApi, type SpaceSummary } from '../api/spaces';

/**
 * The shared spaces the user is in, one list for the whole app: the
 * sidebar's Spaces block and the space section read the same ref.
 */
const spaces = ref<SpaceSummary[]>([]);
const loaded = ref(false);
let loading: Promise<SpaceSummary[]> | null = null;

async function load(force = false): Promise<SpaceSummary[]> {
  if (!isAuthenticated()) return (spaces.value = []);
  if (loading && !force) return loading;
  if (loaded.value && !force) return spaces.value;
  // Through a resolved promise: a call that throws at once is caught below too.
  loading = Promise.resolve()
    .then(() => spacesApi.list())
    .then(({ spaces: list }) => {
      spaces.value = Array.isArray(list) ? list : [];
      loaded.value = true;
      return spaces.value;
    })
    // An older hub without spaces: none.
    .catch(() => spaces.value)
    .finally(() => { loading = null; });
  return loading;
}

export function useSpaces() {
  return { spaces, loaded, load };
}

/** Tests only. */
export function resetSpaces() {
  spaces.value = [];
  loaded.value = false;
  loading = null;
}
