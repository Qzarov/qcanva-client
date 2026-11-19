import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { CanvasCameraState } from './useCanvasCamera';

interface MinimapNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useCanvasMinimap(
  viewerNodes: ComputedRef<readonly MinimapNode[]>,
  viewport: Ref<HTMLElement | null>,
  viewportSize: { width: number; height: number },
  camera: CanvasCameraState,
  centerCameraOn: (worldX: number, worldY: number) => void,
) {
  const minimapDragging = ref(false);

  const minimapData = computed(() => {
    const element = viewport.value;
    if (!viewerNodes.value.length || !element) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of viewerNodes.value) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const width = viewportSize.width || element.clientWidth;
    const height = viewportSize.height || element.clientHeight;
    const vpX = -camera.x / camera.scale;
    const vpY = -camera.y / camera.scale;
    const vpW = width / camera.scale;
    const vpH = height / camera.scale;
    const pad = 100;
    minX = Math.min(minX, vpX) - pad;
    minY = Math.min(minY, vpY) - pad;
    maxX = Math.max(maxX, vpX + vpW) + pad;
    maxY = Math.max(maxY, vpY + vpH) + pad;
    return { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, vpX, vpY, vpW, vpH };
  });

  const minimapScreenToWorld = (event: MouseEvent) => {
    const svg = (event.currentTarget as HTMLElement).querySelector('svg')!;
    const rect = svg.getBoundingClientRect();
    const vb = minimapData.value!;
    const [vbX = 0, vbY = 0, vbW = 1, vbH = 1] = vb.viewBox.split(' ').map(Number);
    const scale = Math.min(rect.width / vbW, rect.height / vbH);
    return {
      wx: vbX + (event.clientX - rect.left - (rect.width - vbW * scale) / 2) / scale,
      wy: vbY + (event.clientY - rect.top - (rect.height - vbH * scale) / 2) / scale,
    };
  };

  const onMinimapDown = (event: MouseEvent) => {
    if (event.button !== 0 || !minimapData.value) return;
    minimapDragging.value = true;
    const { wx, wy } = minimapScreenToWorld(event);
    centerCameraOn(wx, wy);
  };

  const onMinimapMove = (event: MouseEvent) => {
    if (!minimapDragging.value || !minimapData.value) return;
    const { wx, wy } = minimapScreenToWorld(event);
    centerCameraOn(wx, wy);
  };

  const onMinimapUp = () => { minimapDragging.value = false; };

  return { minimapData, minimapDragging, onMinimapDown, onMinimapMove, onMinimapUp };
}
