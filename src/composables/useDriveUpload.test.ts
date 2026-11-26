import { computed } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveApi } from '../api/drive';
import * as clientMediaUpload from '../api/clientMediaUpload';
import { useDriveUpload } from '../composables/useDriveUpload';

vi.mock('../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      uploadFile: vi.fn(),
    },
  };
});

describe('useDriveUpload client preview hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers best-effort client preview upload using returned hash without failing upload', async () => {
    const hash = 'b'.repeat(64);
    const file = new File([new Uint8Array(16)], 'pic.jpg', { type: 'image/jpeg' });
    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);
    const previewSpy = vi
      .spyOn(clientMediaUpload, 'uploadClientPreviewForItems')
      .mockRejectedValue(new Error('preview failed'));

    vi.mocked(driveApi.uploadFile).mockReturnValue({
      promise: Promise.resolve({
        items: [
          {
            id: 'f1',
            name: 'pic.jpg',
            kind: 'photo',
            mime: 'image/jpeg',
            sizeBytes: 16,
            sortDate: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
            ownerId: 'u1',
            folderId: 'folder-1',
            placed: false,
            hash,
          },
        ],
      }),
      abort: vi.fn(),
    });

    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    await handleFilesUpload([file]);

    expect(previewSpy).toHaveBeenCalledWith(file, [expect.objectContaining({ hash })]);
    expect(uploads.value[0]?.status).toBe('done');
    expect(loadCurrentFolder).toHaveBeenCalledTimes(1);
  });

  it('caps concurrent uploads at 4 workers', async () => {
    let active = 0;
    let peak = 0;
    const resolvers: Array<() => void> = [];

    vi.mocked(driveApi.uploadFile).mockImplementation(() => {
      active += 1;
      peak = Math.max(peak, active);
      return {
        promise: new Promise((resolve) => {
          resolvers.push(() => {
            active -= 1;
            resolve({ items: [] } as any);
          });
        }),
        abort: vi.fn(),
      };
    });

    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);
    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    const files = Array.from({ length: 7 }, (_, i) => new File(['x'], `f${i}.txt`, { type: 'text/plain' }));
    const run = handleFilesUpload(files);
    await Promise.resolve();
    await Promise.resolve();

    expect(driveApi.uploadFile).toHaveBeenCalledTimes(4);
    expect(peak).toBe(4);

    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await run;

    expect(driveApi.uploadFile).toHaveBeenCalledTimes(7);
    expect(peak).toBe(4);
    expect(uploads.value.every((u) => u.status === 'done')).toBe(true);
  });
});
