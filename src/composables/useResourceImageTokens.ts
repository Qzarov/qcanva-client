import { ref, getCurrentInstance, onUnmounted, type Ref } from 'vue';
import {
  canvas as canvasApi,
  textDocuments as textDocumentsApi,
  htmlDocuments as htmlDocumentsApi,
  interactiveTemplates as interactiveTemplatesApi,
} from '../api/client';
import { isResourceImageUrl, normalizeResourceRouteBase } from '../canvas/imageUrls';

export type SupportedResourceType =
  | 'canvas'
  | 'text-document'
  | 'text-documents'
  | 'html-document'
  | 'html-documents'
  | 'interactive-template'
  | 'interactive-templates';

export interface UseResourceImageTokensOptions {
  getResourceId: () => string;
  resourceType?: SupportedResourceType;
  refreshTokenApi?: (resourceId: string) => Promise<{ imageToken: string; imageTokenExpiresAt: string }>;
}

export interface ResourceImageTokensComposable {
  imageToken: Ref<string>;
  imageTokenExpiresAt: Ref<string>;
  setImageToken: (token?: string | null, expiresAt?: string | null) => void;
  refreshToken: () => Promise<{ imageToken: string; imageTokenExpiresAt: string } | null>;
  handleImageError: (imageId: string, url?: string | null) => Promise<boolean>;
  scheduleRefresh: (expiresAt?: string | null) => void;
  reset: () => void;
  retriedImages: Set<string>;
}

export function useResourceImageTokens(options: UseResourceImageTokensOptions): ResourceImageTokensComposable {
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

  async function executeRefreshCall(resourceId: string): Promise<{ imageToken: string; imageTokenExpiresAt: string }> {
    if (options.refreshTokenApi) {
      return options.refreshTokenApi(resourceId);
    }

    const routeBase = normalizeResourceRouteBase(options.resourceType || 'canvas');
    switch (routeBase) {
      case 'text-documents':
        return textDocumentsApi.refreshImageToken(resourceId);
      case 'html-documents':
        return htmlDocumentsApi.refreshImageToken(resourceId);
      case 'interactive-templates':
        return interactiveTemplatesApi.refreshImageToken(resourceId);
      case 'canvas':
      default:
        return canvasApi.refreshImageToken(resourceId);
    }
  }

  async function refreshToken(): Promise<{ imageToken: string; imageTokenExpiresAt: string } | null> {
    const resourceId = options.getResourceId();
    if (!resourceId) return null;

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    inFlightRefresh = (async () => {
      try {
        const res = await executeRefreshCall(resourceId);
        setImageToken(res.imageToken, res.imageTokenExpiresAt);
        return res;
      } catch (err) {
        console.warn('Failed to refresh resource image token', err);
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  }

  async function handleImageError(imageId: string, url?: string | null): Promise<boolean> {
    if (url && !isResourceImageUrl(url)) {
      return false; // Ignore external images
    }
    if (retriedImages.has(imageId)) {
      return false; // Already retried once; prevent infinite reload loops
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

export default useResourceImageTokens;
