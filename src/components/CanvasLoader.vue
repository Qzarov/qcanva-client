<template>
  <div
    class="canvas-viewport"
    :class="{ 'is-manipulating': isManipulatingNode }"
    ref="viewport"
    @wheel.prevent="onWheel"
    @mousedown="onPanStart"
    @mousemove="onPanMove"
    @mouseup="onPanEnd"
    @mouseleave="onPanEnd"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @dblclick.prevent="onCanvasDblClick"
  >
    <div class="canvas-world" :style="worldStyle">
      <!-- Groups (rendered behind everything) -->
      <div
        v-for="group in groups"
        :key="group.id"
        class="canvas-group"
        :data-node-id="group.id"
        :class="[groupColorClass(group), nodePresentationClass(group), { 'is-selected': isNodeSelected(group.id), 'is-dragging': dragNodeId === group.id, 'is-locked': isNodePositionLocked(group.id), 'is-flash': flashNodeId === group.id, 'is-hidden': group.hidden }]"
        :style="nodePosition(group)"
        @mousedown.stop="onNodeDragStart($event, group)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, group)"
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
          <marker
            id="arrowhead-start"
            markerWidth="8"
            markerHeight="6"
            refX="1"
            refY="3"
            orient="auto"
          >
            <polygon points="8 0, 0 3, 8 6" fill="rgba(255,255,255,0.35)" />
          </marker>
          <template v-for="color in edgeColors" :key="color">
            <marker
              :id="'arrowhead-' + color.replace('#', '')"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" :fill="color" />
            </marker>
            <marker
              :id="'arrowhead-start-' + color.replace('#', '')"
              markerWidth="8"
              markerHeight="6"
              refX="1"
              refY="3"
              orient="auto"
            >
              <polygon points="8 0, 0 3, 8 6" :fill="color" />
            </marker>
          </template>
        </defs>
        <g :transform="edgesSvgTransform">
          <g v-for="edge in renderedEdges" :key="edge.id" :style="{ opacity: edge.hidden ? 0.4 : 1 }">
            <!-- Invisible wide hit area for clicking -->
            <path
              :d="edge.path"
              class="edge-hit"
              @mousedown.stop="onEdgeClick(edge.id)"
              @dblclick.stop="onEdgeDblClick(edge.id)"
              @contextmenu.prevent.stop="onEdgeContextMenu($event, edge)"
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
              :marker-end="(edge.arrowType === 'end' || edge.arrowType === 'both') ? 'url(#' + arrowMarkerId(edge.color, false) + ')' : undefined"
              :marker-start="(edge.arrowType === 'start' || edge.arrowType === 'both') ? 'url(#' + arrowMarkerId(edge.color, true) + ')' : undefined"
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
            <!-- Midpoint connector for branching -->
            <circle
              :cx="edge.midX"
              :cy="edge.midY"
              r="5"
              class="edge-midpoint-conn"
              @mousedown.stop="onConnStartFromEdge($event, edge.id)"
            />
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
        @dblclick.stop
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
        <button class="edge-action-btn" @mousedown.stop="onEdgeCycleArrow" title="Arrow type">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="15 8 19 12 15 16"/>
          </svg>
        </button>
        <button class="edge-action-btn" @mousedown.stop="onEdgeCycleColor" title="Change color">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
        </button>
        <button v-if="isOwner" class="edge-action-btn" @mousedown.stop="toggleEdgeHidden(selectedEdgeId!)" :title="isEdgeHidden(selectedEdgeId!) ? 'Показать' : 'Скрыть'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><line v-if="isEdgeHidden(selectedEdgeId!)" x1="2" y1="2" x2="22" y2="22"/>
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

      <!-- Text nodes -->
      <div
        v-for="node in textNodes"
        :key="node.id"
        class="canvas-node"
        :data-node-id="node.id"
        :class="[nodeColorClass(node), nodePresentationClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id), 'is-locked': isNodePositionLocked(node.id), 'is-flash': flashNodeId === node.id, 'is-hidden': node.hidden }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
        @dblclick.prevent.stop="onNodeDblClick(node)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
      >
        <!-- Edit mode -->
        <textarea
          v-if="editingNodeId === node.id"
          class="node-editor"
          :style="{ color: node.fontColor || undefined }"
          :value="node.text"
          @input="onEditInput($event, node)"
          @blur="onEditEnd"
          @mousedown.stop
          @mousemove.stop
          @mouseup.stop
          @click.stop
          @dblclick.stop
          @keydown.stop
          @keyup.stop
          @keydown.escape="onEditEnd"
          ref="editorRefs"
        ></textarea>
        <!-- View mode -->
        <div v-else class="node-content" :style="{ color: node.fontColor || undefined }">
          <div
            class="node-first-line"
            :style="{ textAlign: getNodeFirstLineAlignValue(node) }"
            v-html="renderMarkdown(getNodeFirstLine(node.text || ''))"
          ></div>
          <div
            v-if="getNodeRestText(node.text || '')"
            class="node-rest-content"
            :style="{ textAlign: node.textAlign || undefined }"
            v-html="renderMarkdown(getNodeRestText(node.text || ''))"
          ></div>
        </div>
        <button
          v-if="isNodeSelected(node.id) && editingNodeId !== node.id && !readonly"
          class="node-edit-trigger"
          type="button"
          title="Edit text"
          @touchstart.stop
          @mousedown.stop
          @click.stop="onNodeDblClick(node)"
        >
          Edit
        </button>
        <!-- Resize handles (visible when selected) -->
        <template v-if="isNodeSelected(node.id) && editingNodeId !== node.id && !isNodePositionLocked(node.id)">
          <div class="resize-handle resize-handle-br" data-handle="br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
          <div class="resize-handle resize-handle-bl" data-handle="bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
          <div class="resize-handle resize-handle-tr" data-handle="tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
          <div class="resize-handle resize-handle-tl" data-handle="tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
          <div class="resize-handle resize-handle-r" data-handle="r" @mousedown.stop="onResizeStart($event, node, 'r')"></div>
          <div class="resize-handle resize-handle-l" data-handle="l" @mousedown.stop="onResizeStart($event, node, 'l')"></div>
          <div class="resize-handle resize-handle-t" data-handle="t" @mousedown.stop="onResizeStart($event, node, 't')"></div>
          <div class="resize-handle resize-handle-b" data-handle="b" @mousedown.stop="onResizeStart($event, node, 'b')"></div>
        </template>
        <!-- Connection points (visible on hover) -->
        <div class="conn-point conn-top" data-conn-side="top" @mousedown.stop="onConnStart($event, node, 'top')"></div>
        <div class="conn-point conn-bottom" data-conn-side="bottom" @mousedown.stop="onConnStart($event, node, 'bottom')"></div>
        <div class="conn-point conn-left" data-conn-side="left" @mousedown.stop="onConnStart($event, node, 'left')"></div>
        <div class="conn-point conn-right" data-conn-side="right" @mousedown.stop="onConnStart($event, node, 'right')"></div>
      </div>

      <!-- Link nodes -->
      <div
        v-for="node in linkNodes"
        :key="node.id"
        class="canvas-node canvas-node-link"
        :data-node-id="node.id"
        :class="[nodePresentationClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id), 'is-locked': isNodePositionLocked(node.id), 'is-flash': flashNodeId === node.id, 'is-hidden': node.hidden }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
      >
        <div class="node-link-header">
          <a :href="node.url" target="_blank" rel="noopener">{{ node.url }}</a>
        </div>
      </div>
      <!-- Image nodes -->
      <div
        v-for="node in imageNodes"
        :key="node.id"
        class="canvas-node canvas-node-image"
        :data-node-id="node.id"
        :class="[nodePresentationClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id), 'is-locked': isNodePositionLocked(node.id), 'is-flash': flashNodeId === node.id, 'is-hidden': node.hidden }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
      >
        <div v-if="node.label" class="node-image-title">{{ node.label }}</div>
        <img class="node-image" :src="node.file" :alt="node.label || 'Image'" draggable="false" />
        <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id)">
          <div class="resize-handle resize-handle-br" data-handle="br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
          <div class="resize-handle resize-handle-bl" data-handle="bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
          <div class="resize-handle resize-handle-tr" data-handle="tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
          <div class="resize-handle resize-handle-tl" data-handle="tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
        </template>
      </div>
      <!-- Interactive template nodes -->
      <div
        v-for="node in templateNodes"
        :key="node.id"
        class="canvas-node canvas-node-template"
        :data-node-id="node.id"
        :class="[nodePresentationClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id), 'is-locked': isNodePositionLocked(node.id), 'is-hidden': node.hidden }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
        :tabindex="isNodeSelected(node.id) ? 0 : -1"
        @keydown.enter.prevent="enterDndInteraction(node)"
        @keydown.esc.stop="exitDndInteraction(node)"
      >
        <template v-if="node.templateId === 'dnd-character'">
          <section class="dnd-sheet" :class="{ 'is-compact': dndSheet(node).displayMode === 'compact' || node.width < 720 || node.height < 480, 'is-interacting': isDndInteracting(node) }" @mousedown="onDndSheetMouseDown($event, node)">
            <button class="dnd-mode-toggle" type="button" :class="{ active: isDndInteracting(node) }" :title="isDndInteracting(node) ? 'Завершить взаимодействие (Esc)' : 'Редактировать карточку (Enter)'" :aria-label="isDndInteracting(node) ? 'Завершить взаимодействие' : 'Редактировать карточку'" @mousedown.stop @click.stop="toggleDndInteraction(node)">{{ isDndInteracting(node) ? '✓' : '✎' }}</button>
            <div class="dnd-sheet-content" :inert="!isDndInteracting(node)">
            <header class="dnd-sheet-head">
              <div class="dnd-portrait-wrap"><div class="dnd-portrait" :class="{ empty: !dndSheet(node).identity.portraitUrl }"><img v-if="dndSheet(node).identity.portraitUrl" :src="dndSheet(node).identity.portraitUrl" alt="Портрет персонажа" /><span v-else>{{ dndSheet(node).identity.name.slice(0, 1).toUpperCase() }}</span></div><div v-if="!readonly" class="dnd-portrait-actions"><button aria-label="Загрузить портрет" @click.stop="openDndPortraitPicker(node)">▣</button><button v-if="dndSheet(node).identity.portraitUrl" aria-label="Удалить портрет" @click.stop="setDndIdentity(node, 'portraitUrl', '')">×</button></div></div>
              <div class="dnd-identity"><input aria-label="Имя персонажа" :readonly="readonly" :value="dndSheet(node).identity.name" @change="setDndIdentity(node, 'name', ($event.target as HTMLInputElement).value)" /><span><input aria-label="Раса" :readonly="readonly" :value="dndSheet(node).identity.race" placeholder="Раса" @change="setDndIdentity(node, 'race', ($event.target as HTMLInputElement).value)" /> · <input aria-label="Класс" :readonly="readonly" :value="dndSheet(node).identity.className" placeholder="Класс" @change="setDndIdentity(node, 'className', ($event.target as HTMLInputElement).value)" /></span></div>
              <label class="dnd-level">ур.<input aria-label="Уровень" type="number" min="1" :readonly="readonly" :value="dndSheet(node).identity.level" @change="setDndNumber(node, 'level', ($event.target as HTMLInputElement).value)" /></label>
              <button class="dnd-collapse" :aria-label="dndSheet(node).displayMode === 'compact' ? 'Развернуть карточку' : 'Свернуть карточку'" :disabled="readonly" @click.stop="toggleDndMode(node)">{{ dndSheet(node).displayMode === 'compact' ? '⤢' : '⤡' }}</button>
            </header>
            <div class="dnd-combat-row"><label>КД <input type="number" min="0" :readonly="readonly" :value="dndSheet(node).combat.armorClass" @change="setDndCombat(node, 'armorClass', ($event.target as HTMLInputElement).value)" /></label><label>Скорость <input type="number" min="0" :readonly="readonly" :value="dndSheet(node).combat.speed" @change="setDndCombat(node, 'speed', ($event.target as HTMLInputElement).value)" /></label><label>HP <button :disabled="readonly" @click.stop="changeDndHp(node, -1)">−</button><input type="number" min="0" :readonly="readonly" :value="dndSheet(node).combat.currentHp" @change="setDndCombat(node, 'currentHp', ($event.target as HTMLInputElement).value)" /><b>/</b><input type="number" min="1" :readonly="readonly" :value="dndSheet(node).combat.maxHp" @change="setDndCombat(node, 'maxHp', ($event.target as HTMLInputElement).value)" /><button :disabled="readonly" @click.stop="changeDndHp(node, 1)">+</button></label><label class="dnd-temp">Врем. <input type="number" min="0" :readonly="readonly" :value="dndSheet(node).combat.temporaryHp" @change="setDndCombat(node, 'temporaryHp', ($event.target as HTMLInputElement).value)" /></label></div>
            <div class="dnd-card-abilities"><article v-for="ability in dndAbilities" :key="ability.key"><button :disabled="readonly" @click.stop="rollTemplateAbility(node, ability.key)"><span>{{ ability.short }}</span><strong>{{ dndSheet(node).abilities[ability.key].score }}</strong><em>{{ formatDndModifier(dndSheet(node).abilities[ability.key].score) }}</em></button><input aria-label="Значение характеристики" type="number" min="1" max="30" :readonly="readonly" :value="dndSheet(node).abilities[ability.key].score" @change="setDndAbilityScore(node, ability.key, ($event.target as HTMLInputElement).value)" /><label title="Владение спасброском"><input type="checkbox" :checked="dndSheet(node).abilities[ability.key].savingThrowProficient" :disabled="readonly" @change="toggleDndSave(node, ability.key)" /> Спас {{ formatDndModifier(dndSavingThrow(node, ability.key)) }}</label></article></div>
            <div v-if="dndSheet(node).displayMode !== 'compact' && node.width >= 720 && node.height >= 480" class="dnd-full-content"><nav class="dnd-tabs"><button v-for="tab in dndTabs" :key="tab.key" :class="{ active: dndSheet(node).activeTab === tab.key }" :disabled="readonly" @click.stop="setDndTab(node, tab.key)">{{ tab.label }}</button></nav><div class="dnd-tab-panel"><template v-if="dndSheet(node).activeTab === 'notes'"><textarea aria-label="Заметки персонажа" :readonly="readonly" :value="dndSheet(node).notes" placeholder="Заметки персонажа" @change="setDndNotes(node, ($event.target as HTMLTextAreaElement).value)" /></template><template v-else-if="dndSheet(node).activeTab === 'personality'"><label v-for="field in dndPersonalityFields" :key="field.key">{{ field.label }}<textarea :readonly="readonly" :value="dndSheet(node).personality[field.key]" @change="setDndPersonality(node, field.key, ($event.target as HTMLTextAreaElement).value)" /></label></template><template v-else><div class="dnd-list"><div v-for="item in dndTabItems(node)" :key="item.id" class="dnd-list-row"><input aria-label="Название" :readonly="readonly" :value="item.name" placeholder="Название" @change="updateDndListItem(node, item.id, 'name', ($event.target as HTMLInputElement).value)" /><template v-if="dndSheet(node).activeTab === 'equipment'"><input aria-label="Количество" type="number" min="0" :readonly="readonly" :value="item.quantity || 1" @change="updateDndListItem(node, item.id, 'quantity', Number(($event.target as HTMLInputElement).value) || 0)" /><label><input type="checkbox" :checked="item.equipped" :disabled="readonly" @change="updateDndListItem(node, item.id, 'equipped', !item.equipped)" /> экипировано</label></template><template v-else-if="dndSheet(node).activeTab === 'goals'"><label><input type="checkbox" :checked="item.completed" :disabled="readonly" @change="updateDndListItem(node, item.id, 'completed', !item.completed)" /> готово</label></template><template v-else-if="dndSheet(node).activeTab === 'spells'"><input aria-label="Уровень заклинания" type="number" min="0" max="9" :readonly="readonly" :value="item.level || 0" @change="updateDndListItem(node, item.id, 'level', Number(($event.target as HTMLInputElement).value) || 0)" /><label><input type="checkbox" :checked="item.prepared" :disabled="readonly" @change="updateDndListItem(node, item.id, 'prepared', !item.prepared)" /> подготовлено</label></template><template v-else-if="dndSheet(node).activeTab === 'features'"><input aria-label="Использований" type="number" min="0" :readonly="readonly" :value="item.currentUses || 0" @change="updateDndListItem(node, item.id, 'currentUses', Number(($event.target as HTMLInputElement).value) || 0)" /><span>/</span><input aria-label="Максимум использований" type="number" min="0" :readonly="readonly" :value="item.maxUses || 0" @change="updateDndListItem(node, item.id, 'maxUses', Number(($event.target as HTMLInputElement).value) || 0)" /></template><input aria-label="Описание" :readonly="readonly" :value="item.description || ''" placeholder="Описание" @change="updateDndListItem(node, item.id, 'description', ($event.target as HTMLInputElement).value)" /><button class="dnd-list-remove" aria-label="Удалить запись" :disabled="readonly" @click.stop="removeDndListItem(node, item.id)">×</button></div><button class="dnd-list-add" :disabled="readonly" @click.stop="addDndListItem(node)">+ Добавить</button></div></template></div></div>
            </div>
          </section>
        </template>
        <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id) && !isDndInteracting(node)">
          <div class="resize-handle resize-handle-br" data-handle="br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
          <div class="resize-handle resize-handle-bl" data-handle="bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
          <div class="resize-handle resize-handle-tr" data-handle="tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
          <div class="resize-handle resize-handle-tl" data-handle="tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
        </template>
      </div>
      <!-- Canvas embed nodes -->
      <div
        v-for="node in canvasNodes"
        :key="node.id"
        class="canvas-node canvas-node-embed"
        :data-node-id="node.id"
        :class="[nodePresentationClass(node), { 'is-dragging': dragNodeId === node.id, 'is-selected': isNodeSelected(node.id), 'is-locked': isNodePositionLocked(node.id), 'is-flash': flashNodeId === node.id, 'is-hidden': node.hidden }]"
        :style="nodePosition(node)"
        @mousedown.stop="onNodeDragStart($event, node)"
        @contextmenu.prevent.stop="onNodeContextMenu($event, node)"
        @dblclick.stop="onCanvasEmbedDblClick(node.canvasId!)"
      >
        <div class="embed-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="embed-icon">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
          <span class="embed-title">{{ getEmbeddedCanvasData(node.canvasId!).title || 'Loading...' }}</span>
        </div>
        <div class="embed-preview">
          <div v-if="getEmbeddedCanvasData(node.canvasId!).loading" class="embed-loading">Loading...</div>
          <div v-else-if="getEmbeddedCanvasData(node.canvasId!).error" class="embed-error">Cannot load canvas</div>
          <svg v-else class="embed-minimap" :viewBox="embeddedCanvasViewBox(node.canvasId!)" preserveAspectRatio="xMidYMid meet">
            <rect
              v-for="en in getEmbeddedCanvasData(node.canvasId!).nodes"
              :key="'emb-' + en.id"
              :x="en.x"
              :y="en.y"
              :width="en.width || 100"
              :height="en.height || 60"
              :fill="en.type === 'group' ? 'rgba(255,255,255,0.05)' : 'rgba(124,138,255,0.25)'"
              :stroke="en.type === 'group' ? 'rgba(255,255,255,0.1)' : 'rgba(124,138,255,0.5)'"
              stroke-width="2"
              rx="3"
            />
            <path
              v-for="ee in getEmbeddedCanvasData(node.canvasId!).edges"
              :key="'embe-' + ee.id"
              :d="embeddedEdgePath(ee, getEmbeddedCanvasData(node.canvasId!).nodes)"
              stroke="rgba(255,255,255,0.2)"
              stroke-width="1.5"
              fill="none"
            />
          </svg>
        </div>
        <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id)">
          <div class="resize-handle resize-handle-br" data-handle="br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
          <div class="resize-handle resize-handle-bl" data-handle="bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
          <div class="resize-handle resize-handle-tr" data-handle="tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
          <div class="resize-handle resize-handle-tl" data-handle="tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
        </template>
        <div class="conn-point conn-top" data-conn-side="top" @mousedown.stop="onConnStart($event, node, 'top')"></div>
        <div class="conn-point conn-bottom" data-conn-side="bottom" @mousedown.stop="onConnStart($event, node, 'bottom')"></div>
        <div class="conn-point conn-left" data-conn-side="left" @mousedown.stop="onConnStart($event, node, 'left')"></div>
        <div class="conn-point conn-right" data-conn-side="right" @mousedown.stop="onConnStart($event, node, 'right')"></div>
      </div>

      <!-- Drawings SVG layer (above nodes) -->
      <svg class="canvas-drawings" :style="edgesSvgStyle">
        <g :transform="edgesSvgTransform">
        <g v-for="d in renderList" :key="d.id" :style="{ opacity: d.hidden ? 0.4 : 1 }">
          <!-- pen / highlighter: wide transparent hit path + visible path -->
          <template v-if="d.tool === 'pen' || d.tool === 'highlighter'">
            <path
              :d="strokeToPath(d.points || [], d.width)"
              fill="transparent" stroke="transparent" stroke-width="18"
              stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"
              :style="{ pointerEvents: drawTool === 'select' ? 'all' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
              @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
              @pointermove="onDrawingPointerMove"
              @pointerup="onDrawingPointerUp"
              @pointercancel="onDrawingPointerUp"
              @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
            />
            <path
              :d="strokeToPath(d.points || [], d.width)"
              :fill="d.color" :opacity="d.opacity ?? 1"
              :style="d.tool === 'highlighter' ? { mixBlendMode: 'multiply', pointerEvents: 'none' } : { pointerEvents: 'none' }"
            />
          </template>
          <!-- rect: wide transparent border hit + visible -->
          <template v-else-if="d.tool === 'rect'">
            <rect
              :x="Math.min((d.x ?? 0), (d.x ?? 0) + (d.w ?? 0))" :y="Math.min((d.y ?? 0), (d.y ?? 0) + (d.h ?? 0))"
              :width="Math.abs(d.w ?? 0)" :height="Math.abs(d.h ?? 0)"
              fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke"
              :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
              @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
              @pointermove="onDrawingPointerMove"
              @pointerup="onDrawingPointerUp"
              @pointercancel="onDrawingPointerUp"
              @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
            />
            <rect
              :x="Math.min((d.x ?? 0), (d.x ?? 0) + (d.w ?? 0))" :y="Math.min((d.y ?? 0), (d.y ?? 0) + (d.h ?? 0))"
              :width="Math.abs(d.w ?? 0)" :height="Math.abs(d.h ?? 0)"
              fill="none" :stroke="d.color" :stroke-width="d.width"
              :style="{ pointerEvents: 'none' }"
            />
          </template>
          <!-- ellipse: wide transparent border hit + visible -->
          <template v-else-if="d.tool === 'ellipse'">
            <ellipse
              :cx="(d.x ?? 0) + (d.w ?? 0) / 2" :cy="(d.y ?? 0) + (d.h ?? 0) / 2"
              :rx="Math.abs((d.w ?? 0) / 2)" :ry="Math.abs((d.h ?? 0) / 2)"
              fill="none" stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke"
              :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
              @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
              @pointermove="onDrawingPointerMove"
              @pointerup="onDrawingPointerUp"
              @pointercancel="onDrawingPointerUp"
              @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
            />
            <ellipse
              :cx="(d.x ?? 0) + (d.w ?? 0) / 2" :cy="(d.y ?? 0) + (d.h ?? 0) / 2"
              :rx="Math.abs((d.w ?? 0) / 2)" :ry="Math.abs((d.h ?? 0) / 2)"
              fill="none" :stroke="d.color" :stroke-width="d.width"
              :style="{ pointerEvents: 'none' }"
            />
          </template>
          <!-- line / arrow: wide transparent hit line + visible line -->
          <template v-else-if="d.tool === 'line' || d.tool === 'arrow'">
            <marker
              v-if="d.tool === 'arrow'"
              :id="'draw-arrow-' + d.id"
              viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" :fill="d.color" />
            </marker>
            <line
              :x1="d.x1 ?? 0" :y1="d.y1 ?? 0" :x2="d.x2 ?? 0" :y2="d.y2 ?? 0"
              stroke="transparent" stroke-width="18" stroke-linecap="round" vector-effect="non-scaling-stroke"
              :style="{ pointerEvents: drawTool === 'select' ? 'stroke' : 'none', cursor: drawTool === 'select' ? 'pointer' : 'default' }"
              @mousedown.stop @pointerdown.stop="onDrawingPointerDown(d, $event)"
              @pointermove="onDrawingPointerMove"
              @pointerup="onDrawingPointerUp"
              @pointercancel="onDrawingPointerUp"
              @contextmenu.prevent.stop="onDrawingContextMenu($event, d)"
            />
            <line
              :x1="d.x1 ?? 0" :y1="d.y1 ?? 0" :x2="d.x2 ?? 0" :y2="d.y2 ?? 0"
              :stroke="d.color" :stroke-width="d.width"
              :marker-end="d.tool === 'arrow' ? 'url(#draw-arrow-' + d.id + ')' : undefined"
              :style="{ pointerEvents: 'none' }"
            />
          </template>
        </g>
        <!-- Selection highlight + animated outline (hidden while drawing or moving) -->
        <g v-if="selectedDrawingObj && drawTool === 'select'" :style="{ pointerEvents: 'none' }">
          <template v-if="!isDraggingDrawing">
            <rect
              :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
              :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
              rx="4" fill="rgba(77,171,247,0.12)" stroke="none"
            />
            <rect
              :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
              :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
              rx="4" fill="none" stroke="#4dabf7" stroke-width="2"
              stroke-dasharray="6 4" vector-effect="non-scaling-stroke"
              class="drawing-selection-outline"
            />
          </template>
          <!-- move handle: drag anywhere inside the selection box -->
          <rect
            :x="selectedBounds.x - 6" :y="selectedBounds.y - 6"
            :width="selectedBounds.w + 12" :height="selectedBounds.h + 12"
            fill="transparent" stroke="none"
            :style="{ pointerEvents: drawTool === 'select' ? 'all' : 'none', cursor: 'move' }"
            @mousedown.stop @pointerdown.stop="onDrawingPointerDown(selectedDrawingObj, $event)"
            @pointermove="onDrawingPointerMove"
            @pointerup="onDrawingPointerUp"
            @pointercancel="onDrawingPointerUp"
          />
        </g>
        <!-- in-progress preview -->
        <path
          v-if="draftDrawing && (draftDrawing.tool === 'pen' || draftDrawing.tool === 'highlighter')"
          :d="strokeToPath(draftDrawing.points || [], draftDrawing.width)"
          :fill="draftDrawing.color" :opacity="draftDrawing.opacity ?? 1"
          :style="draftDrawing.tool === 'highlighter' ? 'mix-blend-mode: multiply' : undefined"
        />
        <rect
          v-else-if="draftDrawing && draftDrawing.tool === 'rect'"
          :x="Math.min((draftDrawing.x ?? 0), (draftDrawing.x ?? 0) + (draftDrawing.w ?? 0))" :y="Math.min((draftDrawing.y ?? 0), (draftDrawing.y ?? 0) + (draftDrawing.h ?? 0))"
          :width="Math.abs(draftDrawing.w ?? 0)" :height="Math.abs(draftDrawing.h ?? 0)"
          fill="none" :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
        />
        <ellipse
          v-else-if="draftDrawing && draftDrawing.tool === 'ellipse'"
          :cx="(draftDrawing.x ?? 0) + (draftDrawing.w ?? 0) / 2" :cy="(draftDrawing.y ?? 0) + (draftDrawing.h ?? 0) / 2"
          :rx="Math.abs((draftDrawing.w ?? 0) / 2)" :ry="Math.abs((draftDrawing.h ?? 0) / 2)"
          fill="none" :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
        />
        <template v-else-if="draftDrawing && (draftDrawing.tool === 'line' || draftDrawing.tool === 'arrow')">
          <marker
            v-if="draftDrawing.tool === 'arrow'"
            id="draw-arrow-draft"
            viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="draftDrawing.color" />
          </marker>
          <line
            :x1="draftDrawing.x1 ?? 0" :y1="draftDrawing.y1 ?? 0" :x2="draftDrawing.x2 ?? 0" :y2="draftDrawing.y2 ?? 0"
            :stroke="draftDrawing.color" :stroke-width="draftDrawing.width"
            :marker-end="draftDrawing.tool === 'arrow' ? 'url(#draw-arrow-draft)' : undefined"
          />
        </template>
        </g>
      </svg>

      <!-- Remote cursors -->
      <div
        v-for="cursor in remoteCursors"
        :key="'cursor-' + cursor.socketId"
        class="remote-cursor"
        :style="{ left: cursor.x + 'px', top: cursor.y + 'px' }"
      >
        <svg width="16" height="20" viewBox="0 0 16 20" :fill="cursor.color">
          <path d="M0 0 L16 12 L8 12 L4 20 Z"/>
        </svg>
        <span class="remote-cursor-name" :style="{ background: cursor.color }">{{ cursor.userName }}</span>
      </div>
    </div>

    <!-- Minimap -->
    <div
      class="minimap"
      v-if="minimapData"
      @mousedown.stop="onMinimapDown"
      @mousemove.stop="onMinimapMove"
      @mouseup.stop="onMinimapUp"
      @mouseleave="onMinimapUp"
    >
      <svg :viewBox="minimapData.viewBox" preserveAspectRatio="xMidYMid meet">
        <rect
          v-for="node in viewerNodes"
          :key="'mm-' + node.id"
          :x="node.x"
          :y="node.y"
          :width="node.width"
          :height="node.height"
          :fill="node.type === 'group' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)'"
          rx="2"
        />
        <rect
          :x="minimapData.vpX"
          :y="minimapData.vpY"
          :width="minimapData.vpW"
          :height="minimapData.vpH"
          fill="rgba(124,138,255,0.08)"
          stroke="rgba(124,138,255,0.6)"
          stroke-width="3"
          rx="2"
          style="cursor: grab"
        />
      </svg>
    </div>

    <!-- Context menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="contextMenuStyle"
      @mousedown.stop
    >
      <template v-if="contextMenu.kind === 'node'">
        <div class="ctx-colors">
          <span class="ctx-label">Fill</span>
          <button
            v-for="c in ['1','2','3','4','5','6']"
            :key="c"
            class="ctx-color-btn"
            :class="['ctx-color-' + c, { active: getContextNode()?.color === c }]"
            :title="'Color ' + c"
            @click="onCtxSetColor(c)"
          ></button>
          <button class="ctx-color-btn ctx-color-none" title="No color" @click="onCtxSetColor(undefined)">✕</button>
        </div>
        <div class="ctx-colors">
          <span class="ctx-label">Text</span>
          <button
            v-for="c in fontColors"
            :key="'ctx-font-' + c"
            class="ctx-color-btn"
            :class="{ active: getContextNode()?.fontColor === c }"
            :style="{ background: c }"
            :title="'Text ' + c"
            @click="onCtxSetFontColor(c)"
          ></button>
          <button class="ctx-color-btn ctx-color-none" title="Default text color" @click="onCtxSetFontColor(undefined)">✕</button>
        </div>
        <button class="ctx-item" @click="onCtxSendBackward">Send backward</button>
        <button class="ctx-item" @click="onCtxBringForward">Bring forward</button>
        <button class="ctx-item" @click="onCtxSendToBack">Send to back</button>
        <button class="ctx-item" @click="onCtxBringToFront">Bring to front</button>
        <button class="ctx-item" @click="onCtxToggleLock">{{ isNodePositionLocked(contextMenu.nodeId) ? 'Unlock position' : 'Lock position' }}</button>
        <button v-if="isOwner" class="ctx-item" @click="toggleNodeHidden(contextMenu.nodeId)">{{ isNodeHidden(contextMenu.nodeId) ? 'Показать' : 'Скрыть' }}</button>
        <button class="ctx-item" @click="onCtxDuplicate">Duplicate</button>
        <button class="ctx-item ctx-item-danger" @click="onCtxDelete">Delete</button>
      </template>
      <template v-else-if="contextMenu.kind === 'edge'">
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
          <button v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000']" :key="'ctxd-'+c" class="ctx-color-btn" :style="{ background: c }" @click="setSelectedDrawingColor(c); closeContextMenu()"></button>
        </div>
        <button class="ctx-item" @click="duplicateSelectedDrawing(); closeContextMenu()">Дублировать</button>
        <button v-if="isOwner" class="ctx-item" @click="toggleSelectedDrawingHidden(); closeContextMenu()">{{ isSelectedDrawingHidden() ? 'Показать' : 'Скрыть' }}</button>
        <button class="ctx-item ctx-item-danger" @click="deleteSelectedDrawing(); closeContextMenu()">Удалить</button>
      </template>
    </div>

    <!-- Controls -->
    <div class="canvas-controls">
      <button @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ zoomPercent }}%</span>
      <button @click="zoomOut" title="Zoom out">−</button>
      <button @click="resetView" title="Reset view">⌂</button>
      <span class="controls-divider"></span>
      <button @click="undo" :disabled="!canUndo" title="Undo">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-2"/></svg>
      </button>
      <button @click="redo" :disabled="!canRedo" title="Redo">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h2"/></svg>
      </button>
      <span class="controls-divider"></span>
      <button v-if="!readonly" class="ctrl-add-node" @click="addTextNodeCenter" title="Add text node">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button @click="duplicateSelection" title="Duplicate selection">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
      </button>
      <button @click="openImagePicker" title="Add image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      </button>
      <button v-if="!readonly" @click="$emit('open-embed')" title="Вставить канвас">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
      </button>
      <span class="controls-divider"></span>
      <button @click="onExportCanvas" title="Export .canvas file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>
    <input type="file" ref="fileInput" accept=".canvas,.json" style="display:none" @change="onFileSelected" />
    <input type="file" ref="imageInput" accept="image/*" style="display:none" @change="onImageSelected" />
    <input type="file" ref="dndPortraitInput" accept="image/*" style="display:none" @change="onDndPortraitSelected" />
    <div
      v-if="drawTool !== 'select'"
      class="draw-capture"
      @pointerdown="onDrawPointerDown"
      @pointermove="onDrawPointerMove"
      @pointerup="onDrawPointerUp"
      @pointerleave="onDrawPointerUp"
      @pointercancel="onDrawPointerCancel"
    ></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted, reactive, nextTick, watch, type PropType } from "vue";
