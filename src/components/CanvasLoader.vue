<template>
  <div
    class="canvas-viewport"
    ref="viewport"
    @wheel.prevent="onWheel"
    @mousedown="onPanStart"
    @mousemove="onPanMove"
    @mouseup="onPanEnd"
    @mouseleave="onPanEnd"
    @touchstart.prevent="onTouchStart"
    @touchmove.prevent="onTouchMove"
    @touchend="onTouchEnd"
    @dblclick="onCanvasDblClick"
  >
    <div class="canvas-world" :style="worldStyle">
      <!-- Groups (rendered behind everything) -->
      <div
        v-for="group in groups"
        :key="group.id"
        class="canvas-group"
        :class="groupColorClass(group)"
        :style="nodePosition(group)"
      >
        <span v-if="group.label" class="group-label">{{ group.label }}</span>
      </div>

      <!-- Edges (SVG layer) -->
      <svg class="canvas-edges" :style="edgesSvgStyle">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.35)" />
          </marker>
        </defs>
        <g :transform="edgesSvgTransform">
          <g v-for="edge in renderedEdges" :key="edge.id">
            <!-- Invisible wide hit area for clicking -->
            <path
              :d="edge.path"
              class="edge-hit"
              @mousedown.stop="onEdgeClick(edge.id)"
              @dblclick.stop="onEdgeDblClick(edge.id)"
            />
            <path
              :d="edge.path"
              class="edge-line"
              :class="{ 'edge-selected': selectedEdgeId === edge.id }"
              :style="{
                stroke: edge.color || undefined,
                strokeWidth: edge.thickness,
                strokeDasharray: edge.dashArray || undefined,
              }"
              marker-end="url(#arrowhead)"
            />
            <!-- Label on edge -->
            <g v-if="edge.label && editingEdgeId !== edge.id" class="edge-label-group">
              <rect
                :x="edge.labelX - edge.labelW / 2 - 8"
                :y="edge.labelY - 12"
                :width="edge.labelW + 16"
                :height="24"
                rx="4"
                class="edge-label-bg"
              />
              <text
                :x="edge.labelX"
                :y="edge.labelY + 4"
                class="edge-label"
              >{{ edge.label }}</text>
            </g>
          </g>
          <!-- Temporary edge while creating connection -->
          <path
            v-if="connDragging && tempEdgePath"
            :d="tempEdgePath"
            class="edge-line edge-temp"
          />
        </g>
      </svg>

      <!-- Edge action buttons (DOM overlay) -->
      <div
        v-if="selectedEdgeId && selectedEdgeMidpoint"
        class="edge-actions"
        :style="{ left: selectedEdgeMidpoint.x + 'px', top: selectedEdgeMidpoint.y + 'px' }"
      >
        <button class="edge-action-btn edge-delete-btn" @mousedown.stop="onDeleteEdge" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
        <button class="edge-action-btn edge-label-btn" @mousedown.stop="onEdgeDblClick(selectedEdgeId!)" title="Add label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button class="edge-action-btn" @mousedown.stop="onEdgeToggleStyle" title="Toggle style">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="7" y2="12"/><line x1="10" y1="12" x2="14" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/>
          </svg>
        </button>
        <button class="edge-action-btn" @mousedown.stop="onEdgeCycleColor" title="Change color">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <!-- Edge label editor (DOM overlay) -->
      <div
        v-if="editingEdgeId && editingEdgeMidpoint"
        class="edge-label-editor"
        :style="{ left: editingEdgeMidpoint.x + 'px', top: editingEdgeMidpoint.y + 'px' }"
      >
        <input
          ref="edgeLabelInput"
          class="edge-label-input"
          :value="editingEdgeLabel"
          @input="onEdgeLabelInput"
          @blur="onEdgeLabelEnd"
          @keydown.enter="onEdgeLabelEnd"
          @keydown.escape="onEdgeLabelEnd"
          placeholder="Label..."
          @mousedown.stop
        />
      </div>

      <!-- Selection box -->
      <div v-if="selBox.active" class="selection-box" :style="selBoxStyle"></div>

      <!-- Context menu -->
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @mousedown.stop
      >
        <div class="ctx-colors">
          <button
            v-for="c in ['1','2','3','4','5','6']"
            :key="c"
            class="ctx-color-btn"
            :class="'ctx-color-' + c"
            :title="'Color ' + c"
            @click="onCtxSetColor(c)"
          ></button>
          <button class="ctx-color-btn ctx-color-none" title="No color" @click="onCtxSetColor(undefined)">✕</button>
        </div>
        <button class="ctx-item" @click="onCtxDuplicate">Duplicate</button>
        <button class="ctx-item ctx-item-danger" @click="onCtxDelete">Delete</button>
      </div>

      <!-- Text nodes -->
      <div
        v-for="node in textNodes"
        :key="node.id"
        class="canvas-node"
        :class="[nodeColorClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id) }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
        @dblclick.stop="onNodeDblClick(node)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
      >
        <!-- Edit mode -->
        <textarea
          v-if="editingNodeId === node.id"
          class="node-editor"
          :value="node.text"
          @input="onEditInput($event, node)"
          @blur="onEditEnd"
          @keydown.escape="onEditEnd"
          ref="editorRefs"
        ></textarea>
        <!-- View mode -->
        <div v-else class="node-content" v-html="renderMarkdown(node.text || '')"></div>
        <!-- Resize handles (visible when selected) -->
        <template v-if="isNodeSelected(node.id) && editingNodeId !== node.id">
          <div class="resize-handle resize-handle-br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
          <div class="resize-handle resize-handle-bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
          <div class="resize-handle resize-handle-tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
          <div class="resize-handle resize-handle-tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
          <div class="resize-handle resize-handle-r" @mousedown.stop="onResizeStart($event, node, 'r')"></div>
          <div class="resize-handle resize-handle-l" @mousedown.stop="onResizeStart($event, node, 'l')"></div>
          <div class="resize-handle resize-handle-t" @mousedown.stop="onResizeStart($event, node, 't')"></div>
          <div class="resize-handle resize-handle-b" @mousedown.stop="onResizeStart($event, node, 'b')"></div>
        </template>
        <!-- Connection points (visible on hover) -->
        <div class="conn-point conn-top" @mousedown.stop="onConnStart($event, node, 'top')"></div>
        <div class="conn-point conn-bottom" @mousedown.stop="onConnStart($event, node, 'bottom')"></div>
        <div class="conn-point conn-left" @mousedown.stop="onConnStart($event, node, 'left')"></div>
        <div class="conn-point conn-right" @mousedown.stop="onConnStart($event, node, 'right')"></div>
      </div>

      <!-- Link nodes -->
      <div
        v-for="node in linkNodes"
        :key="node.id"
        class="canvas-node canvas-node-link"
        :class="{ 'is-dragging': dragNodeId === node.id }"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
      >
        <div class="node-link-header">
          <a :href="node.url" target="_blank" rel="noopener">{{ node.url }}</a>
        </div>
      </div>
    </div>

    <!-- Zoom controls -->
    <div class="canvas-controls">
      <button @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ zoomPercent }}%</span>
      <button @click="zoomOut" title="Zoom out">−</button>
      <button @click="resetView" title="Reset view">⌂</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, reactive, nextTick } from "vue";
