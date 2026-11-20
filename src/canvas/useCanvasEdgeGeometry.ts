import { computed, type ComputedRef, type Ref } from 'vue';

export interface CanvasEdgeNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasEdgeModel {
  id: string;
  fromNode: string;
  fromEdge?: string;
  toNode: string;
  toSide?: string;
  fromSide?: string;
  label?: string;
  color?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  arrowType?: 'end' | 'start' | 'both' | 'none';
  thickness?: number;
  hidden?: boolean;
}

export interface RenderedCanvasEdge {
  id: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
  labelW: number;
  midX: number;
  midY: number;
  color?: string;
  dashArray?: string;
  thickness: number;
  arrowType: string;
  hidden?: boolean;
}

export function useCanvasEdgeGeometry(
  nodes: Ref<readonly CanvasEdgeNode[]>,
  edges: Ref<readonly CanvasEdgeModel[]>,
  viewerNodeIds: ComputedRef<Set<string>>,
  canViewerSee: (item: { hidden?: boolean } | null | undefined) => boolean,
) {
  const nodeMap = computed(() => new Map(nodes.value.map((node) => [node.id, node])));

  const getAnchor = (node: CanvasEdgeNode, side: string) => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    switch (side) {
      case 'top': return { x: cx, y: node.y };
      case 'bottom': return { x: cx, y: node.y + node.height };
      case 'left': return { x: node.x, y: cy };
      case 'right': return { x: node.x + node.width, y: cy };
      default: return { x: cx, y: cy };
    }
  };

  const getControlOffset = (side: string, dist: number) => {
    const offset = Math.min(Math.max(dist * 0.4, 40), 200);
    switch (side) {
      case 'top': return { dx: 0, dy: -offset };
      case 'bottom': return { dx: 0, dy: offset };
      case 'left': return { dx: -offset, dy: 0 };
      case 'right': return { dx: offset, dy: 0 };
      default: return { dx: 0, dy: 0 };
    }
  };

  const getEdgeMidpoint = (edgeId: string): { x: number; y: number } | null => {
    const edge = edges.value.find((item) => item.id === edgeId);
    if (!edge) return null;
    const from = nodeMap.value.get(edge.fromNode);
    const to = nodeMap.value.get(edge.toNode);
    if (!from || !to) return null;
    const a = getAnchor(from, edge.fromSide || 'bottom');
    const b = getAnchor(to, edge.toSide || 'top');
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const renderedEdges = computed<RenderedCanvasEdge[]>(() => edges.value.flatMap((edge) => {
    if (!canViewerSee(edge) || !viewerNodeIds.value.has(edge.toNode)) return [];
    if (!edge.fromEdge && !viewerNodeIds.value.has(edge.fromNode)) return [];

    const empty = { id: edge.id, path: '', labelX: 0, labelY: 0, labelW: 0, midX: 0, midY: 0, thickness: 2, arrowType: 'end' };
    const toNode = nodeMap.value.get(edge.toNode);
    if (!toNode) return [empty];

    let from: { x: number; y: number };
    let fromSide: string;
    if (edge.fromEdge) {
      const mid = getEdgeMidpoint(edge.fromEdge);
      if (!mid) return [empty];
      from = mid;
      const toAnchor = getAnchor(toNode, edge.toSide || 'top');
      const dx = toAnchor.x - from.x;
      const dy = toAnchor.y - from.y;
      fromSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
    } else {
      const fromNode = nodeMap.value.get(edge.fromNode);
      if (!fromNode) return [empty];
      fromSide = edge.fromSide || 'bottom';
      from = getAnchor(fromNode, fromSide);
    }

    const to = getAnchor(toNode, edge.toSide || 'top');
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const c1 = getControlOffset(fromSide, dist);
    const c2 = getControlOffset(edge.toSide || 'top', dist);
    const path = `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dashMap: Record<string, string> = { dashed: '8 4', dotted: '3 3' };
    return [{
      id: edge.id,
      path,
      label: edge.label,
      labelX: midX,
      labelY: midY - 8,
      labelW: edge.label ? edge.label.length * 7.5 : 0,
      midX,
      midY,
      color: edge.color,
      dashArray: edge.lineStyle ? dashMap[edge.lineStyle] : undefined,
      thickness: edge.thickness || 2,
      arrowType: edge.arrowType || 'end',
      hidden: edge.hidden,
    }];
  }));

  const edgeColors = computed(() => Array.from(new Set(edges.value.flatMap((edge) => edge.color ? [edge.color] : []))));
  const arrowMarkerId = (color: string | undefined, start: boolean) => {
    if (!color) return start ? 'arrowhead-start' : 'arrowhead';
    return (start ? 'arrowhead-start-' : 'arrowhead-') + color.replace('#', '');
  };

  return { nodeMap, getAnchor, getControlOffset, getEdgeMidpoint, renderedEdges, edgeColors, arrowMarkerId };
}
