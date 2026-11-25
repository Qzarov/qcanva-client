// @vitest-environment jsdom

import { computed, effectScope, nextTick, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityJournal from './ActivityJournal.vue';
import { resetActivityJournalForTests, useActivityJournal } from '../composables/useActivityJournal';
import { resetExplorerLayoutPrefs, useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';
import { useDriveUpload } from '../composables/useDriveUpload';
import { useDashboardBulkDownload } from '../composables/useDashboardBulkDownload';
import { useDashboardBulkDelete } from '../composables/useDashboardBulkDelete';
import { driveApi } from '../api/drive';

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

enableAutoUnmount(afterEach);

describe('ActivityJournal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityJournalForTests();
    resetExplorerLayoutPrefs(true);
    useI18n().setLocale('en');
  });

  it('is hidden when idle with no tasks, registers as active host, and unregisters on unmount', () => {
    const journal = useActivityJournal();
    expect(journal.isActive.value).toBe(false);

    const wrapper = mount(ActivityJournal);
    expect(journal.isActive.value).toBe(true);
    expect(wrapper.find('[data-activity-journal]').exists()).toBe(false);

    wrapper.unmount();
    expect(journal.isActive.value).toBe(false);
  });

  it('shows compact pill with active count and aggregate progress, then expands and collapses', async () => {
    const journal = useActivityJournal();
    const wrapper = mount(ActivityJournal);

    const t1 = journal.startTask({ kind: 'upload', title: 'video.mp4', detail: '5 MB / 10 MB', progress: 50, weight: 100 });
    const t2 = journal.startTask({ kind: 'download', title: 'Archive (2)', progress: 0, weight: 100 });
    await nextTick();

    expect(wrapper.find('[data-activity-pill]').exists()).toBe(true);
    expect(wrapper.get('[data-activity-pill-label]').text()).toBe('2 active');
    expect(wrapper.get('[data-activity-pill-percent]').text()).toBe('25%');
    expect(wrapper.find('[data-activity-dismiss]').exists()).toBe(false);

    await wrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-activity-drawer]').exists()).toBe(true);
    expect(wrapper.get('[data-activity-head-title]').text()).toBe('Running (2)');
    expect(wrapper.get('[data-activity-head-percent]').text()).toBe('25%');
    expect(wrapper.findAll('[data-activity-item]')).toHaveLength(2);
    expect(wrapper.get(`[data-activity-item="${t1}"]`).text()).toContain('video.mp4');
    expect(wrapper.get(`[data-activity-item="${t1}"]`).text()).toContain('50%');
    expect(wrapper.get(`[data-activity-item="${t2}"]`).text()).toContain('Archive (2)');

    await wrapper.get('[data-activity-collapse]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-activity-pill]').exists()).toBe(true);
    expect(wrapper.find('[data-activity-drawer]').exists()).toBe(false);
  });

  it('lets the user cancel running cancellable tasks, clear completed tasks, and dismiss when idle', async () => {
    const journal = useActivityJournal();
    const abortSpy = vi.fn();
    const wrapper = mount(ActivityJournal);

    const uploadId = journal.startTask({
      kind: 'upload',
      title: 'design.png',
      progress: 35,
      cancellable: true,
      cancel: abortSpy,
    });
    const syncId = journal.startTask({
      kind: 'sync',
      title: 'Document sync',
      progress: null,
      cancellable: false,
    });
    await nextTick();

    await wrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();

    expect(wrapper.find(`[data-activity-cancel="${uploadId}"]`).exists()).toBe(true);
    expect(wrapper.find(`[data-activity-cancel="${syncId}"]`).exists()).toBe(false);

    await wrapper.get(`[data-activity-cancel="${uploadId}"]`).trigger('click');
    await nextTick();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.get(`[data-activity-item="${uploadId}"]`).attributes('data-activity-status')).toBe('cancelled');
    expect(wrapper.find('[data-activity-clear]').exists()).toBe(true);

    // Clear completed removes the cancelled task while keeping the running sync task.
    await wrapper.get('[data-activity-clear]').trigger('click');
    await nextTick();
    expect(wrapper.find(`[data-activity-item="${uploadId}"]`).exists()).toBe(false);
    expect(wrapper.find(`[data-activity-item="${syncId}"]`).exists()).toBe(true);

    // Finish sync task, collapse, and dismiss idle pill.
    journal.completeTask(syncId);
    await nextTick();
    await wrapper.get('[data-activity-collapse]').trigger('click');
    await nextTick();

    expect(wrapper.get('[data-activity-pill-label]').text()).toBe('Done · 1');
    await wrapper.get('[data-activity-dismiss]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-activity-journal]').exists()).toBe(false);
  });

  it('supports Russian localization and error state indicator', async () => {
    useI18n().setLocale('ru');
    const journal = useActivityJournal();
    const wrapper = mount(ActivityJournal);

    const id = journal.startTask({ kind: 'media', title: 'Обработка медиа', progress: null });
    await nextTick();
    expect(wrapper.get('[data-activity-pill-label]').text()).toBe('1 актив.');

    journal.failTask(id, 'Сбой');
    await nextTick();
    expect(wrapper.get('[data-activity-pill-label]').text()).toBe('Ошибки · 1');

    await wrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();
    expect(wrapper.get('[data-activity-head-title]').text()).toBe('Ошибки (1)');
    expect(wrapper.get(`[data-activity-item="${id}"] [data-activity-status-badge]`).text()).toBe('Ошибка');
  });

  it('wires Drive uploads into ActivityJournal with live progress and real abort cancellation', async () => {
    const journalWrapper = mount(ActivityJournal);
    const abortSpy = vi.fn();
    let progressCb: ((p: number) => void) | undefined;
    let rejectUpload!: (err: Error) => void;

    vi.mocked(driveApi.uploadFile).mockImplementation((_folderId, _file, onProgress) => {
      progressCb = typeof onProgress === 'function' ? onProgress : onProgress?.onProgress;
      return {
        promise: new Promise((_resolve, reject) => { rejectUpload = reject; }),
        abort: () => {
          abortSpy();
          rejectUpload(new Error('cancelled'));
        },
      };
    });

    const loadCurrentFolder = vi.fn().mockResolvedValue(undefined);
    const driveUpload = useDriveUpload({
      folderId: computed(() => 'folder-1'),
      loadCurrentFolder,
    });
    expect(driveUpload.journalActive.value).toBe(true);

    const file = new File(['hello world'], 'archive.tar.gz', { type: 'application/gzip' });
    const uploadRun = driveUpload.handleFilesUpload([file]);
    await nextTick();

    expect(journalWrapper.find('[data-activity-pill]').exists()).toBe(true);
    progressCb?.(60);
    await nextTick();
    expect(journalWrapper.get('[data-activity-pill-percent]').text()).toBe('60%');

    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();
    await journalWrapper.get('[data-activity-cancel]').trigger('click');
    await uploadRun;
    await flushPromises();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(driveUpload.uploads.value[0]?.status).toBe('cancelled');
    expect(journalWrapper.get('[data-activity-item]').attributes('data-activity-status')).toBe('cancelled');
  });

  it('wires bulk download into ActivityJournal and aborts in-flight collection before zipping', async () => {
    const journalWrapper = mount(ActivityJournal);
    const buildZip = vi.fn().mockResolvedValue(new Blob(['zip']));
    const saveBlob = vi.fn();
    const clearSelection = vi.fn();

    let releaseFirst!: () => void;
    let receivedSignal: AbortSignal | undefined;
    const archiveItem = vi.fn((_item: { id: string }, _taken: Set<string>, signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<{ name: string; content: string }>((resolve) => {
        releaseFirst = () => resolve({ name: 'a.txt', content: 'a' });
      });
    });

    const selectedItems = ref([{ id: '1' }, { id: '2' }]);
    const scope = effectScope();
    const { downloadStatus, bulkDownload } = scope.run(() => useDashboardBulkDownload({
      selectedItems,
      selectedDriveFiles: ref([]),
      selectedYandexFiles: ref([]),
      archiveItem,
      archiveDriveFile: vi.fn(),
      archiveYandexFile: vi.fn(),
      buildZip,
      saveBlob,
      clearSelection,
    }))!;

    const run = bulkDownload();
    await nextTick();

    expect(downloadStatus.value.phase).toBe('collect');
    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();

    expect(journalWrapper.get('[data-activity-item]').attributes('data-activity-kind')).toBe('download');
    await journalWrapper.get('[data-activity-cancel]').trigger('click');

    expect(receivedSignal?.aborted).toBe(true);
    releaseFirst();
    await run;

    expect(archiveItem).toHaveBeenCalledTimes(1);
    expect(buildZip).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
    expect(downloadStatus.value.phase).toBe('idle');
    scope.stop();
  });

  it('wires bulk delete into ActivityJournal and stops before remaining deletes when cancelled', async () => {
    const journalWrapper = mount(ActivityJournal);
    let resolveFirst!: () => void;
    const deleteItem = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue(undefined);
    const afterSuccess = vi.fn();

    const { bulkDelete } = useDashboardBulkDelete<{ id: string }, never, never>({
      getItems: () => [{ id: 'doc-1' }, { id: 'doc-2' }],
      getDriveFiles: () => [],
      getYandexFiles: () => [],
      getSkippedCount: () => 0,
      confirm: async () => true,
      runAction: (task) => task(),
      deleteItem,
      trashDriveFile: vi.fn(),
      removeYandexFile: vi.fn(),
      afterSuccess,
    });

    const run = bulkDelete();
    await flushPromises();

    await journalWrapper.get('[data-activity-pill]').trigger('click');
    await nextTick();

    expect(journalWrapper.get('[data-activity-item]').attributes('data-activity-kind')).toBe('bulk');
    await journalWrapper.get('[data-activity-cancel]').trigger('click');

    resolveFirst();
    await run;

    expect(deleteItem).toHaveBeenCalledTimes(1);
    expect(deleteItem).toHaveBeenCalledWith({ id: 'doc-1' });
    expect(afterSuccess).toHaveBeenCalledWith({
      items: [{ id: 'doc-1' }],
      driveFiles: [],
      yandex: [],
    });
  });

  it('drags by pill and header, persists clamped position, and preserves short clicks (< 5px)', async () => {
    const journal = useActivityJournal();
    const prefs = useExplorerLayoutPrefs();
    const wrapper = mount(ActivityJournal, { attachTo: document.body });

    journal.startTask({ kind: 'upload', title: 'photo.jpg', progress: 40 });
    await nextTick();

    const pill = wrapper.get('[data-activity-pill]');
    // Short jitter (< 5px) must NOT swallow the click that expands the drawer.
    pill.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 500, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 502, clientY: 501, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 502, clientY: 501, pointerId: 1 }));
    await pill.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-activity-drawer]').exists()).toBe(true);
    expect(prefs.activityJournalPos.value).toBeNull();

    // Real drag (>= 5px) on expanded header updates and persists clamped position.
    const head = wrapper.get('[data-activity-head]');
    head.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 500, pointerId: 2 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 160, pointerId: 2 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 160, pointerId: 2 }));
    await nextTick();

    expect(prefs.activityJournalPos.value).not.toBeNull();
    const aside = wrapper.get('[data-activity-journal]').element as HTMLElement;
    expect(aside.style.left).toMatch(/^\d+px$/);
    expect(aside.style.top).toMatch(/^\d+px$/);
    expect(aside.style.right).toBe('auto');

    // Dragging out of bounds clamps safely within viewport.
    head.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 160, pointerId: 3 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -2000, clientY: -2000, pointerId: 3 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: -2000, clientY: -2000, pointerId: 3 }));
    await nextTick();
    expect(prefs.activityJournalPos.value!.x).toBeGreaterThanOrEqual(8);
    expect(prefs.activityJournalPos.value!.y).toBeGreaterThanOrEqual(8);
  });
});
