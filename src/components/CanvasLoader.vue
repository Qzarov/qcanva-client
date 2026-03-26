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
            <path
              :d="edge.path"
              class="edge-line"
              marker-end="url(#arrowhead)"
            />
            <text
              v-if="edge.label"
              :x="edge.labelX"
              :y="edge.labelY"
              class="edge-label"
            >{{ edge.label }}</text>
          </g>
        </g>
      </svg>

      <!-- Text nodes -->
      <div
        v-for="node in textNodes"
        :key="node.id"
        class="canvas-node"
        :class="[nodeColorClass(node), { 'is-dragging': dragNodeId === node.id }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
      >
        <div class="node-content" v-html="renderMarkdown(node.text || '')"></div>
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
import { defineComponent, ref, computed, onMounted, reactive } from "vue";
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
  styleAttributes?: Record<string, string>;
}

interface RenderedEdge {
  id: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
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
        pointerEvents: "none" as const,
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
          return { id: edge.id, path: "", labelX: 0, labelY: 0 };
        }

        const fromSide = edge.fromSide || "bottom";
        const toSide = edge.toSide || "top";
        const from = getAnchor(fromNode, fromSide);
        const to = getAnchor(toNode, toSide);

        const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
        const c1 = getControlOffset(fromSide, dist);
        const c2 = getControlOffset(toSide, dist);

        const path = `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;

        return {
          id: edge.id,
          path,
          label: edge.label,
          labelX: (from.x + to.x) / 2,
          labelY: (from.y + to.y) / 2 - 8,
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

    const renderMarkdown = (text: string) => {
      return marked.parse(text) as string;
    };

    // Drag node state
    const dragNodeId = ref<string | null>(null);
    const dragNodeStart = reactive({ x: 0, y: 0 });
    const dragMouseStart = reactive({ x: 0, y: 0 });

    // Node drag handlers
    const onNodeDragStart = (e: MouseEvent, node: CanvasNode) => {
      dragNodeId.value = node.id;
      dragMouseStart.x = e.clientX;
      dragMouseStart.y = e.clientY;
      dragNodeStart.x = node.x;
      dragNodeStart.y = node.y;
    };

    // Pan handlers
    const onPanStart = (e: MouseEvent) => {
      if (dragNodeId.value) return;
      isPanning.value = true;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      cameraStart.x = camera.x;
      cameraStart.y = camera.y;
    };

    const onPanMove = (e: MouseEvent) => {
      // Node dragging
      if (dragNodeId.value) {
        const node = nodes.value.find((n) => n.id === dragNodeId.value);
        if (node) {
          const dx = (e.clientX - dragMouseStart.x) / camera.scale;
          const dy = (e.clientY - dragMouseStart.y) / camera.scale;
          node.x = dragNodeStart.x + dx;
          node.y = dragNodeStart.y + dy;
        }
        return;
      }
      // Canvas panning
      if (!isPanning.value) return;
      camera.x = cameraStart.x + (e.clientX - panStart.x);
      camera.y = cameraStart.y + (e.clientY - panStart.y);
    };

    const onPanEnd = () => {
      isPanning.value = false;
      dragNodeId.value = null;
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
      dragNodeId,
      onNodeDragStart,
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
.edge-line {
  fill: none;
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 2;
  --edge-color: rgba(255, 255, 255, 0.25);
}
.edge-label {
  fill: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  text-anchor: middle;
  dominant-baseline: auto;
}

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
.canvas-node.is-dragging {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  border-color: rgba(124, 138, 255, 0.5);
  z-index: 100;
  cursor: grabbing;
}
.canvas-node {
  cursor: grab;
}

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
