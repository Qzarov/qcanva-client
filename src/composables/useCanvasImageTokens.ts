import { useResourceImageTokens, type ResourceImageTokensComposable } from './useResourceImageTokens';

export interface UseCanvasImageTokensOptions {
  getCanvasId: () => string;
}

export function useCanvasImageTokens(options: UseCanvasImageTokensOptions): ResourceImageTokensComposable {
  return useResourceImageTokens({
    getResourceId: options.getCanvasId,
    resourceType: 'canvas',
  });
}

export default useCanvasImageTokens;
