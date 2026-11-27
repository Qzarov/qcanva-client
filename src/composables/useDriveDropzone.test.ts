// @vitest-environment jsdom

import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { hasDataTransferFiles, useDriveDropzone } from './useDriveDropzone';

function makeDragEvent(
  type: string,
  dataTransfer?: Partial<{
    types: string[];
    files: File[];
    items: Array<{ kind: string }>;
    dropEffect: string;
  }> | null,
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer === undefined ? { types: [], files: [], dropEffect: 'none' } : dataTransfer,
    configurable: true,
  });
  return event;
}

describe('hasDataTransferFiles', () => {
  it('returns true for external file drags and false for non-file payloads', () => {
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' });
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { types: ['Files'] }))).toBe(true);
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { types: ['application/x-moz-file'] }))).toBe(true);
    expect(hasDataTransferFiles(makeDragEvent('drop', { files: [file] }))).toBe(true);
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { items: [{ kind: 'file' }] }))).toBe(true);

    expect(hasDataTransferFiles(makeDragEvent('dragenter', null))).toBe(false);
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { types: ['text/plain', 'text/uri-list'] }))).toBe(false);
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { types: ['application/x-qcanva-folder'] }))).toBe(false);
    expect(hasDataTransferFiles(makeDragEvent('dragenter', { items: [{ kind: 'string' }] }))).toBe(false);
  });
});

describe('useDriveDropzone', () => {
  it('tracks nested dragenter/dragleave, sets copy dropEffect, and uploads dropped files', () => {
    const enabled = ref(true);
    const handleFilesUpload = vi.fn().mockResolvedValue(undefined);
    const { isDraggingOver, onDragEnter, onDragOver, onDragLeave, onDrop } = useDriveDropzone({
      enabled,
      handleFilesUpload,
    });

    const enterOuter = makeDragEvent('dragenter', { types: ['Files'] });
    onDragEnter(enterOuter);
    expect(enterOuter.defaultPrevented).toBe(true);
    expect(isDraggingOver.value).toBe(true);

    // Nested child enter/leave keeps the overlay active until all levels leave.
    onDragEnter(makeDragEvent('dragenter', { types: ['Files'] }));
    onDragLeave();
    expect(isDraggingOver.value).toBe(true);

    const overEvent = makeDragEvent('dragover', { types: ['Files'], dropEffect: 'none' });
    onDragOver(overEvent);
    expect(overEvent.defaultPrevented).toBe(true);
    expect(overEvent.dataTransfer?.dropEffect).toBe('copy');

    const mdFile = new File(['# Title'], 'readme.md', { type: 'text/markdown' });
    const imgFile = new File(['img'], 'photo.png', { type: 'image/png' });
    const dropEvent = makeDragEvent('drop', { types: ['Files'], files: [mdFile, imgFile] });
    onDrop(dropEvent);

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(isDraggingOver.value).toBe(false);
    expect(handleFilesUpload).toHaveBeenCalledWith([mdFile, imgFile]);
  });

  it('ignores events matched by ignoreEvent and non-file drags', () => {
    const handleFilesUpload = vi.fn();
    const { isDraggingOver, onDragEnter, onDragOver, onDrop } = useDriveDropzone({
      ignoreEvent: (event) => Array.from(event.dataTransfer?.types || []).includes('application/x-qcanva-folder'),
      handleFilesUpload,
    });

    const internalEnter = makeDragEvent('dragenter', { types: ['application/x-qcanva-folder'] });
    onDragEnter(internalEnter);
    expect(internalEnter.defaultPrevented).toBe(false);
    expect(isDraggingOver.value).toBe(false);

    const textOver = makeDragEvent('dragover', { types: ['text/plain'] });
    onDragOver(textOver);
    expect(textOver.defaultPrevented).toBe(false);

    const internalDrop = makeDragEvent('drop', {
      types: ['application/x-qcanva-folder'],
      files: [new File(['x'], 'x.txt')],
    });
    onDrop(internalDrop);
    expect(internalDrop.defaultPrevented).toBe(false);
    expect(handleFilesUpload).not.toHaveBeenCalled();
  });

  it('resets active overlay when enabled becomes false', async () => {
    const enabled = ref(true);
    const { isDraggingOver, onDragEnter } = useDriveDropzone({
      enabled,
      handleFilesUpload: vi.fn(),
    });

    onDragEnter(makeDragEvent('dragenter', { types: ['Files'] }));
    expect(isDraggingOver.value).toBe(true);

    enabled.value = false;
    await nextTick();
    expect(isDraggingOver.value).toBe(false);
  });

  it('resets active overlay on capture-phase window drop even if a child stops propagation, and cleans up on unmount', async () => {
    const handleFilesUpload = vi.fn();
    let dropzone!: ReturnType<typeof useDriveDropzone>;
    const Host = defineComponent({
      setup() {
        dropzone = useDriveDropzone({ handleFilesUpload });
        return { dropzone };
      },
      template: '<div class="outer"><div class="child" @drop.stop></div></div>',
    });

    const wrapper = mount(Host, { attachTo: document.body });
    dropzone.onDragEnter(makeDragEvent('dragenter', { types: ['Files'] }));
    expect(dropzone.isDraggingOver.value).toBe(true);

    const childDrop = makeDragEvent('drop', { types: ['Files'], files: [] });
    wrapper.get('.child').element.dispatchEvent(childDrop);
    expect(dropzone.isDraggingOver.value).toBe(false);

    // After unmount, capture listener is removed
    wrapper.unmount();
    dropzone.onDragEnter(makeDragEvent('dragenter', { types: ['Files'] }));
    expect(dropzone.isDraggingOver.value).toBe(true);
    window.dispatchEvent(makeDragEvent('drop', { types: ['Files'], files: [] }));
    expect(dropzone.isDraggingOver.value).toBe(true);
  });
});
