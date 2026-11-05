// @vitest-environment node
//
// The parts of the mention menu that need no editor: the item builder. The
// trigger guards are reused from slash-menu.ts (see mention-menu.ts's own
// comment) and are exercised together with the real editor in
// views/TextDocumentView.mentionMenu.test.ts - including the email case,
// which needs a real ProseMirror doc to place the `@` mid-word.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMentionMenuItems, createMentionSearchCache, MENTION_SEARCH_TTL_MS, type MentionMenuItem } from './mention-menu';

describe('mention menu item builder', () => {
  it('lists the matching documents, then "create page" always last', () => {
    const items = buildMentionMenuItems(
      [
        { id: 'doc-1', title: 'Roadmap' },
        { id: 'doc-2', title: 'Roadmap Q3' },
      ],
      'road',
    );

    expect(items).toEqual<MentionMenuItem[]>([
      { kind: 'document', id: 'doc-1', title: 'Roadmap' },
      { kind: 'document', id: 'doc-2', title: 'Roadmap Q3' },
      { kind: 'create', query: 'road' },
    ]);
  });

  it('still offers "create page" as the only item when nothing matched', () => {
    expect(buildMentionMenuItems([], 'zzzz')).toEqual<MentionMenuItem[]>([
      { kind: 'create', query: 'zzzz' },
    ]);
  });

  it('offers "create page" even for an empty query, carrying the empty text', () => {
    expect(buildMentionMenuItems([], '')).toEqual<MentionMenuItem[]>([{ kind: 'create', query: '' }]);
  });

  it('lists this document\'s own matching headings BEFORE other documents, then "create page" last', () => {
    const items = buildMentionMenuItems(
      [{ id: 'doc-1', title: 'Roadmap' }],
      'road',
      [{ headingId: 'h-1', label: 'Roadmap Overview' }],
    );

    expect(items).toEqual<MentionMenuItem[]>([
      { kind: 'heading', headingId: 'h-1', label: 'Roadmap Overview' },
      { kind: 'document', id: 'doc-1', title: 'Roadmap' },
      { kind: 'create', query: 'road' },
    ]);
  });

  it('omits the heading section entirely when nothing in this document matched', () => {
    const items = buildMentionMenuItems([{ id: 'doc-1', title: 'Roadmap' }], 'road', []);
    expect(items.filter((item) => item.kind === 'heading')).toEqual([]);
  });
});

describe('mention search cache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const roadmap = [{ id: 'doc-1', title: 'Roadmap' }, { id: 'doc-2', title: 'Budget' }];

  function setup(search = vi.fn(async (_query: string) => roadmap)) {
    const onResults = vi.fn();
    let clock = 0;
    const cache = createMentionSearchCache({ search, delayMs: 150, onResults, now: () => clock });
    return { cache, search, onResults, tick: (ms: number) => { clock += ms; } };
  }

  it('answers at once without waiting for the server, then pushes the server answer in', async () => {
    const { cache, search, onResults } = setup();

    expect(cache.lookup('')).toEqual([]);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledWith('');
    expect(onResults).toHaveBeenCalledWith('', roadmap);
  });

  it('waits for typing to pause before the next search, and only searches the last text', async () => {
    const { cache, search } = setup();
    cache.lookup('');
    await vi.advanceTimersByTimeAsync(0);

    cache.lookup('r');
    cache.lookup('ro');
    cache.lookup('roa');
    await vi.advanceTimersByTimeAsync(100);
    expect(search).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith('roa');
  });

  it('narrows the documents already shown by title while the new search is out', async () => {
    const { cache } = setup();
    cache.lookup('');
    await vi.advanceTimersByTimeAsync(0);

    expect(cache.lookup('road')).toEqual([{ id: 'doc-1', title: 'Roadmap' }]);
  });

  it('reuses a fresh answer for the same text without searching again, until it is stale', async () => {
    const { cache, search, tick } = setup();
    cache.lookup('road');
    await vi.advanceTimersByTimeAsync(0);
    cache.close();

    expect(cache.lookup('road')).toEqual(roadmap);
    await vi.advanceTimersByTimeAsync(1000);
    expect(search).toHaveBeenCalledTimes(1);

    cache.close();
    tick(MENTION_SEARCH_TTL_MS + 1);
    cache.lookup('road');
    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('never shows a slow answer for text already typed past', async () => {
    let release: (value: typeof roadmap) => void = () => undefined;
    const search = vi.fn((query: string) =>
      query === 'ro' ? new Promise<typeof roadmap>((resolve) => { release = resolve; }) : Promise.resolve([]),
    );
    const { cache, onResults } = setup(search);

    cache.lookup('ro');
    await vi.advanceTimersByTimeAsync(0);
    cache.lookup('road');
    await vi.advanceTimersByTimeAsync(150);
    release(roadmap);
    await vi.advanceTimersByTimeAsync(0);

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith('road', []);
  });

  it('a failed search answers "nothing found" rather than leaving the menu waiting', async () => {
    const { cache, onResults } = setup(vi.fn(async () => { throw new Error('offline'); }));
    cache.lookup('road');
    await vi.advanceTimersByTimeAsync(0);
    expect(onResults).toHaveBeenCalledWith('road', []);
  });

  it('a closed menu drops the pending search', async () => {
    const { cache, search, onResults } = setup();
    cache.lookup('road');
    cache.close();
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
    expect(onResults).not.toHaveBeenCalled();
  });
});
