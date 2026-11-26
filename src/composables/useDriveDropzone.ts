import { getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/**
 * Checks whether a DragEvent carries external files (as opposed to internal
 * card/folder DnD payloads, links, or text selections).
 */
export function hasDataTransferFiles(event: DragEvent): boolean {
  const dt = event.dataTransfer;
  if (!dt) return false;
  const types = Array.from(dt.types || []);
  if (types.includes('Files') || types.includes('application/x-moz-file')) return true;
  if (dt.files && dt.files.length > 0) return true;
  if (dt.items && Array.from(dt.items).some((item) => item.kind === 'file')) return true;
  return false;
}

/**
 * Tracks external file drag-and-drop state over a dropzone element and forwards
 * dropped files to `handleFilesUpload`.
 */
export function useDriveDropzone(options: {
  activeTab?: Ref<string>;
  enabled?: Ref<boolean>;
  ignoreEvent?: (event: DragEvent) => boolean;
  handleFilesUpload: (files: File[]) => Promise<void> | void;
}) {
  const isDraggingOver = ref(false);
  let dragCounter = 0;

  const isEnabled = () => (options.enabled ? options.enabled.value : true) && options.activeTab?.value !== 'photos';
  const shouldAccept = (event: DragEvent) => isEnabled() && !options.ignoreEvent?.(event) && hasDataTransferFiles(event);

  const reset = () => {
    dragCounter = 0;
    isDraggingOver.value = false;
  };

  watch(isEnabled, (allowed) => {
    if (!allowed) reset();
  });

  if (getCurrentInstance() && typeof window !== 'undefined') {
    onMounted(() => {
      window.addEventListener('dragend', reset);
      window.addEventListener('drop', reset, true);
    });
    onBeforeUnmount(() => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset, true);
    });
  }

  function onDragEnter(event: DragEvent) {
    if (!shouldAccept(event)) return;
    event.preventDefault();
    dragCounter += 1;
    isDraggingOver.value = true;
  }

  function onDragOver(event: DragEvent) {
    if (!shouldAccept(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave() {
    if (!isDraggingOver.value && dragCounter === 0) return;
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) isDraggingOver.value = false;
  }

  function onDrop(event: DragEvent) {
    reset();
    if (!isEnabled() || options.ignoreEvent?.(event)) return;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (droppedFiles.length > 0 || hasDataTransferFiles(event)) {
      event.preventDefault();
    }
    if (droppedFiles.length > 0) {
      void options.handleFilesUpload(droppedFiles);
    }
  }

  return { isDraggingOver, onDragEnter, onDragOver, onDragLeave, onDrop, reset };
}
