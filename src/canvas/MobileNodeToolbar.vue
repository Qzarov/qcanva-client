<template>
  <div v-if="selectionKind !== 'none'" ref="toolbarElement" class="mobile-node-toolbar" role="toolbar" :aria-label="t('nodeActions')" @keydown.esc.stop.prevent="backToMenu">
    <CanvasPanelPage :page="activeSection">
    <header v-if="activeSection" class="mobile-panel-header"><strong class="mobile-settings-heading">{{ pageLabel }}</strong></header>
    <div v-if="activeSection" class="mobile-node-subpanel" @pointerdown.stop @click.stop>
      <div class="mobile-subpanel-row mobile-settings-row mobile-settings-compact-row">
        <button class="mobile-panel-back" type="button" :aria-label="t('backToMenu')" @click="backToMenu"><span aria-hidden="true">←</span><span>{{ t('undo') }}</span></button>
        <template v-if="activeSection === 'border-settings'">
          <button class="tb-btn" :aria-label="t('borderColor')" :aria-expanded="colorPopup === 'border'" @click="toggleColorPopup('border', $event)"><span class="canvas-palette-swatch" :style="{ background: canvasRef?.getNodeBorderColor(nodeId) ?? 'var(--ui-text)' }" /><span>{{ t('color') }}</span></button>
          <button class="tb-btn" :aria-label="t('borderWidth')" :aria-expanded="colorPopup === 'border-width'" @click="toggleColorPopup('border-width', $event)"><svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true"><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" :stroke-width="canvasRef?.getNodeBorderWidth(nodeId)" /></svg><span>{{ t('width') }}</span></button>
          <button class="tb-btn" :aria-label="t('borderStyle')" :aria-expanded="colorPopup === 'border-style'" @click="toggleColorPopup('border-style', $event)"><svg v-bind="iconProps('border-style')" v-html="iconPath('border-style')" aria-hidden="true" /><span>{{ t('style') }}</span></button>
        </template>
        <template v-if="activeSection === 'text-settings'">
          <button class="tb-btn" :aria-label="t('headerAlignment')" :aria-expanded="colorPopup === 'first-line'" @click="toggleColorPopup('first-line', $event)"><svg v-bind="iconProps('alignment')" v-html="iconPath('alignment')" aria-hidden="true" /><span>{{ t('textHeader') }}</span></button>
          <button class="tb-btn" :aria-label="t('bodyAlignment')" :aria-expanded="colorPopup === 'body-text'" @click="toggleColorPopup('body-text', $event)"><svg v-bind="iconProps('alignment')" v-html="iconPath('alignment')" aria-hidden="true" /><span>{{ t('text') }}</span></button>
          <button class="tb-btn" :aria-label="t('textColor')" :aria-expanded="colorPopup === 'text'" @click="toggleColorPopup('text', $event)"><span class="canvas-palette-swatch" :style="{ background: canvasRef?.getNodeFontColorSwatch(canvasRef?.getNodeFontColor(nodeId)) || 'var(--content-canvas-node-text)' }" /><span>{{ t('color') }}</span></button>
        </template>
      </div>
      <label v-if="activeSection === 'image-title'" class="mobile-subpanel-row"><span>{{ canvasRef?.isGroupNode(nodeId) ? t('groupName') : t('imageName') }}</span><input class="block-menu-text-input mobile-subpanel-title-input" :value="canvasRef?.getNodeTitle(nodeId)" :placeholder="canvasRef?.isGroupNode(nodeId) ? t('groupName') : t('imageName')" @input="onTitleInput" @keydown.stop /></label>
    </div>

    <CanvasColorMenu :open="paletteOpen" :anchor="colorAnchor" above :label="paletteLabel" :menu-class="'mobile-node-popup mobile-node-color-palette' + (paletteKind === 'fill' ? ' mobile-node-background-palette' : '')" @close="colorPopup = null">
      <button v-for="c in paletteColors" :key="c" class="tb-color" :class="[{ active: isPaletteColorActive(c) }, paletteKind === 'fill' ? 'ctx-color-'+c : '']" :style="paletteKind !== 'fill' ? { background: paletteKind === 'text' ? canvasRef?.getNodeFontColorSwatch(c) : c } : {}" :aria-label="paletteLabel + ' ' + c" :title="paletteLabel + ' ' + c" @click="chooseColor(c)" />
      <button class="tb-color tb-color-none" :aria-label="t('clearColor')" :title="t('clearColor')" @click="chooseColor(undefined)">×</button>
      <template v-if="paletteKind === 'fill'">
        <button class="tb-btn mobile-background-toggle" :aria-label="canvasRef?.getNodeFillStyle(nodeId) === 'solid' ? t('solid') : t('gradient')" :title="canvasRef?.getNodeFillStyle(nodeId) === 'solid' ? t('solid') : t('gradient')" @click.stop="canvasRef?.toggleNodeFillStyle(nodeId)"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3" fill="currentColor" /><path d="M10 3v14" stroke="var(--ui-surface)" stroke-width="7" :opacity="canvasRef?.getNodeFillStyle(nodeId) === 'solid' ? 0 : .5" /></svg><span>{{ canvasRef?.getNodeFillStyle(nodeId) === 'solid' ? t('solid') : t('gradient') }}</span></button>
        <button class="tb-btn mobile-background-toggle" :class="{ active: canvasRef?.isNodeTransparent(nodeId) }" :aria-label="t('transparent')" :title="t('transparent')" :aria-pressed="canvasRef?.isNodeTransparent(nodeId) ?? false" @click.stop="canvasRef?.toggleNodeTransparent(nodeId)"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M3 3l14 14M3 17 17 3" /></svg><span>{{ t('transparent') }}</span></button>
      </template>
    </CanvasColorMenu>
    <CanvasColorMenu :open="!!colorPopup && !paletteOpen" :anchor="colorAnchor" above :label="popupLabel" controls :menu-class="'mobile-node-popup mobile-node-options mobile-' + colorPopup + '-menu'" @close="colorPopup = null">
      <template v-if="colorPopup === 'shape'">
        <button v-for="shape in ['rect', 'round']" :key="shape" :class="{ active: canvasRef?.getNodeShape(nodeId) === shape }" :aria-label="shape === 'round' ? t('round') : t('rectangular')" :aria-pressed="canvasRef?.getNodeShape(nodeId) === shape" @click="canvasRef?.getNodeShape(nodeId) !== shape && canvasRef?.toggleNodeShape(nodeId)"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle v-if="shape === 'round'" cx="10" cy="10" r="7" /><rect v-else x="3" y="3" width="14" height="14" rx="2" /></svg><span>{{ shape === 'round' ? t('round') : t('rectangular') }}</span></button>
      </template>
      <template v-if="colorPopup === 'layers'">
        <button v-for="action in layerActions" :key="action.key" :disabled="action.disabled" :aria-label="action.label" @click="action.handler()"><svg v-bind="iconProps(action.key)" v-html="iconPath(action.key)" aria-hidden="true" /><span>{{ action.label }}</span></button>
      </template>
      <template v-if="colorPopup === 'border-style'">
        <button v-for="bs in canvasRef?.borderStyles ?? []" :key="bs.value" :class="{ active: canvasRef?.getNodeBorderStyle(nodeId) === bs.value }" :aria-pressed="canvasRef?.getNodeBorderStyle(nodeId) === bs.value" :aria-label="t('style') + ': ' + bs.label" @click="canvasRef?.setNodeBorderStyle(nodeId, bs.value)"><svg width="24" height="10" viewBox="0 0 24 10" v-html="bs.svg" aria-hidden="true" /><span>{{ bs.label }}</span></button>
      </template>
      <template v-if="colorPopup === 'border-width'">
        <button v-for="bw in [1,2,3,4]" :key="bw" :class="{ active: canvasRef?.getNodeBorderWidth(nodeId) === bw }" :aria-pressed="canvasRef?.getNodeBorderWidth(nodeId) === bw" :aria-label="t('width') + ' ' + bw + 'px'" @click="canvasRef?.setNodeBorderWidth(nodeId, bw)"><svg width="24" height="14" viewBox="0 0 24 14" aria-hidden="true"><line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" :stroke-width="bw" /></svg><span>{{ bw }}px</span></button>
      </template>
      <template v-if="colorPopup === 'first-line' || colorPopup === 'body-text'">
        <button v-for="a in aligns" :key="a.v" :class="{ active: (colorPopup === 'first-line' ? canvasRef?.getNodeFirstLineAlign(nodeId) : canvasRef?.getNodeAlign(nodeId)) === a.v }" :aria-label="t(colorPopup === 'first-line' ? 'firstLine' : 'bodyText') + ': ' + a.l" @click="colorPopup === 'first-line' ? canvasRef?.setNodeFirstLineAlign(nodeId, a.v) : canvasRef?.setNodeAlign(nodeId, a.v)"><span v-html="a.icon" aria-hidden="true" /><span>{{ a.l }}</span></button>
      </template>
    </CanvasColorMenu>

    <!-- Drawing popup: floats above the icon row without changing toolbar height -->
    <CanvasColorMenu :open="drawingSection === 'drawing-color'" :anchor="colorAnchor" :label="t('color')" menu-class="mobile-drawing-popup-colors" @close="drawingSection = null">
          <button
            v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000','#ffffff']"
            :key="'mdpc'+c"
            class="mobile-drawing-popup-swatch"
            :class="{ active: canvasRef?.selectedDrawingObj?.color === c }"
            :style="{ background: c }"
            :aria-label="c"
            @click="canvasRef?.setSelectedDrawingColor(c)"
          />
    </CanvasColorMenu>
    <CanvasColorMenu :open="drawingSection === 'drawing-stroke-width'" :anchor="colorAnchor" :label="t('width')" controls @close="drawingSection = null">
      <CanvasStrokeWidth :width="canvasRef?.selectedDrawingObj?.width ?? 4" :color="canvasRef?.selectedDrawingObj?.color ?? '#000000'"
        @update:width="canvasRef?.setSelectedDrawingWidth($event)" />
    </CanvasColorMenu>

    <!-- Icon row -->
    <div v-if="!activeSection" class="mobile-node-toolbar-row">
      <!-- Visible actions -->
      <template v-for="action in visibleActions" :key="action.key">
        <button
          class="mobile-toolbar-btn"
          :class="{
            'mobile-toolbar-btn-danger': action.danger,
            'mobile-toolbar-btn-active': action.isSectionToggle && (activeSection === action.key || drawingSection === action.key),
          }"
          :disabled="action.disabled"
          :title="action.label"
          :aria-label="action.label"
          :aria-pressed="action.isSectionToggle ? (activeSection === action.key || drawingSection === action.key) : undefined"
          @click="onActionClick(action, $event)"
        >
          <component :is="'svg'" v-bind="iconProps(action.key)" v-html="iconPath(action.key)" aria-hidden="true" />
          <span class="mobile-toolbar-caption">{{ caption(action) }}</span>
        </button>
      </template>

      <!-- Overflow button -->
      <button
        v-if="overflowActions.length > 0"
        class="mobile-toolbar-btn"
        :class="{ 'mobile-toolbar-btn-active': overflowOpen }"
        :title="t('moreActions')"
        :aria-label="t('moreActions')"
        :aria-expanded="overflowOpen"
        @click="toggleOverflow"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8"/>
          <circle cx="12" cy="12" r="1.8"/>
          <circle cx="19" cy="12" r="1.8"/>
        </svg>
      </button>
    </div>
    </CanvasPanelPage>

    <!-- Overflow bottom sheet -->
    <Teleport to="body">
      <div v-if="overflowOpen" class="mobile-overflow-backdrop" @click="overflowOpen = false" aria-hidden="true"/>
      <div
        v-if="overflowOpen"
        class="mobile-overflow-sheet"
        role="dialog"
        :aria-label="t('moreActions')"
      >
        <div class="mobile-overflow-sheet-handle"/>
        <div class="mobile-overflow-list">
          <button
            v-for="action in overflowActions"
            :key="action.key"
            class="mobile-overflow-item"
            :class="{ 'mobile-overflow-item-danger': action.danger }"
            :disabled="action.disabled"
            @click="onOverflowActionClick(action)"
          >
            <component :is="'svg'" v-bind="iconProps(action.key)" v-html="iconPath(action.key)" aria-hidden="true" />
            <span>{{ action.label }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, ref, shallowRef, watch, type PropType } from 'vue';
