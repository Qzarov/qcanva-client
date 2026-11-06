import { ref } from 'vue';
import { isAuthenticated } from '../api/client';
import { isYandexReconnectError, yandexDisk, type YandexStatus } from '../api/yandexDisk';

/**
 * One status of the Yandex Disk connection for the whole app: the sidebar's
 * Spaces block and the Yandex section read the same ref.
 */
const status = ref<YandexStatus | null>(null);
let loading: Promise<YandexStatus | null> | null = null;

async function load(force = false): Promise<YandexStatus | null> {
  if (!isAuthenticated()) return (status.value = null);
  if (loading && !force) return loading;
  if (status.value && !force) return status.value;
  // Through a resolved promise: a call that throws right away is caught below too.
  loading = Promise.resolve()
    .then(() => yandexDisk.status())
    .then((value) => (status.value = value))
    // An older hub without the integration: the space is just not there.
    .catch(() => (status.value = { enabled: false, connected: false, reconnectRequired: false, login: null, displayName: null }))
    .finally(() => { loading = null; });
  return loading;
}

/** A call failed with "connect again": reflect it without asking the hub. */
function noteError(error: unknown) {
  if (!isYandexReconnectError(error) || !status.value) return;
  status.value = { ...status.value, connected: false, reconnectRequired: (error as any)?.body?.code === 'yandex_reconnect_required' };
}

export function useYandexDisk() {
  return { status, load, noteError };
}

/** Tests only. */
export function resetYandexDiskStatus() {
  status.value = null;
  loading = null;
}
