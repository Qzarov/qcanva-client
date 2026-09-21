<template>
  <!-- Shown only when there is an active selection and not editing text -->
  <div v-if="selectionKind !== 'none'" class="mobile-node-toolbar" role="toolbar" :aria-label="t('nodeActions')">
    <!-- Sub-panel: expands above the icon row for fill/text color/border sections (non-drawing) -->
    <div v-if="activeSection" class="mobile-node-subpanel" @click.stop>
      <!-- Fill (background) colors -->
      <template v-if="activeSection === 'fill'">
        <div class="mobile-subpanel-colors">
          <button
            v-for="c in ['1','2','3','4','5','6']"
            :key="'mf'+c"
            class="tb-color"
            :class="['ctx-color-'+c, { active: canvasRef?.getNodeColor(nodeId) === c }]"
            :aria-label="t('backgroundColor') + ' ' + c"
            @click="canvasRef?.setNodeColor(nodeId, c)"
          />
          <button
            class="tb-color tb-color-none"
            :aria-label="t('clearColor')"
            @click="canvasRef?.setNodeColor(nodeId, undefined)"
          >×</button>
        </div>
        <div class="mobile-subpanel-row">
          <button
            class="block-menu-toggle"
            :class="{ active: canvasRef?.getNodeFillStyle(nodeId) === 'solid' }"
            @click="canvasRef?.toggleNodeFillStyle(nodeId)"
          >{{ canvasRef?.getNodeFillStyle(nodeId) === 'solid' ? t('solid') : t('gradient') }}</button>
          <button
            class="block-menu-toggle"
            :class="{ active: canvasRef?.isNodeTransparent(nodeId) }"
            @click="canvasRef?.toggleNodeTransparent(nodeId)"
          >{{ canvasRef?.isNodeTransparent(nodeId) ? t('transparent') : t('withBackground') }}</button>
          <button
            class="block-menu-toggle"
            :class="{ active: canvasRef?.getNodeShape(nodeId) === 'round' }"
            @click="canvasRef?.toggleNodeShape(nodeId)"
          >{{ canvasRef?.getNodeShape(nodeId) === 'round' ? t('round') : t('rectangular') }}</button>
        </div>
      </template>

      <!-- Text (font) colors -->
      <template v-if="activeSection === 'text-color'">
        <div class="mobile-subpanel-colors">
          <button
            v-for="c in canvasRef?.fontColors ?? []"
            :key="'mtc'+c"
            class="tb-color"
            :class="{ active: canvasRef?.getNodeFontColor(nodeId) === c }"
            :style="{ background: c }"
            :aria-label="t('textColor') + ' ' + c"
            @click="canvasRef?.setNodeFontColor(nodeId, c)"
          />
          <button
            class="tb-color tb-color-none"
            :aria-label="t('clearColor')"
            @click="canvasRef?.setNodeFontColor(nodeId, undefined)"
          >×</button>
        </div>
      </template>

      <!-- Border color -->
      <template v-if="activeSection === 'border-color'">
        <div class="mobile-subpanel-colors">
          <button
            v-for="c in ['#fb464c','#e9973f','#e0de71','#44cf6e','#53dfdd','#a882ff','#ffffff']"
            :key="'mbc'+c"
            class="tb-color"
            :class="{ active: canvasRef?.getNodeBorderColor(nodeId) === c }"
            :style="{ background: c }"
            :aria-label="t('borderColor') + ' ' + c"
            @click="canvasRef?.setNodeBorderColor(nodeId, c)"
          />
          <button
            class="tb-color tb-color-none"
            :aria-label="t('clearColor')"
            @click="canvasRef?.setNodeBorderColor(nodeId, undefined)"
          >×</button>
        </div>
      </template>

      <!-- Border style & width -->
      <template v-if="activeSection === 'border-style'">
        <div class="mobile-subpanel-row block-menu-pop-wrap">
          <button
            v-for="bs in canvasRef?.borderStyles ?? []"
            :key="bs.value"
            class="tb-btn"
            :class="{ active: canvasRef?.getNodeBorderStyle(nodeId) === bs.value }"
            @click="canvasRef?.setNodeBorderStyle(nodeId, bs.value)"
            :title="bs.label"
            v-html="'<svg width=\'24\' height=\'10\' viewBox=\'0 0 24 10\'>' + bs.svg + '</svg>'"
          />
          <span class="tb-sep"></span>
          <button
            v-for="bw in [1,2,3,4]"
            :key="'mw'+bw"
            class="tb-btn"
            :class="{ active: canvasRef?.getNodeBorderWidth(nodeId) === bw }"
            @click="canvasRef?.setNodeBorderWidth(nodeId, bw)"
            :title="bw+'px'"
          >
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" :stroke-width="bw"/></svg>
          </button>
        </div>
      </template>

      <!-- Text alignment -->
      <template v-if="activeSection === 'alignment'">
        <div class="mobile-subpanel-row block-menu-pop-wrap">
          <span class="block-menu-sublabel">{{ t('firstLineShort') }}</span>
          <button
            v-for="a in aligns"
            :key="'mfa-'+a.v"
            class="tb-btn"
            :class="{ active: canvasRef?.getNodeFirstLineAlign(nodeId) === a.v }"
            @click="canvasRef?.setNodeFirstLineAlign(nodeId, a.v)"
            :title="a.l"
            v-html="a.icon"
          />
          <span class="tb-sep"></span>
          <span class="block-menu-sublabel">{{ t('text') }}</span>
          <button
            v-for="a in aligns"
            :key="'mba-'+a.v"
            class="tb-btn"
            :class="{ active: canvasRef?.getNodeAlign(nodeId) === a.v }"
            @click="canvasRef?.setNodeAlign(nodeId, a.v)"
            :title="a.l"
            v-html="a.icon"
          />
        </div>
      </template>

      <!-- Image / group title -->
      <template v-if="activeSection === 'image-title'">
        <div class="mobile-subpanel-row">
          <input
            class="block-menu-text-input mobile-subpanel-title-input"
            :value="canvasRef?.getNodeTitle(nodeId)"
            :placeholder="canvasRef?.isGroupNode(nodeId) ? t('groupName') : t('imageName')"
            @input="onTitleInput"
            @keydown.stop
          />
        </div>
      </template>
    </div>

    <!-- Drawing popup: floats above the icon row without changing toolbar height -->
    <div v-if="drawingSection" class="mobile-drawing-popup" @click.stop>
      <template v-if="drawingSection === 'drawing-color'">
        <div class="mobile-drawing-popup-colors">
          <button
            v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000','#ffffff']"
            :key="'mdpc'+c"
            class="mobile-drawing-popup-swatch"
            :class="{ active: canvasRef?.selectedDrawingObj?.color === c }"
            :style="{ background: c }"
            :aria-label="c"
            @click="canvasRef?.setSelectedDrawingColor(c); drawingSection = null"
          />
        </div>
      </template>
      <template v-else-if="drawingSection === 'drawing-stroke-width'">
        <div class="mobile-drawing-popup-width">
          <input
            class="mobile-drawing-popup-width-slider"
            type="range" min="1" max="20"
            :value="canvasRef?.selectedDrawingObj?.width ?? 4"
            @input="canvasRef?.setSelectedDrawingWidth(Number(($event.target as HTMLInputElement).value))"
            :aria-label="t('width')"
          />
          <span class="mobile-drawing-popup-width-label">{{ canvasRef?.selectedDrawingObj?.width ?? 4 }}</span>
        </div>
      </template>
    </div>
    <!-- Backdrop closes drawing popup on tap-outside -->
    <Teleport to="body">
      <div v-if="drawingSection" class="mobile-drawing-popup-backdrop" @click="drawingSection = null" aria-hidden="true"/>
    </Teleport>

    <!-- Icon row -->
    <div class="mobile-node-toolbar-row">
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
          @click="onActionClick(action)"
        >
          <component :is="'svg'" v-bind="iconProps(action.key)" v-html="iconPath(action.key)" aria-hidden="true" />
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
        @click="overflowOpen = !overflowOpen; activeSection = null"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8"/>
          <circle cx="12" cy="12" r="1.8"/>
          <circle cx="19" cy="12" r="1.8"/>
        </svg>
      </button>
    </div>

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
import { computed, defineComponent, ref, watch, type PropType } from 'vue';
import { buildNodeActions, getSelectionKind, MAX_VISIBLE_ACTIONS, type NodeAction } from './nodeActions';
import { useI18n } from '../composables/useI18n';

