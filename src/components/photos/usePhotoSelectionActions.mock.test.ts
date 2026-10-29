// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSpy = vi.fn();

describe('selection actions in photos mock mode', () => {
  beforeEach(() => {
    vi.resetModules();
    requestSpy.mockReset();
    requestSpy.mockRejectedValue(new Error('network must not be used in mock mode'));
    vi.doMock('../../api/client', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/client')>();
      return { ...actual, request: requestSpy };
    });
  });

  it('moves through the mock tree without any request and the feed reflects it', async () => {
    const i18n = await import('../../composables/useI18n');
    i18n.useI18n().setLocale('ru');
    const photos = await import('../../api/photos');
    photos.setPhotosMock(true);
    const { useToast } = await import('../../composables/useToast');
    const { usePhotoSelectionActions } = await import('./usePhotoSelectionActions');
    const { default: FolderPickerDialog } = await import('../FolderPickerDialog.vue');

    // The picker lists the mock's top-level folders and lazily the sub-folder.
    const picker = mount(FolderPickerDialog, { attachTo: document.body });
    await flushPromises();
    expect(picker.findAll('[role="treeitem"]').map((n) => n.text())).toEqual([
      'Корень диска', 'Камера', 'Отпуск с друзьями', 'Поездки', 'Семья',
    ]);
    await picker.get('[data-key="folder-trips"] [data-fpd-toggle]').trigger('click');
    await flushPromises();
    expect(picker.find('[data-key="folder-trips-altay"]').exists()).toBe(true);
    picker.unmount();

    const params = {
      sort: [{ key: 'date' as const, desc: true }],
      levels: ['date' as const],
      period: 'month' as const,
      filter: 'all' as const,
      shared: false,
    };
    const { groups } = await photos.photosApi.summary(params);
    const { items } = await photos.photosApi.items(params, groups[0]!.key, null);
    const target = items.find((i) => i.folderId !== 'folder-family');
    expect(target).toBeTruthy();
    const selection = new Set([target!.fileId]);
    const toasts = useToast().toasts;
    toasts.value = [];
    const actions = usePhotoSelectionActions({
      selected: () => selection,
      deselect: (ids) => ids.forEach((id) => selection.delete(id)),
    });
    await actions.moveTo({ id: 'folder-family', name: 'Семья' });

    expect(requestSpy).not.toHaveBeenCalled();
    expect(toasts.value[0]?.type).toBe('success');
    expect(selection.size).toBe(0);
    expect((await photos.photosApi.details(target!.fileId)).item.folderId).toBe('folder-family');
    photos.setPhotosMock(null);
  });
});
