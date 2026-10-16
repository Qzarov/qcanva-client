import { ref, getCurrentInstance, onUnmounted } from 'vue';
import { canvas as canvasApi } from '../api/client';
import { isCanvasImageUrl } from '../canvas/imageUrls';

export interface UseCanvasImageTokensOptions {
  getCanvasId: () => string;
}

export function useCanvasImageTokens(options: UseCanvasImageTokensOptions) {
  const imageToken = ref<string>('');
  const imageTokenExpiresAt = ref<string>('');
  const retriedImages = new Set<string>();

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlightRefresh: Promise<{ imageToken: string; imageTokenExpiresAt: string } | null> | null = null;

  function clearTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh(expiresAt?: string | null) {
    clearTimer();
    if (!expiresAt) return;

    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) return;

    // Refresh about 5 minutes before expiry
    const targetMs = expiresAtMs - 5 * 60 * 1000;
    const delay = Math.max(0, targetMs - Date.now());

    refreshTimer = setTimeout(() => {
      void refreshToken();
    }, delay);
  }

  function setImageToken(token?: string | null, expiresAt?: string | null) {
    if (token) {
      imageToken.value = token;
    }
    if (expiresAt) {
      imageTokenExpiresAt.value = expiresAt;
      scheduleRefresh(expiresAt);
    }
  }

  async function refreshToken(): Promise<{ imageToken: string; imageTokenExpiresAt: string } | null> {
    const canvasId = options.getCanvasId();
    if (!canvasId) return null;

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    inFlightRefresh = (async () => {
      try {
        const res = await canvasApi.refreshImageToken(canvasId);
        setImageToken(res.imageToken, res.imageTokenExpiresAt);
        return res;
      } catch (err) {
        console.warn('Failed to refresh canvas image token', err);
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  }

  async function handleImageError(imageId: string, url?: string | null): Promise<boolean> {
    if (url && !isCanvasImageUrl(url)) {
      return false;
    }
    if (retriedImages.has(imageId)) {
      return false; // Already retried once; no loops
    }
    retriedImages.add(imageId);
    const result = await refreshToken();
    return result !== null;
  }

  function reset() {
    clearTimer();
    imageToken.value = '';
    imageTokenExpiresAt.value = '';
    retriedImages.clear();
    inFlightRefresh = null;
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTimer();
    });
  }

  return {
    imageToken,
    imageTokenExpiresAt,
    setImageToken,
    refreshToken,
    handleImageError,
    scheduleRefresh,
    reset,
    retriedImages,
  };
}
