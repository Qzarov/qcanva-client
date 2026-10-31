<template>
  <!-- The desktop node toolbar: one row of icons right above the selection
       (below it when the top is too close), each menu one level deep, right
       under its row. The phone has its own bottom toolbar (MobileNodeToolbar). -->
  <div
    v-if="visible"
    ref="root"
    class="node-floating-toolbar desktop-only"
    :class="{ 'is-below': placement.below, 'opens-up': placement.menuUp }"
    :style="{ left: placement.left + 'px', top: (placement.menuUp && menu ? placement.top - menuHeight - MENU_GAP : placement.top) + 'px' }"
    role="toolbar"
    :aria-label="t('nodeActions')"
    data-node-toolbar
    @pointerdown.stop
    @click.stop
    @keydown.esc="closeOnEscape"
  >
    <div class="node-toolbar-row">
      <!-- What the node looks like: one node at a time -->
      <template v-if="single">
        <button
          type="button"
          class="node-tool node-tool-menu"
          :class="{ active: menu === 'fill' }"
          :title="t('background')"
          :aria-label="t('background')"
          aria-haspopup="true"
          :aria-expanded="menu === 'fill'"
          data-node-tool="fill"
          @click="toggle('fill')"
        >
          <span class="node-tool-swatch tb-color" :class="fillColor ? 'ctx-color-' + fillColor : 'tb-color-none'" aria-hidden="true"></span>
          <ChevronDown :size="12" class="node-tool-caret" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="node-tool node-tool-menu"
          :class="{ active: menu === 'text' }"
          :title="t('text')"
          :aria-label="t('text')"
          aria-haspopup="true"
          :aria-expanded="menu === 'text'"
          data-node-tool="text"
          @click="toggle('text')"
        >
          <Type :size="17" aria-hidden="true" />
          <ChevronDown :size="12" class="node-tool-caret" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="node-tool node-tool-menu"
          :class="{ active: menu === 'border' }"
          :title="t('border')"
          :aria-label="t('border')"
          aria-haspopup="true"
          :aria-expanded="menu === 'border'"
          data-node-tool="border"
          @click="toggle('border')"
        >
          <Square :size="17" aria-hidden="true" />
          <ChevronDown :size="12" class="node-tool-caret" aria-hidden="true" />
        </button>
        <span class="node-tool-sep" aria-hidden="true"></span>
      </template>

      <!-- One click each -->
      <button
        v-if="single && canvas.isTextNode(nodeId)"
        type="button"
        class="node-tool"
        :title="t('toolbarEdit')"
        :aria-label="t('toolbarEdit')"
        data-node-tool="edit"
        @click="canvas.openTextEditor(nodeId)"
      ><Pencil :size="17" aria-hidden="true" /></button>
      <button
        type="button"
        class="node-tool"
        :class="{ active: locked }"
        :title="locked ? t('unlockPosition') : t('lockPosition')"
        :aria-label="locked ? t('unlockPosition') : t('lockPosition')"
        :aria-pressed="locked"
        data-node-tool="lock"
        @click="single ? canvas.toggleNodePositionLock(nodeId) : canvas.toggleSelectedNodesPositionLock()"
      ><Lock v-if="locked" :size="17" aria-hidden="true" /><LockOpen v-else :size="17" aria-hidden="true" /></button>
      <button
        type="button"
        class="node-tool"
        :title="t('duplicate')"
        :aria-label="t('duplicate')"
        data-node-tool="duplicate"
        @click="canvas.duplicateSelection()"
      ><Copy :size="17" aria-hidden="true" /></button>
      <button
        v-if="role === 'owner'"
        type="button"
        class="node-tool"
        :class="{ active: hidden }"
        :title="hidden ? t('show') : t('hide')"
        :aria-label="hidden ? t('show') : t('hide')"
        :aria-pressed="hidden"
        data-node-tool="hide"
        @click="single ? canvas.toggleNodeHidden(nodeId) : canvas.toggleSelectedNodesHidden()"
      ><EyeOff v-if="hidden" :size="17" aria-hidden="true" /><Eye v-else :size="17" aria-hidden="true" /></button>
      <span class="node-tool-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="node-tool"
        :class="{ active: menu === 'more' }"
        :title="t('moreActions')"
        :aria-label="t('moreActions')"
        aria-haspopup="true"
        :aria-expanded="menu === 'more'"
        data-node-tool="more"
        @click="toggle('more')"
      ><MoreHorizontal :size="17" aria-hidden="true" /></button>
    </div>

    <!-- The open menu: everything at once, nothing nested over it -->
    <div v-if="menu" ref="menuEl" class="node-toolbar-menu" :data-node-menu="menu">
      <template v-if="menu === 'fill' && single">
        <div class="node-menu-label" aria-hidden="true">{{ t('backgroundColor') }}</div>
        <div class="node-menu-swatches" role="group" :aria-label="t('backgroundColor')">
          <button
            v-for="c in FILL_COLORS"
            :key="'fill-' + c"
            type="button"
            class="tb-color"
            :class="['ctx-color-' + c, { active: fillColor === c }]"
            :aria-label="t('backgroundColor') + ' ' + c"
            :aria-pressed="fillColor === c"
            @click="canvas.setNodeColor(nodeId, c)"
          ></button>
          <button type="button" class="tb-color tb-color-none" :class="{ active: !fillColor }" :aria-label="t('clearColor')" :title="t('clearColor')" @click="canvas.setNodeColor(nodeId, undefined)">×</button>
        </div>
        <div class="node-menu-row">
          <button type="button" class="node-menu-choice" :class="{ active: canvas.isNodeTransparent(nodeId) }" :aria-pressed="canvas.isNodeTransparent(nodeId) ?? false" @click="canvas.toggleNodeTransparent(nodeId)">{{ t('transparent') }}</button>
          <button type="button" class="node-menu-choice" :class="{ active: canvas.getNodeFillStyle(nodeId) !== 'solid' }" :aria-pressed="canvas.getNodeFillStyle(nodeId) !== 'solid'" @click="canvas.toggleNodeFillStyle(nodeId)">{{ t('gradient') }}</button>
          <button type="button" class="node-menu-choice" :class="{ active: canvas.getNodeShape(nodeId) === 'round' }" :aria-pressed="canvas.getNodeShape(nodeId) === 'round'" @click="canvas.toggleNodeShape(nodeId)">{{ t('round') }}</button>
        </div>
      </template>

      <template v-else-if="menu === 'text' && single">
        <div class="node-menu-label" aria-hidden="true">{{ t('textColor') }}</div>
        <div class="node-menu-swatches" role="group" :aria-label="t('textColor')">
          <button
            v-for="c in canvas.fontColors"
            :key="'font-' + c"
            type="button"
            class="tb-color"
            :class="{ active: canvas.isNodeFontColorActive(canvas.getNodeFontColor(nodeId), c) }"
            :style="{ background: canvas.getNodeFontColorSwatch(c) }"
            :aria-label="t('textColor') + ' ' + c"
            @click="canvas.setNodeFontColor(nodeId, c)"
          ></button>
          <button type="button" class="tb-color tb-color-none" :aria-label="t('clearColor')" :title="t('clearColor')" @click="canvas.setNodeFontColor(nodeId, undefined)">×</button>
        </div>
        <div class="node-menu-label">{{ t('firstLine') }}</div>
        <div class="node-menu-row">
          <button v-for="a in aligns" :key="'first-' + a.v" type="button" class="tb-btn" :class="{ active: canvas.getNodeFirstLineAlign(nodeId) === a.v }" :title="a.l" :aria-label="t('firstLine') + ': ' + a.l" @click="canvas.setNodeFirstLineAlign(nodeId, a.v)" v-html="a.icon"></button>
        </div>
        <div class="node-menu-label">{{ t('bodyText') }}</div>
        <div class="node-menu-row">
          <button v-for="a in aligns" :key="'body-' + a.v" type="button" class="tb-btn" :class="{ active: canvas.getNodeAlign(nodeId) === a.v }" :title="a.l" :aria-label="t('bodyText') + ': ' + a.l" @click="canvas.setNodeAlign(nodeId, a.v)" v-html="a.icon"></button>
        </div>
      </template>

      <template v-else-if="menu === 'border' && single">
        <div class="node-menu-label">{{ t('style') }}</div>
        <div class="node-menu-row">
          <button v-for="bs in canvas.borderStyles" :key="'border-' + bs.value" type="button" class="tb-btn" :class="{ active: canvas.getNodeBorderStyle(nodeId) === bs.value }" :title="bs.label" :aria-label="bs.label" @click="canvas.setNodeBorderStyle(nodeId, bs.value)">
            <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true" v-html="bs.svg"></svg>
          </button>
        </div>
        <div class="node-menu-label">{{ t('width') }}</div>
        <div class="node-menu-row">
          <button v-for="bw in [1, 2, 3, 4]" :key="'width-' + bw" type="button" class="tb-btn" :class="{ active: canvas.getNodeBorderWidth(nodeId) === bw }" :title="bw + 'px'" :aria-label="t('width') + ' ' + bw + 'px'" @click="canvas.setNodeBorderWidth(nodeId, bw)">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" :stroke-width="bw" /></svg>
          </button>
        </div>
        <div class="node-menu-label" aria-hidden="true">{{ t('borderColor') }}</div>
        <div class="node-menu-swatches" role="group" :aria-label="t('borderColor')">
          <button
            v-for="c in BORDER_COLORS"
            :key="'border-color-' + c"
            type="button"
            class="tb-color"
            :class="{ active: canvas.getNodeBorderColor(nodeId) === c }"
            :style="{ background: c }"
            :aria-label="t('borderColor') + ' ' + c"
            @click="canvas.setNodeBorderColor(nodeId, c)"
          ></button>
          <button type="button" class="tb-color tb-color-none" :aria-label="t('clearColor')" :title="t('clearColor')" @click="canvas.setNodeBorderColor(nodeId, undefined)">×</button>
        </div>
      </template>

      <template v-else-if="menu === 'more'">
        <div v-if="!single" class="node-menu-label">{{ t('selectedObjects') }}: {{ canvas.selectedNodeIds.length }}</div>
        <template v-if="single && (canvas.isImageNode(nodeId) || canvas.isGroupNode(nodeId))">
          <div class="node-menu-label">{{ canvas.isGroupNode(nodeId) ? t('groupName') : t('imageName') }}</div>
          <input
            class="node-menu-input"
            :value="canvas.getNodeTitle(nodeId)"
            :placeholder="canvas.isGroupNode(nodeId) ? t('groupName') : t('imageName')"
            data-node-title-input
            @input="canvas.setNodeTitle?.(nodeId, ($event.target as HTMLInputElement).value)"
            @keydown.stop
          />
        </template>
        <div class="node-menu-label">{{ t('layers') }}</div>
        <div class="node-menu-list">
          <button type="button" class="node-menu-item" @click="canvas.bringSelectionForward()"><ArrowUp :size="15" aria-hidden="true" />{{ t('layerUp') }}</button>
          <button type="button" class="node-menu-item" @click="canvas.sendSelectionBackward()"><ArrowDown :size="15" aria-hidden="true" />{{ t('layerDown') }}</button>
          <button type="button" class="node-menu-item" @click="canvas.bringSelectionToFront()"><ArrowUpToLine :size="15" aria-hidden="true" />{{ t('bringToFront') }}</button>
          <button type="button" class="node-menu-item" @click="canvas.sendSelectionToBack()"><ArrowDownToLine :size="15" aria-hidden="true" />{{ t('sendToBack') }}</button>
        </div>
        <div class="node-menu-divider" aria-hidden="true"></div>
        <button type="button" class="node-menu-item danger" data-node-tool="delete" @click="canvas.deleteSelection()"><Trash2 :size="15" aria-hidden="true" />{{ t('delete') }}</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronDown, Copy, Eye, EyeOff, Lock, LockOpen,
  MoreHorizontal, Pencil, Square, Trash2, Type,
} from '@lucide/vue';
import { useI18n } from '../composables/useI18n';
import { MENU_GAP, placeNodeToolbar } from './nodeToolbarPlacement';

