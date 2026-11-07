<template>
<div
  :key="node.id"
  class="canvas-node canvas-node-template"
  :data-node-id="node.id"
  :class="[nodePresentationClass(node), stateClass]"
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
        <div class="dnd-portrait-wrap"><div class="dnd-portrait" :class="{ empty: !dndSheet(node).identity.portraitUrl }"><img v-if="dndSheet(node).identity.portraitUrl" :src="getImageSrc(dndSheet(node).identity.portraitUrl)" @error="onImageError(node.id + '-portrait', dndSheet(node).identity.portraitUrl)" alt="Портрет персонажа" /><span v-else>{{ dndSheet(node).identity.name.slice(0, 1).toUpperCase() }}</span></div><div v-if="!readonly" class="dnd-portrait-actions"><button aria-label="Загрузить портрет" @click.stop="openDndPortraitPicker(node)">▣</button><button v-if="dndSheet(node).identity.portraitUrl" aria-label="Удалить портрет" @click.stop="setDndIdentity(node, 'portraitUrl', '')">×</button></div></div>
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
  <BoardPreview
    v-else-if="node.templateId === 'trello-board-preview'"
    :board-id="boardPreviewId(node)"
    @open-board="openBoardPreview"
  />
  <template v-if="isNodeSelected(node.id) && !isNodePositionLocked(node.id) && !isDndInteracting(node)">
    <div class="resize-handle resize-handle-br" data-handle="br" @mousedown.stop="onResizeStart($event, node, 'br')"></div>
    <div class="resize-handle resize-handle-bl" data-handle="bl" @mousedown.stop="onResizeStart($event, node, 'bl')"></div>
    <div class="resize-handle resize-handle-tr" data-handle="tr" @mousedown.stop="onResizeStart($event, node, 'tr')"></div>
    <div class="resize-handle resize-handle-tl" data-handle="tl" @mousedown.stop="onResizeStart($event, node, 'tl')"></div>
  </template>
</div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import BoardPreview from '../board/BoardPreview.vue';
const props = defineProps<{
  node: any;
  stateClass: Record<string, boolean | undefined>;
  nodePresentationClass: (node: any) => Record<string, boolean>;
  nodePosition: (node: any) => Record<string, string | undefined>;
  isNodeSelected: (id: string) => boolean;
  isNodePositionLocked: (id: string) => boolean;
  onNodeDragStart: (...args: any[]) => void;
  onNodeContextMenu: (...args: any[]) => void;
  enterDndInteraction: (...args: any[]) => void;
  exitDndInteraction: (...args: any[]) => void;
  readonly: boolean;
  dndSheet: (node: any) => any;
  isDndInteracting: (node: any) => boolean;
  onDndSheetMouseDown: (...args: any[]) => void;
  toggleDndInteraction: (...args: any[]) => void;
  toggleDndMode: (...args: any[]) => void;
  getImageSrc: (url?: string | null) => string;
  onImageError: (id: string, file?: string | null) => void;
  openDndPortraitPicker: (...args: any[]) => void;
  setDndIdentity: (...args: any[]) => void;
  setDndNumber: (...args: any[]) => void;
  setDndCombat: (...args: any[]) => void;
  changeDndHp: (...args: any[]) => void;
  dndAbilities: readonly any[];
  rollTemplateAbility: (...args: any[]) => void;
  formatDndModifier: (value: number) => string;
  setDndAbilityScore: (...args: any[]) => void;
  toggleDndSave: (...args: any[]) => void;
  dndSavingThrow: (...args: any[]) => number;
  dndTabs: readonly any[];
  setDndTab: (...args: any[]) => void;
  dndPersonalityFields: readonly any[];
  setDndNotes: (...args: any[]) => void;
  setDndPersonality: (...args: any[]) => void;
  dndTabItems: (node: any) => any[];
  updateDndListItem: (...args: any[]) => void;
  removeDndListItem: (...args: any[]) => void;
  addDndListItem: (...args: any[]) => void;
  boardPreviewId: (node: any) => string;
  openBoardPreview: (...args: any[]) => void;
  onResizeStart: (...args: any[]) => void;
}>();
const { node, stateClass, nodePresentationClass, nodePosition, isNodeSelected, isNodePositionLocked, onNodeDragStart, onNodeContextMenu, enterDndInteraction, exitDndInteraction, readonly, dndSheet, isDndInteracting, onDndSheetMouseDown, toggleDndInteraction, toggleDndMode, getImageSrc, onImageError, openDndPortraitPicker, setDndIdentity, setDndNumber, setDndCombat, changeDndHp, dndAbilities, rollTemplateAbility, formatDndModifier, setDndAbilityScore, toggleDndSave, dndSavingThrow, dndTabs, setDndTab, dndPersonalityFields, setDndNotes, setDndPersonality, dndTabItems, updateDndListItem, removeDndListItem, addDndListItem, boardPreviewId, openBoardPreview, onResizeStart } = toRefs(props);
</script>
