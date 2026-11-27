import { readonly, ref } from 'vue';

/**
 * Shared Group Drag-and-Drop state across Explorer, Tree, Table, Albums and Gallery (`T-021`, `T-018`).
 *
 * - Supports dragging 1 or N selected items simultaneously under a floating Liquid Glass count badge.
 * - Supports spring-loaded folders (`SPRING_EXPAND_DELAY_MS = 450ms` hover auto-expand).
 * - Supports dropping onto folders (move), Albums (add group), and Favorites (favorite group).
 */

export const SPRING_EXPAND_DELAY_MS = 450;
export const GROUP_DND_MIME = 'application/x-qspace-group';

export type GroupDragSource = 'explorer' | 'tree' | 'gallery';

export interface GroupDragEntry {
  key: string;
  id: string;
  kind: string;
  name?: string;
  folderId?: string | null;
  path?: string | null;
}

export interface GroupDragPayload {
  source: GroupDragSource;
  items: GroupDragEntry[];
  keys: string[];
  count: number;
}

export interface DropTargetHint {
  kind: 'folder' | 'album' | 'favorites' | 'yandex';
  id: string;
}

const activeDrag = ref<GroupDragPayload | null>(null);
const dragCursor = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const dropTarget = ref<DropTargetHint | null>(null);
const springHoverId = ref<string | null>(null);

let springTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelSpringExpand(): void {
  if (springTimer !== null) {
    clearTimeout(springTimer);
    springTimer = null;
  }
  springHoverId.value = null;
}

export function scheduleSpringExpand(
  nodeId: string,
  onExpand: () => void,
  delayMs = SPRING_EXPAND_DELAY_MS,
): void {
  if (springHoverId.value === nodeId && springTimer !== null) return;
  cancelSpringExpand();
  springHoverId.value = nodeId;
  springTimer = setTimeout(() => {
    springTimer = null;
    if (springHoverId.value === nodeId) {
      onExpand();
    }
  }, delayMs);
}

export function startGroupDrag(
  payload: Omit<GroupDragPayload, 'keys' | 'count'>,
  event?: DragEvent | PointerEvent | MouseEvent,
): GroupDragPayload {
  const uniqueMap = new Map<string, GroupDragEntry>();
  for (const item of payload.items) {
    if (item.key) uniqueMap.set(item.key, item);
  }
  const items = [...uniqueMap.values()];
  const full: GroupDragPayload = {
    source: payload.source,
    items,
    keys: items.map((i) => i.key),
    count: items.length,
  };
  activeDrag.value = full;
  if (event && 'clientX' in event) {
    dragCursor.value = { x: event.clientX, y: event.clientY };
  }
  if (event && 'dataTransfer' in event && event.dataTransfer) {
    try {
      event.dataTransfer.setData(GROUP_DND_MIME, JSON.stringify(full));
      event.dataTransfer.effectAllowed = 'copyMove';
    } catch {
      // Some environments disallow setting custom MIME types.
    }
  }
  return full;
}

export function updateGroupDragPosition(x: number, y: number): void {
  dragCursor.value = { x, y };
}

export function setGroupDropTarget(target: DropTargetHint | null): void {
  dropTarget.value = target;
}

export function readGroupDragFromEvent(event: DragEvent): GroupDragPayload | null {
  if (activeDrag.value) return activeDrag.value;
  const raw = event.dataTransfer?.getData(GROUP_DND_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GroupDragPayload;
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed;
    }
  } catch {
    // Malformed drag payload.
  }
  return null;
}

export function endGroupDrag(): void {
  cancelSpringExpand();
  activeDrag.value = null;
  dropTarget.value = null;
}

export function formatDragCountLabel(count: number, locale: 'ru' | 'en'): string {
  if (locale === 'en') {
    return count === 1 ? '1 item' : `${count} items`;
  }
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} объект`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} объекта`;
  return `${count} объектов`;
}

export function useExplorerGroupDnd() {
  return {
    activeDrag: readonly(activeDrag),
    dragCursor: readonly(dragCursor),
    dropTarget: readonly(dropTarget),
    springHoverId: readonly(springHoverId),
    startGroupDrag,
    updateGroupDragPosition,
    setGroupDropTarget,
    readGroupDragFromEvent,
    endGroupDrag,
    scheduleSpringExpand,
    cancelSpringExpand,
  };
}

/** Tests only. */
export function resetExplorerGroupDnd(): void {
  endGroupDrag();
  dragCursor.value = { x: 0, y: 0 };
}