const ICON_PATHS: Record<string, string> = {
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
  props: {
    canvasRef: { type: Object as PropType<any>, default: null },
    role: { type: String as PropType<string>, default: 'read' },
  },
  setup(props) {
    const { t } = useI18n();

    const activeSection = ref<string | null>(null);
    const drawingSection = ref<string | null>(null);
    const overflowOpen = ref(false);

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
        handlers: {
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

    const visibleActions = computed(() => actions.value.slice(0, MAX_VISIBLE_ACTIONS));
    const overflowActions = computed(() => actions.value.slice(MAX_VISIBLE_ACTIONS));

    const triggerSection = (section: string) => {
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
    watch(selectionKind, () => {
      activeSection.value = null;
      drawingSection.value = null;
      overflowOpen.value = false;
    });

    const onActionClick = (action: NodeAction) => {
      action.handler();
      if (!action.isSectionToggle) {
        activeSection.value = null;
        drawingSection.value = null;
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

    const onTitleInput = (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      props.canvasRef?.setNodeTitle?.(nodeId.value, val);
    };

    const iconProps = (_key: string) => ({
      width: 20, height: 20, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'none',
    });

    const iconPath = (key: string): string => ICON_PATHS[key] ?? '';

    return {
      t,
      selectionKind,
      nodeId,
      visibleActions,
      overflowActions,
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
