// The lightweight registry is synchronous, as required by TipTap. The fixed
// grammar set is asynchronous and shared by every editor on this page.
import { createLowlight } from 'lowlight';
import type { LanguageFn } from 'highlight.js';

type LanguageModule = { grammars: Readonly<Record<string, LanguageFn>> };

export function createCodeHighlighter(importLanguages: () => Promise<LanguageModule> = () => import('./code-highlighting-languages')) {
  const lowlight = createLowlight();
  let ready = false;
  let loading: Promise<void> | undefined;

  const ensureReady = (): Promise<void> => {
    if (ready) return Promise.resolve();
    if (!loading) {
      loading = Promise.resolve().then(importLanguages).then(({ grammars }) => {
        // Registration also preserves aliases such as js, ts, py, sh and html.
        lowlight.register(grammars);
        ready = true;
      }).catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
    }
    return loading;
  };
  return { lowlight, ensureReady };
}

const sharedHighlighter = createCodeHighlighter();
export const lowlight = sharedHighlighter.lowlight;
export const ensureCodeLanguages = sharedHighlighter.ensureReady;
