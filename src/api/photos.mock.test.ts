import { describe, expect, it } from 'vitest';
import { createPhotosMock, renditionUrlMock } from './photos.mock';
import type { FeedItem, FeedParams } from './photos';

describe('photos mock', () => {
  const defaultFeedParams: FeedParams = {
    sort: [{ key: 'date', desc: true }],
    levels: ['date'],
    period: 'month',
    filter: 'all',
    shared: true,
  };

  it('mock api returns shared items and albums', async () => {
    const mock = createPhotosMock();
    const { groups } = await mock.summary(defaultFeedParams);
    expect(groups.length).toBeGreaterThan(0);

    const albums = await mock.albums();
    expect(albums.length).toBeGreaterThanOrEqual(2);
    expect(albums.some((a) => a.id === 'album-summer')).toBe(true);
    expect(albums.some((a) => a.id === 'album-favorites')).toBe(true);

    const { items } = await mock.search('IMG', { shared: true, limit: 100 });
    const hasShared = items.some((item) => item.share !== null);
    expect(hasShared).toBe(true);
  });

  it('deterministic (two instances equal)', async () => {
    const mock1 = createPhotosMock();
    const mock2 = createPhotosMock();

    const sum1 = await mock1.summary(defaultFeedParams);
    const sum2 = await mock2.summary(defaultFeedParams);
    expect(sum1).toEqual(sum2);

    const albums1 = await mock1.albums();
    const albums2 = await mock2.albums();
    expect(albums1).toEqual(albums2);

    const search1 = await mock1.search('VID', { shared: true });
    const search2 = await mock2.search('VID', { shared: true });
    expect(search1).toEqual(search2);
  });

  it('summary counts equal items() totals (walk pages via cursor)', async () => {
    const mock = createPhotosMock();
    const { groups } = await mock.summary(defaultFeedParams);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      let pageCount = 0;
      let cursor: string | null = null;
      do {
        const page = await mock.items(defaultFeedParams, group.key, null, cursor, 5);
        pageCount += page.items.length;
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(pageCount).toBe(group.count);
    }

    // Two-level summary: date + folder
    const twoLevelParams: FeedParams = {
      ...defaultFeedParams,
      levels: ['date', 'folder'],
    };
    const twoLevelSummary = await mock.summary(twoLevelParams);
    for (const group of twoLevelSummary.groups) {
      expect(group.subs).toBeDefined();
      let subTotal = 0;
      for (const sub of group.subs!) {
        let subPageCount = 0;
        let cursor: string | null = null;
        do {
          const page = await mock.items(twoLevelParams, group.key, sub.key, cursor, 5);
          subPageCount += page.items.length;
          cursor = page.nextCursor;
        } while (cursor !== null);

        expect(subPageCount).toBe(sub.count);
        subTotal += sub.count;
      }
      expect(subTotal).toBe(group.count);
    }
  });

  it('shared:false excludes shared', async () => {
    const mock = createPhotosMock();
    const withShared = await mock.summary({ ...defaultFeedParams, shared: true });
    const withoutShared = await mock.summary({ ...defaultFeedParams, shared: false });

    const totalWith = withShared.groups.reduce((acc, g) => acc + g.count, 0);
    const totalWithout = withoutShared.groups.reduce((acc, g) => acc + g.count, 0);

    expect(totalWithout).toBeLessThan(totalWith);

    const { items } = await mock.search('IMG', { shared: false, limit: 200 });
    for (const item of items) {
      expect(item.share).toBeNull();
    }
  });

  it('a photo in two albums', async () => {
    const mock = createPhotosMock();
    const all: FeedItem[] = [];
    let cursor: string | null = null;
    do {
      const page = await mock.search('_', { shared: true, cursor, limit: 200 });
      all.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    const photo = all.find((item) => item.fileId === 'mock-file-42');
    expect(photo).toBeDefined();
    expect(photo!.albumIds).toContain('album-summer');
    expect(photo!.albumIds).toContain('album-favorites');
    expect(photo!.albumIds.length).toBeGreaterThanOrEqual(2);
  });

  it('albumId filter', async () => {
    const mock = createPhotosMock();
    const params: FeedParams = {
      ...defaultFeedParams,
      albumId: 'album-summer',
    };

    const { groups } = await mock.summary(params);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      const { items } = await mock.items(params, group.key, null);
      for (const item of items) {
        expect(item.albumIds).toContain('album-summer');
      }
    }
  });

  it('filter=video/fav', async () => {
    const mock = createPhotosMock();

    // Video filter
    const videoSummary = await mock.summary({ ...defaultFeedParams, filter: 'video' });
    expect(videoSummary.groups.length).toBeGreaterThan(0);
    for (const group of videoSummary.groups) {
      const { items } = await mock.items({ ...defaultFeedParams, filter: 'video' }, group.key, null);
      for (const item of items) {
        expect(item.kind).toBe('video');
        expect(item.durationSec).toBeGreaterThan(0);
      }
    }

    // Favorite filter
    const favSummary = await mock.summary({ ...defaultFeedParams, filter: 'fav' });
    expect(favSummary.groups.length).toBeGreaterThan(0);
    for (const group of favSummary.groups) {
      const { items } = await mock.items({ ...defaultFeedParams, filter: 'fav' }, group.key, null);
      for (const item of items) {
        expect(item.favorite).toBe(true);
      }
    }
  });

  it('unprocessed items present', async () => {
    const mock = createPhotosMock();
    const details = await mock.details('mock-file-0');
    expect(details.item.processed).toBe(false);
    expect(details.item.width).toBeNull();
    expect(details.item.height).toBeNull();
    expect(details.item.thumbhash).toBeNull();
    expect(details.item.takenAt).toBeNull();
    expect(details.meta).toBeNull();
  });

  it('several months present', async () => {
    const mock = createPhotosMock();
    const { groups } = await mock.summary(defaultFeedParams);
    expect(groups.length).toBeGreaterThanOrEqual(15);
  });

  it('sort desc/asc order of date groups', async () => {
    const mock = createPhotosMock();

    const descRes = await mock.summary({
      ...defaultFeedParams,
      sort: [{ key: 'date', desc: true }],
    });
    for (let i = 0; i < descRes.groups.length - 1; i += 1) {
      expect(descRes.groups[i]!.key > descRes.groups[i + 1]!.key).toBe(true);
    }

    const ascRes = await mock.summary({
      ...defaultFeedParams,
      sort: [{ key: 'date', desc: false }],
    });
    for (let i = 0; i < ascRes.groups.length - 1; i += 1) {
      expect(ascRes.groups[i]!.key < ascRes.groups[i + 1]!.key).toBe(true);
    }
  });

  it('search paging', async () => {
    const mock = createPhotosMock();

    const page1 = await mock.search('IMG', { shared: true, limit: 5 });
    expect(page1.items.length).toBe(5);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await mock.search('IMG', { shared: true, cursor: page1.nextCursor, limit: 5 });
    expect(page2.items.length).toBe(5);

    const ids1 = new Set(page1.items.map((i) => i.fileId));
    const ids2 = new Set(page2.items.map((i) => i.fileId));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });

  it('edit/favorite mutation', async () => {
    const mock = createPhotosMock();
    const fileId = 'mock-file-10';

    await mock.edit(fileId, {
      favorite: true,
      description: 'Mountain trip photo',
      rating: 5,
    });

    const details = await mock.details(fileId);
    expect(details.item.favorite).toBe(true);
    expect(details.edit.favorite).toBe(true);
    expect(details.edit.description).toBe('Mountain trip photo');
    expect(details.edit.rating).toBe(5);
  });

  it('album create/rename/delete/add/remove', async () => {
    const mock = createPhotosMock();

    const { id } = await mock.createAlbum('New Trip 2026');
    let albums = await mock.albums();
    const created = albums.find((a) => a.id === id);
    expect(created).toBeDefined();
    expect(created?.name).toBe('New Trip 2026');
    expect(created?.count).toBe(0);

    await mock.renameAlbum(id, 'New Trip 2026 Renamed');
    albums = await mock.albums();
    expect(albums.find((a) => a.id === id)?.name).toBe('New Trip 2026 Renamed');

    const added = await mock.addToAlbum(id, ['mock-file-1', 'mock-file-2']);
    expect(added).toBe(2);
    albums = await mock.albums();
    const albumWithItems = albums.find((a) => a.id === id);
    expect(albumWithItems?.count).toBe(2);
    expect(albumWithItems?.coverFileIds.length).toBe(2);

    const removed = await mock.removeFromAlbum(id, ['mock-file-1']);
    expect(removed).toBe(1);
    albums = await mock.albums();
    expect(albums.find((a) => a.id === id)?.count).toBe(1);

    await mock.deleteAlbum(id);
    albums = await mock.albums();
    expect(albums.some((a) => a.id === id)).toBe(false);

    // mock-file-2 no longer references id
    const details = await mock.details('mock-file-2');
    expect(details.item.albumIds).not.toContain(id);
  });

  it('renditionUrlMock produces valid deterministic data URLs', () => {
    const url1 = renditionUrlMock('test-hash-1', 'thumbnail');
    const url2 = renditionUrlMock('test-hash-1', 'thumbnail');
    const urlVideo = renditionUrlMock('test-hash-1', 'video');
    expect(url1).toBe(url2);
    expect(url1.startsWith('data:image/svg+xml')).toBe(true);
    expect(urlVideo.startsWith('data:image/svg+xml')).toBe(true);
  });
});