import { marked } from "marked";
import { computeResizedRect } from "../canvas/resizeMath";
import { uploadImage } from "../api/client";
import { type Drawing, strokeToPath, applyDrawOp, hitTestDrawing, drawingBounds, translateDrawing } from "../canvas/drawing";
import { DND_ABILITIES, abilityModifier, createDndCharacterSheet, formatModifier, normalizeDndCharacterSheet, savingThrowBonus, type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type DndTab } from "../dnd/characterSheet";

/** Minimal pointer shape shared by mouse and touch resize entry points. */
type PointerLike = { clientX: number; clientY: number; button?: number };

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
  canvasId?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  firstLineTextAlign?: "left" | "center" | "right" | "justify";
  borderStyle?: string;
  borderWidth?: number;
  borderColor?: string;
  fillStyle?: "gradient" | "solid";
  zIndex?: number;
  positionLocked?: boolean;
  transparent?: boolean;
  shape?: "rect" | "round";
  fontColor?: string;
  styleAttributes?: Record<string, string>;
  hidden?: boolean;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromEdge?: string;
  toNode: string;
  toSide?: string;
  fromSide?: string;
  label?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  arrowType?: "end" | "start" | "both" | "none";
  thickness?: number;
  styleAttributes?: Record<string, string>;
  hidden?: boolean;
}

type CanvasOp =
  | { type: 'nodes-move'; moves: { id: string; x: number; y: number }[] }
  | { type: 'node-resize'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'node-add'; node: CanvasNode }
  | { type: 'node-delete'; ids: string[] }
  | { type: 'node-update'; id: string; changes: Partial<CanvasNode> }
  | { type: 'edge-add'; edge: CanvasEdge }
  | { type: 'edge-delete'; id: string }
  | { type: 'edge-update'; id: string; changes: Partial<CanvasEdge> }
  | { type: 'draw-add'; drawing: Drawing }
  | { type: 'draw-remove'; id: string }
  | { type: 'draw-update'; id: string; changes: Partial<Drawing> };