type NodeMenu = '' | 'fill' | 'text' | 'border' | 'more';

const props = defineProps<{
  /** The CanvasLoader instance: the toolbar reads and changes the selection through it. */
  canvas: any;
  role: string;
  /** The open menu, kept by the page (Escape and a click elsewhere close it there). */
  menu: string;
  /** Text alignment choices, as the page lists them. */
  aligns: Array<{ v: string; l: string; icon: string }>;
}>();
const emit = defineEmits<{ 'update:menu': [menu: NodeMenu] }>();
const { t } = useI18n();

const FILL_COLORS = ['1', '2', '3', '4', '5', '6'];
const BORDER_COLORS = ['#fb464c', '#e9973f', '#e0de71', '#44cf6e', '#53dfdd', '#a882ff', '#ffffff'];
const root = ref<HTMLElement | null>(null);
const size = reactive({ width: 360, height: 44 });

const nodeId = computed<string | null>(() => props.canvas?.selectedNodeId ?? null);
const single = computed(() => Boolean(nodeId.value));
const rect = computed(() => props.canvas?.selectedNodesScreenRect ?? null);
/** Hidden while there is nothing to act on, while the node is edited or moved, and while the canvas pans. */
const visible = computed(() => Boolean(
  props.role !== 'read'
  && props.canvas?.selectedNodeIds?.length
  && rect.value
  && !props.canvas.editingNodeId
  && !props.canvas.isManipulatingNode
  && !props.canvas.isPanning,
));
const fillColor = computed(() => (single.value ? props.canvas.getNodeColor(nodeId.value) : undefined));
const locked = computed(() => Boolean(single.value ? props.canvas.isNodePositionLocked(nodeId.value) : props.canvas.areSelectedNodesPositionLocked()));
const hidden = computed(() => Boolean(single.value ? props.canvas.isNodeHidden(nodeId.value) : props.canvas.areSelectedNodesHidden()));

