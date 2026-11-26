// @vitest-environment jsdom

import { computed } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { driveApi } from '../api/drive';
import { useDriveUpload } from './useDriveUpload';
import { useI18n } from './useI18n';

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

describe('useDriveUpload B-003 413 error preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('ru');
  });

  it('preserves exact 500 MB limit message from 413 ApiError instead of overwriting with 2 GB', async () => {
    const file = new File(['x'], 'archive.zip', { type: 'application/zip' });
    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(driveApi.uploadFile).mockReturnValueOnce({
      promise: Promise.reject(new ApiError(413, 'Файл превышает лимит (500 МБ)', { limitBytes: 524288000 })),
      abort: vi.fn(),
    });

    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    await handleFilesUpload([file]);

    expect(uploads.value[0]?.status).toBe('error');
    expect(uploads.value[0]?.errorMessage).toBe('Файл превышает лимит (500 МБ)');
  });

  it('preserves proxy 413 message even though it contains "413"', async () => {
    const file = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(driveApi.uploadFile).mockReturnValueOnce({
      promise: Promise.reject(new ApiError(413, 'Превышен лимит размера запроса на прокси-сервере (413)', {})),
      abort: vi.fn(),
    });

    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    await handleFilesUpload([file]);

    expect(uploads.value[0]?.status).toBe('error');
    expect(uploads.value[0]?.errorMessage).toBe('Превышен лимит размера запроса на прокси-сервере (413)');
  });

  it('formats 5 GB limitBytes from error.body when ApiError message is generic HTTP 413', async () => {
    const file = new File(['x'], 'iso.img');
    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(driveApi.uploadFile).mockReturnValueOnce({
      promise: Promise.reject(new ApiError(413, 'HTTP 413', { limitBytes: 5368709120 })),
      abort: vi.fn(),
    });

    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    await handleFilesUpload([file]);

    expect(uploads.value[0]?.status).toBe('error');
    expect(uploads.value[0]?.errorMessage).toBe('Файл превышает лимит (5 ГБ)');
  });

  it('falls back to driveUploadTooLarge when 413 error has generic Payload Too Large message and no limitBytes', async () => {
    const file = new File(['x'], 'huge.bin');
    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);

    vi.mocked(driveApi.uploadFile).mockReturnValueOnce({
      promise: Promise.reject(new ApiError(413, 'Payload Too Large', {})),
      abort: vi.fn(),
    });

    const { uploads, handleFilesUpload } = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });

    await handleFilesUpload([file]);

    expect(uploads.value[0]?.status).toBe('error');
    expect(uploads.value[0]?.errorMessage).toBe('Файл больше 2 ГБ');
  });
});
