import { onBeforeUnmount, ref, type Ref } from 'vue';

type ResourceDragItem = {
  id: string;
  type: string;
  folderId?: string | null;
};

type ResourceDragFolder = {
  id: string;
  role: string;
  hasChildren?: boolean;
};

type ResourceDragState<TItem> = {
  active: boolean;
  startX: number;
  startY: number;
  item: TItem;
  targetFolderId: string;
};

export function useDashboardResourceDrag<
  TItem extends ResourceDragItem,
  TFolder extends ResourceDragFolder,
>(options: {
  draggingResourceId: Ref<string>;
  draggingResourceType: Ref<TItem['type']>;
  draggingResourceFolderId: Ref<string | null>;
  dragTargetFolder: Ref<string>;
  suppressNextCardClick: Ref<boolean>;
  closeCardMenu: () => void;
  endResourceDrag: () => void;
  findDropFolder: (folderId: string) => TFolder | null | undefined;
  dropResourceToFolder: (folder: TFolder) => Promise<void>;
  expandTree: (folderId: string) => void;
  canStart: (item: TItem, sourceFolder: TFolder, target: HTMLElement | null) => boolean;
}) {
  const resourceDrag = ref<ResourceDragState<TItem> | null>(null);

  const removeResourceDragListeners = () => {
    window.removeEventListener('mousemove', onResourceMouseMove);
    window.removeEventListener('mouseup', onResourceMouseUp);
    window.removeEventListener('touchmove', onResourceTouchMove);
    window.removeEventListener('touchend', onResourceTouchEnd);
    window.removeEventListener('touchcancel', onResourceTouchCancel);
  };

  const finishResourceDrag = async () => {
    const state = resourceDrag.value;
    resourceDrag.value = null;
    removeResourceDragListeners();
    if (!state?.active) {
      options.endResourceDrag();
      return;
    }
    options.suppressNextCardClick.value = true;
    window.setTimeout(() => {
      options.suppressNextCardClick.value = false;
    }, 0);
    const targetFolder = options.findDropFolder(state.targetFolderId);
    if (targetFolder) {
      await options.dropResourceToFolder(targetFolder);
    } else {
      options.endResourceDrag();
    }
  };

  const updateResourceDrag = (clientX: number, clientY: number, event?: Event) => {
    const state = resourceDrag.value;
    if (!state) return;
    const distance = Math.hypot(clientX - state.startX, clientY - state.startY);
    if (!state.active && distance < 8) return;
    if (!state.active) {
      state.active = true;
      options.closeCardMenu();
      options.draggingResourceId.value = state.item.id;
      options.draggingResourceType.value = state.item.type;
      options.draggingResourceFolderId.value = state.item.folderId || null;
    }
    event?.preventDefault();
    const target = document.elementsFromPoint(clientX, clientY)
      .map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>('[data-dashboard-folder]') : null)
      .find((element): element is HTMLElement => Boolean(element));
    const folderId = target?.dataset.dashboardFolder || '';
    const folder = options.findDropFolder(folderId);
    state.targetFolderId = folder?.id || '';
    options.dragTargetFolder.value = folder?.id || '';
    if (folder?.hasChildren) options.expandTree(folder.id);
  };

  function onResourceMouseMove(event: MouseEvent) {
    updateResourceDrag(event.clientX, event.clientY, event);
  }

  function onResourceMouseUp() {
    void finishResourceDrag();
  }

  function onResourceTouchMove(event: TouchEvent) {
    const point = event.touches[0];
    if (!point) return;
    updateResourceDrag(point.clientX, point.clientY, event);
  }

  function onResourceTouchEnd(event: TouchEvent) {
    const point = event.changedTouches[0];
    if (point) updateResourceDrag(point.clientX, point.clientY, event);
    void finishResourceDrag();
  }

  function onResourceTouchCancel() {
    resourceDrag.value = null;
    removeResourceDragListeners();
    options.endResourceDrag();
  }

  const startResourceDrag = (clientX: number, clientY: number, item: TItem, sourceFolder: TFolder, target: HTMLElement | null) => {
    if (!options.canStart(item, sourceFolder, target)) return;
    resourceDrag.value = {
      active: false,
      startX: clientX,
      startY: clientY,
      item,
      targetFolderId: '',
    };
  };

  const startResourceMouseDrag = (event: MouseEvent, item: TItem, sourceFolder: TFolder) => {
    if (event.button !== 0) return;
    startResourceDrag(event.clientX, event.clientY, item, sourceFolder, event.target as HTMLElement | null);
    if (!resourceDrag.value) return;
    window.addEventListener('mousemove', onResourceMouseMove);
    window.addEventListener('mouseup', onResourceMouseUp);
  };

  const startResourceTouchDrag = (event: TouchEvent, item: TItem, sourceFolder: TFolder) => {
    const point = event.touches[0];
    if (!point) return;
    startResourceDrag(point.clientX, point.clientY, item, sourceFolder, event.target as HTMLElement | null);
    if (!resourceDrag.value) return;
    window.addEventListener('touchmove', onResourceTouchMove, { passive: false });
    window.addEventListener('touchend', onResourceTouchEnd);
    window.addEventListener('touchcancel', onResourceTouchCancel);
  };

  onBeforeUnmount(() => {
    resourceDrag.value = null;
    removeResourceDragListeners();
  });

  return {
    resourceDrag,
    startResourceMouseDrag,
    startResourceTouchDrag,
  };
}