function toggle(next: Exclude<NodeMenu, ''>) {
  emit('update:menu', props.menu === next ? '' : next);
}

/** The viewport the rect is measured in. */
const area = reactive({ width: 0, height: 0 });
function measureArea() {
  const viewport: HTMLElement | undefined = props.canvas?.viewport;
  area.width = viewport?.clientWidth ?? window.innerWidth;
  area.height = viewport?.clientHeight ?? window.innerHeight;
}

/** Centred over the selection, inside the viewport; its menu unfolds away from the node. */
const menuEl = ref<HTMLElement | null>(null);
const menuHeight = ref(0);
let menuObserver: ResizeObserver | null = null;
// Measured whenever it changes: switching from one menu to another keeps the element.
watch(menuEl, (el) => {
  menuObserver?.disconnect();
  menuHeight.value = el?.offsetHeight ?? 0;
  if (!el || typeof ResizeObserver === 'undefined') return;
  menuObserver = new ResizeObserver(() => { menuHeight.value = el.offsetHeight; });
  menuObserver.observe(el);
});
const placement = computed(() => {
  const box = rect.value;
  if (!box) return { left: 0, top: 0, below: false, menuUp: false };
  return placeNodeToolbar(box, size, area, props.menu ? menuHeight.value : 0);
});

/** Escape with a menu open closes the menu only; the next one clears the selection. */
function closeOnEscape(event: KeyboardEvent) {
  if (!props.menu) return;
  event.stopPropagation();
  event.preventDefault();
  emit('update:menu', '');
}

let resizeObserver: ResizeObserver | null = null;
watch(root, (el) => {
  resizeObserver?.disconnect();
  if (!el || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    const row = el.querySelector('.node-toolbar-row') as HTMLElement | null;
    size.width = row?.offsetWidth ?? el.offsetWidth;
    size.height = row?.offsetHeight ?? el.offsetHeight;
  });
  resizeObserver.observe(el.querySelector('.node-toolbar-row') ?? el);
});
// A new selection starts with no menu open.
watch(() => props.canvas?.selectedNodeIds?.join(','), () => {
  if (props.menu) emit('update:menu', '');
});
// The menu opens upward when the toolbar sits low.
watch(() => props.menu, () => nextTick(measureArea));

onMounted(() => {
  measureArea();
  window.addEventListener('resize', measureArea);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', measureArea);
  resizeObserver?.disconnect();
  menuObserver?.disconnect();
});

defineExpose({ root });
</script>