interface RenderedEdge {
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

export interface CanvasChangePayload {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  drawings?: Drawing[];
  forceSnapshot?: boolean;
}

export default defineComponent({
  name: "CanvasLoader",
  props: {
    initialData: {
      type: Object as PropType<{ nodes: any[]; edges: any[]; drawings?: Drawing[] } | null>,
      default: null,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    isOwner: {
      type: Boolean,
      default: false,
    },
    remoteCursors: {
      type: Array as PropType<Array<{ socketId: string; userId: string; userName: string; x: number; y: number; color: string }>>,
      default: () => [],
    },
  },
  emits: ["change", "cursor-move", "op", "open-canvas", "open-embed", "node-edit-start", "template-roll"],
  setup(props, { emit }) {
    const viewport = ref<HTMLDivElement | null>(null);
    const nodes = ref<CanvasNode[]>([]);
    const edges = ref<CanvasEdge[]>([]);
    const drawings = ref<Drawing[]>([]);
    const draftDrawing = ref<Drawing | null>(null);

    type ActiveDrawTool = "select" | Drawing["tool"] | "eraser";
    const drawTool = ref<ActiveDrawTool>("select");
    const drawColor = ref("#e03131");
    const drawWidth = ref(4);
    let drawErasing = false;
    let drawGestureStarted = false;

    const setDrawTool = (t: ActiveDrawTool) => { drawTool.value = t; };
    const setDrawColor = (c: string) => { drawColor.value = c; };
    const setDrawWidth = (w: number) => { drawWidth.value = w; };

    // Drawing selection + drag state
    const selectedDrawingId = ref<string | null>(null);
    let drawMoveStart: { x: number; y: number } | null = null;
    let drawMoveOrigin: Drawing | null = null;
    const drawMovePreview = ref<Drawing | null>(null);

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
    // Single-finger tap / drag tracking
    const TAP_MOVE_THRESHOLD = 8; // px before a touch becomes a drag/pan
    const DOUBLE_TAP_MS = 300;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchNodeId: string | null = null; // node under the active single-finger touch
    let touchDragging = false; // an actual node drag is in progress
    let touchResizing = false; // a resize via a touch on a resize handle is in progress
    let touchConnecting = false; // a connection drag via a touch on a connection point is in progress
    let lastTapTime = 0;
    let lastTapTarget = ""; // node id, or "__empty__" for blank canvas

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    const loadCanvas = () => {
      if (props.initialData) {
        nodes.value = props.initialData.nodes || [];
        edges.value = props.initialData.edges || [];
        drawings.value = props.initialData.drawings || [];
      }
      nextTick(() => {
        fitToContent();
        for (const node of nodes.value) {
          if (node.type === 'canvas' && node.canvasId) {
            loadEmbeddedCanvas(node.canvasId);
          }
        }
      });
    };

    // Emit change when nodes or edges mutate (full-sync for DB persistence)
    let forceNextChange = false;
    const emitChange = () => {
      const payload: CanvasChangePayload = {
        nodes: JSON.parse(JSON.stringify(nodes.value)),
        edges: JSON.parse(JSON.stringify(edges.value)),
        drawings: JSON.parse(JSON.stringify(drawings.value)),
      };
      if (forceNextChange) payload.forceSnapshot = true;
      forceNextChange = false;
      emit("change", payload);
    };

    // Emit granular operation for real-time sync
    const emitOp = (op: CanvasOp) => {
      emit("op", op);
    };

    // Apply a remote operation without triggering change/op emit
    const applyRemoteOp = (op: CanvasOp) => {
      switch (op.type) {
        case 'nodes-move':
          for (const m of op.moves) {
            const node = nodes.value.find((n) => n.id === m.id);
            if (node) { node.x = m.x; node.y = m.y; }
          }
          break;
        case 'node-resize': {
          const node = nodes.value.find((n) => n.id === op.id);
          if (node) { node.x = op.x; node.y = op.y; node.width = op.width; node.height = op.height; }
          break;
        }
        case 'node-add':
          if (!nodes.value.find((n) => n.id === op.node.id)) {
            nodes.value.push({ ...op.node });
          }
          break;
        case 'node-delete': {
          const ids = new Set(op.ids);
          edges.value = edges.value.filter((ed) => !ids.has(ed.fromNode) && !ids.has(ed.toNode));
          nodes.value = nodes.value.filter((n) => !ids.has(n.id));
          break;
        }
        case 'node-update': {
          const node = nodes.value.find((n) => n.id === op.id);
          if (node) {
            Object.assign(node, op.changes);
            if (Object.prototype.hasOwnProperty.call(op.changes, 'positionLocked') || Object.prototype.hasOwnProperty.call(op.changes, 'zIndex')) {
              rebalanceNodeLayers(false);
            }
          }
          break;
        }
        case 'edge-add':
          if (!edges.value.find((e) => e.id === op.edge.id)) {
            edges.value.push({ ...op.edge });
          }
          break;
        case 'edge-delete':
          edges.value = edges.value.filter((e) => e.id !== op.id);
          break;
        case 'edge-update': {
          const edge = edges.value.find((e) => e.id === op.id);
          if (edge) Object.assign(edge, op.changes);
          break;
        }
        case 'draw-add':
        case 'draw-remove':
        case 'draw-update':
          drawings.value = applyDrawOp(drawings.value, op as any);
          break;
      }
    };

    // Watch for prop changes
    watch(() => props.initialData, (newData) => {
      if (newData) {
        nodes.value = newData.nodes || [];
        edges.value = newData.edges || [];
        drawings.value = newData.drawings || [];
        nextTick(() => fitToContent());
      }
    });

    // Fit all content in view
    const fitToContent = () => {
      if (!viewerNodes.value.length || !viewport.value) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of viewerNodes.value) {
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
    // Viewer-visibility helpers: owner sees all nodes (including hidden, dimmed); non-owners see only non-hidden ones.
    const canViewerSee = (o: { hidden?: boolean } | null | undefined): boolean => props.isOwner || !o?.hidden;
    const viewerNodes = computed(() => (props.isOwner ? nodes.value : nodes.value.filter((n) => !n.hidden)));
    const viewerNodeIds = computed(() => new Set(viewerNodes.value.map((n) => n.id)));

    const groups = computed(() => viewerNodes.value.filter((n) => n.type === "group"));
    const textNodes = computed(() => viewerNodes.value.filter((n) => n.type === "text"));
    const linkNodes = computed(() => viewerNodes.value.filter((n) => n.type === "link"));
    const imageNodes = computed(() => viewerNodes.value.filter((n) => n.type === "image"));
    const templateNodes = computed(() => viewerNodes.value.filter((n) => n.type === "template"));
    const canvasNodes = computed(() => viewerNodes.value.filter((n) => n.type === "canvas"));

    const dndAbilities = DND_ABILITIES;
    const dndTabs = [
      { key: 'attacks', label: 'Атаки' }, { key: 'features', label: 'Способности' }, { key: 'equipment', label: 'Снаряжение' },
      { key: 'personality', label: 'Личность' }, { key: 'goals', label: 'Цели' }, { key: 'notes', label: 'Заметки' }, { key: 'spells', label: 'Заклинания' },
    ] as const;
    const dndPersonalityFields = [
      { key: 'traits', label: 'Черты' }, { key: 'ideals', label: 'Идеалы' }, { key: 'bonds', label: 'Привязанности' }, { key: 'flaws', label: 'Слабости' },
    ] as const;
    // The selected tab is presentation state only: it must not create canvas
    // operations, history entries, or affect other collaborators.
    const dndActiveTabs = reactive<Record<string, DndCharacterSheetData['activeTab']>>({});
    const dndInteractionNodeId = ref<string | null>(null);
    const isDndInteracting = (node: CanvasNode) => !props.readonly && dndInteractionNodeId.value === node.id;
    const enterDndInteraction = (node: CanvasNode) => {
      if (node.templateId === 'dnd-character' && !props.readonly) dndInteractionNodeId.value = node.id;
    };
    const exitDndInteraction = (node: CanvasNode) => {
      if (dndInteractionNodeId.value === node.id) dndInteractionNodeId.value = null;
    };
    const toggleDndInteraction = (node: CanvasNode) => isDndInteracting(node) ? exitDndInteraction(node) : enterDndInteraction(node);
    const onDndSheetMouseDown = (event: MouseEvent, node: CanvasNode) => {
      if (isDndInteracting(node)) event.stopPropagation();
    };
    const dndSheet = (node: CanvasNode) => {
      const data = normalizeDndCharacterSheet(node.templateData);
      data.activeTab = dndActiveTabs[node.id] || data.activeTab;
      return data;
    };
    const updateDndSheet = (node: CanvasNode, mutate: (data: DndCharacterSheetData) => void) => {
      if (props.readonly || !isDndInteracting(node)) return;
      const data = normalizeDndCharacterSheet(node.templateData);
      mutate(data);
      const templateData = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      delete templateData.activeTab;
      pushUndo();
      node.templateData = templateData;
      emitOp({ type: 'node-update', id: node.id, changes: { templateData } });
    };
    const setDndIdentity = (node: CanvasNode, key: 'name' | 'race' | 'className' | 'portraitUrl', value: string) => updateDndSheet(node, (data) => { data.identity[key] = value; });
    const setDndNumber = (node: CanvasNode, _key: 'level', value: string) => updateDndSheet(node, (data) => { data.identity.level = Math.max(1, Number(value) || 1); });
    const setDndCombat = (node: CanvasNode, key: 'armorClass' | 'speed' | 'currentHp' | 'maxHp' | 'temporaryHp', value: string) => updateDndSheet(node, (data) => { const min = key === 'maxHp' ? 1 : 0; data.combat[key] = Math.max(min, Number(value) || 0); });
    const changeDndHp = (node: CanvasNode, delta: number) => updateDndSheet(node, (data) => { data.combat.currentHp = Math.max(0, data.combat.currentHp + delta); });
    const setDndAbilityScore = (node: CanvasNode, key: DndAbilityKey, value: string) => updateDndSheet(node, (data) => { data.abilities[key].score = Math.max(1, Math.min(30, Number(value) || 1)); });
    const toggleDndSave = (node: CanvasNode, key: DndAbilityKey) => updateDndSheet(node, (data) => { data.abilities[key].savingThrowProficient = !data.abilities[key].savingThrowProficient; });
    const toggleDndMode = (node: CanvasNode) => updateDndSheet(node, (data) => { data.displayMode = data.displayMode === 'compact' ? 'full' : 'compact'; });
    const setDndTab = (node: CanvasNode, tab: DndCharacterSheetData['activeTab']) => { if (isDndInteracting(node)) dndActiveTabs[node.id] = tab; };
    const setDndNotes = (node: CanvasNode, value: string) => updateDndSheet(node, (data) => { data.notes = value; });
    const setDndPersonality = (node: CanvasNode, key: keyof DndCharacterSheetData['personality'], value: string) => updateDndSheet(node, (data) => { data.personality[key] = value; });
    const dndTabItems = (node: CanvasNode): DndListItem[] => {
      const data = dndSheet(node);
      const tab = data.activeTab;
      return ['attacks', 'features', 'equipment', 'spells', 'goals'].includes(tab) ? data[tab as 'attacks' | 'features' | 'equipment' | 'spells' | 'goals'] : [];
    };
    const updateDndList = (node: CanvasNode, tab: DndTab, mutate: (items: DndListItem[]) => void) => updateDndSheet(node, (data) => {
      if (!['attacks', 'features', 'equipment', 'spells', 'goals'].includes(tab)) return;
      const key = tab as 'attacks' | 'features' | 'equipment' | 'spells' | 'goals';
      mutate(data[key]);
    });
    const addDndListItem = (node: CanvasNode) => updateDndList(node, dndSheet(node).activeTab, (items) => { items.push({ id: genId(), name: '' }); });
    const updateDndListItem = (node: CanvasNode, id: string, key: keyof DndListItem, value: string | number | boolean) => updateDndList(node, dndSheet(node).activeTab, (items) => { const item = items.find((entry) => entry.id === id); if (item) item[key] = value as never; });
    const removeDndListItem = (node: CanvasNode, id: string) => updateDndList(node, dndSheet(node).activeTab, (items) => { const index = items.findIndex((entry) => entry.id === id); if (index >= 0) items.splice(index, 1); });
    const formatDndModifier = (score: number) => formatModifier(abilityModifier(score));
    const dndSavingThrow = (node: CanvasNode, key: DndAbilityKey) => { const data = dndSheet(node); return savingThrowBonus(data.abilities[key], data.proficiencyBonus); };
    const rollTemplateAbility = (node: CanvasNode, ability: DndAbilityKey) => { if (!isDndInteracting(node)) return; const data = dndSheet(node); emit('template-roll', { nodeId: node.id, label: `${data.identity.name}: ${ability.toUpperCase()}`, modifier: abilityModifier(data.abilities[ability].score) }); };

    const embeddedCanvasCache = reactive<Record<string, { title: string; nodes: any[]; edges: any[]; loading: boolean; error: boolean }>>({});

    const loadEmbeddedCanvas = async (canvasId: string) => {
      if (embeddedCanvasCache[canvasId]) return;
      embeddedCanvasCache[canvasId] = { title: '', nodes: [], edges: [], loading: true, error: false };
      try {
        const { canvas: canvasApi } = await import('../api/client');
        const res = await canvasApi.get(canvasId);
        const data = JSON.parse(res.canvas.data || '{"nodes":[],"edges":[]}');
        embeddedCanvasCache[canvasId] = { title: res.canvas.title || 'Untitled', nodes: data.nodes || [], edges: data.edges || [], loading: false, error: false };
      } catch {
        embeddedCanvasCache[canvasId] = { title: 'Error', nodes: [], edges: [], loading: false, error: true };
      }
    };

    const getEmbeddedCanvasData = (canvasId: string) => {
      if (!embeddedCanvasCache[canvasId]) {
        loadEmbeddedCanvas(canvasId);
      }
      return embeddedCanvasCache[canvasId] || { title: '', nodes: [], edges: [], loading: true, error: false };
    };

    const embeddedCanvasViewBox = (canvasId: string) => {
      const data = embeddedCanvasCache[canvasId];
      if (!data || data.nodes.length === 0) return '0 0 800 600';
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of data.nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || 100));
        maxY = Math.max(maxY, n.y + (n.height || 60));
      }
      const pad = 40;
      return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
    };

    const embeddedEdgePath = (edge: any, allNodes: any[]) => {
      const from = allNodes.find((n: any) => n.id === edge.fromNode);
      const to = allNodes.find((n: any) => n.id === edge.toNode);
      if (!from || !to) return '';
      const fx = from.x + (from.width || 100) / 2;
      const fy = from.y + (from.height || 60) / 2;
      const tx = to.x + (to.width || 100) / 2;
      const ty = to.y + (to.height || 60) / 2;
      return `M${fx},${fy} L${tx},${ty}`;
    };

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

    // Helper to find midpoint of a rendered edge by id (for fromEdge support)
    const getEdgeMidpoint = (edgeId: string): { x: number; y: number } | null => {
      const srcEdge = edges.value.find((e) => e.id === edgeId);
      if (!srcEdge) return null;
      const srcFrom = nodeMap.value.get(srcEdge.fromNode);
      const srcTo = nodeMap.value.get(srcEdge.toNode);
      if (!srcFrom || !srcTo) return null;
      const a = getAnchor(srcFrom, srcEdge.fromSide || "bottom");
      const b = getAnchor(srcTo, srcEdge.toSide || "top");
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const renderedEdges = computed<RenderedEdge[]>(() => {
      return edges.value.flatMap((edge) => {
        // Non-owners: skip hidden edges and edges whose endpoints are hidden-for-viewer.
        if (!canViewerSee(edge)) return [];
        if (!viewerNodeIds.value.has(edge.toNode)) return [];
        if (!edge.fromEdge && !viewerNodeIds.value.has(edge.fromNode)) return [];

        const toNode = nodeMap.value.get(edge.toNode);
        if (!toNode) {
          return [{ id: edge.id, path: "", labelX: 0, labelY: 0, labelW: 0, midX: 0, midY: 0, thickness: 2, arrowType: "end" }];
        }

        let from: { x: number; y: number };
        let fromSide: string;

        if (edge.fromEdge) {
          // Source is another edge's midpoint
          const mid = getEdgeMidpoint(edge.fromEdge);
          if (!mid) {
            return [{ id: edge.id, path: "", labelX: 0, labelY: 0, labelW: 0, midX: 0, midY: 0, thickness: 2, arrowType: "end" }];
          }
          from = mid;
          // Guess direction toward target
          const toAnchor = getAnchor(toNode, edge.toSide || "top");
          const dx = toAnchor.x - from.x;
          const dy = toAnchor.y - from.y;
          fromSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
        } else {
          const fromNode = nodeMap.value.get(edge.fromNode);
          if (!fromNode) {
            return [{ id: edge.id, path: "", labelX: 0, labelY: 0, labelW: 0, midX: 0, midY: 0, thickness: 2, arrowType: "end" }];
          }
          fromSide = edge.fromSide || "bottom";
          from = getAnchor(fromNode, fromSide);
        }

        const toSide = edge.toSide || "top";
        const to = getAnchor(toNode, toSide);

        const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
        const c1 = getControlOffset(fromSide, dist);
        const c2 = getControlOffset(toSide, dist);

        const path = `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;

        const thickness = edge.thickness || 2;
        const arrowType = edge.arrowType || "end";
        const dashMap: Record<string, string> = { dashed: "8 4", dotted: "3 3" };
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
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
          thickness,
          arrowType,
          hidden: edge.hidden,
        }];
      });
    });

    // Unique edge colors for dynamic arrow markers
    const edgeColors = computed(() => {
      const colors = new Set<string>();
      for (const edge of edges.value) {
        if (edge.color) colors.add(edge.color);
      }
      return Array.from(colors);
    });

    const arrowMarkerId = (color: string | undefined, start: boolean) => {
      if (!color) return start ? 'arrowhead-start' : 'arrowhead';
      return (start ? 'arrowhead-start-' : 'arrowhead-') + color.replace('#', '');
    };

    // Style helpers
    const nodePosition = (node: CanvasNode) => {
      const style: Record<string, string | undefined> = {
        left: `${node.x}px`,
        top: `${node.y}px`,
        width: `${node.width}px`,
        height: `${node.height}px`,
        borderColor: node.borderColor || undefined,
        zIndex: `${node.zIndex ?? 10}`,
      };
      if (node.shape === "round") {
        style.borderRadius = "9999px";
      }
      if (node.transparent) {
        style.background = "transparent";
        style.boxShadow = "none";
      }
      const bs = node.borderStyle || "solid";
      const bw = node.borderWidth || undefined;
      if (bs === "wavy" || bs === "sawtooth") {
        // Use CSS border-image for custom patterns
        style.borderStyle = "solid";
        style.borderWidth = bw ? `${bw}px` : undefined;
        const color = node.borderColor || (node.color ? undefined : "rgba(255,255,255,0.1)");
        const strokeColor = color || "currentColor";
        if (bs === "wavy") {
          style.borderImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='4'><path d='M0 2 Q5 0 10 2 Q15 4 20 2' fill='none' stroke='${strokeColor}' stroke-width='1.5'/></svg>`)}") 2 round`;
        } else {
          style.borderImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='12' height='4'><path d='M0 4 L6 0 L12 4' fill='none' stroke='${strokeColor}' stroke-width='1.5'/></svg>`)}") 2 round`;
        }
      } else {
        style.borderStyle = bs;
        style.borderWidth = bw ? `${bw}px` : undefined;
      }
      return style;
    };

    const nodePresentationClass = (node: CanvasNode) => ({
      "node-transparent": node.transparent === true,
      "node-round": node.shape === "round",
    });

    const nodeColorClass = (node: CanvasNode) => {
      if (!node.color) return "";
      const fill = node.fillStyle || "gradient";
      return fill === "solid" ? `node-color-${node.color}-solid` : `node-color-${node.color}`;
    };

    const groupColorClass = (node: CanvasNode) => {
      return node.color ? `group-color-${node.color}` : "";
    };

    const isNodePositionLocked = (nodeId: string | null | undefined): boolean => {
      if (!nodeId) return false;
      return nodes.value.find((n) => n.id === nodeId)?.positionLocked === true;
    };

    const selectedEditableNodes = () => nodes.value.filter((n) => selectedNodeIds.value.includes(n.id));

    const updateNode = (node: CanvasNode, changes: Partial<CanvasNode>) => {
      Object.assign(node, changes);
      emitOp({ type: 'node-update', id: node.id, changes });
    };

    const isNodeInsideGroup = (node: CanvasNode, group: CanvasNode) => {
      if (node.id === group.id || node.type === "group") return false;
      return (
        node.x >= group.x &&
        node.y >= group.y &&
        node.x + node.width <= group.x + group.width &&
        node.y + node.height <= group.y + group.height
      );
    };

    const getCopySelectionIds = () => {
      const ids = new Set(selectedNodeIds.value);
      const selectedGroups = nodes.value.filter((node) => ids.has(node.id) && node.type === "group");
      for (const group of selectedGroups) {
        for (const node of viewerNodes.value) {
          if (isNodeInsideGroup(node, group)) ids.add(node.id);
        }
      }
      return ids;
    };

    // Callout types and their colors/icons
    const CALLOUT_STYLES: Record<string, { icon: string; color: string }> = {
      note: { icon: "📝", color: "#7c8aff" },
      tip: { icon: "💡", color: "#44cf6e" },
      warning: { icon: "⚠️", color: "#e9973f" },
      danger: { icon: "🔴", color: "#fb464c" },
      error: { icon: "🔴", color: "#fb464c" },
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
        /<blockquote>\s*<p>\s*\[!\s*([\w-]+)\]\s*(.*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
        (_match, type: string, title: string, body: string) => {
          const key = type.toLowerCase();
          const style = (CALLOUT_STYLES[key] || CALLOUT_STYLES.note)!;
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

    const getNodeFirstLine = (text: string) => {
      return text.split(/\r?\n/, 1)[0] || "";
    };

    const getNodeRestText = (text: string) => {
      const lines = text.split(/\r?\n/);
      return lines.length > 1 ? lines.slice(1).join("\n") : "";
    };

    const getNodeFirstLineAlignValue = (node: CanvasNode) => {
      return node.firstLineTextAlign || node.textAlign || undefined;
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
    const dragCameraStart = reactive({ x: 0, y: 0 });

    // Resize state
    const resizeNodeId = ref<string | null>(null);
    const resizeHandle = ref<string>("");
    const resizeStart = reactive({ x: 0, y: 0, nodeX: 0, nodeY: 0, nodeW: 0, nodeH: 0 });
    const resizeCameraStart = reactive({ x: 0, y: 0 });
    // True while a node is being actively dragged or resized — used to hide the
    // node edit menu/toolbar during manipulation (it overlaps the node on mobile).
    const isManipulatingNode = computed(() => !!dragNodeId.value || !!resizeNodeId.value);
    const GRID_SIZE = 24;
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
    const EDGE_PAN_ZONE = 72;
    const EDGE_PAN_MAX_SPEED = 18;
    const lastPointer = reactive({ x: 0, y: 0 });
    let autoPanFrame: number | null = null;

    // Node drag handlers
    // Store initial positions of all dragged nodes for multi-drag
    const dragNodesInitial = ref<Map<string, { x: number; y: number }>>(new Map());

    const updateLastPointer = (e: PointerLike) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    };

    // Apply the in-progress resize to its node from the current lastPointer.
    // Shared by the mouse/pointer move handler and the touch move handler.
    const applyResize = () => {
      if (!resizeNodeId.value) return;
      const node = nodes.value.find((n) => n.id === resizeNodeId.value);
      if (!node) return;
      const r = computeResizedRect({
        handle: resizeHandle.value,
        start: { x: resizeStart.x, y: resizeStart.y, nodeX: resizeStart.nodeX, nodeY: resizeStart.nodeY, nodeW: resizeStart.nodeW, nodeH: resizeStart.nodeH },
        pointer: { x: lastPointer.x, y: lastPointer.y },
        camera: { x: camera.x, y: camera.y, scale: camera.scale },
        cameraStart: { x: resizeCameraStart.x, y: resizeCameraStart.y },
      });
      if (node.templateId === 'dnd-character') {
        node.x = r.x;
        node.y = r.y;
        node.width = Math.max(320, r.width);
        node.height = Math.max(220, r.height);
      } else {
        node.x = r.x;
        node.y = r.y;
        node.width = r.width;
        node.height = r.height;
      }
    };

    const updateActiveDragFromPointer = () => {
      if (dragNodeId.value) {
        const dx = (lastPointer.x - dragMouseStart.x - camera.x + dragCameraStart.x) / camera.scale;
        const dy = (lastPointer.y - dragMouseStart.y - camera.y + dragCameraStart.y) / camera.scale;
        for (const [id, init] of dragNodesInitial.value) {
          const node = nodes.value.find((n) => n.id === id);
          if (node) {
            node.x = snap(init.x + dx);
            node.y = snap(init.y + dy);
          }
        }
      }

      applyResize();

      if (connDragging.value && viewport.value) {
        const rect = viewport.value.getBoundingClientRect();
        connMouseWorld.x = (lastPointer.x - rect.left - camera.x) / camera.scale;
        connMouseWorld.y = (lastPointer.y - rect.top - camera.y) / camera.scale;
      }
    };

    const stopAutoPan = () => {
      if (autoPanFrame !== null) {
        cancelAnimationFrame(autoPanFrame);
        autoPanFrame = null;
      }
    };

    const tickAutoPan = () => {
      autoPanFrame = null;
      if (!viewport.value || (!dragNodeId.value && !resizeNodeId.value && !connDragging.value)) return;

      const rect = viewport.value.getBoundingClientRect();
      const left = lastPointer.x - rect.left;
      const right = rect.right - lastPointer.x;
      const top = lastPointer.y - rect.top;
      const bottom = rect.bottom - lastPointer.y;
      let vx = 0;
      let vy = 0;

      if (left < EDGE_PAN_ZONE) vx = (1 - Math.max(left, 0) / EDGE_PAN_ZONE) * EDGE_PAN_MAX_SPEED;
      else if (right < EDGE_PAN_ZONE) vx = -(1 - Math.max(right, 0) / EDGE_PAN_ZONE) * EDGE_PAN_MAX_SPEED;
      if (top < EDGE_PAN_ZONE) vy = (1 - Math.max(top, 0) / EDGE_PAN_ZONE) * EDGE_PAN_MAX_SPEED;
      else if (bottom < EDGE_PAN_ZONE) vy = -(1 - Math.max(bottom, 0) / EDGE_PAN_ZONE) * EDGE_PAN_MAX_SPEED;

      if (vx || vy) {
        camera.x += vx;
        camera.y += vy;
        updateActiveDragFromPointer();
      }

      autoPanFrame = requestAnimationFrame(tickAutoPan);
    };

    const startAutoPan = () => {
      if (autoPanFrame === null) autoPanFrame = requestAnimationFrame(tickAutoPan);
    };

    const onNodeDragStart = (e: MouseEvent, node: CanvasNode) => {
      updateLastPointer(e);
      if (e.button === 1) { // middle-click → pan, not drag
        isPanning.value = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
        return;
      }
      if (resizeNodeId.value) return;
      selectedDrawingId.value = null;
      if (node.positionLocked) {
        // A locked block can't be moved, so a drag starting on it should behave
        // like a drag on empty canvas — begin a marquee selection. A plain click
        // (no movement) still just selects this block, because onPanEnd ignores
        // sub-5px boxes. The mousemove/mouseup events bubble up to the viewport
        // (only mousedown is .stop-ped on the block), so onPanMove/onPanEnd drive
        // the box without any extra listeners.
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const idx = selectedNodeIds.value.indexOf(node.id);
          if (idx >= 0) {
            selectedNodeIds.value.splice(idx, 1);
          } else {
            selectedNodeIds.value.push(node.id);
          }
        } else {
          selectedNodeIds.value = [node.id];
        }
        selectedEdgeId.value = null;
        const rect = viewport.value!.getBoundingClientRect();
        const wx = (e.clientX - rect.left - camera.x) / camera.scale;
        const wy = (e.clientY - rect.top - camera.y) / camera.scale;
        selBox.active = true;
        selBox.startX = wx;
        selBox.startY = wy;
        selBox.curX = wx;
        selBox.curY = wy;
        return;
      }
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
      dragCameraStart.x = camera.x;
      dragCameraStart.y = camera.y;
      // Store initial positions of all selected nodes
      dragNodesInitial.value = new Map();
      for (const id of selectedNodeIds.value) {
        const n = nodes.value.find((nd) => nd.id === id);
        if (n && !n.positionLocked) dragNodesInitial.value.set(id, { x: n.x, y: n.y });
      }
      startAutoPan();
    };

    // Double-click to edit text
    const onNodeDblClick = (node: CanvasNode) => {
      if (node.type !== "text") return;
      emit('node-edit-start', node.id);
      editingNodeId.value = node.id;
      nextTick(() => {
        const textarea = editorRefs.value?.[0];
        if (textarea) textarea.focus();
      });
    };

    let editSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const lastEmittedText = new Map<string, string | undefined>();

    const emitTextUpdate = (node: CanvasNode) => {
      if (editSaveTimer) {
        clearTimeout(editSaveTimer);
        editSaveTimer = null;
      }
      if (lastEmittedText.get(node.id) === node.text) return;
      lastEmittedText.set(node.id, node.text);
      emitOp({ type: 'node-update', id: node.id, changes: { text: node.text } });
    };

    const scheduleTextUpdate = (node: CanvasNode) => {
      if (editSaveTimer) clearTimeout(editSaveTimer);
      editSaveTimer = setTimeout(() => emitTextUpdate(node), 500);
    };

    const onEditInput = (e: Event, node: CanvasNode) => {
      node.text = (e.target as HTMLTextAreaElement).value;
      scheduleTextUpdate(node);
      scheduleChange();
    };

    const onEditEnd = () => {
      if (editingNodeId.value) {
        const node = nodes.value.find((n) => n.id === editingNodeId.value);
        if (node) emitTextUpdate(node);
      }
      editingNodeId.value = null;
      scheduleChange();
    };

    // Resize handlers
    const onResizeStart = (e: PointerLike, node: CanvasNode, handle: string) => {
      updateLastPointer(e);
      if (node.positionLocked) return;
      if (e.button === 1) {
        isPanning.value = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
        return;
      }
      pushUndo();
      resizeNodeId.value = node.id;
      resizeHandle.value = handle;
      resizeStart.x = e.clientX;
      resizeStart.y = e.clientY;
      resizeStart.nodeX = node.x;
      resizeStart.nodeY = node.y;
      resizeStart.nodeW = node.width;
      resizeStart.nodeH = node.height;
      resizeCameraStart.x = camera.x;
      resizeCameraStart.y = camera.y;
      startAutoPan();
    };

    // Edge selection
    const selectedEdgeId = ref<string | null>(null);

    const onEdgeClick = (edgeId: string) => {
      selectedEdgeId.value = edgeId;
      selectedNodeIds.value = [];
      selectedDrawingId.value = null;
    };

    const onDeleteEdge = () => {
      if (!selectedEdgeId.value) return;
      pushUndo();
      const deletedId = selectedEdgeId.value;
      edges.value = edges.value.filter((ed) => ed.id !== deletedId);
      emitOp({ type: 'edge-delete', id: deletedId });
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
      pushUndo();
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
      if (editingEdgeId.value) {
        const edge = edges.value.find((e) => e.id === editingEdgeId.value);
        if (edge) emitOp({ type: 'edge-update', id: edge.id, changes: { label: edge.label } });
      }
      editingEdgeId.value = null;
    };

    // Edge style cycling
    const EDGE_COLORS = [undefined, "#fb464c", "#e9973f", "#e0de71", "#44cf6e", "#53dfdd", "#a882ff"];
    const LINE_STYLES: Array<"solid" | "dashed" | "dotted"> = ["solid", "dashed", "dotted"];

    const onEdgeToggleStyle = () => {
      const edge = edges.value.find((e) => e.id === selectedEdgeId.value);
      if (!edge) return;
      pushUndo();
      const current = edge.lineStyle || "solid";
      const idx = LINE_STYLES.indexOf(current);
      edge.lineStyle = LINE_STYLES[(idx + 1) % LINE_STYLES.length];
      emitOp({ type: 'edge-update', id: edge.id, changes: { lineStyle: edge.lineStyle } });
    };

    const onEdgeCycleColor = () => {
      const edge = edges.value.find((e) => e.id === selectedEdgeId.value);
      if (!edge) return;
      pushUndo();
      const idx = EDGE_COLORS.indexOf(edge.color);
      edge.color = EDGE_COLORS[(idx + 1) % EDGE_COLORS.length];
      emitOp({ type: 'edge-update', id: edge.id, changes: { color: edge.color } });
    };

    const ARROW_TYPES: Array<"end" | "start" | "both" | "none"> = ["end", "start", "both", "none"];

    const onEdgeCycleArrow = () => {
      const edge = edges.value.find((e) => e.id === selectedEdgeId.value);
      if (!edge) return;
      pushUndo();
      const current = edge.arrowType || "end";
      const idx = ARROW_TYPES.indexOf(current);
      edge.arrowType = ARROW_TYPES[(idx + 1) % ARROW_TYPES.length];
      emitOp({ type: 'edge-update', id: edge.id, changes: { arrowType: edge.arrowType } });
    };

    // Connection (edge creation) state
    const connDragging = ref(false);
    const connFromNode = ref<string>("");
    const connFromEdge = ref<string>("");
    const connFromSide = ref<string>("");
    const connMouseWorld = reactive({ x: 0, y: 0 });

    const onConnStart = (e: MouseEvent, node: CanvasNode, side: string) => {
      updateLastPointer(e);
      connDragging.value = true;
      connFromNode.value = node.id;
      connFromEdge.value = "";
      connFromSide.value = side;
      // Set initial mouse position in world coords
      const rect = viewport.value!.getBoundingClientRect();
      connMouseWorld.x = (e.clientX - rect.left - camera.x) / camera.scale;
      connMouseWorld.y = (e.clientY - rect.top - camera.y) / camera.scale;
      startAutoPan();
    };

    const onConnStartFromEdge = (e: MouseEvent, edgeId: string) => {
      updateLastPointer(e);
      connDragging.value = true;
      connFromNode.value = "";
      connFromEdge.value = edgeId;
      connFromSide.value = "";
      const rect = viewport.value!.getBoundingClientRect();
      connMouseWorld.x = (e.clientX - rect.left - camera.x) / camera.scale;
      connMouseWorld.y = (e.clientY - rect.top - camera.y) / camera.scale;
      startAutoPan();
    };

    // Temp edge path while dragging
    const tempEdgePath = computed(() => {
      if (!connDragging.value) return "";

      let from: { x: number; y: number };
      let fromSideVal: string;

      if (connFromEdge.value) {
        // Starting from edge midpoint
        const mid = getEdgeMidpoint(connFromEdge.value);
        if (!mid) return "";
        from = mid;
        const dx = connMouseWorld.x - from.x;
        const dy = connMouseWorld.y - from.y;
        fromSideVal = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
      } else {
        const fromNode = nodeMap.value.get(connFromNode.value);
        if (!fromNode) return "";
        from = getAnchor(fromNode, connFromSide.value);
        fromSideVal = connFromSide.value;
      }

      const to = connMouseWorld;
      const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
      const c1 = getControlOffset(fromSideVal, dist);
      // Guess toSide based on direction
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const guessedSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "left" : "right") : (dy > 0 ? "top" : "bottom");
      const c2 = getControlOffset(guessedSide, dist);
      return `M ${from.x} ${from.y} C ${from.x + c1.dx} ${from.y + c1.dy}, ${to.x + c2.dx} ${to.y + c2.dy}, ${to.x} ${to.y}`;
    });

    // Find which node is under the mouse (world coords)
    const findNodeAt = (wx: number, wy: number): { node: CanvasNode; side: string } | null => {
      for (const n of viewerNodes.value) {
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
    // Create a text node at the given screen coordinates and start editing it
    const createTextNodeAtClient = (clientX: number, clientY: number) => {
      if (props.readonly) return;
      const rect = viewport.value!.getBoundingClientRect();
      const wx = (clientX - rect.left - camera.x) / camera.scale;
      const wy = (clientY - rect.top - camera.y) / camera.scale;
      const newNode: CanvasNode = {
        id: genId(),
        type: "text",
        x: snap(wx - 125),
        y: snap(wy - 30),
        width: 250,
        height: 60,
        text: "",
      };
      pushUndo();
      nodes.value.push(newNode);
      emitOp({ type: 'node-add', node: { ...newNode } });
      selectedNodeIds.value = [newNode.id];
      editingNodeId.value = newNode.id;
      nextTick(() => {
        const textarea = editorRefs.value?.[0];
        if (textarea) textarea.focus();
      });
    };

    const onCanvasDblClick = (e: MouseEvent) => {
      e.preventDefault();
      createTextNodeAtClient(e.clientX, e.clientY);
    };

    // Add a text node at the center of the current viewport (toolbar button —
    // the reliable way to create a node on touch devices).
    const addTextNodeCenter = () => {
      if (!viewport.value) return;
      const rect = viewport.value.getBoundingClientRect();
      createTextNodeAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    const addDndCharacterTemplate = (data: Record<string, unknown> = {}) => {
      if (props.readonly) return;
      const centerX = viewport.value ? (-camera.x / camera.scale) + viewport.value.clientWidth / (2 * camera.scale) : 0;
      const centerY = viewport.value ? (-camera.y / camera.scale) + viewport.value.clientHeight / (2 * camera.scale) : 0;
      const { activeTab: _activeTab, ...templateData } = { ...createDndCharacterSheet(), ...data };
      const newNode: CanvasNode = {
        id: genId(), type: "template", templateId: "dnd-character", templateData,
        x: snap(centerX - 550), y: snap(centerY - 380), width: 1100, height: 760,
      };
      pushUndo();
      nodes.value.push(newNode);
      emitOp({ type: "node-add", node: { ...newNode } });
      selectedNodeIds.value = [newNode.id];
    };

    const importDndCharacter = (data: unknown) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Файл карточки имеет неверный формат");
      const source = (data as Record<string, unknown>).templateData && typeof (data as Record<string, unknown>).templateData === "object"
        ? (data as Record<string, Record<string, unknown>>).templateData
        : data as Record<string, unknown>;
      addDndCharacterTemplate(source);
    };

    // Context menu state
    const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeId: "", kind: "", id: "" });
    const contextMenuStyle = computed(() => ({
      left: contextMenu.x + 'px',
      top: contextMenu.y + 'px',
    }));
    const getContextNode = () => nodes.value.find((n) => n.id === contextMenu.nodeId);

    const closeContextMenu = () => { contextMenu.visible = false; };

    const positionContextMenu = (e: MouseEvent) => {
      const rect = viewport.value!.getBoundingClientRect();
      const menuWidth = Math.min(260, rect.width - 16);
      const menuHeight = Math.min(360, rect.height - 16);
      contextMenu.x = Math.max(8, Math.min(e.clientX - rect.left, rect.width - menuWidth - 8));
      contextMenu.y = Math.max(8, Math.min(e.clientY - rect.top, rect.height - menuHeight - 8));
    };

    const onNodeContextMenu = (e: MouseEvent, node: CanvasNode) => {
      selectedNodeIds.value = [node.id];
      positionContextMenu(e);
      contextMenu.kind = "node";
      contextMenu.nodeId = node.id;
      contextMenu.id = node.id;
      contextMenu.visible = true;
    };

    const onEdgeContextMenu = (e: MouseEvent, edge: { id: string }) => {
      e.preventDefault(); e.stopPropagation();
      onEdgeClick(edge.id);
      positionContextMenu(e);
      contextMenu.kind = "edge";
      contextMenu.id = edge.id;
      contextMenu.visible = true;
    };

    const onDrawingContextMenu = (e: MouseEvent, d: { id: string }) => {
      e.preventDefault(); e.stopPropagation();
      selectedDrawingId.value = d.id;
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
      positionContextMenu(e);
      contextMenu.kind = "drawing";
      contextMenu.id = d.id;
      contextMenu.visible = true;
    };

    const setNodeColor = (nodeId: string, color: string | undefined) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.color = color;
        emitOp({ type: 'node-update', id: nodeId, changes: { color } });
      }
    };

    const getNodeColor = (nodeId: string): string | undefined => {
      return nodes.value.find((n) => n.id === nodeId)?.color;
    };

    const getNodeAlign = (nodeId: string) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.textAlign || "left";
    };

