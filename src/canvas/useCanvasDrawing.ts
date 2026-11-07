import type { Ref } from 'vue';
import { hitTestDrawing, type ActiveDrawingTool, type Drawing } from './drawing';
import type { CanvasCameraState } from './useCanvasCamera';

type DrawingOperation =
  | { type: 'draw-add'; drawing: Drawing }
  | { type: 'draw-remove'; id: string };

interface CanvasDrawingOptions {
  viewport: Ref<HTMLElement | null>;
  camera: CanvasCameraState;
  drawings: Ref<Drawing[]>;
  draftDrawing: Ref<Drawing | null>;
  drawTool: Ref<ActiveDrawingTool>;
  drawColor: Ref<string>;
  drawWidth: Ref<number>;
  genId: () => string;
  pushUndo: () => void;
  emitOp: (operation: DrawingOperation) => void;
}

export function useCanvasDrawing(options: CanvasDrawingOptions) {
  let drawErasing = false;
  let drawGestureStarted = false;

  const setDrawTool = (tool: ActiveDrawingTool) => { options.drawTool.value = tool; };
  const setDrawColor = (color: string) => { options.drawColor.value = color; };
  const setDrawWidth = (width: number) => { options.drawWidth.value = width; };

  const toWorld = (event: PointerEvent) => {
    const rect = options.viewport.value?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left - options.camera.x) / options.camera.scale,
      y: (event.clientY - rect.top - options.camera.y) / options.camera.scale,
    };
  };

  const eraseAt = (x: number, y: number) => {
    const tolerance = 6 / options.camera.scale;
    const hit = [...options.drawings.value].reverse().find((drawing) => hitTestDrawing(drawing, x, y, tolerance));
    if (!hit) return;
    options.drawings.value = options.drawings.value.filter((drawing) => drawing.id !== hit.id);
    options.emitOp({ type: 'draw-remove', id: hit.id });
  };

  const onDrawPointerDown = (event: PointerEvent) => {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    const { x, y } = toWorld(event);
    drawGestureStarted = true;

    if (options.drawTool.value === 'eraser') {
      drawErasing = true;
      options.pushUndo();
      eraseAt(x, y);
      return;
    }

    const base = {
      id: options.genId(),
      color: options.drawColor.value,
      width: options.drawWidth.value,
      createdBy: 'me',
      createdAt: new Date().toISOString(),
    };
    if (options.drawTool.value === 'pen' || options.drawTool.value === 'highlighter') {
      options.draftDrawing.value = {
        ...base,
        tool: options.drawTool.value,
        points: [x, y],
        opacity: options.drawTool.value === 'highlighter' ? 0.3 : 1,
      };
    } else if (options.drawTool.value === 'line' || options.drawTool.value === 'arrow') {
      options.draftDrawing.value = { ...base, tool: options.drawTool.value, x1: x, y1: y, x2: x, y2: y };
    } else {
      options.draftDrawing.value = { ...base, tool: options.drawTool.value as Drawing['tool'], x, y, w: 0, h: 0 };
    }
  };

  const onDrawPointerMove = (event: PointerEvent) => {
    if (!drawGestureStarted) return;
    const { x, y } = toWorld(event);
    if (drawErasing) {
      eraseAt(x, y);
      return;
    }
    const drawing = options.draftDrawing.value;
    if (!drawing) return;
    if (drawing.tool === 'pen' || drawing.tool === 'highlighter') {
      drawing.points = [...(drawing.points || []), x, y];
    } else if (drawing.tool === 'line' || drawing.tool === 'arrow') {
      drawing.x2 = x;
      drawing.y2 = y;
    } else {
      drawing.w = x - (drawing.x as number);
      drawing.h = y - (drawing.y as number);
    }
  };

  const onDrawPointerUp = () => {
    if (!drawGestureStarted) return;
    drawGestureStarted = false;
    if (drawErasing) {
      drawErasing = false;
      return;
    }
    const drawing = options.draftDrawing.value;
    options.draftDrawing.value = null;
    if (!drawing) return;
    if ((drawing.tool === 'pen' || drawing.tool === 'highlighter') && (drawing.points || []).length < 4) return;
    if ((drawing.tool === 'rect' || drawing.tool === 'ellipse') && (Math.abs(drawing.w ?? 0) < 3 || Math.abs(drawing.h ?? 0) < 3)) return;
    if ((drawing.tool === 'line' || drawing.tool === 'arrow') && Math.hypot((drawing.x2 ?? 0) - (drawing.x1 ?? 0), (drawing.y2 ?? 0) - (drawing.y1 ?? 0)) < 3) return;
    options.pushUndo();
    options.drawings.value = [...options.drawings.value, drawing];
    options.emitOp({ type: 'draw-add', drawing });
  };

  const onDrawPointerCancel = () => {
    drawGestureStarted = false;
    drawErasing = false;
    options.draftDrawing.value = null;
  };

  return { setDrawTool, setDrawColor, setDrawWidth, toWorld, onDrawPointerDown, onDrawPointerMove, onDrawPointerUp, onDrawPointerCancel };
}
