import { describe, expect, it } from 'vitest';
import { createPhotosMock, isMockPhotoId } from './photos.mock';

describe('photos.mock', () => {
  const fixedNow = new Date('2026-10-17T12:00:00Z');

  it('generates buckets newest first, where every bucket count equals getBucket(month).items.length', async () => {
    const mock = createPhotosMock({ now: fixedNow, delayMs: 0 });
    const { buckets } = await mock.getBuckets();

    expect(buckets.length).toBeGreaterThan(0);

    // Verify buckets are newest first
    for (let i = 0; i < buckets.length - 1; i += 1) {
      expect(buckets[i]!.month > buckets[i + 1]!.month).toBe(true);
    }

    // Verify count matches getBucket(month).items.length for every bucket
    for (const bucket of buckets) {
      const bucketRes = await mock.getBucket(bucket.month);
      expect(bucketRes.items.length).toBe(bucket.count);
    }
  });

  it('contains both photo and video items, and some items have processed=false', async () => {
    const mock = createPhotosMock({ now: fixedNow, delayMs: 0 });
    const { buckets } = await mock.getBuckets();
    const firstBucket = await mock.getBucket(buckets[0]!.month);

    let hasPhoto = false;
    let hasVideo = false;
    let hasUnprocessed = false;
    let hasProcessed = false;

    for (const item of firstBucket.items) {
      if (item.kind === 'photo') hasPhoto = true;
      if (item.kind === 'video') hasVideo = true;
      if (!item.processed) hasUnprocessed = true;
      if (item.processed) hasProcessed = true;
    }

    expect(hasPhoto).toBe(true);
    expect(hasVideo).toBe(true);
    expect(hasUnprocessed).toBe(true);
    expect(hasProcessed).toBe(true);
  });

  it('folderId filter and personId filter give smaller non-empty counts', async () => {
    const mock = createPhotosMock({ now: fixedNow, delayMs: 0 });
    const { buckets: allBuckets } = await mock.getBuckets();
    const totalAll = allBuckets.reduce((acc, b) => acc + b.count, 0);

    const { buckets: folderBuckets } = await mock.getBuckets({ folderId: 'mock-folder-camera' });
    const totalFolder = folderBuckets.reduce((acc, b) => acc + b.count, 0);
    expect(folderBuckets.length).toBeGreaterThan(0);
    expect(totalFolder).toBeGreaterThan(0);
    expect(totalFolder).toBeLessThan(totalAll);

    const { buckets: personBuckets } = await mock.getBuckets({ personId: 'mock-person-1' });
    const totalPerson = personBuckets.reduce((acc, b) => acc + b.count, 0);
    expect(personBuckets.length).toBeGreaterThan(0);
    expect(totalPerson).toBeGreaterThan(0);
    expect(totalPerson).toBeLessThan(totalAll);

    // Also check single bucket filtering
    const firstMonth = allBuckets[0]!.month;
    const allItems = (await mock.getBucket(firstMonth)).items;
    const folderItems = (await mock.getBucket(firstMonth, { folderId: 'mock-folder-camera' })).items;
    const personItems = (await mock.getBucket(firstMonth, { personId: 'mock-person-1' })).items;

    expect(folderItems.length).toBeGreaterThan(0);
    expect(folderItems.length).toBeLessThan(allItems.length);
    expect(personItems.length).toBeGreaterThan(0);
    expect(personItems.length).toBeLessThan(allItems.length);
  });

  it('search returns items for a non-empty query and nothing for empty query', async () => {
    const mock = createPhotosMock({ now: fixedNow, delayMs: 0 });

    const emptyRes = await mock.search({ query: '' });
    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.nextCursor).toBeNull();

    const whitespaceRes = await mock.search({ query: '   ' });
    expect(whitespaceRes.items).toEqual([]);
    expect(whitespaceRes.nextCursor).toBeNull();

    const searchRes = await mock.search({ query: 'vacation' });
    expect(searchRes.items.length).toBeGreaterThan(0);
    for (const item of searchRes.items) {
      expect(item.processed).toBe(true);
    }
  });

  it('getPeople returns people list with valid properties', async () => {
    const mock = createPhotosMock({ now: fixedNow, delayMs: 0 });
    const { people } = await mock.getPeople();

    expect(people.length).toBeGreaterThan(0);
    for (const person of people) {
      expect(person.id).toMatch(/^mock-person-/);
      expect(person.assetCount).toBeGreaterThan(0);
      expect(person.thumbUrl).toContain('data:image/svg+xml');
    }
  });

  it('isMockPhotoId identifies mock vs real ids', () => {
    expect(isMockPhotoId('mock-file-2026-10-0')).toBe(true);
    expect(isMockPhotoId('mock-person-1')).toBe(true);
    expect(isMockPhotoId('real-file-123')).toBe(false);
    expect(isMockPhotoId('')).toBe(false);
    expect(isMockPhotoId(null)).toBe(false);
    expect(isMockPhotoId(undefined)).toBe(false);
  });
});