import { marked } from "marked";

interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  url?: string;
  file?: string;
  color?: string;
  label?: string;
  styleAttributes?: Record<string, string>;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  thickness?: number;
  styleAttributes?: Record<string, string>;
}

interface RenderedEdge {
  id: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
  labelW: number;
  color?: string;
  dashArray?: string;
  thickness: number;
}

// Obsidian color palette
const OBSIDIAN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "1": { bg: "rgba(251,70,76,0.15)", border: "#fb464c", text: "#fb464c" },
  "2": { bg: "rgba(233,151,63,0.15)", border: "#e9973f", text: "#e9973f" },
  "3": { bg: "rgba(224,222,113,0.15)", border: "#e0de71", text: "#e0de71" },
  "4": { bg: "rgba(68,207,110,0.15)", border: "#44cf6e", text: "#44cf6e" },
  "5": { bg: "rgba(83,223,221,0.15)", border: "#53dfdd", text: "#53dfdd" },
  "6": { bg: "rgba(168,130,255,0.15)", border: "#a882ff", text: "#a882ff" },
};

export default defineComponent({
  name: "CanvasLoader",
  setup() {
    const viewport = ref<HTMLDivElement | null>(null);
    const nodes = ref<CanvasNode[]>([]);
    const edges = ref<CanvasEdge[]>([]);

    // Pan & zoom state
    const camera = reactive({
      x: 0,
      y: 0,
      scale: 1,
    });
    const isPanning = ref(false);
    const panStart = reactive({ x: 0, y: 0 });
    const cameraStart = reactive({ x: 0, y: 0 });

    // Touch state
    const lastTouchDist = ref(0);
    const lastTouchCenter = reactive({ x: 0, y: 0 });

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    const loadCanvas = async () => {
      try {
        const response = await fetch("/product_decomposition.canvas");
        const data = await response.json();
        nodes.value = data.nodes || [];
        edges.value = data.edges || [];
        fitToContent();
      } catch (e) {
        console.error("Failed to load canvas:", e);
      }
    };

    // Fit all content in view
    const fitToContent = () => {
      if (!nodes.value.length || !viewport.value) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes.value) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }

      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const vw = viewport.value.clientWidth;
      const vh = viewport.value.clientHeight;

      const padding = 80;
      const scaleX = (vw - padding * 2) / contentW;
      const scaleY = (vh - padding * 2) / contentH;
      camera.scale = Math.min(scaleX, scaleY, 1);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      camera.x = vw / 2 - centerX * camera.scale;
      camera.y = vh / 2 - centerY * camera.scale;
    };

    // Computed styles
    const worldStyle = computed(() => ({
      transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
      transformOrigin: "0 0",
    }));

    const zoomPercent = computed(() => Math.round(camera.scale * 100));

    // Node filtering
    const groups = computed(() => nodes.value.filter((n) => n.type === "group"));
    const textNodes = computed(() => nodes.value.filter((n) => n.type === "text"));
    const linkNodes = computed(() => nodes.value.filter((n) => n.type === "link"));

    // Bounding box for SVG edges — explicit position & size
    const contentBounds = computed(() => {
      if (!nodes.value.length) return { minX: 0, minY: 0, w: 1, h: 1 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes.value) {
        minX = Math.min(minX, n.x - 200);
        minY = Math.min(minY, n.y - 200);
        maxX = Math.max(maxX, n.x + n.width + 200);
        maxY = Math.max(maxY, n.y + n.height + 200);
      }
      return { minX, minY, w: maxX - minX, h: maxY - minY };
    });

    const edgesSvgStyle = computed(() => {
      const b = contentBounds.value;
      return {
        position: "absolute" as const,
        left: `${b.minX}px`,
        top: `${b.minY}px`,
        width: `${b.w}px`,
        height: `${b.h}px`,
        overflow: "visible" as const,
      };
    });

    const edgesSvgTransform = computed(() => {
      const b = contentBounds.value;
      return `translate(${-b.minX}, ${-b.minY})`;
    });

    // Build a node map for edge lookups
    const nodeMap = computed(() => {
      const map = new Map<string, CanvasNode>();
      for (const n of nodes.value) map.set(n.id, n);
      return map;
    });

    // Get connection point on a node's side
    const getAnchor = (node: CanvasNode, side: string) => {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      switch (side) {
        case "top": return { x: cx, y: node.y };
        case "bottom": return { x: cx, y: node.y + node.height };
        case "left": return { x: node.x, y: cy };
        case "right": return { x: node.x + node.width, y: cy };
        default: return { x: cx, y: cy };
      }
    };

    // Control point offset for bezier curves
    const getControlOffset = (side: string, dist: number) => {
      const offset = Math.min(Math.max(dist * 0.4, 40), 200);
      switch (side) {
        case "top": return { dx: 0, dy: -offset };
        case "bottom": return { dx: 0, dy: offset };
        case "left": return { dx: -offset, dy: 0 };
        case "right": return { dx: offset, dy: 0 };
        default: return { dx: 0, dy: 0 };
      }
    };

    const renderedEdges = computed<RenderedEdge[]>(() => {
      return edges.value.map((edge) => {
        const fromNode = nodeMap.value.get(edge.fromNode);
        const toNode = nodeMap.value.get(edge.toNode);
        if (!fromNode || !toNode) {
          return { id: edge.id, path: "", labelX: 0, labelY: 0, labelW: 0, thickness: 2 };
        }

        const fromSide = edge.fromSide || "bottom";
        const toSide = edge.toSide || "top";
        const from = getAnchor(fromNode, fromSide);
        const to = getAnchor(toNode, toSide);

        const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
        const c1 = getControlOffset(fromSide, dist);
        const c2 = getControlOffset(toSide, dist);

        const path = `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;

        const thickness = edge.thickness || 2;
        const dashMap: Record<string, string> = { dashed: "8 4", dotted: "3 3" };
        return {
          id: edge.id,
          path,
          label: edge.label,
          labelX: (from.x + to.x) / 2,
          labelY: (from.y + to.y) / 2 - 8,
          labelW: edge.label ? edge.label.length * 7.5 : 0,
          color: edge.color,
          dashArray: edge.lineStyle ? dashMap[edge.lineStyle] : undefined,
          thickness,
        };
      });
    });

    // Style helpers
    const nodePosition = (node: CanvasNode) => ({
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width}px`,
      height: `${node.height}px`,
    });

    const nodeColorClass = (node: CanvasNode) => {
      return node.color ? `node-color-${node.color}` : "";
    };

    const groupColorClass = (node: CanvasNode) => {
      return node.color ? `group-color-${node.color}` : "";
    };

    // Callout types and their colors/icons
    const CALLOUT_STYLES: Record<string, { icon: string; color: string }> = {
      note: { icon: "📝", color: "#7c8aff" },
      tip: { icon: "💡", color: "#44cf6e" },
      warning: { icon: "⚠️", color: "#e9973f" },
      danger: { icon: "🔴", color: "#fb464c" },
      info: { icon: "ℹ️", color: "#53dfdd" },
      success: { icon: "✅", color: "#44cf6e" },
      question: { icon: "❓", color: "#e0de71" },
      bug: { icon: "🐛", color: "#fb464c" },
      example: { icon: "📋", color: "#a882ff" },
      quote: { icon: "💬", color: "#999" },
      abstract: { icon: "📄", color: "#53dfdd" },
      todo: { icon: "☑️", color: "#7c8aff" },
      failure: { icon: "❌", color: "#fb464c" },
      important: { icon: "🔥", color: "#e9973f" },
    };

    const processCallouts = (html: string): string => {
      // Match blockquotes that start with [!type]
      return html.replace(
        /<blockquote>\s*<p>\s*\[!([\w-]+)\]\s*(.*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
        (_match, type: string, title: string, body: string) => {
          const key = type.toLowerCase();
          const style = CALLOUT_STYLES[key] || CALLOUT_STYLES.note;
          const displayTitle = title.trim() || key.charAt(0).toUpperCase() + key.slice(1);
          return `<div class="callout callout-${key}" style="border-left-color: ${style.color}">
            <div class="callout-title" style="color: ${style.color}">${style.icon} ${displayTitle}</div>
            <div class="callout-body">${body}</div>
          </div>`;
        }
      );
    };

    const renderMarkdown = (text: string) => {
      const html = marked.parse(text) as string;
      return processCallouts(html);
    };

    // Selection state (multi-select)
    const selectedNodeIds = ref<string[]>([]);
    // Convenience: single selected node ID (for backwards compat in template)
    const selectedNodeId = computed(() => selectedNodeIds.value.length === 1 ? selectedNodeIds.value[0] : null);

    const isNodeSelected = (id: string) => selectedNodeIds.value.includes(id);

    // Selection box state
    const selBox = reactive({ active: false, startX: 0, startY: 0, curX: 0, curY: 0 });
    const selBoxStyle = computed(() => {
      if (!selBox.active) return { display: "none" };
      const x1 = Math.min(selBox.startX, selBox.curX);
      const y1 = Math.min(selBox.startY, selBox.curY);
      const x2 = Math.max(selBox.startX, selBox.curX);
      const y2 = Math.max(selBox.startY, selBox.curY);
      return {
        display: "block",
        left: `${x1}px`,
        top: `${y1}px`,
        width: `${x2 - x1}px`,
        height: `${y2 - y1}px`,
      };
    });

    // Editing state
    const editingNodeId = ref<string | null>(null);
    const editorRefs = ref<HTMLTextAreaElement[]>([]);

    // Drag node state
    const dragNodeId = ref<string | null>(null);
    const dragMouseStart = reactive({ x: 0, y: 0 });

    // Resize state
    const resizeNodeId = ref<string | null>(null);
    const resizeHandle = ref<string>("");
    const resizeStart = reactive({ x: 0, y: 0, nodeX: 0, nodeY: 0, nodeW: 0, nodeH: 0 });
    const MIN_NODE_SIZE = 60;
    const GRID_SIZE = 24;
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

    // Node drag handlers
    // Store initial positions of all dragged nodes for multi-drag
    const dragNodesInitial = ref<Map<string, { x: number; y: number }>>(new Map());

    const onNodeDragStart = (e: MouseEvent, node: CanvasNode) => {
      if (resizeNodeId.value) return;
      // Shift/Ctrl click: toggle selection
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const idx = selectedNodeIds.value.indexOf(node.id);
        if (idx >= 0) {
          selectedNodeIds.value.splice(idx, 1);
        } else {
          selectedNodeIds.value.push(node.id);
        }
        return;
      }
      // If clicking a node that's not in selection, replace selection
      if (!selectedNodeIds.value.includes(node.id)) {
        selectedNodeIds.value = [node.id];
      }
      pushUndo();
      dragNodeId.value = node.id;
      dragMouseStart.x = e.clientX;
      dragMouseStart.y = e.clientY;
      // Store initial positions of all selected nodes
      dragNodesInitial.value = new Map();
      for (const id of selectedNodeIds.value) {
        const n = nodes.value.find((nd) => nd.id === id);
        if (n) dragNodesInitial.value.set(id, { x: n.x, y: n.y });
      }
    };

    // Double-click to edit text
    const onNodeDblClick = (node: CanvasNode) => {
      if (node.type !== "text") return;
      editingNodeId.value = node.id;
      nextTick(() => {
        const textarea = editorRefs.value?.[0];
        if (textarea) textarea.focus();
      });
    };

    const onEditInput = (e: Event, node: CanvasNode) => {
      node.text = (e.target as HTMLTextAreaElement).value;
    };

    const onEditEnd = () => {
      editingNodeId.value = null;
    };

    // Resize handlers
    const onResizeStart = (e: MouseEvent, node: CanvasNode, handle: string) => {
      resizeNodeId.value = node.id;
      resizeHandle.value = handle;
      resizeStart.x = e.clientX;
      resizeStart.y = e.clientY;
      resizeStart.nodeX = node.x;
      resizeStart.nodeY = node.y;
      resizeStart.nodeW = node.width;
      resizeStart.nodeH = node.height;
    };

    // Edge selection
    const selectedEdgeId = ref<string | null>(null);

    const onEdgeClick = (edgeId: string) => {
      selectedEdgeId.value = edgeId;
      selectedNodeIds.value = [];
    };

    const onDeleteEdge = () => {
      if (!selectedEdgeId.value) return;
      edges.value = edges.value.filter((ed) => ed.id !== selectedEdgeId.value);
      selectedEdgeId.value = null;
    };

    // Midpoint of the selected edge (for positioning action buttons)
    const selectedEdgeMidpoint = computed(() => {
      if (!selectedEdgeId.value) return null;
      const re = renderedEdges.value.find((e) => e.id === selectedEdgeId.value);
      if (!re) return null;
      return { x: re.labelX, y: re.labelY - 24 };
    });

    // Edge label editing
    const editingEdgeId = ref<string | null>(null);
    const editingEdgeLabel = ref("");
    const edgeLabelInput = ref<HTMLInputElement | null>(null);

    const editingEdgeMidpoint = computed(() => {
      if (!editingEdgeId.value) return null;
      const re = renderedEdges.value.find((e) => e.id === editingEdgeId.value);
      if (!re) return null;
      return { x: re.labelX, y: re.labelY };
    });

    const onEdgeDblClick = (edgeId: string) => {
      const edge = edges.value.find((e) => e.id === edgeId);
      if (!edge) return;
      editingEdgeId.value = edgeId;
      editingEdgeLabel.value = edge.label || "";
      selectedEdgeId.value = null;
      nextTick(() => {
        edgeLabelInput.value?.focus();
      });
    };

    const onEdgeLabelInput = (e: Event) => {
      editingEdgeLabel.value = (e.target as HTMLInputElement).value;
      const edge = edges.value.find((ed) => ed.id === editingEdgeId.value);
      if (edge) edge.label = editingEdgeLabel.value || undefined;
    };

    const onEdgeLabelEnd = () => {
      editingEdgeId.value = null;
    };

    // Edge style cycling
    const EDGE_COLORS = [undefined, "#fb464c", "#e9973f", "#e0de71", "#44cf6e", "#53dfdd", "#a882ff"];
    const LINE_STYLES: Array<"solid" | "dashed" | "dotted"> = ["solid", "dashed", "dotted"];

    const onEdgeToggleStyle = () => {
      const edge = edges.value.find((e) => e.id === selectedEdgeId.value);
      if (!edge) return;
      const current = edge.lineStyle || "solid";
      const idx = LINE_STYLES.indexOf(current);
      edge.lineStyle = LINE_STYLES[(idx + 1) % LINE_STYLES.length];
    };

    const onEdgeCycleColor = () => {
      const edge = edges.value.find((e) => e.id === selectedEdgeId.value);
      if (!edge) return;
      const idx = EDGE_COLORS.indexOf(edge.color);
      edge.color = EDGE_COLORS[(idx + 1) % EDGE_COLORS.length];
    };

    // Connection (edge creation) state
    const connDragging = ref(false);
    const connFromNode = ref<string>("");
    const connFromSide = ref<string>("");
    const connMouseWorld = reactive({ x: 0, y: 0 });

    const onConnStart = (e: MouseEvent, node: CanvasNode, side: string) => {
      connDragging.value = true;
      connFromNode.value = node.id;
      connFromSide.value = side;
      // Set initial mouse position in world coords
      const rect = viewport.value!.getBoundingClientRect();
      connMouseWorld.x = (e.clientX - rect.left - camera.x) / camera.scale;
      connMouseWorld.y = (e.clientY - rect.top - camera.y) / camera.scale;
    };

    // Temp edge path while dragging
    const tempEdgePath = computed(() => {
      if (!connDragging.value) return "";
      const fromNode = nodeMap.value.get(connFromNode.value);
      if (!fromNode) return "";
      const from = getAnchor(fromNode, connFromSide.value);
      const to = connMouseWorld;
      const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
      const c1 = getControlOffset(connFromSide.value, dist);
      // Guess toSide based on direction
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const guessedSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "left" : "right") : (dy > 0 ? "top" : "bottom");
      const c2 = getControlOffset(guessedSide, dist);
      return `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;
    });

    // Find which node is under the mouse (world coords)
    const findNodeAt = (wx: number, wy: number): { node: CanvasNode; side: string } | null => {
      for (const n of nodes.value) {
        if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) {
          // Determine closest side
          const cx = n.x + n.width / 2;
          const cy = n.y + n.height / 2;
          const relX = (wx - cx) / (n.width / 2);
          const relY = (wy - cy) / (n.height / 2);
          let side: string;
          if (Math.abs(relX) > Math.abs(relY)) {
            side = relX > 0 ? "right" : "left";
          } else {
            side = relY > 0 ? "bottom" : "top";
          }
          return { node: n, side };
        }
      }
      return null;
    };

    // Generate unique ID
    const genId = () => Math.random().toString(36).substring(2, 18);

    // Create node on double-click on empty canvas
    const onCanvasDblClick = (e: MouseEvent) => {
      const rect = viewport.value!.getBoundingClientRect();
      const wx = (e.clientX - rect.left - camera.x) / camera.scale;
      const wy = (e.clientY - rect.top - camera.y) / camera.scale;
      const newNode: CanvasNode = {
        id: genId(),
        type: "text",
        x: wx - 125,
        y: wy - 30,
        width: 250,
        height: 60,
        text: "",
      };
      pushUndo();
      nodes.value.push(newNode);
      selectedNodeIds.value = [newNode.id];
      editingNodeId.value = newNode.id;
      nextTick(() => {
        const textarea = editorRefs.value?.[0];
        if (textarea) textarea.focus();
      });
    };

    // Context menu state
    const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeId: "" });

    const onNodeContextMenu = (e: MouseEvent, node: CanvasNode) => {
      selectedNodeIds.value = [node.id];
      // Position in world coords (same as nodes)
      const rect = viewport.value!.getBoundingClientRect();
      const wx = (e.clientX - rect.left - camera.x) / camera.scale;
      const wy = (e.clientY - rect.top - camera.y) / camera.scale;
      contextMenu.x = wx;
      contextMenu.y = wy;
      contextMenu.nodeId = node.id;
      contextMenu.visible = true;
    };

    const closeContextMenu = () => { contextMenu.visible = false; };

    const onCtxSetColor = (color: string | undefined) => {
      const node = nodes.value.find((n) => n.id === contextMenu.nodeId);
      if (node) node.color = color;
      closeContextMenu();
    };

    const onCtxDuplicate = () => {
      const node = nodes.value.find((n) => n.id === contextMenu.nodeId);
      if (!node) return;
      pushUndo();
      const clone: CanvasNode = { ...node, id: genId(), x: node.x + 30, y: node.y + 30 };
      nodes.value.push(clone);
      selectedNodeIds.value = [clone.id];
      closeContextMenu();
    };

    const onCtxDelete = () => {
      pushUndo();
      const id = contextMenu.nodeId;
      edges.value = edges.value.filter((ed) => ed.fromNode !== id && ed.toNode !== id);
      nodes.value = nodes.value.filter((n) => n.id !== id);
      selectedNodeIds.value = [];
      closeContextMenu();
    };

    // Undo/redo history
    interface Snapshot { nodes: string; edges: string; }
    const undoStack = ref<Snapshot[]>([]);
    const redoStack = ref<Snapshot[]>([]);
    const MAX_HISTORY = 50;

    const takeSnapshot = (): Snapshot => ({
      nodes: JSON.stringify(nodes.value),
      edges: JSON.stringify(edges.value),
    });

    const pushUndo = () => {
      undoStack.value.push(takeSnapshot());
      if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
      redoStack.value = [];
    };

    const undo = () => {
      if (!undoStack.value.length) return;
      redoStack.value.push(takeSnapshot());
      const snap = undoStack.value.pop()!;
      nodes.value = JSON.parse(snap.nodes);
      edges.value = JSON.parse(snap.edges);
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
    };

    const redo = () => {
      if (!redoStack.value.length) return;
      undoStack.value.push(takeSnapshot());
      const snap = redoStack.value.pop()!;
      nodes.value = JSON.parse(snap.nodes);
      edges.value = JSON.parse(snap.edges);
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
    };

    // Clipboard for copy/paste
    const clipboard = ref<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>({ nodes: [], edges: [] });

    // Delete edge or node on keydown
    const onKeyDown = (e: KeyboardEvent) => {
      // Undo/redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedNodeIds.value.length > 0) {
        const ids = new Set(selectedNodeIds.value);
        clipboard.value = {
          nodes: nodes.value.filter((n) => ids.has(n.id)).map((n) => ({ ...n })),
          edges: edges.value.filter((ed) => ids.has(ed.fromNode) && ids.has(ed.toNode)).map((ed) => ({ ...ed })),
        };
        return;
      }
      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboard.value.nodes.length > 0) {
        e.preventDefault();
        pushUndo();
        const idMap = new Map<string, string>();
        const newNodes: CanvasNode[] = clipboard.value.nodes.map((n) => {
          const newId = genId();
          idMap.set(n.id, newId);
          return { ...n, id: newId, x: n.x + 40, y: n.y + 40 };
        });
        const newEdges: CanvasEdge[] = clipboard.value.edges.map((ed) => ({
          ...ed,
          id: genId(),
          fromNode: idMap.get(ed.fromNode) || ed.fromNode,
          toNode: idMap.get(ed.toNode) || ed.toNode,
        }));
        nodes.value.push(...newNodes);
        edges.value.push(...newEdges);
        selectedNodeIds.value = newNodes.map((n) => n.id);
        // Update clipboard positions for next paste
        clipboard.value.nodes = clipboard.value.nodes.map((n) => ({ ...n, x: n.x + 40, y: n.y + 40 }));
        return;
      }
      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectedNodeIds.value = nodes.value.map((n) => n.id);
        return;
      }
      // Escape — deselect
      if (e.key === "Escape") {
        selectedNodeIds.value = [];
        selectedEdgeId.value = null;
        return;
      }
      if (editingNodeId.value || editingEdgeId.value) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEdgeId.value) {
          pushUndo();
          edges.value = edges.value.filter((ed) => ed.id !== selectedEdgeId.value);
          selectedEdgeId.value = null;
          e.preventDefault();
        } else if (selectedNodeIds.value.length > 0) {
          pushUndo();
          const ids = new Set(selectedNodeIds.value);
          edges.value = edges.value.filter((ed) => !ids.has(ed.fromNode) && !ids.has(ed.toNode));
          nodes.value = nodes.value.filter((n) => !ids.has(n.id));
          selectedNodeIds.value = [];
          e.preventDefault();
        }
      }
    };

    // Pan handlers
    const onPanStart = (e: MouseEvent) => {
      if (dragNodeId.value || connDragging.value) return;
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        selectedNodeIds.value = [];
      }
      selectedEdgeId.value = null;
      if (editingNodeId.value) editingNodeId.value = null;
      if (contextMenu.visible) closeContextMenu();

      // Middle button or space held → always pan. Left button → selection box.
      if (e.button === 1) {
        isPanning.value = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
        return;
      }
      // Left button on empty space: start selection box
      const rect = viewport.value!.getBoundingClientRect();
      const wx = (e.clientX - rect.left - camera.x) / camera.scale;
      const wy = (e.clientY - rect.top - camera.y) / camera.scale;
      selBox.active = true;
      selBox.startX = wx;
      selBox.startY = wy;
      selBox.curX = wx;
      selBox.curY = wy;
    };

    const onPanMove = (e: MouseEvent) => {
      // Edge creation dragging
      if (connDragging.value) {
        const rect = viewport.value!.getBoundingClientRect();
        connMouseWorld.x = (e.clientX - rect.left - camera.x) / camera.scale;
        connMouseWorld.y = (e.clientY - rect.top - camera.y) / camera.scale;
        return;
      }
      // Node resizing
      if (resizeNodeId.value) {
        const node = nodes.value.find((n) => n.id === resizeNodeId.value);
        if (!node) return;
        const dx = (e.clientX - resizeStart.x) / camera.scale;
        const dy = (e.clientY - resizeStart.y) / camera.scale;
        const h = resizeHandle.value;

        if (h.includes("r")) {
          node.width = snap(Math.max(MIN_NODE_SIZE, resizeStart.nodeW + dx));
        }
        if (h.includes("b")) {
          node.height = snap(Math.max(MIN_NODE_SIZE, resizeStart.nodeH + dy));
        }
        if (h.includes("l")) {
          const newW = snap(Math.max(MIN_NODE_SIZE, resizeStart.nodeW - dx));
          node.x = resizeStart.nodeX + resizeStart.nodeW - newW;
          node.width = newW;
        }
        if (h.includes("t")) {
          const newH = snap(Math.max(MIN_NODE_SIZE, resizeStart.nodeH - dy));
          node.y = resizeStart.nodeY + resizeStart.nodeH - newH;
          node.height = newH;
        }
        return;
      }
      // Node dragging (multi-drag)
      if (dragNodeId.value) {
        const dx = (e.clientX - dragMouseStart.x) / camera.scale;
        const dy = (e.clientY - dragMouseStart.y) / camera.scale;
        for (const [id, init] of dragNodesInitial.value) {
          const node = nodes.value.find((n) => n.id === id);
          if (node) {
            node.x = snap(init.x + dx);
            node.y = snap(init.y + dy);
          }
        }
        return;
      }
      // Selection box dragging
      if (selBox.active) {
        const rect = viewport.value!.getBoundingClientRect();
        selBox.curX = (e.clientX - rect.left - camera.x) / camera.scale;
        selBox.curY = (e.clientY - rect.top - camera.y) / camera.scale;
        return;
      }
      // Canvas panning
      if (!isPanning.value) return;
      camera.x = cameraStart.x + (e.clientX - panStart.x);
      camera.y = cameraStart.y + (e.clientY - panStart.y);
    };

    const onPanEnd = (e: MouseEvent) => {
      // Finish edge creation
      if (connDragging.value) {
        const rect = viewport.value!.getBoundingClientRect();
        const wx = (e.clientX - rect.left - camera.x) / camera.scale;
        const wy = (e.clientY - rect.top - camera.y) / camera.scale;
        const target = findNodeAt(wx, wy);
        if (target && target.node.id !== connFromNode.value) {
          pushUndo();
          edges.value.push({
            id: genId(),
            fromNode: connFromNode.value,
            fromSide: connFromSide.value,
            toNode: target.node.id,
            toSide: target.side,
          });
        }
        connDragging.value = false;
        return;
      }
      // Finish selection box
      if (selBox.active) {
        const x1 = Math.min(selBox.startX, selBox.curX);
        const y1 = Math.min(selBox.startY, selBox.curY);
        const x2 = Math.max(selBox.startX, selBox.curX);
        const y2 = Math.max(selBox.startY, selBox.curY);
        // Only select if box is bigger than a tiny drag (avoid deselect on click)
        if (x2 - x1 > 5 || y2 - y1 > 5) {
          const hits = nodes.value.filter((n) =>
            n.x + n.width > x1 && n.x < x2 && n.y + n.height > y1 && n.y < y2
          ).map((n) => n.id);
          selectedNodeIds.value = hits;
        }
        selBox.active = false;
      }
      isPanning.value = false;
      dragNodeId.value = null;
      resizeNodeId.value = null;
    };

    // Zoom handler
    const onWheel = (e: WheelEvent) => {
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.05, Math.min(5, camera.scale * zoomFactor));

      // Zoom toward mouse pointer
      const rect = viewport.value!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      camera.x = mx - (mx - camera.x) * (newScale / camera.scale);
      camera.y = my - (my - camera.y) * (newScale / camera.scale);
      camera.scale = newScale;
    };

    // Touch handlers
    const getTouchDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (e: TouchEvent) => {
      if (e.touches.length < 2) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isPanning.value = true;
        panStart.x = e.touches[0].clientX;
        panStart.y = e.touches[0].clientY;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
      } else if (e.touches.length === 2) {
        lastTouchDist.value = getTouchDist(e);
        const c = getTouchCenter(e);
        lastTouchCenter.x = c.x;
        lastTouchCenter.y = c.y;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isPanning.value) {
        camera.x = cameraStart.x + (e.touches[0].clientX - panStart.x);
        camera.y = cameraStart.y + (e.touches[0].clientY - panStart.y);
      } else if (e.touches.length === 2) {
        const dist = getTouchDist(e);
        const center = getTouchCenter(e);
        if (lastTouchDist.value > 0) {
          const zoomFactor = dist / lastTouchDist.value;
          const newScale = Math.max(0.05, Math.min(5, camera.scale * zoomFactor));

          const rect = viewport.value!.getBoundingClientRect();
          const mx = center.x - rect.left;
          const my = center.y - rect.top;
          camera.x = mx - (mx - camera.x) * (newScale / camera.scale);
          camera.y = my - (my - camera.y) * (newScale / camera.scale);
          camera.scale = newScale;
        }
        // Pan with two fingers
        camera.x += center.x - lastTouchCenter.x;
        camera.y += center.y - lastTouchCenter.y;

        lastTouchDist.value = dist;
        lastTouchCenter.x = center.x;
        lastTouchCenter.y = center.y;
      }
    };

    const onTouchEnd = () => {
      isPanning.value = false;
      lastTouchDist.value = 0;
    };

    // Zoom controls
    const zoomIn = () => {
      const vw = viewport.value!.clientWidth / 2;
      const vh = viewport.value!.clientHeight / 2;
      const newScale = Math.min(5, camera.scale * 1.2);
      camera.x = vw - (vw - camera.x) * (newScale / camera.scale);
      camera.y = vh - (vh - camera.y) * (newScale / camera.scale);
      camera.scale = newScale;
    };

    const zoomOut = () => {
      const vw = viewport.value!.clientWidth / 2;
      const vh = viewport.value!.clientHeight / 2;
      const newScale = Math.max(0.05, camera.scale / 1.2);
      camera.x = vw - (vw - camera.x) * (newScale / camera.scale);
      camera.y = vh - (vh - camera.y) * (newScale / camera.scale);
      camera.scale = newScale;
    };

    const resetView = () => fitToContent();

    onMounted(() => {
      loadCanvas();
      window.addEventListener("resize", fitToContent);
      window.addEventListener("keydown", onKeyDown);
    });

    return {
      viewport,
      worldStyle,
      zoomPercent,
      groups,
      textNodes,
      linkNodes,
      edgesSvgStyle,
      edgesSvgTransform,
      renderedEdges,
      nodePosition,
      nodeColorClass,
      groupColorClass,
      renderMarkdown,
      selectedNodeId,
      selectedNodeIds,
      isNodeSelected,
      selBoxStyle,
      selBox,
      editingNodeId,
      editorRefs,
      dragNodeId,
      onNodeDragStart,
      onNodeDblClick,
      onEditInput,
      onEditEnd,
      onResizeStart,
      selectedEdgeId,
      selectedEdgeMidpoint,
      onEdgeClick,
      onDeleteEdge,
      editingEdgeId,
      editingEdgeLabel,
      editingEdgeMidpoint,
      edgeLabelInput,
      onEdgeDblClick,
      onEdgeLabelInput,
      onEdgeLabelEnd,
      onEdgeToggleStyle,
      onEdgeCycleColor,
      onCanvasDblClick,
      contextMenu,
      onNodeContextMenu,
      onCtxSetColor,
      onCtxDuplicate,
      onCtxDelete,
      connDragging,
      tempEdgePath,
      onConnStart,
      onWheel,
      onPanStart,
      onPanMove,
      onPanEnd,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      zoomIn,
      zoomOut,
      resetView,
    };
  },
});
</script>

<style>
/* ===== Viewport ===== */
.canvas-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #1e1e1e;
  background-image: radial-gradient(circle, #333 1px, transparent 1px);
  background-size: 24px 24px;
  cursor: grab;
  position: relative;
  user-select: none;
}
.canvas-viewport:active {
  cursor: grabbing;
}

/* ===== World (transformed layer) ===== */
.canvas-world {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

/* ===== Groups ===== */
.canvas-group {
  position: absolute;
  border-radius: 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}
.canvas-group .group-label {
  position: absolute;
  top: -28px;
  left: 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

/* Group colors */
.group-color-1 { border-color: rgba(251,70,76,0.45); background: rgba(251,70,76,0.06); }
.group-color-1 .group-label { color: #fb464c; }
.group-color-2 { border-color: rgba(233,151,63,0.45); background: rgba(233,151,63,0.06); }
.group-color-2 .group-label { color: #e9973f; }
.group-color-3 { border-color: rgba(224,222,113,0.45); background: rgba(224,222,113,0.06); }
.group-color-3 .group-label { color: #e0de71; }
.group-color-4 { border-color: rgba(68,207,110,0.45); background: rgba(68,207,110,0.06); }
.group-color-4 .group-label { color: #44cf6e; }
.group-color-5 { border-color: rgba(83,223,221,0.45); background: rgba(83,223,221,0.06); }
.group-color-5 .group-label { color: #53dfdd; }
.group-color-6 { border-color: rgba(168,130,255,0.45); background: rgba(168,130,255,0.06); }
.group-color-6 .group-label { color: #a882ff; }

/* ===== Edges (SVG) ===== */
.canvas-edges {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  cursor: pointer;
  pointer-events: stroke;
}
.edge-line {
  fill: none;
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 2;
  pointer-events: none;
  transition: stroke 0.15s ease;
}
.edge-line.edge-selected {
  stroke: rgba(124, 138, 255, 0.8);
  stroke-width: 2.5;
}
.edge-line.edge-temp {
  stroke: rgba(124, 138, 255, 0.5);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}
.edge-label-bg {
  fill: rgba(30, 30, 30, 0.85);
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 1;
}
.edge-label {
  fill: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-anchor: middle;
  dominant-baseline: auto;
  pointer-events: none;
}

/* ===== Edge actions (DOM overlay) ===== */
.edge-actions {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  gap: 4px;
  z-index: 50;
  pointer-events: auto;
}
.edge-action-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.edge-action-btn:hover {
  background: rgba(60, 60, 60, 0.95);
  color: #fff;
}
.edge-delete-btn:hover {
  background: rgba(251, 70, 76, 0.3);
  border-color: rgba(251, 70, 76, 0.5);
  color: #fb464c;
}

/* ===== Edge label editor (DOM overlay) ===== */
.edge-label-editor {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 50;
}
.edge-label-input {
  width: 140px;
  padding: 4px 10px;
  border: 1.5px solid rgba(124, 138, 255, 0.6);
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-align: center;
  outline: none;
}
.edge-label-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* ===== Selection box ===== */
.selection-box {
  position: absolute;
  border: 1.5px solid rgba(124, 138, 255, 0.6);
  background: rgba(124, 138, 255, 0.08);
  border-radius: 2px;
  pointer-events: none;
  z-index: 5;
}

/* ===== Context menu ===== */
.context-menu {
  position: absolute;
  z-index: 200;
  background: rgba(30, 30, 30, 0.97);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 6px;
  min-width: 140px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}
.ctx-colors {
  display: flex;
  gap: 4px;
  padding: 4px 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
}
.ctx-color-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s;
}
.ctx-color-btn:hover { transform: scale(1.2); }
.ctx-color-1 { background: #fb464c; }
.ctx-color-2 { background: #e9973f; }
.ctx-color-3 { background: #e0de71; }
.ctx-color-4 { background: #44cf6e; }
.ctx-color-5 { background: #53dfdd; }
.ctx-color-6 { background: #a882ff; }
.ctx-color-none { background: #444; font-size: 10px; color: #aaa; display: flex; align-items: center; justify-content: center; }
.ctx-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}
.ctx-item:hover { background: rgba(255, 255, 255, 0.08); }
.ctx-item-danger:hover { background: rgba(251, 70, 76, 0.2); color: #fb464c; }

/* Arrowhead color */
#arrowhead polygon {
  fill: rgba(255, 255, 255, 0.25);
}

/* ===== Nodes ===== */
.canvas-node {
  position: absolute;
  background: #262626;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  transition: box-shadow 0.15s ease;
}
.canvas-node:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.2);
}
.canvas-node.is-selected {
  border-color: rgba(124, 138, 255, 0.6);
}
.canvas-node.is-dragging {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  border-color: rgba(124, 138, 255, 0.5);
  z-index: 100;
  cursor: grabbing;
}
.canvas-node {
  cursor: grab;
}

/* ===== Text editor ===== */
.node-editor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  display: block;
}

/* ===== Resize handles ===== */
.resize-handle {
  position: absolute;
  background: rgba(124, 138, 255, 0.8);
  border: 1.5px solid rgba(124, 138, 255, 1);
  border-radius: 2px;
  z-index: 10;
}
/* Corners */
.resize-handle-br { width: 8px; height: 8px; bottom: -4px; right: -4px; cursor: nwse-resize; border-radius: 50%; }
.resize-handle-bl { width: 8px; height: 8px; bottom: -4px; left: -4px; cursor: nesw-resize; border-radius: 50%; }
.resize-handle-tr { width: 8px; height: 8px; top: -4px; right: -4px; cursor: nesw-resize; border-radius: 50%; }
.resize-handle-tl { width: 8px; height: 8px; top: -4px; left: -4px; cursor: nwse-resize; border-radius: 50%; }
/* Edges */
.resize-handle-r { width: 4px; height: calc(100% - 16px); top: 8px; right: -2px; cursor: ew-resize; border-radius: 2px; }
.resize-handle-l { width: 4px; height: calc(100% - 16px); top: 8px; left: -2px; cursor: ew-resize; border-radius: 2px; }
.resize-handle-t { height: 4px; width: calc(100% - 16px); left: 8px; top: -2px; cursor: ns-resize; border-radius: 2px; }
.resize-handle-b { height: 4px; width: calc(100% - 16px); left: 8px; bottom: -2px; cursor: ns-resize; border-radius: 2px; }

/* ===== Connection points ===== */
.conn-point {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(124, 138, 255, 0.7);
  border: 2px solid rgba(124, 138, 255, 1);
  opacity: 0;
  transition: opacity 0.15s ease;
  cursor: crosshair;
  z-index: 20;
  transform: translate(-50%, -50%);
}
.canvas-node:hover .conn-point {
  opacity: 1;
}
.conn-top { left: 50%; top: 0; }
.conn-bottom { left: 50%; top: 100%; }
.conn-left { left: 0; top: 50%; }
.conn-right { left: 100%; top: 50%; }

/* Node colors */
.node-color-1 { border-color: rgba(251,70,76,0.6); background: linear-gradient(135deg, rgba(251,70,76,0.12), #262626 60%); }
.node-color-2 { border-color: rgba(233,151,63,0.6); background: linear-gradient(135deg, rgba(233,151,63,0.12), #262626 60%); }
.node-color-3 { border-color: rgba(224,222,113,0.6); background: linear-gradient(135deg, rgba(224,222,113,0.12), #262626 60%); }
.node-color-4 { border-color: rgba(68,207,110,0.6); background: linear-gradient(135deg, rgba(68,207,110,0.12), #262626 60%); }
.node-color-5 { border-color: rgba(83,223,221,0.6); background: linear-gradient(135deg, rgba(83,223,221,0.12), #262626 60%); }
.node-color-6 { border-color: rgba(168,130,255,0.6); background: linear-gradient(135deg, rgba(168,130,255,0.12), #262626 60%); }

/* ===== Node content (markdown) ===== */
.node-content {
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

.node-content h1 {
  font-size: 22px;
  margin: 0 0 8px 0;
  font-weight: 700;
  color: #fff;
}
.node-content h2 {
  font-size: 18px;
  margin: 0 0 6px 0;
  font-weight: 600;
  color: #fff;
}
.node-content h3 {
  font-size: 15px;
  margin: 0 0 4px 0;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.node-content p {
  margin: 0 0 8px 0;
}
.node-content p:last-child {
  margin-bottom: 0;
}
.node-content ul,
.node-content ol {
  margin: 4px 0 8px 0;
  padding-left: 20px;
}
.node-content li {
  margin-bottom: 2px;
}
.node-content strong {
  color: #fff;
  font-weight: 600;
}
.node-content a {
  color: #7c8aff;
  text-decoration: none;
}
.node-content a:hover {
  text-decoration: underline;
}
.node-content code {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
}
.node-content pre {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.node-content pre code {
  background: none;
  padding: 0;
}
.node-content blockquote {
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  margin: 8px 0;
  padding: 4px 12px;
  color: rgba(255, 255, 255, 0.6);
}
/* Callouts */
.node-content .callout {
  border-left: 3px solid;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  margin: 8px 0;
  padding: 8px 12px;
}
.node-content .callout-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.node-content .callout-body {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
.node-content .callout-body p { margin: 0; }
.node-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}
.node-content th,
.node-content td {
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 6px 10px;
  text-align: left;
}
.node-content th {
  background: rgba(255, 255, 255, 0.06);
  font-weight: 600;
}
.node-content hr {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 12px 0;
}

/* ===== Link nodes ===== */
.canvas-node-link {
  display: flex;
  flex-direction: column;
}
.node-link-header {
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-link-header a {
  color: #7c8aff;
  text-decoration: none;
}
.node-link-header a:hover {
  text-decoration: underline;
}

/* ===== Controls ===== */
.canvas-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px 8px;
  z-index: 10;
}
.canvas-controls button {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.canvas-controls button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.zoom-level {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 40px;
  text-align: center;
}

/* ===== Scrollbar for node content ===== */
.node-content::-webkit-scrollbar {
  width: 4px;
}
.node-content::-webkit-scrollbar-track {
  background: transparent;
}
.node-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}
</style>
