import { type Ref } from 'vue';
import { applyDrawOp, type Drawing } from './drawing';
import { keepLocalOrder } from './keepLocalOrder';

export interface CanvasRemoteNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  positionLocked?: boolean;
  zIndex?: number;
}

export interface CanvasRemoteEdge {
  id: string;
  fromNode: string;
  toNode: string;
}

export type CanvasRemoteOp<N extends CanvasRemoteNode, E extends CanvasRemoteEdge> =
  | { type: 'nodes-move'; moves: { id: string; x: number; y: number }[] }
  | { type: 'node-resize'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'node-add'; node: N }
  | { type: 'node-delete'; ids: string[] }
  | { type: 'node-update'; id: string; changes: Partial<N> }
  | { type: 'edge-add'; edge: E }
  | { type: 'edge-delete'; id: string }
  | { type: 'edge-update'; id: string; changes: Partial<E> }
  | { type: 'draw-add'; drawing: Drawing }
  | { type: 'draw-remove'; id: string }
  | { type: 'draw-update'; id: string; changes: Partial<Drawing> };

export function useCanvasRemoteSync<N extends CanvasRemoteNode, E extends CanvasRemoteEdge>(options: {
  nodes: Ref<N[]>;
  edges: Ref<E[]>;
  drawings: Ref<Drawing[]>;
  rebalanceNodeLayers: () => void;
}) {
  const applyRemoteOp = (op: CanvasRemoteOp<N, E>) => {
    switch (op.type) {
      case 'nodes-move':
        for (const move of op.moves) {
          const node = options.nodes.value.find((item) => item.id === move.id);
          if (node) { node.x = move.x; node.y = move.y; }
        }
        break;
      case 'node-resize': {
        const node = options.nodes.value.find((item) => item.id === op.id);
        if (node) { node.x = op.x; node.y = op.y; node.width = op.width; node.height = op.height; }
        break;
      }
      case 'node-add':
        if (!options.nodes.value.find((item) => item.id === op.node.id)) options.nodes.value.push({ ...op.node });
        break;
      case 'node-delete': {
        const ids = new Set(op.ids);
        options.edges.value = options.edges.value.filter((edge) => !ids.has(edge.fromNode) && !ids.has(edge.toNode));
        options.nodes.value = options.nodes.value.filter((node) => !ids.has(node.id));
        break;
      }
      case 'node-update': {
        const node = options.nodes.value.find((item) => item.id === op.id);
        if (node) {
          Object.assign(node, op.changes);
          if (Object.prototype.hasOwnProperty.call(op.changes, 'positionLocked') || Object.prototype.hasOwnProperty.call(op.changes, 'zIndex')) options.rebalanceNodeLayers();
        }
        break;
      }
      case 'edge-add':
        if (!options.edges.value.find((edge) => edge.id === op.edge.id)) options.edges.value.push({ ...op.edge });
        break;
      case 'edge-delete':
        options.edges.value = options.edges.value.filter((edge) => edge.id !== op.id);
        break;
      case 'edge-update': {
        const edge = options.edges.value.find((item) => item.id === op.id);
        if (edge) Object.assign(edge, op.changes);
        break;
      }
      case 'draw-add':
      case 'draw-remove':
      case 'draw-update':
        options.drawings.value = applyDrawOp(options.drawings.value, op);
        break;
    }
  };

  const applyRemoteData = (data: { nodes: N[]; edges: E[]; drawings?: Drawing[] }) => {
    options.nodes.value = keepLocalOrder(options.nodes.value, data.nodes || []);
    options.edges.value = keepLocalOrder(options.edges.value, data.edges || []);
    options.drawings.value = data.drawings || [];
  };

  return { applyRemoteOp, applyRemoteData };
}
