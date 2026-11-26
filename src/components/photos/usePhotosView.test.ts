// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrefMock = vi.fn<(key: string) => Promise<unknown>>();
const putPrefMock = vi.fn<(key: string, value: unknown) => Promise<void>>();

async function load() {
  const mod = await import('./usePhotosView');
  return mod;
}

describe('usePhotosView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    getPrefMock.mockReset();
    putPrefMock.mockReset();
    getPrefMock.mockResolvedValue(null);
    putPrefMock.mockResolvedValue(undefined);
    vi.doMock('../../api/photos', () => ({
      photosApi: {
        getPreference: getPrefMock,
        putPreference: putPrefMock,
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../../api/photos');
    vi.restoreAllMocks();
  });

  it('defaults match spec', async () => {
    const { usePhotosView, defaultPhotosViewState } = await load();
    const { state, levels, feedParams } = usePhotosView();

    expect(state.value).toEqual(defaultPhotosViewState());
    expect(state.value).toEqual({
      sort: [],
      dirs: { date: true, folder: false, album: false, size: true },
      subs: { folder: 'name', album: 'name' },
      period: 'month',
      filter: 'all',
      captions: [],
      shared: true,
      tile: 'm',
      collapsedShares: [],
    });
    expect(levels.value).toEqual(['date']);
    expect(feedParams.value).toEqual({
      sort: [],
      levels: ['date'],
      period: 'month',
      filter: 'all',
      shared: true,
    });
    expect('albumId' in feedParams.value).toBe(false);
  });

  it('levels: date then folder when folder sorted after date and captioned', async () => {
    const { usePhotosView } = await load();
    const { levels, toggleSortKey, toggleCaption } = usePhotosView();

    expect(levels.value).toEqual(['date']);
    toggleSortKey('date');
    toggleSortKey('folder');
    expect(levels.value).toEqual(['date', 'folder']);
    toggleCaption('access');
    expect(levels.value).toEqual(['date', 'folder']);
  });

  it('levels: folder first when folder outranks date', async () => {
    localStorage.setItem(
      'qcanva:photos:view:v1',
      JSON.stringify({
        sort: [
          { key: 'folder', desc: false, sub: 'name' },
          { key: 'date', desc: true },
        ],
        captions: ['folder'],
      }),
    );
    const { usePhotosView } = await load();
    const { levels, toggleSortKey } = usePhotosView();

    expect(levels.value).toEqual(['folder', 'date']);

    // Case where date is outside sort
    toggleSortKey('date');
    expect(levels.value).toEqual(['folder', 'date']);
  });

  it('caption not in sort goes to tile (including access)', async () => {
    const { usePhotosView } = await load();
    const { captionOnTile, levels, toggleCaption } = usePhotosView();

    toggleCaption('album');
    toggleCaption('access');
    expect(captionOnTile.value).toEqual(['album', 'access']);
    expect(levels.value).toEqual(['date']);
  });

  it('enabling sort key enables its caption', async () => {
    const { usePhotosView } = await load();
    const { state, toggleSortKey } = usePhotosView();

    toggleSortKey('album');
    expect(state.value.sort[state.value.sort.length - 1]).toEqual({
      key: 'album',
      desc: false,
      sub: 'name',
    });
    expect(state.value.captions).toContain('album');

    toggleSortKey('size');
    expect(state.value.sort[state.value.sort.length - 1]).toEqual({
      key: 'size',
      desc: true,
    });
    expect(state.value.captions).toContain('size');

    // Toggle date on (does not add a caption)
    const captionsSnapshot = [...state.value.captions];
    toggleSortKey('date');
    expect(state.value.sort.some((s) => s.key === 'date')).toBe(true);
    expect(state.value.captions).toEqual(captionsSnapshot);
  });

  it('disabling sort key keeps caption which moves to tile', async () => {
    const { usePhotosView } = await load();
    const { state, captionOnTile, levels, toggleSortKey } = usePhotosView();

    toggleSortKey('album');
    expect(state.value.captions).toContain('album');

    toggleSortKey('album');
    expect(state.value.captions).toContain('album');
    expect(captionOnTile.value).toContain('album');
    expect(levels.value).not.toContain('album');
  });

  it('setAllDirs', async () => {
    const { usePhotosView } = await load();
    const { state, setAllDirs, toggleSortKey } = usePhotosView();

    toggleSortKey('date');
    toggleSortKey('folder');
    setAllDirs(true);
    expect(state.value.sort.every((s) => s.desc === true)).toBe(true);

    setAllDirs(false);
    expect(state.value.sort.every((s) => s.desc === false)).toBe(true);
  });

  it('toggleDir flips only the given key', async () => {
    const { usePhotosView } = await load();
    const { state, toggleDir, toggleSortKey } = usePhotosView();

    toggleSortKey('date');
    toggleSortKey('folder');
    toggleDir('date');
    expect(state.value.sort.find((s) => s.key === 'date')?.desc).toBe(false);
    expect(state.value.sort.find((s) => s.key === 'folder')?.desc).toBe(false);

    toggleDir('folder');
    expect(state.value.sort.find((s) => s.key === 'date')?.desc).toBe(false);
    expect(state.value.sort.find((s) => s.key === 'folder')?.desc).toBe(true);
  });

  it('cycleSub order', async () => {
    const { usePhotosView } = await load();
    const { state, cycleSub, toggleSortKey } = usePhotosView();

    toggleSortKey('folder');
    cycleSub('folder');
    expect(state.value.sort.find((s) => s.key === 'folder')?.sub).toBe('size');
    cycleSub('folder');
    expect(state.value.sort.find((s) => s.key === 'folder')?.sub).toBe('created');
    cycleSub('folder');
    expect(state.value.sort.find((s) => s.key === 'folder')?.sub).toBe('added');
    cycleSub('folder');
    expect(state.value.sort.find((s) => s.key === 'folder')?.sub).toBe('name');

    toggleSortKey('album');
    expect(state.value.sort.find((s) => s.key === 'album')?.sub).toBe('name');
    cycleSub('album');
    expect(state.value.sort.find((s) => s.key === 'album')?.sub).toBe('size');
    cycleSub('album');
    expect(state.value.sort.find((s) => s.key === 'album')?.sub).toBe('created');
    cycleSub('album');
    expect(state.value.sort.find((s) => s.key === 'album')?.sub).toBe('added');
    cycleSub('album');
    expect(state.value.sort.find((s) => s.key === 'album')?.sub).toBe('name');
  });

  it('cycleTile order', async () => {
    const { usePhotosView } = await load();
    const { state, cycleTile } = usePhotosView();

    expect(state.value.tile).toBe('m');
    cycleTile();
    expect(state.value.tile).toBe('l');
    cycleTile();
    expect(state.value.tile).toBe('s');
    cycleTile();
    expect(state.value.tile).toBe('m');
  });

  it('persists to localStorage immediately and to hub debounced', async () => {
    const { usePhotosView, PHOTOS_VIEW_STORAGE_KEY, PHOTOS_VIEW_PREFERENCE_KEY } = await load();
    const { state, setPeriod, setFilter } = usePhotosView();

    setPeriod('year');

    const raw = localStorage.getItem(PHOTOS_VIEW_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).period).toBe('year');

    await vi.advanceTimersByTimeAsync(499);
    expect(putPrefMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(putPrefMock).toHaveBeenCalledTimes(1);
    expect(putPrefMock).toHaveBeenCalledWith(PHOTOS_VIEW_PREFERENCE_KEY, state.value);

    putPrefMock.mockClear();

    setPeriod('day');
    await vi.advanceTimersByTimeAsync(200);
    setFilter('photo');
    await vi.advanceTimersByTimeAsync(499);
    expect(putPrefMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(putPrefMock).toHaveBeenCalledTimes(1);
    expect(putPrefMock).toHaveBeenCalledWith(PHOTOS_VIEW_PREFERENCE_KEY, state.value);
    expect(state.value.period).toBe('day');
    expect(state.value.filter).toBe('photo');
  });

  it('hub put failure keeps local state', async () => {
    localStorage.setItem(
      'qcanva:photos:view:v1',
      JSON.stringify({
        period: 'day',
      }),
    );
    getPrefMock.mockRejectedValue(new Error('Hub get error'));
    putPrefMock.mockRejectedValue(new Error('Hub put error'));

    const { usePhotosView, PHOTOS_VIEW_STORAGE_KEY } = await load();
    const { state, setPeriod } = usePhotosView();

    await Promise.resolve();
    await Promise.resolve();

    expect(state.value.period).toBe('day');

    setPeriod('year');
    expect(state.value.period).toBe('year');
    expect(JSON.parse(localStorage.getItem(PHOTOS_VIEW_STORAGE_KEY)!).period).toBe('year');

    await vi.advanceTimersByTimeAsync(500);

    expect(state.value.period).toBe('year');
    expect(JSON.parse(localStorage.getItem(PHOTOS_VIEW_STORAGE_KEY)!).period).toBe('year');
  });

  it('malformed stored value falls back per field', async () => {
    const storageKey = 'qcanva:photos:view:v1';
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        period: 'day',
        filter: 'favorites',
        tile: 'xl',
        shared: 'yes',
        sort: [
          { key: 'unknown', desc: true },
          { key: 'folder', desc: 'bad' },
          { key: 'folder', desc: true },
        ],
        captions: ['junk', 'folder', 123, 'folder'],
        collapsedShares: [123, 'share-1', '', 'share-1'],
        extraKey: 'extra',
      }),
    );
    const { usePhotosView, normalizePhotosViewState, defaultPhotosViewState } = await load();
    const { state } = usePhotosView();

    expect(state.value.period).toBe('day');
    expect(state.value.filter).toBe('all');
    expect(state.value.tile).toBe('m');
    expect(state.value.shared).toBe(true);
    expect(state.value.sort).toEqual([{ key: 'folder', desc: false, sub: 'name' }]);
    expect(state.value.captions).toEqual(['folder']);
    expect(state.value.collapsedShares).toEqual(['share-1']);
    expect('extraKey' in (state.value as Record<string, unknown>)).toBe(false);

    // Non-JSON garbage string -> all defaults
    localStorage.setItem(storageKey, '{not-json');
    vi.resetModules();
    const mod2 = await import('./usePhotosView');
    const view2 = mod2.usePhotosView();
    expect(view2.state.value).toEqual(defaultPhotosViewState());

    // normalizePhotosViewState(null/42/'x') -> defaults
    expect(normalizePhotosViewState(null)).toEqual(defaultPhotosViewState());
    expect(normalizePhotosViewState(42)).toEqual(defaultPhotosViewState());
    expect(normalizePhotosViewState('x')).toEqual(defaultPhotosViewState());
  });

  it('hub value arriving after load is applied', async () => {
    getPrefMock.mockResolvedValue({ period: 'year', filter: 'video' });

    const { usePhotosView, PHOTOS_VIEW_STORAGE_KEY } = await load();
    const { state } = usePhotosView();

    await Promise.resolve();
    await Promise.resolve();

    expect(state.value.period).toBe('year');
    expect(state.value.filter).toBe('video');
    expect(JSON.parse(localStorage.getItem(PHOTOS_VIEW_STORAGE_KEY)!).period).toBe('year');
    expect(putPrefMock).not.toHaveBeenCalled();
  });

  it('hub value does not override a change made meanwhile', async () => {
    let resolveGetPref!: (val: unknown) => void;
    const deferred = new Promise((resolve) => {
      resolveGetPref = resolve;
    });
    getPrefMock.mockReturnValue(deferred);

    const { usePhotosView } = await load();
    const { state, setPeriod } = usePhotosView();

    setPeriod('day');
    resolveGetPref({ period: 'year' });

    await Promise.resolve();
    await Promise.resolve();

    expect(state.value.period).toBe('day');
  });

  it('hub value is normalized', async () => {
    getPrefMock.mockResolvedValue({
      period: 'day',
      filter: 'invalid_filter',
      tile: 'invalid_tile',
      sort: 'not-an-array',
    });

    const { usePhotosView } = await load();
    const { state } = usePhotosView();

    await Promise.resolve();
    await Promise.resolve();

    expect(state.value.period).toBe('day');
    expect(state.value.filter).toBe('all');
    expect(state.value.tile).toBe('m');
    expect(state.value.sort).toEqual([]);
  });

  it('toggleShareCollapsed and reset', async () => {
    const {
      usePhotosView,
      defaultPhotosViewState,
      PHOTOS_VIEW_STORAGE_KEY,
      PHOTOS_VIEW_PREFERENCE_KEY,
    } = await load();
    const { state, toggleShareCollapsed, reset, setPeriod } = usePhotosView();

    toggleShareCollapsed('share-root-1');
    expect(state.value.collapsedShares).toEqual(['share-root-1']);

    toggleShareCollapsed('share-root-1');
    expect(state.value.collapsedShares).toEqual([]);

    setPeriod('year');
    toggleShareCollapsed('share-root-2');
    expect(state.value.period).toBe('year');
    expect(state.value.collapsedShares).toEqual(['share-root-2']);

    reset();
    expect(state.value).toEqual(defaultPhotosViewState());
    expect(JSON.parse(localStorage.getItem(PHOTOS_VIEW_STORAGE_KEY)!)).toEqual(
      defaultPhotosViewState(),
    );

    await vi.advanceTimersByTimeAsync(500);
    expect(putPrefMock).toHaveBeenCalledWith(
      PHOTOS_VIEW_PREFERENCE_KEY,
      defaultPhotosViewState(),
    );
  });

  it('toggle off then on keeps direction and sub', async () => {
    const { usePhotosView } = await load();
    const { state, toggleSortKey, toggleDir, cycleSub } = usePhotosView();

    toggleSortKey('folder');
    toggleDir('folder');
    cycleSub('folder');
    toggleSortKey('folder');
    expect(state.value.sort.some((s) => s.key === 'folder')).toBe(false);
    expect(state.value.dirs.folder).toBe(true);
    expect(state.value.subs.folder).toBe('size');

    toggleSortKey('folder');
    expect(state.value.sort[state.value.sort.length - 1]).toEqual({ key: 'folder', desc: true, sub: 'size' });
  });

  it('setAllDirs reaches inactive keys', async () => {
    const { usePhotosView } = await load();
    const { state, setAllDirs, toggleSortKey } = usePhotosView();

    setAllDirs(true);
    expect(state.value.dirs).toEqual({ date: true, folder: true, album: true, size: true });
    toggleSortKey('album');
    expect(state.value.sort[state.value.sort.length - 1]).toEqual({ key: 'album', desc: true, sub: 'name' });
    setAllDirs(false);
    expect(state.value.dirs.size).toBe(false);
    expect(state.value.sort.every((s) => s.desc === false)).toBe(true);
  });

  it('toggleDir and cycleSub on an inactive key persist and survive reload', async () => {
    let mod = await load();
    let view = mod.usePhotosView();
    view.toggleDir('size');
    view.cycleSub('album');
    expect(view.state.value.sort.map((s) => s.key)).toEqual([]);
    expect(view.state.value.dirs.size).toBe(false);
    expect(view.state.value.subs.album).toBe('size');

    vi.resetModules();
    mod = await load();
    view = mod.usePhotosView();
    expect(view.state.value.dirs.size).toBe(false);
    expect(view.state.value.subs.album).toBe('size');
    view.toggleSortKey('album');
    view.toggleSortKey('size');
    expect(view.state.value.sort).toEqual([
      { key: 'album', desc: false, sub: 'size' },
      { key: 'size', desc: false },
    ]);
  });

  it('setSort replaces sort specs while preserving dirs/subs', async () => {
    const { usePhotosView } = await load();
    const { state, setSort } = usePhotosView();

    setSort([{ key: 'size', desc: false }, { key: 'date', desc: true }]);
    expect(state.value.sort).toEqual([{ key: 'size', desc: true }, { key: 'date', desc: true }]);
    setSort([]);
    expect(state.value.sort).toEqual([]);
  });

  it('old stored state without dirs and subs migrates to defaults', async () => {
    localStorage.setItem(
      'qcanva:photos:view:v1',
      JSON.stringify({
        sort: [{ key: 'size', desc: false }, { key: 'album', desc: true, sub: 'added' }],
        period: 'day',
      }),
    );
    const { usePhotosView } = await load();
    const { state } = usePhotosView();
    expect(state.value.dirs).toEqual({ date: true, folder: false, album: false, size: true });
    expect(state.value.subs).toEqual({ folder: 'name', album: 'name' });
    expect(state.value.sort).toEqual([
      { key: 'size', desc: true },
      { key: 'album', desc: false, sub: 'name' },
    ]);
    expect(state.value.period).toBe('day');
  });

  it('malformed dirs and subs fall back per key', async () => {
    const { normalizePhotosViewState } = await load();
    const st = normalizePhotosViewState({
      dirs: { date: false, folder: 'x', album: 1, size: false, extra: true },
      subs: { folder: 'created', album: 'bogus' },
    });
    expect(st.dirs).toEqual({ date: false, folder: false, album: false, size: false });
    expect(st.subs).toEqual({ folder: 'created', album: 'name' });
  });

  it('strips legacy default captions without explicit marker, preserves explicit toggleCaption', async () => {
    localStorage.setItem(
      'qcanva:photos:view:v1',
      JSON.stringify({
        sort: [],
        captions: ['folder', 'album'],
      }),
    );
    let mod = await load();
    let view = mod.usePhotosView();
    expect(view.state.value.captions).toEqual([]);

    view.toggleCaption('folder');
    expect(view.state.value.captions).toEqual(['folder']);

    vi.resetModules();
    mod = await load();
    view = mod.usePhotosView();
    expect(view.state.value.captions).toEqual(['folder']);
  });

  it('serializes in-flight putPreference saves without overlapping PUTs', async () => {
    let resolveFirst!: () => void;
    putPrefMock.mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }));
    const { usePhotosView } = await load();
    const { setPeriod } = usePhotosView();

    setPeriod('year');
    await vi.advanceTimersByTimeAsync(500);
    expect(putPrefMock).toHaveBeenCalledTimes(1);

    // Trigger another save while first PUT is still in flight
    setPeriod('day');
    await vi.advanceTimersByTimeAsync(500);
    expect(putPrefMock).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(putPrefMock).toHaveBeenCalledTimes(2);
    expect(putPrefMock.mock.calls[1]![1]).toMatchObject({ period: 'day' });
  });
});
