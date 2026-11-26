// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { useI18n } from '../../composables/useI18n';
import DashboardAddDialog from './DashboardAddDialog.vue';

function createDragPayload(
  overrides: Partial<{
    types: string[];
    files: File[];
    items: Array<{ kind: string }>;
    dropEffect: string;
  }> = {},
) {
  return {
    types: [] as string[],
    files: [] as File[],
    items: [] as Array<{ kind: string }>,
    dropEffect: 'none',
    ...overrides,
  };
}

describe('DashboardAddDialog B-002 dropzone & immediate upload', () => {
  beforeEach(() => {
    useI18n().setLocale('en');
  });

  it('sets copy dropEffect, prevents dragleave flicker on inner children, and immediately emits import on drop/pick', async () => {
    const wrapper = mount(DashboardAddDialog, {
      props: {
        folders: [{ id: 'folder-1', name: 'Docs', depth: 0 }],
        initialFolderId: 'folder-1',
      },
    });

    const dropzone = wrapper.get('[data-add-drop]');
    const innerHint = dropzone.get('.dashboard-add-drop-hint');

    const dt = createDragPayload({ types: ['Files'] });
    await dropzone.trigger('dragenter', { dataTransfer: dt });
    expect(dropzone.classes()).toContain('over');
    expect(dt.dropEffect).toBe('copy');

    await dropzone.trigger('dragover', { dataTransfer: dt });
    expect(dropzone.classes()).toContain('over');

    // Moving from dropzone onto its child span must NOT clear .over
    await dropzone.trigger('dragleave', { relatedTarget: innerHint.element });
    expect(dropzone.classes()).toContain('over');

    // Leaving the dropzone to outside clears .over
    await dropzone.trigger('dragleave', { relatedTarget: null });
    expect(dropzone.classes()).not.toContain('over');

    // Dropping a file immediately emits import('file', [file], 'folder-1') without staging
    const dropped = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
    await dropzone.trigger('drop', {
      dataTransfer: createDragPayload({ types: ['Files'], files: [dropped] }),
    });
    await flushPromises();

    expect(dropzone.classes()).not.toContain('over');
    expect(wrapper.find('[data-add-files]').exists()).toBe(false);
    expect(wrapper.emitted('import')).toEqual([['file', [dropped], 'folder-1']]);

    // Picking files via hidden <input> also immediately emits import('file', ...)
    const picked = new File(['img'], 'photo.png', { type: 'image/png' });
    const input = wrapper.get('[data-add-input]').element as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [picked],
      configurable: true,
    });
    await wrapper.get('[data-add-input]').trigger('change');

    expect(wrapper.emitted('import')?.[1]).toEqual(['file', [picked], 'folder-1']);
  });

  it('accepts OS file drops anywhere on the dialog modal card for default file mode and ignores non-file drags', async () => {
    const wrapper = mount(DashboardAddDialog, {
      props: {
        folders: [{ id: 'folder-1', name: 'Docs', depth: 0 }],
        initialFolderId: 'folder-1',
      },
    });

    const modalCard = wrapper.get('[data-add-dialog]');
    const dropzone = wrapper.get('[data-add-drop]');

    // Non-file drag over modal card does not activate dropzone
    const textDrag = createDragPayload({ types: ['text/plain'] });
    await modalCard.trigger('dragover', { dataTransfer: textDrag });
    expect(dropzone.classes()).not.toContain('over');
    expect(textDrag.dropEffect).toBe('none');

    // OS file drag over modal card activates dropzone and drop uploads immediately
    const fileDrag = createDragPayload({ types: ['Files'] });
    await modalCard.trigger('dragenter', { dataTransfer: fileDrag });
    expect(dropzone.classes()).toContain('over');
    expect(fileDrag.dropEffect).toBe('copy');

    const dropped = new File(['data'], 'archive.zip', { type: 'application/zip' });
    await modalCard.trigger('drop', {
      dataTransfer: createDragPayload({ types: ['Files'], files: [dropped] }),
    });

    expect(dropzone.classes()).not.toContain('over');
    expect(wrapper.emitted('import')).toEqual([['file', [dropped], 'folder-1']]);
  });

  it('keeps staged validation list when initialImport is explicitly markdown/canvas/html', async () => {
    const wrapper = mount(DashboardAddDialog, {
      props: {
        folders: [{ id: 'folder-1', name: 'Docs', depth: 0 }],
        initialFolderId: 'folder-1',
        initialImport: 'markdown',
      },
    });

    const mdFile = new File(['# Heading'], 'guide.md', { type: 'text/markdown' });
    await wrapper.get('[data-add-drop]').trigger('drop', {
      dataTransfer: createDragPayload({ types: ['Files'], files: [mdFile] }),
    });
    await flushPromises();

    expect(wrapper.emitted('import')).toBeUndefined();
    expect(wrapper.find('[data-add-file="guide.md"]').exists()).toBe(true);

    await wrapper.get('[data-add-submit]').trigger('click');
    expect(wrapper.emitted('import')).toEqual([['markdown', [mdFile], 'folder-1']]);
  });
});
