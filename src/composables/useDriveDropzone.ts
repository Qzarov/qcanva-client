import { ref, type Ref } from 'vue';

export function useDriveDropzone(options: {
  activeTab: Ref<string>;
  handleFilesUpload: (files: File[]) => Promise<void>;
}) {
  const isDraggingOver = ref(false);
  let dragCounter = 0;

  function onDragEnter(event: DragEvent) {
    if (options.activeTab.value === 'photos') return;
    if (event.dataTransfer?.types?.includes('Files')) {
      dragCounter += 1;
      isDraggingOver.value = true;
    }
  }

  function onDragOver(event: DragEvent) {
    if (options.activeTab.value === 'photos') return;
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  }

  function onDragLeave() {
    if (options.activeTab.value === 'photos') return;
    dragCounter -= 1;
    if (dragCounter <= 0) {
      dragCounter = 0;
      isDraggingOver.value = false;
    }
  }

  function onDrop(event: DragEvent) {
    dragCounter = 0;
    isDraggingOver.value = false;
    if (options.activeTab.value === 'photos') return;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      void options.handleFilesUpload(Array.from(droppedFiles));
    }
  }

  return { isDraggingOver, onDragEnter, onDragOver, onDragLeave, onDrop };
}