    const getNodeFirstLineAlign = (nodeId: string) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.firstLineTextAlign || node?.textAlign || "left";
    };

    const setNodeFirstLineAlign = (nodeId: string, align: "left" | "center" | "right" | "justify") => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.firstLineTextAlign = align;
        emitOp({ type: 'node-update', id: nodeId, changes: { firstLineTextAlign: align } });
      }
    };

    const setNodeAlign = (nodeId: string, align: "left" | "center" | "right" | "justify") => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.textAlign = align;
        emitOp({ type: 'node-update', id: nodeId, changes: { textAlign: align } });
      }
    };

    // Border styles config
    const borderStyles: { value: string; label: string; svg: string }[] = [
      { value: "solid", label: "Solid", svg: `<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2"/>` },
      { value: "dashed", label: "Dashed", svg: `<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3"/>` },
      { value: "dotted", label: "Dotted", svg: `<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/>` },
      { value: "double", label: "Double", svg: `<line x1="0" y1="3" x2="24" y2="3" stroke="currentColor" stroke-width="1"/><line x1="0" y1="7" x2="24" y2="7" stroke="currentColor" stroke-width="1"/>` },
      { value: "ridge", label: "Dash-dot", svg: `<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="8 2 2 2"/>` },
      { value: "wavy", label: "Wavy", svg: `<path d="M0 5 Q3 2 6 5 Q9 8 12 5 Q15 2 18 5 Q21 8 24 5" fill="none" stroke="currentColor" stroke-width="1.5"/>` },
      { value: "sawtooth", label: "Sawtooth", svg: `<path d="M0 7 L4 3 L8 7 L12 3 L16 7 L20 3 L24 7" fill="none" stroke="currentColor" stroke-width="1.5"/>` },
    ];

    const fontColors = ['#000000', '#ffffff', '#d7dce8', '#fb464c', '#e9973f', '#e0de71', '#44cf6e', '#53dfdd', '#a882ff'];

    const getNodeFillStyle = (nodeId: string): "gradient" | "solid" => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.fillStyle || "gradient";
    };

    const toggleNodeFillStyle = (nodeId: string) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.fillStyle = (node.fillStyle || "gradient") === "gradient" ? "solid" : "gradient";
        emitOp({ type: 'node-update', id: nodeId, changes: { fillStyle: node.fillStyle } });
      }
    };

    const getNodeBorderColor = (nodeId: string): string | undefined => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.borderColor;
    };

    const setNodeBorderColor = (nodeId: string, color: string | undefined) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.borderColor = color;
        emitOp({ type: 'node-update', id: nodeId, changes: { borderColor: color } });
      }
    };

    const getNodeBorderStyle = (nodeId: string): string => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.borderStyle || "solid";
    };

    const setNodeBorderStyle = (nodeId: string, style: string) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.borderStyle = style;
        emitOp({ type: 'node-update', id: nodeId, changes: { borderStyle: style } });
      }
    };

    const getNodeBorderWidth = (nodeId: string): number => {
      const node = nodes.value.find((n) => n.id === nodeId);
      return node?.borderWidth || 2;
    };

    const setNodeBorderWidth = (nodeId: string, width: number) => {
      const node = nodes.value.find((n) => n.id === nodeId);
      if (node) {
        pushUndo();
        node.borderWidth = width;
        emitOp({ type: 'node-update', id: nodeId, changes: { borderWidth: width } });
      }
    };

    const getNodeFontColor = (nodeId: string | null | undefined): string | undefined => {
      if (!nodeId) return undefined;
      return nodes.value.find((n) => n.id === nodeId)?.fontColor;
    };

    const setNodeFontColor = (nodeId: string | null | undefined, fontColor: string | undefined) => {
      if (!nodeId) return;
      const node = nodes.value.find((n) => n.id === nodeId);
      if (!node) return;
      pushUndo();
      updateNode(node, { fontColor });
    };

    const isNodeTransparent = (nodeId: string | null | undefined): boolean => {
      if (!nodeId) return false;
      return nodes.value.find((n) => n.id === nodeId)?.transparent === true;
    };

    const toggleNodeTransparent = (nodeId: string | null | undefined) => {
      if (!nodeId) return;
      const node = nodes.value.find((n) => n.id === nodeId);
      if (!node) return;
      pushUndo();
      const transparent = !node.transparent;
      updateNode(node, { transparent });
    };

    const getNodeShape = (nodeId: string | null | undefined): "rect" | "round" => {
      if (!nodeId) return "rect";
      return nodes.value.find((n) => n.id === nodeId)?.shape || "rect";
    };

    const toggleNodeShape = (nodeId: string | null | undefined) => {
      if (!nodeId) return;
      const node = nodes.value.find((n) => n.id === nodeId);
      if (!node) return;
      pushUndo();
      const shape = node.shape === "round" ? "rect" : "round";
      updateNode(node, { shape });
    };

    const toggleNodePositionLock = (nodeId: string | null | undefined) => {
      if (!nodeId) return;
      const node = nodes.value.find((n) => n.id === nodeId);
      if (!node) return;
      pushUndo();
      const positionLocked = !node.positionLocked;
      updateNode(node, { positionLocked });
      // Locked objects form the bottom layer. A newly locked object is placed
      // above previously locked ones, while still staying below every editable one.
      rebalanceNodeLayers(true, positionLocked ? node.id : undefined);
      if (positionLocked && resizeNodeId.value === node.id) resizeNodeId.value = null;
      if (positionLocked && dragNodeId.value === node.id) dragNodeId.value = null;
    };

    const orderedLayerNodes = (locked: boolean) => nodes.value
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => !!node.positionLocked === locked)
      .sort((a, b) => (a.node.zIndex ?? 10) - (b.node.zIndex ?? 10) || a.index - b.index)
      .map(({ node }) => node);

    const rebalanceNodeLayers = (emitChanges = false, newlyLockedId?: string) => {
      const locked = orderedLayerNodes(true);
      if (newlyLockedId) {
        const newlyLocked = locked.find((node) => node.id === newlyLockedId);
        if (newlyLocked) {
          locked.splice(locked.indexOf(newlyLocked), 1);
          locked.push(newlyLocked);
        }
      }
      const ordered = [...locked, ...orderedLayerNodes(false)];
      ordered.forEach((node, index) => {
        const zIndex = index + 1;
        if (node.zIndex === zIndex) return;
        node.zIndex = zIndex;
        if (emitChanges) emitOp({ type: "node-update", id: node.id, changes: { zIndex } });
      });
    };

    const currentLayerBounds = (locked: boolean) => {
      const layers = orderedLayerNodes(locked).map((n) => n.zIndex ?? 10);
      return {
        min: layers.length ? Math.min(...layers) : 0,
        max: layers.length ? Math.max(...layers) : 0,
      };
    };

    const changeSelectionLayer = (mode: "forward" | "backward" | "front" | "back") => {
      const targets = selectedEditableNodes();
      if (!targets.length) return;
      pushUndo();
      for (const node of targets) {
        const bounds = currentLayerBounds(!!node.positionLocked);
        const current = node.zIndex ?? 10;
        const zIndex =
          mode === "forward" ? current + 1 :
          mode === "backward" ? Math.max(1, current - 1) :
          mode === "front" ? bounds.max + 1 :
          Math.max(1, bounds.min - 1);
        updateNode(node, { zIndex });
      }
      // Layer controls may reorder only within their partition: locked nodes
      // always remain under editable nodes.
      rebalanceNodeLayers(true);
    };

    const bringSelectionForward = () => changeSelectionLayer("forward");
    const sendSelectionBackward = () => changeSelectionLayer("backward");
    const bringSelectionToFront = () => changeSelectionLayer("front");
    const sendSelectionToBack = () => changeSelectionLayer("back");

    const onCtxSetColor = (color: string | undefined) => {
      const node = nodes.value.find((n) => n.id === contextMenu.nodeId);
      if (node) {
        node.color = color;
        emitOp({ type: 'node-update', id: node.id, changes: { color } });
      }
      closeContextMenu();
    };

    const onCtxSetFontColor = (fontColor: string | undefined) => {
      setNodeFontColor(contextMenu.nodeId, fontColor);
      closeContextMenu();
    };

    const withContextNodeSelected = (action: () => void) => {
      if (contextMenu.nodeId) selectedNodeIds.value = [contextMenu.nodeId];
      action();
      closeContextMenu();
    };

    const onCtxSendBackward = () => withContextNodeSelected(sendSelectionBackward);
    const onCtxBringForward = () => withContextNodeSelected(bringSelectionForward);
    const onCtxSendToBack = () => withContextNodeSelected(sendSelectionToBack);
    const onCtxBringToFront = () => withContextNodeSelected(bringSelectionToFront);
    const onCtxToggleLock = () => withContextNodeSelected(() => toggleNodePositionLock(contextMenu.nodeId));

    const onCtxDuplicate = () => {
      const node = nodes.value.find((n) => n.id === contextMenu.nodeId);
      if (!node) return;
      pushUndo();
      const clone: CanvasNode = { ...node, id: genId(), x: node.x + 30, y: node.y + 30 };
      nodes.value.push(clone);
      emitOp({ type: 'node-add', node: { ...clone } });
      selectedNodeIds.value = [clone.id];
      closeContextMenu();
    };

    const duplicateSelection = () => {
      if (!selectedNodeIds.value.length) return;
      const ids = getCopySelectionIds();
      clipboard.value = {
        nodes: nodes.value.filter((n) => ids.has(n.id)).map((n) => ({ ...n })),
        edges: edges.value.filter((ed) => ids.has(ed.fromNode) && ids.has(ed.toNode)).map((ed) => ({ ...ed })),
      };

      const idMap = new Map<string, string>();
      pushUndo();
      const newNodes: CanvasNode[] = clipboard.value.nodes.map((n) => {
        const newId = genId();
        idMap.set(n.id, newId);
        return { ...n, id: newId, x: n.x + 40, y: n.y + 40 };
      });
      const newEdges: CanvasEdge[] = clipboard.value.edges.map((ed) => ({
        ...ed,
        id: genId(),
        fromNode: idMap.get(ed.fromNode) || ed.fromNode,
        fromEdge: ed.fromEdge ? idMap.get(ed.fromEdge) || ed.fromEdge : ed.fromEdge,
        toNode: idMap.get(ed.toNode) || ed.toNode,
      }));
      nodes.value.push(...newNodes);
      edges.value.push(...newEdges);
      for (const n of newNodes) emitOp({ type: 'node-add', node: { ...n } });
      for (const ed of newEdges) emitOp({ type: 'edge-add', edge: { ...ed } });
      selectedNodeIds.value = newNodes.map((n) => n.id);
    };

    const onCtxDelete = () => {
      pushUndo();
      const id = contextMenu.nodeId;
      edges.value = edges.value.filter((ed) => ed.fromNode !== id && ed.toNode !== id);
      nodes.value = nodes.value.filter((n) => n.id !== id);
      emitOp({ type: 'node-delete', ids: [id] });
      selectedNodeIds.value = [];
      closeContextMenu();
    };

    // Delete the current selection (toolbar button — touch-friendly alternative
    // to the keyboard Delete shortcut / right-click context menu).
    const deleteSelection = () => {
      if (!selectedNodeIds.value.length) return;
      pushUndo();
      const ids = [...selectedNodeIds.value];
      const idSet = new Set(ids);
      edges.value = edges.value.filter((ed) => !idSet.has(ed.fromNode) && !idSet.has(ed.toNode));
      nodes.value = nodes.value.filter((n) => !idSet.has(n.id));
      emitOp({ type: 'node-delete', ids });
      selectedNodeIds.value = [];
    };

    // Undo/redo history
    interface Snapshot { nodes: string; edges: string; drawings: string; }
    const undoStack = ref<Snapshot[]>([]);
    const redoStack = ref<Snapshot[]>([]);
    const MAX_HISTORY = 50;
    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    const takeSnapshot = (): Snapshot => ({
      nodes: JSON.stringify(nodes.value),
      edges: JSON.stringify(edges.value),
      drawings: JSON.stringify(drawings.value),
    });

    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleChange = (forceSnapshot = false) => {
      forceNextChange = forceNextChange || forceSnapshot;
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(emitChange, 300);
    };

    const pushUndo = () => {
      undoStack.value.push(takeSnapshot());
      if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
      redoStack.value = [];
      scheduleChange();
    };

    const undo = () => {
      if (!undoStack.value.length) return;
      redoStack.value.push(takeSnapshot());
      // will call scheduleChange below
      const snap = undoStack.value.pop()!;
      nodes.value = JSON.parse(snap.nodes);
      edges.value = JSON.parse(snap.edges);
      drawings.value = JSON.parse(snap.drawings);
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
      selectedDrawingId.value = null;
      scheduleChange(true);
    };

    const redo = () => {
      if (!redoStack.value.length) return;
      undoStack.value.push(takeSnapshot());
      const snap = redoStack.value.pop()!;
      nodes.value = JSON.parse(snap.nodes);
      edges.value = JSON.parse(snap.edges);
      drawings.value = JSON.parse(snap.drawings);
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
      selectedDrawingId.value = null;
      scheduleChange(true);
    };

    // Clipboard for copy/paste
    const clipboard = ref<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>({ nodes: [], edges: [] });

    const isEditableEventTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("textarea, input, select, [contenteditable='true']"));
    };

    // Delete edge or node on keydown
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableEventTarget(e.target)) return;
      if (e.key === "Escape" && drawTool.value !== "select") {
        drawTool.value = "select";
        draftDrawing.value = null;
        drawGestureStarted = false;
        drawErasing = false;
        return;
      }
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
        e.preventDefault();
        const ids = getCopySelectionIds();
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
          fromEdge: ed.fromEdge ? idMap.get(ed.fromEdge) || ed.fromEdge : ed.fromEdge,
          toNode: idMap.get(ed.toNode) || ed.toNode,
        }));
        nodes.value.push(...newNodes);
        edges.value.push(...newEdges);
        for (const n of newNodes) emitOp({ type: 'node-add', node: { ...n } });
        for (const ed of newEdges) emitOp({ type: 'edge-add', edge: { ...ed } });
        selectedNodeIds.value = newNodes.map((n) => n.id);
        // Update clipboard positions for next paste
        clipboard.value.nodes = clipboard.value.nodes.map((n) => ({ ...n, x: n.x + 40, y: n.y + 40 }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedNodeIds.value.length > 0) {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectedNodeIds.value = viewerNodes.value.map((n) => n.id);
        return;
      }
      // Escape — deselect
      if (e.key === "Escape") {
        selectedNodeIds.value = [];
        selectedEdgeId.value = null;
        selectedDrawingId.value = null;
        return;
      }
      if (editingNodeId.value || editingEdgeId.value) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEdgeId.value) {
          pushUndo();
          const deletedId = selectedEdgeId.value;
          edges.value = edges.value.filter((ed) => ed.id !== deletedId);
          emitOp({ type: 'edge-delete', id: deletedId });
          selectedEdgeId.value = null;
          e.preventDefault();
        } else if (selectedNodeIds.value.length > 0) {
          pushUndo();
          const ids = [...selectedNodeIds.value];
          const idSet = new Set(ids);
          edges.value = edges.value.filter((ed) => !idSet.has(ed.fromNode) && !idSet.has(ed.toNode));
          nodes.value = nodes.value.filter((n) => !idSet.has(n.id));
          emitOp({ type: 'node-delete', ids });
          selectedNodeIds.value = [];
          e.preventDefault();
        } else if (selectedDrawingId.value) {
          e.preventDefault();
          deleteSelectedDrawing();
        }
      }
    };

    // Drawing pointer handlers
    const toWorld = (e: PointerEvent): { x: number; y: number } => {
      const rect = viewport.value!.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - camera.x) / camera.scale,
        y: (e.clientY - rect.top - camera.y) / camera.scale,
      };
    };

    // NOTE: each erased drawing emits an immediate draw-remove op to peers. Local Ctrl+Z
    // restores the local array but does not emit compensating draw-add ops to peers — a
    // known limitation of the snapshot-undo + op-broadcast model (shared by nodes/edges). TODO: reconcile undo with collab.
    const eraseAt = (x: number, y: number) => {
      const tol = 6 / camera.scale;
      const hit = [...drawings.value].reverse().find((d) => hitTestDrawing(d, x, y, tol));
      if (!hit) return;
      drawings.value = drawings.value.filter((d) => d.id !== hit.id);
      emitOp({ type: "draw-remove", id: hit.id } as CanvasOp);
    };

    const onDrawPointerDown = (e: PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const { x, y } = toWorld(e);
      drawGestureStarted = true;

      if (drawTool.value === "eraser") {
        drawErasing = true;
        pushUndo();
        eraseAt(x, y);
        return;
      }
      const base = {
        id: genId(),
        color: drawColor.value,
        width: drawWidth.value,
        createdBy: "me",
        createdAt: new Date().toISOString(),
      };
      if (drawTool.value === "pen" || drawTool.value === "highlighter") {
        draftDrawing.value = {
          ...base,
          tool: drawTool.value,
          points: [x, y],
          opacity: drawTool.value === "highlighter" ? 0.3 : 1,
        };
      } else if (drawTool.value === "line" || drawTool.value === "arrow") {
        draftDrawing.value = { ...base, tool: drawTool.value, x1: x, y1: y, x2: x, y2: y };
      } else {
        // rect / ellipse
        draftDrawing.value = { ...base, tool: drawTool.value as Drawing["tool"], x, y, w: 0, h: 0 };
      }
    };

    const onDrawPointerMove = (e: PointerEvent) => {
      if (!drawGestureStarted) return;
      const { x, y } = toWorld(e);
      if (drawErasing) { eraseAt(x, y); return; }
      const d = draftDrawing.value;
      if (!d) return;
      if (d.tool === "pen" || d.tool === "highlighter") {
        d.points = [...(d.points || []), x, y];
      } else if (d.tool === "line" || d.tool === "arrow") {
        d.x2 = x; d.y2 = y;
      } else {
        d.w = x - (d.x as number); d.h = y - (d.y as number);
      }
    };

    const onDrawPointerUp = () => {
      if (!drawGestureStarted) return;
      drawGestureStarted = false;
      if (drawErasing) { drawErasing = false; return; }
      const d = draftDrawing.value;
      draftDrawing.value = null;
      if (!d) return;
      if ((d.tool === "pen" || d.tool === "highlighter") && (d.points || []).length < 4) return;
      if ((d.tool === "rect" || d.tool === "ellipse") && (Math.abs(d.w ?? 0) < 3 || Math.abs(d.h ?? 0) < 3)) return;
      if ((d.tool === "line" || d.tool === "arrow") && Math.hypot((d.x2 ?? 0) - (d.x1 ?? 0), (d.y2 ?? 0) - (d.y1 ?? 0)) < 3) return;
      pushUndo();
      drawings.value = [...drawings.value, d];
      emitOp({ type: "draw-add", drawing: d } as CanvasOp);
    };

    const onDrawPointerCancel = () => {
      drawGestureStarted = false;
      drawErasing = false;
      draftDrawing.value = null;
    };

    // Drawing selection computeds
    const selectedDrawingObj = computed(() => drawings.value.find((d) => d.id === selectedDrawingId.value) || null);
    const isDraggingDrawing = computed(() => drawMovePreview.value !== null);
    const shownDrawing = (d: Drawing): Drawing =>
      (drawMovePreview.value && drawMovePreview.value.id === d.id ? drawMovePreview.value : d);
    const renderList = computed(() => drawings.value.filter(canViewerSee).map(shownDrawing));
    const selectedBounds = computed(() => {
      const d = selectedDrawingObj.value;
      if (!d) return { x: 0, y: 0, w: 0, h: 0 };
      return drawingBounds(shownDrawing(d));
    });
    const selectedDrawingScreenRect = computed(() => {
      if (!selectedDrawingObj.value) return null;
      const b = selectedBounds.value;
      return {
        left: b.x * camera.scale + camera.x,
        top: b.y * camera.scale + camera.y,
        width: b.w * camera.scale,
        height: b.h * camera.scale,
      };
    });

    // Drawing pointer handlers (select + drag)
    const onDrawingPointerDown = (d: Drawing, e: PointerEvent) => {
      if (drawTool.value !== "select") return;
      e.stopPropagation();
      selectedDrawingId.value = d.id;
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      drawMoveStart = toWorld(e);
      drawMoveOrigin = d;
      drawMovePreview.value = null;
    };
    const onDrawingPointerMove = (e: PointerEvent) => {
      if (!drawMoveStart || !drawMoveOrigin) return;
      const p = toWorld(e);
      drawMovePreview.value = translateDrawing(drawMoveOrigin, p.x - drawMoveStart.x, p.y - drawMoveStart.y);
    };
    const onDrawingPointerUp = () => {
      if (!drawMoveStart || !drawMoveOrigin) return;
      const moved = drawMovePreview.value;
      const origin = drawMoveOrigin;
      drawMoveStart = null;
      drawMoveOrigin = null;
      drawMovePreview.value = null;
      if (!moved) return; // pure click → selection only
      pushUndo();
      drawings.value = drawings.value.map((d) => (d.id === origin.id ? moved : d));
      const changes =
        (moved.tool === "pen" || moved.tool === "highlighter")
          ? { points: moved.points }
          : (moved.tool === "line" || moved.tool === "arrow")
            ? { x1: moved.x1, y1: moved.y1, x2: moved.x2, y2: moved.y2 }
            : { x: moved.x, y: moved.y };
      emitOp({ type: "draw-update", id: origin.id, changes } as CanvasOp);
    };

    // Drawing action methods
    const setSelectedDrawingColor = (color: string) => {
      const d = selectedDrawingObj.value;
      if (!d) return;
      pushUndo();
      drawings.value = drawings.value.map((x) => (x.id === d.id ? { ...x, color } : x));
      emitOp({ type: "draw-update", id: d.id, changes: { color } } as CanvasOp);
    };
    const setSelectedDrawingWidth = (width: number) => {
      const d = selectedDrawingObj.value;
      if (!d) return;
      pushUndo();
      drawings.value = drawings.value.map((x) => (x.id === d.id ? { ...x, width } : x));
      emitOp({ type: "draw-update", id: d.id, changes: { width } } as CanvasOp);
    };
    const duplicateSelectedDrawing = () => {
      const d = selectedDrawingObj.value;
      if (!d) return;
      const copy: Drawing = { ...translateDrawing(d, 16, 16), id: genId(), createdAt: new Date().toISOString() };
      pushUndo();
      drawings.value = [...drawings.value, copy];
      selectedDrawingId.value = copy.id;
      emitOp({ type: "draw-add", drawing: copy } as CanvasOp);
    };
    const deleteSelectedDrawing = () => {
      const d = selectedDrawingObj.value;
      if (!d) return;
      const id = d.id;
      pushUndo();
      selectedDrawingId.value = null;
      drawings.value = drawings.value.filter((x) => x.id !== id);
      emitOp({ type: "draw-remove", id } as CanvasOp);
    };

    // Hide/show toggle methods (owner only)
    const isNodeHidden = (id: string) => !!(nodes.value.find((n) => n.id === id))?.hidden;
    const toggleNodeHidden = (id: string) => {
      const n = nodes.value.find((x) => x.id === id); if (!n) return;
      const hidden = !n.hidden;
      pushUndo();
      n.hidden = hidden;
      emitOp({ type: "node-update", id, changes: { hidden } });
      closeContextMenu();
    };
    const isEdgeHidden = (id: string) => !!(edges.value.find((e) => e.id === id))?.hidden;
    const toggleEdgeHidden = (id: string) => {
      const e = edges.value.find((x) => x.id === id); if (!e) return;
      const hidden = !e.hidden;
      pushUndo();
      e.hidden = hidden;
      emitOp({ type: "edge-update", id, changes: { hidden } });
    };
    const isSelectedDrawingHidden = () => !!selectedDrawingObj.value?.hidden;
    const toggleSelectedDrawingHidden = () => {
      const d = selectedDrawingObj.value; if (!d) return;
      const hidden = !d.hidden;
      pushUndo();
      drawings.value = drawings.value.map((x) => (x.id === d.id ? { ...x, hidden } : x));
      emitOp({ type: "draw-update", id: d.id, changes: { hidden } } as CanvasOp);
    };

    // Clear stale selection when peer removes the selected drawing
    watch(drawings, () => {
      if (selectedDrawingId.value && !drawings.value.some((d) => d.id === selectedDrawingId.value)) {
        selectedDrawingId.value = null;
      }
    });

    // Pan handlers
    const onPanStart = (e: MouseEvent) => {
      if (dragNodeId.value || connDragging.value) return;
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        selectedNodeIds.value = [];
      }
      selectedEdgeId.value = null;
      selectedDrawingId.value = null;
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
      updateLastPointer(e);
      // Emit cursor position for remote users
      if (viewport.value) {
        const rect = viewport.value.getBoundingClientRect();
        const wx = (e.clientX - rect.left - camera.x) / camera.scale;
        const wy = (e.clientY - rect.top - camera.y) / camera.scale;
        emit("cursor-move", { x: wx, y: wy });
      }
      // Edge creation dragging
      if (connDragging.value) {
        updateActiveDragFromPointer();
        return;
      }
      // Node resizing
      if (resizeNodeId.value) {
        updateActiveDragFromPointer();
        return;
      }
      // Node dragging (multi-drag)
      if (dragNodeId.value) {
        updateActiveDragFromPointer();
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
      updateLastPointer(e);
      stopAutoPan();
      // Finish edge creation
      if (connDragging.value) {
        const rect = viewport.value!.getBoundingClientRect();
        const wx = (e.clientX - rect.left - camera.x) / camera.scale;
        const wy = (e.clientY - rect.top - camera.y) / camera.scale;
        const target = findNodeAt(wx, wy);
        if (target && target.node.id !== connFromNode.value) {
          pushUndo();
          const newEdge: CanvasEdge = {
            id: genId(),
            fromNode: connFromEdge.value ? "" : connFromNode.value,
            toNode: target.node.id,
            toSide: target.side,
          };
          if (connFromEdge.value) {
            newEdge.fromEdge = connFromEdge.value;
          } else {
            newEdge.fromSide = connFromSide.value;
          }
          edges.value.push(newEdge);
          emitOp({ type: 'edge-add', edge: { ...newEdge } });
        }
        connDragging.value = false;
        connFromEdge.value = "";
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
          const hits = viewerNodes.value.filter((n) =>
            n.x + n.width > x1 && n.x < x2 && n.y + n.height > y1 && n.y < y2
          ).map((n) => n.id);
          selectedNodeIds.value = hits;
        }
        selBox.active = false;
      }
      isPanning.value = false;
      // Emit move op at end of drag
      if (dragNodeId.value && selectedNodeIds.value.length > 0) {
        const moves = selectedNodeIds.value.map((id) => {
          const n = nodes.value.find((nd) => nd.id === id);
          return n ? { id, x: n.x, y: n.y } : null;
        }).filter(Boolean) as { id: string; x: number; y: number }[];
        if (moves.length) emitOp({ type: 'nodes-move', moves });
      }
      // Emit resize op at end of resize
      if (resizeNodeId.value) {
        const n = nodes.value.find((nd) => nd.id === resizeNodeId.value);
        if (n) emitOp({ type: 'node-resize', id: n.id, x: n.x, y: n.y, width: n.width, height: n.height });
      }
      dragNodeId.value = null;
      resizeNodeId.value = null;
    };

    // Zoom / pan handler (wheel + trackpad)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom on trackpad (or Ctrl+wheel)
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        const newScale = Math.max(0.05, Math.min(5, camera.scale * zoomFactor));

        const rect = viewport.value!.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        camera.x = mx - (mx - camera.x) * (newScale / camera.scale);
        camera.y = my - (my - camera.y) * (newScale / camera.scale);
        camera.scale = newScale;
      } else {
        // Two-finger scroll on trackpad → pan
        camera.x -= e.deltaX;
        camera.y -= e.deltaY;
      }
    };

    // Touch handlers
    const getTouchDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0;
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (e: TouchEvent) => {
      const t0 = e.touches[0]!;
      if (e.touches.length < 2) return { x: t0.clientX, y: t0.clientY };
      const t1 = e.touches[1]!;
      return {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };
    };

    // Is the touch on a text-editing field? If so, let the browser handle it
    // natively (caret placement, on-screen keyboard) instead of hijacking it.
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el?.closest('.node-editor, .edge-label-input, input, textarea');
    };

    const onTouchStart = (e: TouchEvent) => {
      if (isEditableTarget(e.target)) return; // typing — don't interfere
      e.preventDefault();

      if (e.touches.length === 1) {
        const t = e.touches[0]!;
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchMoved = false;
        touchDragging = false;
        touchResizing = false;
        if (contextMenu.visible) closeContextMenu();

        // Did we start on a resize handle? (touch-resize for mobile)
        const handleEl = (e.target as HTMLElement | null)?.closest('.resize-handle') as HTMLElement | null;
        const handleNodeEl = handleEl?.closest('[data-node-id]') as HTMLElement | null;
        const handleNodeId = handleNodeEl?.dataset.nodeId ?? null;
        if (handleEl && handleNodeId && !props.readonly) {
          const node = nodes.value.find((n) => n.id === handleNodeId);
          const handle = handleEl.dataset.handle ?? "";
          if (node && handle) {
            selectedNodeIds.value = [handleNodeId];
            selectedEdgeId.value = null;
            if (node.positionLocked) return;
            touchResizing = true;
            onResizeStart({ clientX: t.clientX, clientY: t.clientY }, node, handle);
            return;
          }
        }

        // Did we start on a connection point? (touch-connect for mobile)
        // Only the selected node shows usable connection points, so gate on selection —
        // otherwise the invisible points on other nodes would hijack taps near their edges.
        const connEl = (e.target as HTMLElement | null)?.closest('.conn-point') as HTMLElement | null;
        const connNodeEl = connEl?.closest('[data-node-id]') as HTMLElement | null;
        const connNodeId = connNodeEl?.dataset.nodeId ?? null;
        if (connEl && connNodeId && !props.readonly && selectedNodeIds.value.includes(connNodeId)) {
          const node = nodes.value.find((n) => n.id === connNodeId);
          const side = connEl.dataset.connSide ?? "";
          if (node && side && !node.positionLocked) {
            onConnStart({ clientX: t.clientX, clientY: t.clientY } as MouseEvent, node, side);
            touchConnecting = true;
            return;
          }
        }

        // Did we start on a node/group?
        const nodeEl = (e.target as HTMLElement | null)?.closest('[data-node-id]') as HTMLElement | null;
        touchNodeId = nodeEl?.dataset.nodeId ?? null;

        const touchNode = touchNodeId ? nodes.value.find((n) => n.id === touchNodeId) : null;

        if (touchNodeId && !props.readonly) {
          // Select immediately (so the style toolbar appears) and prime a drag.
          if (!selectedNodeIds.value.includes(touchNodeId)) {
            selectedNodeIds.value = [touchNodeId];
          }
          selectedEdgeId.value = null;
          if (touchNode?.positionLocked) {
            return;
          }
          lastPointer.x = t.clientX;
          lastPointer.y = t.clientY;
          dragMouseStart.x = t.clientX;
          dragMouseStart.y = t.clientY;
          dragCameraStart.x = camera.x;
          dragCameraStart.y = camera.y;
        } else if (touchNodeId && props.readonly) {
          // read-only: tap just selects, no drag/pan
          selectedNodeIds.value = [touchNodeId];
        } else {
          // Empty canvas → pan
          isPanning.value = true;
          panStart.x = t.clientX;
          panStart.y = t.clientY;
          cameraStart.x = camera.x;
          cameraStart.y = camera.y;
        }
      } else if (e.touches.length === 2) {
        // Second finger down → abandon any single-finger drag/pan/resize/connect, go to pinch
        touchNodeId = null;
        touchDragging = false;
        touchResizing = false;
        touchConnecting = false;
        dragNodeId.value = null;
        resizeNodeId.value = null;
        connDragging.value = false;
        connFromEdge.value = "";
        isPanning.value = false;
        stopAutoPan();
        lastTouchDist.value = getTouchDist(e);
        const c = getTouchCenter(e);
        lastTouchCenter.x = c.x;
        lastTouchCenter.y = c.y;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();

      if (e.touches.length === 1) {
        const t = e.touches[0]!;

        // Resize via touch on a handle — drive the shared resize math.
        if (touchResizing && resizeNodeId.value) {
          lastPointer.x = t.clientX;
          lastPointer.y = t.clientY;
          applyResize();
          return;
        }

        // Connection drag via touch on a connection point — track the finger as the temp edge end.
        if (touchConnecting && connDragging.value) {
          lastPointer.x = t.clientX;
          lastPointer.y = t.clientY;
          updateActiveDragFromPointer();
          return;
        }

        if (!touchMoved) {
          const dx = t.clientX - touchStartX;
          const dy = t.clientY - touchStartY;
          if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) touchMoved = true;
        }
        if (!touchMoved) return;

        const activeTouchNode = touchNodeId ? nodes.value.find((n) => n.id === touchNodeId) : null;
        if (activeTouchNode?.positionLocked) return;

        if (touchNodeId && !props.readonly) {
          // Begin the actual node drag the first time we cross the threshold
          if (!touchDragging) {
            touchDragging = true;
            pushUndo();
            dragNodeId.value = touchNodeId;
            dragNodesInitial.value = new Map();
            for (const id of selectedNodeIds.value) {
              const n = nodes.value.find((nd) => nd.id === id);
              if (n && !n.positionLocked) dragNodesInitial.value.set(id, { x: n.x, y: n.y });
            }
            startAutoPan();
          }
          lastPointer.x = t.clientX;
          lastPointer.y = t.clientY;
          updateActiveDragFromPointer();
        } else if (isPanning.value) {
          camera.x = cameraStart.x + (t.clientX - panStart.x);
          camera.y = cameraStart.y + (t.clientY - panStart.y);
        }
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

    const onTouchEnd = (e: TouchEvent) => {
      // Prevent Android WebView from treating the second tap as browser zoom.
      // Textareas are deliberately excluded so their native editing stays intact.
      if (!isEditableTarget(e.target)) e.preventDefault();
      // Only handle when the last finger lifts
      if (e.touches.length > 0) return;
      stopAutoPan();

      // Finalize a touch connection — create the edge if released over another node.
      if (touchConnecting) {
        if (connDragging.value && viewport.value) {
          const rect = viewport.value.getBoundingClientRect();
          const wx = (lastPointer.x - rect.left - camera.x) / camera.scale;
          const wy = (lastPointer.y - rect.top - camera.y) / camera.scale;
          const target = findNodeAt(wx, wy);
          if (target && target.node.id !== connFromNode.value) {
            pushUndo();
            const newEdge: CanvasEdge = {
              id: genId(),
              fromNode: connFromNode.value,
              toNode: target.node.id,
              toSide: target.side,
              fromSide: connFromSide.value,
            };
            edges.value.push(newEdge);
            emitOp({ type: 'edge-add', edge: { ...newEdge } });
          }
        }
        connDragging.value = false;
        connFromEdge.value = "";
        touchConnecting = false;
        touchNodeId = null;
        return;
      }

      // Finalize a touch resize — emit the op and reset, skip tap/drag handling.
      if (touchResizing) {
        if (resizeNodeId.value) {
          const n = nodes.value.find((nd) => nd.id === resizeNodeId.value);
          if (n) emitOp({ type: 'node-resize', id: n.id, x: n.x, y: n.y, width: n.width, height: n.height });
        }
        resizeNodeId.value = null;
        touchResizing = false;
        touchNodeId = null;
        return;
      }

      const now = performance.now();

      if (!touchMoved && touchNodeId) {
        // Tap on a node
        const isDouble = now - lastTapTime < DOUBLE_TAP_MS && lastTapTarget === touchNodeId;
        if (isDouble && !props.readonly) {
          const node = nodes.value.find((n) => n.id === touchNodeId);
          if (node && node.type === 'text') onNodeDblClick(node);
          lastTapTime = 0;
          lastTapTarget = "";
        } else {
          lastTapTime = now;
          lastTapTarget = touchNodeId;
        }
      } else if (!touchMoved && !touchNodeId) {
        // Tap on empty canvas
        const isDouble = now - lastTapTime < DOUBLE_TAP_MS && lastTapTarget === "__empty__";
        if (isDouble && !props.readonly) {
          createTextNodeAtClient(touchStartX, touchStartY);
          lastTapTime = 0;
          lastTapTarget = "";
        } else {
          // Single tap on blank space → deselect / close
          if (editingNodeId.value) onEditEnd();
          selectedNodeIds.value = [];
          selectedEdgeId.value = null;
          closeContextMenu();
          lastTapTime = now;
          lastTapTarget = "__empty__";
        }
      }

      // Commit a node move op at the end of a touch drag
      if (touchDragging && dragNodeId.value && selectedNodeIds.value.length > 0) {
        const moves = selectedNodeIds.value.map((id) => {
          const n = nodes.value.find((nd) => nd.id === id);
          return n ? { id, x: n.x, y: n.y } : null;
        }).filter(Boolean) as { id: string; x: number; y: number }[];
        if (moves.length) emitOp({ type: 'nodes-move', moves });
      }

      dragNodeId.value = null;
      touchDragging = false;
      touchNodeId = null;
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

    // File operations
    const fileInput = ref<HTMLInputElement | null>(null);
    const imageInput = ref<HTMLInputElement | null>(null);
    const dndPortraitInput = ref<HTMLInputElement | null>(null);
    const dndPortraitNodeId = ref<string | null>(null);

    const onNewCanvas = () => {
      pushUndo();
      nodes.value = [];
      edges.value = [];
      selectedNodeIds.value = [];
      selectedEdgeId.value = null;
      camera.x = 0;
      camera.y = 0;
      camera.scale = 1;
      scheduleChange(true);
    };

    const onImportCanvas = () => {
      fileInput.value?.click();
    };

    const onFileSelected = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          pushUndo();
          nodes.value = data.nodes || [];
          edges.value = data.edges || [];
          selectedNodeIds.value = [];
          selectedEdgeId.value = null;
          fitToContent();
          scheduleChange(true);
        } catch (err) {
          console.error("Failed to parse canvas file:", err);
        }
      };
      reader.readAsText(file);
      // Reset so same file can be re-selected
      (e.target as HTMLInputElement).value = "";
    };

    const onExportCanvas = () => {
      const data = JSON.stringify({ nodes: nodes.value, edges: edges.value }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "canvas.canvas";
      a.click();
      URL.revokeObjectURL(url);
    };

    const openImagePicker = () => {
      imageInput.value?.click();
    };

    const onImageSelected = async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      // Reset so the same file can be re-selected even if the upload fails.
      input.value = "";
      if (!file) return;
      try {
        const { url } = await uploadImage(file);
        if (!url) return;
        const centerX = viewport.value ? (-camera.x / camera.scale) + viewport.value.clientWidth / (2 * camera.scale) : 0;
        const centerY = viewport.value ? (-camera.y / camera.scale) + viewport.value.clientHeight / (2 * camera.scale) : 0;
        const newNode: CanvasNode = {
          id: genId(),
          type: "image",
          x: centerX - 160,
          y: centerY - 120,
          width: 320,
          height: 240,
          file: url,
          label: file.name,
        };
        pushUndo();
        nodes.value.push(newNode);
        emitOp({ type: 'node-add', node: { ...newNode } });
        selectedNodeIds.value = [newNode.id];
      } catch (err) {
        console.error("Failed to upload image:", err);
        window.alert("Failed to upload image. Please try again.");
      }
    };

    const openDndPortraitPicker = (node: CanvasNode) => {
      dndPortraitNodeId.value = node.id;
      dndPortraitInput.value?.click();
    };

    const onDndPortraitSelected = async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      const node = nodes.value.find((item) => item.id === dndPortraitNodeId.value);
      dndPortraitNodeId.value = null;
      if (!file || !node || node.templateId !== 'dnd-character') return;
      try {
        const { url } = await uploadImage(file);
        if (url) setDndIdentity(node, 'portraitUrl', url);
      } catch (err) {
        console.error('Failed to upload D&D portrait:', err);
        window.alert('Не удалось загрузить портрет. Попробуйте ещё раз.');
      }
    };

    const onCanvasEmbedDblClick = (canvasId: string) => {
      emit("open-canvas", canvasId);
    };

    const addCanvasEmbed = (canvasId: string) => {
      const centerX = viewport.value ? (-camera.x / camera.scale) + viewport.value.clientWidth / (2 * camera.scale) : 0;
      const centerY = viewport.value ? (-camera.y / camera.scale) + viewport.value.clientHeight / (2 * camera.scale) : 0;
      const newNode: CanvasNode = {
        id: genId(),
        type: "canvas",
        x: centerX - 200,
        y: centerY - 150,
        width: 400,
        height: 300,
        canvasId,
      };
      pushUndo();
      nodes.value.push(newNode);
      emitOp({ type: 'node-add', node: { ...newNode } });
      selectedNodeIds.value = [newNode.id];
      loadEmbeddedCanvas(canvasId);
    };

    const searchNodes = (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        selectedNodeIds.value = [];
        return [];
      }
      return nodes.value
        .filter((node) => {
          const haystack = [
            node.text || "",
            node.label || "",
            node.url || "",
            node.file || "",
          ].join(" ").toLowerCase();
          return haystack.includes(q);
        })
        .map((node) => node.id);
    };

    const getNodeLabel = (id: string): string => {
      const n = nodes.value.find((x) => x.id === id);
      if (!n) return "Нода";
      if (n.type === "image") return n.label || "Изображение";
      const t = (n.text || n.label || "").toString().trim();
      return t ? t.replace(/\s+/g, " ").slice(0, 40) : "Нода";
    };

    const isImageNode = (id: string | null | undefined): boolean => {
      return !!id && nodes.value.find((node) => node.id === id)?.type === "image";
    };

    const getNodeTitle = (id: string | null | undefined): string => {
      if (!id) return "";
      return nodes.value.find((node) => node.id === id)?.label || "";
    };

    const setNodeTitle = (id: string | null | undefined, title: string) => {
      if (!id || props.readonly) return;
      const node = nodes.value.find((item) => item.id === id);
      if (!node || node.type !== "image") return;
      const label = title.trim();
      if (node.label === label) return;
      pushUndo();
      node.label = label;
      emitOp({ type: "node-update", id: node.id, changes: { label } });
    };

    const flashNodeId = ref<string | null>(null);

    const focusNode = (nodeId: string) => {
      const node = nodes.value.find((item) => item.id === nodeId);
      if (!node || !viewport.value) return;
      selectedNodeIds.value = [nodeId];
      selectedEdgeId.value = null;
      selectedDrawingId.value = null;
      const centerX = node.x + node.width / 2;
      const centerY = node.y + node.height / 2;
      camera.x = viewport.value.clientWidth / 2 - centerX * camera.scale;
      camera.y = viewport.value.clientHeight / 2 - centerY * camera.scale;
      // brief highlight flash
      flashNodeId.value = nodeId;
      setTimeout(() => { if (flashNodeId.value === nodeId) flashNodeId.value = null; }, 1400);
    };

    // Minimap drag-to-pan
    const minimapDragging = ref(false);

    const minimapScreenToWorld = (e: MouseEvent) => {
      const el = (e.currentTarget as HTMLElement).querySelector('svg')!;
      const rect = el.getBoundingClientRect();
      const vb = minimapData.value!;
      const [vbX = 0, vbY = 0, vbW = 1, vbH = 1] = vb.viewBox.split(' ').map(Number);
      const wx = vbX + (e.clientX - rect.left) / rect.width * vbW;
      const wy = vbY + (e.clientY - rect.top) / rect.height * vbH;
      return { wx, wy };
    };

    const centerCameraOn = (wx: number, wy: number) => {
      const vw = viewport.value!.clientWidth;
      const vh = viewport.value!.clientHeight;
      camera.x = -(wx * camera.scale - vw / 2);
      camera.y = -(wy * camera.scale - vh / 2);
    };

    const onMinimapDown = (e: MouseEvent) => {
      if (e.button !== 0 || !minimapData.value) return;
      minimapDragging.value = true;
      const { wx, wy } = minimapScreenToWorld(e);
      centerCameraOn(wx, wy);
    };

    const onMinimapMove = (e: MouseEvent) => {
      if (!minimapDragging.value || !minimapData.value) return;
      const { wx, wy } = minimapScreenToWorld(e);
      centerCameraOn(wx, wy);
    };

    const onMinimapUp = () => {
      minimapDragging.value = false;
    };

    // Minimap computed
    const minimapData = computed(() => {
      if (!viewerNodes.value.length || !viewport.value) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of viewerNodes.value) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }
      const pad = 100;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const vw = viewport.value.clientWidth;
      const vh = viewport.value.clientHeight;
      // Viewport in world coords
      const vpX = -camera.x / camera.scale;
      const vpY = -camera.y / camera.scale;
      const vpW = vw / camera.scale;
      const vpH = vh / camera.scale;
      return {
        viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
        vpX, vpY, vpW, vpH,
      };
    });

    // Apply remote canvas data without triggering change event
    const applyRemoteData = (data: { nodes: CanvasNode[]; edges: CanvasEdge[]; drawings?: Drawing[] }) => {
      nodes.value = data.nodes;
      edges.value = data.edges;
      drawings.value = data.drawings || [];
    };

    const getCanvasData = () => ({
      nodes: JSON.parse(JSON.stringify(nodes.value)),
      edges: JSON.parse(JSON.stringify(edges.value)),
      drawings: JSON.parse(JSON.stringify(drawings.value)),
    });

    let previousViewportContent: string | null = null;
    const onOrientationChange = () => window.setTimeout(fitToContent, 0);

    onMounted(() => {
      loadCanvas();
      // Browser zoom on a double tap also emits resize on Android and used to
      // reset this canvas to fit-to-content. Orientation is the only layout
      // change that should intentionally reset the view.
      window.addEventListener("orientationchange", onOrientationChange);
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta) {
        previousViewportContent = viewportMeta.getAttribute('content');
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      }
      window.addEventListener("keydown", onKeyDown);
    });

    onUnmounted(() => {
      if (editSaveTimer) clearTimeout(editSaveTimer);
      stopAutoPan();
      window.removeEventListener("orientationchange", onOrientationChange);
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta && previousViewportContent !== null) viewportMeta.setAttribute('content', previousViewportContent);
      window.removeEventListener("keydown", onKeyDown);
    });

    return {
      viewport,
      worldStyle,
      zoomPercent,
      groups,
      textNodes,
      linkNodes,
      imageNodes,
      canvasNodes,
      getEmbeddedCanvasData,
      embeddedCanvasViewBox,
      embeddedEdgePath,
      addCanvasEmbed,
      onCanvasEmbedDblClick,
      edgesSvgStyle,
      edgesSvgTransform,
      renderedEdges,
      edgeColors,
      arrowMarkerId,
      nodePosition,
      nodeColorClass,
      groupColorClass,
      nodePresentationClass,
      renderMarkdown,
      getNodeFirstLine,
      getNodeRestText,
      getNodeFirstLineAlignValue,
      selectedNodeId,
      selectedNodeIds,
      isNodeSelected,
      selBoxStyle,
      selBox,
      editingNodeId,
      editorRefs,
      dragNodeId,
      isManipulatingNode,
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
      onEdgeCycleArrow,
      onCanvasDblClick,
      addTextNodeCenter,
      addDndCharacterTemplate,
      importDndCharacter,
      templateNodes,
      dndAbilities,
      dndTabs,
      dndPersonalityFields,
      dndSheet,
      isDndInteracting,
      enterDndInteraction,
      exitDndInteraction,
      toggleDndInteraction,
      onDndSheetMouseDown,
      setDndIdentity,
      setDndNumber,
      setDndCombat,
      changeDndHp,
      setDndAbilityScore,
      toggleDndSave,
      toggleDndMode,
      setDndTab,
      setDndNotes,
      setDndPersonality,
      dndTabItems,
      addDndListItem,
      updateDndListItem,
      removeDndListItem,
      formatDndModifier,
      dndSavingThrow,
      rollTemplateAbility,
      contextMenu,
      contextMenuStyle,
      getContextNode,
      setNodeColor,
      getNodeColor,
      getNodeAlign,
      getNodeFirstLineAlign,
      setNodeFirstLineAlign,
      setNodeAlign,
      borderStyles,
      fontColors,
      getNodeBorderStyle,
      setNodeBorderStyle,
      getNodeBorderWidth,
      setNodeBorderWidth,
      getNodeFillStyle,
      toggleNodeFillStyle,
      getNodeBorderColor,
      setNodeBorderColor,
      getNodeFontColor,
      setNodeFontColor,
      isNodeTransparent,
      toggleNodeTransparent,
      getNodeShape,
      toggleNodeShape,
      isNodePositionLocked,
      toggleNodePositionLock,
      bringSelectionForward,
      sendSelectionBackward,
      bringSelectionToFront,
      sendSelectionToBack,
      onNodeContextMenu,
      onEdgeContextMenu,
      onDrawingContextMenu,
      closeContextMenu,
      onCtxSetColor,
      onCtxSetFontColor,
      onCtxSendBackward,
      onCtxBringForward,
      onCtxSendToBack,
      onCtxBringToFront,
      onCtxToggleLock,
      onCtxDuplicate,
      onCtxDelete,
      connDragging,
      tempEdgePath,
      onConnStart,
      onConnStartFromEdge,
      onWheel,
      onPanStart,
      onPanMove,
      onPanEnd,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      nodes,
      drawings,
      draftDrawing,
      drawTool,
      drawColor,
      drawWidth,
      setDrawTool,
      setDrawColor,
      setDrawWidth,
      onDrawPointerDown,
      onDrawPointerMove,
      onDrawPointerUp,
      onDrawPointerCancel,
      strokeToPath,
      Math,
      minimapData,
      onMinimapDown,
      onMinimapMove,
      onMinimapUp,
      zoomIn,
      zoomOut,
      resetView,
      fileInput,
      onNewCanvas,
      onImportCanvas,
      onFileSelected,
      onExportCanvas,
      openImagePicker,
      onImageSelected,
      dndPortraitInput,
      openDndPortraitPicker,
      onDndPortraitSelected,
      undo,
      redo,
      canUndo,
      canRedo,
      applyRemoteData,
      applyRemoteOp,
      getCanvasData,
      duplicateSelection,
      deleteSelection,
      searchNodes,
      focusNode,
      getNodeLabel,
      isImageNode,
      getNodeTitle,
      setNodeTitle,
      flashNodeId,
      imageInput,
      selectedDrawingId,
      selectedDrawingObj,
      isDraggingDrawing,
      selectedBounds,
      selectedDrawingScreenRect,
      renderList,
      onDrawingPointerDown,
      onDrawingPointerMove,
      onDrawingPointerUp,
      setSelectedDrawingColor,
      setSelectedDrawingWidth,
      duplicateSelectedDrawing,
      deleteSelectedDrawing,
      viewerNodes,
      isNodeHidden,
      toggleNodeHidden,
      isEdgeHidden,
      toggleEdgeHidden,
      isSelectedDrawingHidden,
      toggleSelectedDrawingHidden,
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
  touch-action: none;
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
  cursor: grab;
}
.canvas-group.is-selected {
  border-color: rgba(124, 138, 255, 0.7);
  box-shadow: 0 0 0 1px rgba(124, 138, 255, 0.35);
}
.canvas-group.is-dragging {
  cursor: grabbing;
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

.canvas-node.canvas-node-image {
  overflow: visible;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
}
.node-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  pointer-events: none;
  user-select: none;
}
.node-image-title {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 100%;
  color: rgba(255,255,255,0.82);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.canvas-node.canvas-node-template {
  padding: 0;
  overflow: visible;
  background: #171a19;
  border: 1px solid #3b4940;
  border-radius: 10px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.28);
  color: var(--dark-text-primary, #f0f6f1);
  user-select: none;
}
.dnd-sheet { position: relative; box-sizing: border-box; min-width: 720px; min-height: 480px; padding: 42px 18px 18px; background: #171a19; color: #edf5ef; font-size: 14px; user-select: none; }.dnd-sheet.is-interacting { border-color: color-mix(in srgb, var(--color-brands, #00ff00) 72%, #fff); user-select: text; }.dnd-sheet-content[inert] { opacity: .72; pointer-events: none; }
.dnd-mode-toggle { position: absolute; z-index: 2; top: 10px; right: 12px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 1px solid #4a5b50; border-radius: 5px; color: #aab7ae; background: #111513; font-size: 14px; cursor: pointer; }.dnd-mode-toggle:hover, .dnd-mode-toggle:focus-visible { border-color: var(--color-brands, #00ff00); color: #d8ffe1; outline: none; }.dnd-mode-toggle.active { border-color: #4ea963; color: #d9ffe3; background: #1d3924; }
.dnd-sheet.is-compact { min-width: 0; min-height: 0; padding: 12px; }.dnd-sheet.is-compact .dnd-combat-row { margin: 10px 0; }.dnd-sheet.is-compact .dnd-card-abilities article > input, .dnd-sheet.is-compact .dnd-card-abilities label { display: none; }
.dnd-sheet input, .dnd-sheet textarea { box-sizing: border-box; color: inherit; background: #222825; border: 1px solid #3b4940; border-radius: 5px; outline: none; }.dnd-sheet input:focus, .dnd-sheet textarea:focus { border-color: var(--color-brands, #00ff00); box-shadow: 0 0 0 2px #00ff0030; }.dnd-sheet input:read-only, .dnd-sheet textarea:read-only { border-color: transparent; background: transparent; }
.dnd-sheet-head { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #354039; }.dnd-portrait-wrap { position: relative; flex: 0 0 56px; }.dnd-portrait { display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border: 1px solid #435248; border-radius: 50%; background: #263329; color: #77ee9a; font-size: 22px; font-weight: 700; }.dnd-portrait img { width: 100%; height: 100%; object-fit: cover; }.dnd-portrait-actions { position: absolute; right: -5px; bottom: -5px; display: flex; gap: 2px; }.dnd-portrait-actions button { display: grid; place-items: center; width: 19px; height: 19px; padding: 0; border: 1px solid #5c7665; border-radius: 50%; color: #d8f9df; background: #1d3924; font-size: 11px; cursor: pointer; }.dnd-identity { display: grid; min-width: 0; flex: 1; gap: 4px; }.dnd-identity > input { width: 100%; padding: 2px 0; font-size: 22px; font-weight: 700; }.dnd-identity span { color: #aab7ae; font-size: 12px; }.dnd-identity span input { width: min(130px, 32%); padding: 2px; font-size: inherit; }.dnd-level { display: flex; align-items: center; gap: 4px; color: #aab7ae; }.dnd-level input { width: 44px; padding: 5px; text-align: center; }.dnd-collapse { width: 32px; height: 30px; border: 1px solid #435248; border-radius: 6px; color: #bceac8; background: transparent; cursor: pointer; }
.dnd-combat-row { display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0; }.dnd-combat-row label { display: flex; align-items: center; gap: 5px; color: #aab7ae; font-size: 12px; }.dnd-combat-row input { width: 48px; padding: 5px; font-weight: 700; text-align: center; }.dnd-combat-row label:nth-child(3) input { width: 44px; }.dnd-combat-row button { width: 22px; height: 22px; border: 1px solid #435248; border-radius: 5px; color: #bceac8; background: transparent; cursor: pointer; }.dnd-combat-row b { color: #77857c; }.dnd-temp input { width: 42px; }
.dnd-card-abilities { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }.dnd-sheet.is-compact .dnd-card-abilities { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }.dnd-card-abilities article { display: grid; gap: 5px; min-width: 0; padding: 7px; border: 1px solid #354039; border-radius: 7px; background: #1e2421; }.dnd-card-abilities button { min-width: 0; padding: 5px 2px; border: 0; border-radius: 5px; color: inherit; background: transparent; cursor: pointer; }.dnd-card-abilities button:hover { background: #2a362e; }.dnd-card-abilities span, .dnd-card-abilities strong, .dnd-card-abilities em { display: block; }.dnd-card-abilities span { color: #aab7ae; font-size: 10px; }.dnd-card-abilities strong { font-size: 17px; line-height: 1.1; }.dnd-card-abilities em { color: #77ee9a; font-size: 12px; font-style: normal; }.dnd-card-abilities > article > input { width: 100%; padding: 3px; text-align: center; }.dnd-card-abilities label { display: flex; gap: 3px; align-items: center; color: #aab7ae; font-size: 10px; white-space: nowrap; }
.dnd-full-content { margin-top: 16px; border-top: 1px solid #354039; }.dnd-tabs { display: flex; gap: 5px; padding: 10px 0; overflow-x: auto; }.dnd-tabs button { padding: 6px 8px; border: 1px solid transparent; border-radius: 5px; color: #aab7ae; background: transparent; white-space: nowrap; cursor: pointer; }.dnd-tabs button.active { border-color: #3f874f; color: #baf5c7; background: #1d3924; }.dnd-tab-panel { min-height: 112px; }.dnd-tab-panel textarea { width: 100%; min-height: 96px; padding: 8px; resize: vertical; }.dnd-tab-panel > label { display: grid; gap: 4px; margin-bottom: 7px; color: #aab7ae; font-size: 12px; }.dnd-tab-panel > label textarea { min-height: 48px; }.dnd-tab-panel p { color: #94a299; font-size: 12px; }
.dnd-list { display: grid; gap: 7px; }.dnd-list-row { display: grid; grid-template-columns: minmax(110px, 1.2fr) auto minmax(120px, 1fr) auto; align-items: center; gap: 6px; padding: 7px; border: 1px solid #354039; border-radius: 6px; background: #1b211e; }.dnd-list-row input { min-width: 0; padding: 5px; font-size: 12px; }.dnd-list-row input[type="number"] { width: 48px; }.dnd-list-row label { display: flex; gap: 3px; align-items: center; color: #aab7ae; font-size: 10px; white-space: nowrap; }.dnd-list-remove, .dnd-list-add { border: 1px solid #435248; border-radius: 5px; color: #c0edca; background: transparent; cursor: pointer; }.dnd-list-remove { width: 25px; height: 25px; }.dnd-list-add { justify-self: start; padding: 6px 9px; }.dnd-list-add:hover, .dnd-list-remove:hover { border-color: #5bbc70; background: #1d3924; }
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
  z-index: 15;
}
.canvas-drawings {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 20; /* above node layer (z-index 10), below edge actions/label editors (50) and remote cursors (100) */
}
.drawing-selection-outline {
  animation: drawing-selection-ants 0.6s linear infinite;
}
@keyframes drawing-selection-ants {
  to { stroke-dashoffset: -10; }
}
.canvas-drawings path,
.canvas-drawings rect,
.canvas-drawings ellipse,
.canvas-drawings line {
  pointer-events: none;
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
.edge-midpoint-conn {
  fill: rgba(124, 138, 255, 0.5);
  stroke: rgba(124, 138, 255, 0.8);
  stroke-width: 1.5;
  cursor: crosshair;
  opacity: 0;
  pointer-events: auto;
  transition: opacity 0.15s;
}
g:hover > .edge-midpoint-conn {
  opacity: 1;
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
  max-width: min(260px, calc(100vw - 24px));
  max-height: min(420px, calc(100dvh - 24px));
  overflow: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}
.ctx-colors {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
}
.ctx-label {
  min-width: 28px;
  flex: 0 0 28px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 10px;
  text-transform: uppercase;
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
.ctx-color-btn.active {
  border-color: rgba(255, 255, 255, 0.72);
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
  transition: box-shadow 0.15s ease, left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease;
}
/* During local drag/resize the node must track the cursor 1:1 — no position/size easing.
   Remote edits, undo/redo and restore (no local manipulation) keep the smooth transition. */
.canvas-viewport.is-manipulating .canvas-node {
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
.canvas-node.is-locked,
.canvas-group.is-locked {
  cursor: default;
}
.canvas-node.is-locked::after,
.canvas-group.is-locked::after {
  content: "🔒";
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 30;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 10px;
  pointer-events: none;
}
.canvas-node.node-transparent,
.canvas-group.node-transparent {
  background: transparent !important;
  box-shadow: none !important;
}
.canvas-node.node-round,
.canvas-group.node-round {
  border-radius: 9999px !important;
}
.canvas-node.node-round .node-content,
.canvas-node.node-round .node-editor {
  /* round/pill node: keep text inside the curved clip — proportional padding + vertical centering */
  padding: 14% 16%;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

/* Double-tap is fine with a mouse but unreliable on a moving canvas. The
   explicit action is shown for a selected text card on touch screens below. */
.node-edit-trigger {
  display: none;
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 18;
  min-width: 58px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(124, 138, 255, 0.8);
  border-radius: 999px;
  background: rgba(20, 23, 38, 0.96);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

/* ===== Resize handles ===== */
.resize-handle {
  position: absolute;
  background: rgba(124, 138, 255, 0.8);
  border: 1.5px solid rgba(124, 138, 255, 1);
  border-radius: 2px;
  z-index: 10;
  touch-action: none;
}
/* Corners */
.resize-handle-br { width: 14px; height: 14px; bottom: -7px; right: -7px; cursor: nwse-resize; border-radius: 50%; }
.resize-handle-bl { width: 14px; height: 14px; bottom: -7px; left: -7px; cursor: nesw-resize; border-radius: 50%; }
.resize-handle-tr { width: 14px; height: 14px; top: -7px; right: -7px; cursor: nesw-resize; border-radius: 50%; }
.resize-handle-tl { width: 14px; height: 14px; top: -7px; left: -7px; cursor: nwse-resize; border-radius: 50%; }
/* Edges */
.resize-handle-r { width: 8px; height: calc(100% - 24px); top: 12px; right: -4px; cursor: ew-resize; border-radius: 3px; }
.resize-handle-l { width: 8px; height: calc(100% - 24px); top: 12px; left: -4px; cursor: ew-resize; border-radius: 3px; }
.resize-handle-t { height: 8px; width: calc(100% - 24px); left: 12px; top: -4px; cursor: ns-resize; border-radius: 3px; }
.resize-handle-b { height: 8px; width: calc(100% - 24px); left: 12px; bottom: -4px; cursor: ns-resize; border-radius: 3px; }

/* Touch devices: only corner handles, larger, with a big invisible hit area
   so they're easy to grab with a finger. */
@media (pointer: coarse) {
  .resize-handle-r,
  .resize-handle-l,
  .resize-handle-t,
  .resize-handle-b { display: none; }

  .resize-handle-br,
  .resize-handle-bl,
  .resize-handle-tr,
  .resize-handle-tl { width: 24px; height: 24px; border-width: 2px; }
  .resize-handle-br { bottom: -12px; right: -12px; }
  .resize-handle-bl { bottom: -12px; left: -12px; }
  .resize-handle-tr { top: -12px; right: -12px; }
  .resize-handle-tl { top: -12px; left: -12px; }

  /* ~44px touch target, centered on the visible dot, transparent. */
  .resize-handle-br::before,
  .resize-handle-bl::before,
  .resize-handle-tr::before,
  .resize-handle-tl::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 56px;
    height: 56px;
    transform: translate(-50%, -50%);
  }
}

/* ===== Connection points ===== */
@keyframes conn-pulse {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.6; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
.conn-point {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(124, 138, 255, 0.7);
  border: 2px solid rgba(124, 138, 255, 1);
  opacity: 0;
  transition: opacity 0.15s ease;
  cursor: crosshair;
  z-index: 20;
  transform: translate(-50%, -50%);
}
.canvas-node.is-selected .conn-point {
  opacity: 0.6;
}
.canvas-node:hover .conn-point {
  opacity: 1;
  animation: conn-pulse 0.6s ease-in-out 1;
}
@media (hover: none) {
  .canvas-node.is-selected .conn-point {
    opacity: 0.8;
    width: 28px;
    height: 28px;
  }
}
.conn-top { left: 50%; top: 0; }
.conn-bottom { left: 50%; top: 100%; }
.conn-left { left: 0; top: 50%; }
.conn-right { left: 100%; top: 50%; }

/* Node colors */
/* Gradient fill (default) */
.node-color-1 { border-color: rgba(251,70,76,0.6); background: linear-gradient(135deg, rgba(251,70,76,0.12), #262626 60%); }
.node-color-2 { border-color: rgba(233,151,63,0.6); background: linear-gradient(135deg, rgba(233,151,63,0.12), #262626 60%); }
.node-color-3 { border-color: rgba(224,222,113,0.6); background: linear-gradient(135deg, rgba(224,222,113,0.12), #262626 60%); }
.node-color-4 { border-color: rgba(68,207,110,0.6); background: linear-gradient(135deg, rgba(68,207,110,0.12), #262626 60%); }
.node-color-5 { border-color: rgba(83,223,221,0.6); background: linear-gradient(135deg, rgba(83,223,221,0.12), #262626 60%); }
.node-color-6 { border-color: rgba(168,130,255,0.6); background: linear-gradient(135deg, rgba(168,130,255,0.12), #262626 60%); }
/* Solid fill */
.node-color-1-solid { border-color: rgba(251,70,76,0.8); background: rgba(251,70,76,0.25); }
.node-color-2-solid { border-color: rgba(233,151,63,0.8); background: rgba(233,151,63,0.25); }
.node-color-3-solid { border-color: rgba(224,222,113,0.8); background: rgba(224,222,113,0.25); }
.node-color-4-solid { border-color: rgba(68,207,110,0.8); background: rgba(68,207,110,0.25); }
.node-color-5-solid { border-color: rgba(83,223,221,0.8); background: rgba(83,223,221,0.25); }
.node-color-6-solid { border-color: rgba(168,130,255,0.8); background: rgba(168,130,255,0.25); }

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
.node-first-line > :first-child {
  margin-top: 0;
}
.node-first-line > :last-child {
  margin-bottom: 4px;
}
.node-rest-content > :first-child {
  margin-top: 0;
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

/* ===== Minimap ===== */
.minimap {
  position: absolute;
  bottom: 16px;
  left: 16px;
  width: 180px;
  height: 120px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  z-index: 10;
  padding: 6px;
}
.minimap svg {
  width: 100%;
  height: 100%;
  cursor: crosshair;
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
.canvas-controls button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.canvas-controls button:disabled:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
}
.controls-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 2px;
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

/* ===== Remote cursors ===== */
.remote-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 100;
  transition: left 0.1s linear, top 0.1s linear;
}
.remote-cursor svg {
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}
.remote-cursor-name {
  position: absolute;
  left: 16px;
  top: 12px;
  font-size: 11px;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  font-weight: 500;
  line-height: 16px;
}

@media (max-width: 640px) {
  .node-edit-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .canvas-viewport {
    touch-action: none;
  }

  .context-menu {
    min-width: min(180px, calc(100vw - 20px));
    max-width: calc(100vw - 20px);
    max-height: calc(100dvh - 20px);
    padding: 7px;
  }

  .ctx-colors {
    gap: 6px;
  }

  .ctx-color-btn {
    width: 24px;
    height: 24px;
  }

  .ctx-item {
    min-height: 34px;
    padding: 8px 10px;
    font-size: 13px;
  }

  .edge-action-btn {
    width: 36px;
    height: 36px;
  }

  .edge-label-input,
  .node-editor {
    font-size: 16px;
  }

  .minimap {
    left: 8px;
    bottom: calc(var(--canvas-toolbar-height, 0px) + 12px + env(safe-area-inset-bottom));
    width: 132px;
    height: 88px;
  }

  /* Floating controls panel is replaced on mobile by the kebab "canvas
     actions" and the bottom block toolbar. Pinch handles zoom. */
  .canvas-controls {
    display: none;
  }
}

@media (max-width: 420px) {
  .minimap {
    width: 112px;
    height: 76px;
  }

  .canvas-controls {
    max-width: calc(100vw - 132px);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .canvas-controls button {
    width: 34px;
    height: 34px;
  }
}

/* Drawing capture overlay — above drawings layer (z-index 20), below toolbars (50/100) */
.draw-capture {
  position: absolute;
  inset: 0;
  z-index: 25;
  cursor: crosshair;
  touch-action: none;
}

/* Node flash highlight (used when jumping from chat node chip) */
.canvas-node.is-flash,
.canvas-group.is-flash { animation: node-flash 1.4s ease; }
@keyframes node-flash {
  0%, 100% { box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
  30% { box-shadow: 0 0 0 3px #4dabf7, 0 0 18px 4px rgba(77,171,247,0.7); }
}

/* Hidden object dim — owner-only; non-owners don't render hidden objects at all */
.canvas-node.is-hidden,
.canvas-group.is-hidden {
  opacity: 0.4;
}
.canvas-node.is-hidden::after,
.canvas-group.is-hidden::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #888;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
  z-index: 30;
}
</style>