import CanvasColorMenu from './CanvasColorMenu.vue';
import CanvasPanelPage from './CanvasPanelPage.vue';
import CanvasStrokeWidth from './CanvasStrokeWidth.vue';
import { buildNodeActions, getSelectionKind, MAX_VISIBLE_ACTIONS, type NodeAction } from './nodeActions';
import { useI18n } from '../composables/useI18n';
import { useBackHandler } from '../composables/useBackHandler';

type ToolbarAction = Omit<NodeAction, 'key'> & { key: string };

const ICON_PATHS: Record<string, string> = {
  'shape': '<rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="16" cy="16" r="6" stroke="currentColor" stroke-width="1.8" fill="var(--ui-surface)"/>',
  'edit-text': `<path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
                <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>`,
  'fill': `<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>`,
  'text-color': `<text x="4" y="17" font-size="15" font-weight="700" font-family="sans-serif" fill="currentColor">T</text>
                 <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" stroke-width="2"/>`,
  'border-color': `<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>`,
  'border-style': `<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4 2" fill="none"/>`,
  'alignment': `<line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/>
                <line x1="3" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="2"/>
                <line x1="3" y1="18" x2="18" y2="18" stroke="currentColor" stroke-width="2"/>`,
  'duplicate': `<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
                <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'lock': `<rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'unlock': `<rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
             <path d="M7 11V7a5 5 0 0110 0" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'layer-up': `<path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="1.8" fill="none"/>
               <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'layer-down': `<path d="M12 22L2 17l10-5 10 5-10 5z" stroke="currentColor" stroke-width="1.8" fill="none"/>
                 <path d="M2 12l10-5 10 5" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'bring-front': `<rect x="9" y="9" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.8" fill="var(--ui-surface)"/>
                  <rect x="4" y="4" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'send-back': `<rect x="9" y="9" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.8" fill="none"/>
                <rect x="4" y="4" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.8" fill="var(--ui-surface)"/>`,
  'hide': `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.8"/>`,
  'image-title': `<path d="M3 5h18M3 19h18M3 12h8" stroke="currentColor" stroke-width="1.8"/>`,
  'delete': `<polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" fill="none"/>
             <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="1.8" fill="none"/>
             <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'undo': `<path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <path d="M4 9h10a6 6 0 010 12h-2" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'redo': `<path d="M15 14l5-5-5-5" stroke="currentColor" stroke-width="1.8" fill="none"/>
           <path d="M20 9H10a6 6 0 000 12h2" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'edge-style': `<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/>`,
  'edge-arrow': `<path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'drawing-duplicate': `<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
                        <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'drawing-delete': `<polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" fill="none"/>
                     <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  'drawing-color': `<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" fill="none"/>
                    <circle cx="12" cy="12" r="4" fill="currentColor"/>`,
  'drawing-stroke-width': `<line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <line x1="3" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                            <line x1="3" y1="19" x2="21" y2="19" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
};

export default defineComponent({
  name: 'MobileNodeToolbar',
  components: { CanvasColorMenu, CanvasStrokeWidth, CanvasPanelPage },
  props: {
    canvasRef: { type: Object as PropType<any>, default: null },
    role: { type: String as PropType<string>, default: 'read' },
  },
  setup(props) {
    const { t } = useI18n();

    const activeSection = ref<string | null>(null);
    const drawingSection = ref<string | null>(null);
    const overflowOpen = ref(false);
    type Popup = 'fill' | 'text' | 'border' | 'shape' | 'layers' | 'border-width' | 'border-style' | 'first-line' | 'body-text';
    const colorPopup = ref<Popup | null>(null);
    const paletteOpen = computed(() => ['fill', 'text', 'border'].includes(colorPopup.value ?? ''));
    // Keep the last palette contents intact during its closing animation.
    const paletteKind = ref<'fill' | 'text' | 'border'>('fill');
    watch(colorPopup, kind => { if (kind === 'fill' || kind === 'text' || kind === 'border') paletteKind.value = kind; }, { flush: 'sync' });
    const colorAnchor = shallowRef<HTMLElement | null>(null);
    const actionAnchor = shallowRef<HTMLElement | null>(null);
    const toolbarElement = ref<HTMLElement | null>(null);
    watch(colorPopup, async value => {
      await nextTick();
      if (!value) colorAnchor.value?.focus({ preventScroll: true });
    });

    const DRAWING_SECTIONS = ['drawing-color', 'drawing-stroke-width'];

    const aligns = [
      { v: 'left', l: 'Left', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>' },
      { v: 'center', l: 'Center', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>' },
      { v: 'right', l: 'Right', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>' },
      { v: 'justify', l: 'Justify', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
    ];

    const nodeId = computed(() => props.canvasRef?.selectedNodeId ?? null);

    const selectionKind = computed(() =>
      getSelectionKind({
        selectedNodeIds: props.canvasRef?.selectedNodeIds ?? [],
        selectedEdgeId: props.canvasRef?.selectedEdgeId ?? null,
        selectedDrawingIds: props.canvasRef?.selectedDrawingIds ?? [],
      }),
    );

    const actions = computed<NodeAction[]>(() => {
      const cr = props.canvasRef;
      if (!cr) return [];
      const nid = nodeId.value;
      const isReadonly = props.role === 'read';
      const isOwner = props.role === 'owner';
      const kind = selectionKind.value;

      return buildNodeActions({
        kind,
        isLocked: kind === 'multi-node'
          ? (cr.areSelectedNodesPositionLocked?.() ?? false)
          : (nid ? (cr.isNodePositionLocked?.(nid) ?? false) : false),
        canUndo: cr.canUndo ?? false,
        canRedo: cr.canRedo ?? false,
        isOwner,
        isReadonly,
        isTextNode: kind === 'node' && !!nid && (cr.isTextNode?.(nid) ?? false),
        handlers: {
          editText: () => cr.openTextEditor?.(nid),
          duplicate: () => cr.duplicateSelection(),
          delete: () => cr.deleteSelection(),
          toggleLock: () => kind === 'multi-node'
            ? cr.toggleSelectedNodesPositionLock()
            : cr.toggleNodePositionLock(nid),
          layerUp: () => cr.bringSelectionForward(),
          layerDown: () => cr.sendSelectionBackward(),
          bringFront: () => cr.bringSelectionToFront(),
          sendBack: () => cr.sendSelectionToBack(),
          undo: () => cr.undo(),
          redo: () => cr.redo(),
          toggleHide: () => cr.toggleSelectedNodesHidden?.(),
          fillSection: () => triggerSection('fill'),
          textColorSection: () => triggerSection('text-color'),
          borderColorSection: () => triggerSection('border-color'),
          borderStyleSection: () => triggerSection('border-style'),
          alignSection: () => triggerSection('alignment'),
          imageTitleSection: () => triggerSection('image-title'),
          edgeToggleStyle: () => cr.onEdgeToggleStyle?.(cr.selectedEdgeId),
          edgeCycleArrow: () => cr.onEdgeCycleArrow?.(cr.selectedEdgeId),
          drawingDuplicate: () => cr.duplicateSelectedDrawing?.(),
          drawingDelete: () => cr.deleteSelectedDrawing?.(),
          drawingColorSection: () => triggerSection('drawing-color'),
          drawingStrokeWidthSection: () => triggerSection('drawing-stroke-width'),
        },
      });
    });

    const caption = (action: ToolbarAction) => {
      if (action.key === 'lock') return t(action.label === 'Unlock' ? 'toolbarUnlock' : 'toolbarLock');
      if (action.key === 'hide') return t(props.canvasRef?.areSelectedNodesHidden?.() ? 'show' : 'hide');
      const labels: Record<string, Parameters<typeof t>[0]> = { 'edit-text': 'toolbarEdit', 'image-title': 'toolbarTitle', 'fill': 'background', 'duplicate': 'duplicate', 'delete': 'delete', 'drawing-color': 'color', 'drawing-stroke-width': 'width', 'drawing-duplicate': 'duplicate', 'drawing-delete': 'delete' };
      return labels[action.key] ? t(labels[action.key]!) : action.label;
    };

    const layerActions = computed(() => actions.value.filter(action => ['layer-up', 'layer-down', 'bring-front', 'send-back'].includes(action.key)));
    const visibleActions = computed<ToolbarAction[]>(() => {
      if (selectionKind.value !== 'node') return actions.value.slice(0, MAX_VISIBLE_ACTIONS);
      const section = (key: string, label: string): ToolbarAction => ({ key, label, isSectionToggle: true, disabled: props.role === 'read', handler: () => triggerSection(key) });
      return [
        ...(props.canvasRef?.isTextNode?.(nodeId.value) ? [section('layers', t('layers'))] : actions.value.filter(action => action.key === 'image-title')),
        ...actions.value.filter(action => action.key === 'fill'),
        section('shape', t('shape')),
        section('border-settings', t('border')),
        ...(props.canvasRef?.isTextNode?.(nodeId.value) ? [section('text-settings', t('text'))] : []),
        ...(props.canvasRef?.isTextNode?.(nodeId.value) ? actions.value.filter(action => action.key === 'edit-text') : [section('layers', t('layers'))]),
        ...actions.value.filter(action => ['lock', 'duplicate'].includes(action.key)),
        ...actions.value.filter(action => action.key === 'hide'),
        ...actions.value.filter(action => action.key === 'delete'),
      ];
    });
    const overflowActions = computed(() => selectionKind.value === 'node'
      ? []
      : actions.value.slice(MAX_VISIBLE_ACTIONS));

    const paletteColors = computed<string[]>(() => paletteKind.value === 'fill'
      ? ['1', '2', '3', '4', '5', '6']
      : paletteKind.value === 'text' ? (props.canvasRef?.fontColors ?? [])
      : ['#fb464c', '#e9973f', '#e0de71', '#44cf6e', '#53dfdd', '#a882ff', '#ffffff']);
    const paletteLabel = computed(() => t(paletteKind.value === 'fill' ? 'backgroundColor' : paletteKind.value === 'text' ? 'textColor' : 'borderColor'));
    const popupLabel = computed(() => {
      const labels: Partial<Record<Popup, Parameters<typeof t>[0]>> = { shape: 'shape', layers: 'layers', 'border-width': 'width', 'border-style': 'style', 'first-line': 'firstLine', 'body-text': 'bodyText' };
      return t(labels[colorPopup.value ?? 'fill'] ?? 'color');
    });
    const pageLabel = computed(() => {
      const labels: Record<string, Parameters<typeof t>[0]> = { fill: 'background', shape: 'shape', 'text-settings': 'text', 'border-settings': 'border', layers: 'layers', 'image-title': 'toolbarTitle', 'drawing-color': 'color', 'drawing-stroke-width': 'width' };
      return t(labels[activeSection.value || drawingSection.value || ''] ?? 'nodeActions');
    });
    const backToMenu = () => {
      if (colorPopup.value) { colorPopup.value = null; return; }
      activeSection.value = null;
      drawingSection.value = null;
      overflowOpen.value = false;
      const anchor = actionAnchor.value;
      void nextTick(() => {
        if (!anchor) return;
        const label = anchor.getAttribute('aria-label');
        const toolbar = toolbarElement.value?.querySelector('.mobile-node-toolbar-row');
        Array.from(toolbar?.querySelectorAll<HTMLElement>('button') ?? []).find(button => button.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
      });
    };
    const toggleColorPopup = (palette: Popup, event: MouseEvent) => {
      colorAnchor.value = event.currentTarget as HTMLElement;
      colorPopup.value = colorPopup.value === palette ? null : palette;
    };
    const isPaletteColorActive = (color: string) => {
      const cr = props.canvasRef;
      return paletteKind.value === 'fill' ? cr?.getNodeColor(nodeId.value) === color
        : paletteKind.value === 'text' ? cr?.isNodeFontColorActive(cr?.getNodeFontColor(nodeId.value), color)
        : cr?.getNodeBorderColor(nodeId.value) === color;
    };
    const chooseColor = (color: string | undefined) => {
      const cr = props.canvasRef;
      if (colorPopup.value === 'fill') cr?.setNodeColor(nodeId.value, color);
      else if (colorPopup.value === 'text') cr?.setNodeFontColor(nodeId.value, color);
      else if (colorPopup.value === 'border') cr?.setNodeBorderColor(nodeId.value, color);
    };

    const toggleOverflow = () => {
      overflowOpen.value = !overflowOpen.value;
      activeSection.value = null;
      drawingSection.value = null;
      colorPopup.value = null;
    };

    const triggerSection = (section: string) => {
      if (section === 'fill' || section === 'shape' || section === 'layers') {
        activeSection.value = null;
        drawingSection.value = null;
        overflowOpen.value = false;
        colorPopup.value = colorPopup.value === section ? null : section;
        return;
      }
      colorPopup.value = null;
      overflowOpen.value = false;
      if (DRAWING_SECTIONS.includes(section)) {
        drawingSection.value = drawingSection.value === section ? null : section;
        activeSection.value = null;
      } else {
        activeSection.value = activeSection.value === section ? null : section;
        drawingSection.value = null;
      }
    };

    // Close sub-panel / overflow when selection changes.
    watch([selectionKind, nodeId], () => {
      colorPopup.value = null;
      activeSection.value = null;
      drawingSection.value = null;
      overflowOpen.value = false;
    });

    const onActionClick = (action: ToolbarAction, event: MouseEvent) => {
      actionAnchor.value = event.currentTarget as HTMLElement;
      colorAnchor.value = event.currentTarget as HTMLElement;
      action.handler();
      if (!action.isSectionToggle) {
        activeSection.value = null;
        drawingSection.value = null;
        colorPopup.value = null;
        overflowOpen.value = false;
      }
    };

    const onOverflowActionClick = (action: NodeAction) => {
      overflowOpen.value = false;
      action.handler();
      if (!action.isSectionToggle) {
        activeSection.value = null;
        drawingSection.value = null;
      }
    };

    // Android system Back closes an open sub-panel / popup / "more" sheet first;
    // the selection itself is cleared by CanvasView's handler on the next press.
    // Mounted after CanvasView, so this handler is asked before the view's one.
    useBackHandler(() => {
      if (colorPopup.value) { colorPopup.value = null; return true; }
      if (!overflowOpen.value && !activeSection.value && !drawingSection.value) return false;
      overflowOpen.value = false;
      activeSection.value = null;
      drawingSection.value = null;
      return true;
    });

    const onTitleInput = (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      props.canvasRef?.setNodeTitle?.(nodeId.value, val);
    };

    const iconProps = (_key: string) => ({
      width: 20, height: 20, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'none',
    });

    const iconPath = (key: string): string => {
      const alias = key === 'text-settings' ? 'text-color' : key === 'border-settings' ? 'border-style' : key === 'layers' ? 'layer-up'
        : key === 'lock' && props.canvasRef?.isNodePositionLocked?.(nodeId.value) ? 'unlock' : key;
      return ICON_PATHS[alias] ?? '';
    };

    return {
      t, caption, pageLabel, backToMenu, toolbarElement, paletteOpen, popupLabel,
      selectionKind,
      nodeId,
      visibleActions,
      overflowActions,
      layerActions,
      colorPopup,
      paletteKind,
      colorAnchor,
      paletteColors,
      paletteLabel,
      toggleColorPopup,
      isPaletteColorActive,
      chooseColor,
      toggleOverflow,
      activeSection,
      drawingSection,
      overflowOpen,
      aligns,
      iconProps,
      iconPath,
      onActionClick,
      onOverflowActionClick,
      onTitleInput,
    };
  },
});
</script>

<style scoped>
.mobile-node-subpanel { width: 100%; box-sizing: border-box; }
.mobile-settings-viewport { position: relative; overflow: hidden; }
.mobile-settings-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mobile-settings-back { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); font-size: 20px; cursor: pointer; }
.mobile-settings-heading { color: var(--ui-text); font-size: 13px; font-weight: 600; }
.mobile-shape-option { display: flex; flex: 1; align-items: center; justify-content: center; gap: 6px; min-height: 40px; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); font: inherit; font-size: 12px; cursor: pointer; }
.mobile-shape-option.active { background: color-mix(in srgb, var(--ui-accent-strong) 14%, transparent); }
.mobile-settings-back:focus-visible, .mobile-shape-option:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: -2px; }
.mobile-settings-screen-enter-active, .mobile-settings-screen-leave-active { transition: opacity 180ms ease, transform 180ms cubic-bezier(0.2, 0, 0, 1); }
.mobile-settings-screen-leave-active { position: absolute; inset: 0 0 auto; pointer-events: none; }
.mobile-settings-screen-enter-from { opacity: 0; transform: translateX(8px); }
.mobile-settings-screen-leave-to { opacity: 0; transform: translateX(-8px); }
@media (prefers-reduced-motion: reduce) {
  .mobile-settings-screen-enter-active, .mobile-settings-screen-leave-active { transition: none; }
  .mobile-settings-screen-enter-from, .mobile-settings-screen-leave-to { transform: none; }
}
</style>
