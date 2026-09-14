// @vitest-environment jsdom
import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentTitle } from './useDocumentTitle';

describe('useDocumentTitle', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    document.title = 'stale title from a previous page';
  });
  afterEach(() => {
    scope?.stop();
  });

  it('sets the tab title to "<value> · QCanva" immediately', () => {
    const title = ref('My Document');
    scope = effectScope();
    scope.run(() => useDocumentTitle(title));

    expect(document.title).toBe('My Document · QCanva');
  });

  it('updates the tab title reactively when the source changes', async () => {
    const title = ref('First name');
    scope = effectScope();
    scope.run(() => useDocumentTitle(title));

    title.value = 'Renamed';
    await Promise.resolve();

    expect(document.title).toBe('Renamed · QCanva');
  });

  it('falls back to the bare app name when the title is empty', () => {
    const title = ref('');
    scope = effectScope();
    scope.run(() => useDocumentTitle(title));

    expect(document.title).toBe('QCanva');
  });
});
