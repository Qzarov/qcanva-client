<template>
  <div
    v-if="contextMenu.visible"
    class="context-menu"
    :style="contextMenuStyle"
    @mousedown.stop
  >
    <template v-if="contextMenu.kind === 'edge'">
      <button class="ctx-item" @click="onEdgeToggleStyle(); closeContextMenu()">Стиль линии</button>
      <button class="ctx-item" @click="onEdgeCycleArrow(); closeContextMenu()">Тип стрелки</button>
      <button class="ctx-item" @click="onEdgeCycleColor(); closeContextMenu()">Цвет линии</button>
      <button class="ctx-item" @click="onEdgeDblClick(contextMenu.id); closeContextMenu()">Подпись</button>
      <button v-if="isOwner" class="ctx-item" @click="toggleEdgeHidden(contextMenu.id); closeContextMenu()">{{ isEdgeHidden(contextMenu.id) ? 'Показать' : 'Скрыть' }}</button>
      <button class="ctx-item ctx-item-danger" @click="onDeleteEdge(); closeContextMenu()">Удалить</button>
    </template>
    <template v-else-if="contextMenu.kind === 'drawing'">
      <div class="ctx-colors">
        <span class="ctx-label">Цвет</span>
        <button class="ctx-color-btn" :style="{ background: selectedDrawingObj?.color }" :aria-label="t('color')" :aria-expanded="contextColorPopup === 'drawing'" @click="toggleContextColorMenu('drawing', $event)" />
      </div>
      <CanvasColorMenu :open="contextColorPopup === 'drawing'" :anchor="contextColorAnchor" :label="t('color')" @close="closeContextColorPopup">
        <button v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000']" :key="'ctxd-'+c" class="ctx-color-btn" :style="{ background: c }" @click="setSelectedDrawingColor(c)"></button>
      </CanvasColorMenu>
      <button class="ctx-item" @click="duplicateSelectedDrawing(); closeContextMenu()">Дублировать</button>
      <button v-if="isOwner" class="ctx-item" @click="toggleSelectedDrawingHidden(); closeContextMenu()">{{ isSelectedDrawingHidden() ? 'Показать' : 'Скрыть' }}</button>
      <button class="ctx-item ctx-item-danger" @click="deleteSelectedDrawing(); closeContextMenu()">Удалить</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CanvasColorMenu from '../../canvas/CanvasColorMenu.vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const contextMenu = computed(() => context.value.contextMenu);
const contextMenuStyle = computed(() => context.value.contextMenuStyle);
const contextColorPopup = computed(() => context.value.contextColorPopup);
const contextColorAnchor = computed(() => context.value.contextColorAnchor);
const selectedDrawingObj = computed(() => context.value.selectedDrawingObj);
const isOwner = computed(() => context.value.isOwner);
const t = computed(() => context.value.t);
const onEdgeToggleStyle = computed(() => context.value.onEdgeToggleStyle);
const onEdgeCycleArrow = computed(() => context.value.onEdgeCycleArrow);
const onEdgeCycleColor = computed(() => context.value.onEdgeCycleColor);
const onEdgeDblClick = computed(() => context.value.onEdgeDblClick);
const toggleEdgeHidden = computed(() => context.value.toggleEdgeHidden);
const isEdgeHidden = computed(() => context.value.isEdgeHidden);
const onDeleteEdge = computed(() => context.value.onDeleteEdge);
const toggleContextColorMenu = computed(() => context.value.toggleContextColorMenu);
const closeContextColorPopup = computed(() => context.value.closeContextColorPopup);
const setSelectedDrawingColor = computed(() => context.value.setSelectedDrawingColor);
const duplicateSelectedDrawing = computed(() => context.value.duplicateSelectedDrawing);
const toggleSelectedDrawingHidden = computed(() => context.value.toggleSelectedDrawingHidden);
const isSelectedDrawingHidden = computed(() => context.value.isSelectedDrawingHidden);
const deleteSelectedDrawing = computed(() => context.value.deleteSelectedDrawing);
const closeContextMenu = computed(() => context.value.closeContextMenu);
</script>
