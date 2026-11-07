import { computed, reactive, type Ref } from 'vue';

export interface CanvasCameraState {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasCameraItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useCanvasCamera(viewport: Ref<HTMLElement | null>) {
  const camera = reactive<CanvasCameraState>({ x: 0, y: 0, scale: 1 });

  const worldStyle = computed(() => ({
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
    transformOrigin: '0 0',
  }));

  const zoomPercent = computed(() => Math.round(camera.scale * 100));

  const fitToContent = (items: readonly CanvasCameraItem[]) => {
    const element = viewport.value;
    if (!items.length || !element) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of items) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 80;
    const scaleX = (element.clientWidth - padding * 2) / contentW;
    const scaleY = (element.clientHeight - padding * 2) / contentH;
    camera.scale = Math.min(scaleX, scaleY, 1);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    camera.x = element.clientWidth / 2 - centerX * camera.scale;
    camera.y = element.clientHeight / 2 - centerY * camera.scale;
  };

  const zoomAt = (x: number, y: number, factor: number) => {
    const nextScale = Math.max(0.05, Math.min(5, camera.scale * factor));
    camera.x = x - (x - camera.x) * (nextScale / camera.scale);
    camera.y = y - (y - camera.y) * (nextScale / camera.scale);
    camera.scale = nextScale;
  };

  const zoomIn = () => {
    const element = viewport.value;
    if (!element) return;
    zoomAt(element.clientWidth / 2, element.clientHeight / 2, 1.2);
  };

  const zoomOut = () => {
    const element = viewport.value;
    if (!element) return;
    zoomAt(element.clientWidth / 2, element.clientHeight / 2, 1 / 1.2);
  };

  const resetView = (items: readonly CanvasCameraItem[]) => fitToContent(items);

  const centerOn = (worldX: number, worldY: number) => {
    const element = viewport.value;
    if (!element) return;
    camera.x = -(worldX * camera.scale - element.clientWidth / 2);
    camera.y = -(worldY * camera.scale - element.clientHeight / 2);
  };

  const screenToWorld = (clientX: number, clientY: number) => {
    const element = viewport.value;
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return {
      x: (clientX - rect.left - camera.x) / camera.scale,
      y: (clientY - rect.top - camera.y) / camera.scale,
    };
  };

  return {
    camera,
    worldStyle,
    zoomPercent,
    fitToContent,
    zoomAt,
    zoomIn,
    zoomOut,
    resetView,
    centerOn,
    screenToWorld,
  };
}
