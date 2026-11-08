import { reactive, ref } from 'vue';
import {
  DND_ABILITIES,
  abilityModifier,
  formatModifier,
  normalizeDndCharacterSheet,
  savingThrowBonus,
  type DndAbilityKey,
  type DndCharacterSheetData,
  type DndListItem,
  type DndTab,
} from '../dnd/characterSheet';

export interface CanvasTemplateNode {
  id: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface CanvasTemplateRoll {
  nodeId: string;
  label: string;
  modifier: number;
}

export interface CanvasTemplateUpdateOp {
  type: 'node-update';
  id: string;
  changes: { templateData: Record<string, unknown> };
}

interface CanvasDndTemplateOptions {
  readonly: () => boolean;
  genId: () => string;
  pushUndo: () => void;
  emitOp: (operation: CanvasTemplateUpdateOp) => void;
  emitRoll: (roll: CanvasTemplateRoll) => void;
}

export function useCanvasDndTemplate(options: CanvasDndTemplateOptions) {
  const dndAbilities = DND_ABILITIES;
  const dndTabs = [
    { key: 'attacks', label: 'Атаки' },
    { key: 'features', label: 'Способности' },
    { key: 'equipment', label: 'Снаряжение' },
    { key: 'personality', label: 'Личность' },
    { key: 'goals', label: 'Цели' },
    { key: 'notes', label: 'Заметки' },
    { key: 'spells', label: 'Заклинания' },
  ] as const;
  const dndPersonalityFields = [
    { key: 'traits', label: 'Черты' },
    { key: 'ideals', label: 'Идеалы' },
    { key: 'bonds', label: 'Привязанности' },
    { key: 'flaws', label: 'Слабости' },
  ] as const;

  // The selected tab is presentation state only: it must not create canvas
  // operations, history entries, or affect other collaborators.
  const dndActiveTabs = reactive<Record<string, DndCharacterSheetData['activeTab']>>({});
  const dndInteractionNodeId = ref<string | null>(null);

  const isDndInteracting = (node: CanvasTemplateNode) => !options.readonly() && dndInteractionNodeId.value === node.id;
  const enterDndInteraction = (node: CanvasTemplateNode) => {
    if (node.templateId === 'dnd-character' && !options.readonly()) dndInteractionNodeId.value = node.id;
  };
  const exitDndInteraction = (node: CanvasTemplateNode) => {
    if (dndInteractionNodeId.value === node.id) dndInteractionNodeId.value = null;
  };
  const toggleDndInteraction = (node: CanvasTemplateNode) => isDndInteracting(node) ? exitDndInteraction(node) : enterDndInteraction(node);
  const onDndSheetMouseDown = (event: MouseEvent, node: CanvasTemplateNode) => {
    if (isDndInteracting(node)) event.stopPropagation();
  };

  const dndSheet = (node: CanvasTemplateNode) => {
    const data = normalizeDndCharacterSheet(node.templateData);
    data.activeTab = dndActiveTabs[node.id] || data.activeTab;
    return data;
  };

  const updateDndSheet = (node: CanvasTemplateNode, mutate: (data: DndCharacterSheetData) => void) => {
    if (options.readonly() || !isDndInteracting(node)) return;
    const data = normalizeDndCharacterSheet(node.templateData);
    mutate(data);
    const templateData = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    delete templateData.activeTab;
    options.pushUndo();
    node.templateData = templateData;
    options.emitOp({ type: 'node-update', id: node.id, changes: { templateData } });
  };

  const setDndIdentity = (node: CanvasTemplateNode, key: 'name' | 'race' | 'className' | 'portraitUrl', value: string) =>
    updateDndSheet(node, (data) => { data.identity[key] = value; });
  const setDndNumber = (node: CanvasTemplateNode, _key: 'level', value: string) =>
    updateDndSheet(node, (data) => { data.identity.level = Math.max(1, Number(value) || 1); });
  const setDndCombat = (node: CanvasTemplateNode, key: 'armorClass' | 'speed' | 'currentHp' | 'maxHp' | 'temporaryHp', value: string) =>
    updateDndSheet(node, (data) => { const min = key === 'maxHp' ? 1 : 0; data.combat[key] = Math.max(min, Number(value) || 0); });
  const changeDndHp = (node: CanvasTemplateNode, delta: number) =>
    updateDndSheet(node, (data) => { data.combat.currentHp = Math.max(0, data.combat.currentHp + delta); });
  const setDndAbilityScore = (node: CanvasTemplateNode, key: DndAbilityKey, value: string) =>
    updateDndSheet(node, (data) => { data.abilities[key].score = Math.max(1, Math.min(30, Number(value) || 1)); });
  const toggleDndSave = (node: CanvasTemplateNode, key: DndAbilityKey) =>
    updateDndSheet(node, (data) => { data.abilities[key].savingThrowProficient = !data.abilities[key].savingThrowProficient; });
  const toggleDndMode = (node: CanvasTemplateNode) =>
    updateDndSheet(node, (data) => { data.displayMode = data.displayMode === 'compact' ? 'full' : 'compact'; });
  const setDndTab = (node: CanvasTemplateNode, tab: DndCharacterSheetData['activeTab']) => {
    if (isDndInteracting(node)) dndActiveTabs[node.id] = tab;
  };
  const setDndNotes = (node: CanvasTemplateNode, value: string) => updateDndSheet(node, (data) => { data.notes = value; });
  const setDndPersonality = (node: CanvasTemplateNode, key: keyof DndCharacterSheetData['personality'], value: string) =>
    updateDndSheet(node, (data) => { data.personality[key] = value; });

  const dndTabItems = (node: CanvasTemplateNode): DndListItem[] => {
    const data = dndSheet(node);
    const tab = data.activeTab;
    return ['attacks', 'features', 'equipment', 'spells', 'goals'].includes(tab)
      ? data[tab as 'attacks' | 'features' | 'equipment' | 'spells' | 'goals']
      : [];
  };
  const updateDndList = (node: CanvasTemplateNode, tab: DndTab, mutate: (items: DndListItem[]) => void) => updateDndSheet(node, (data) => {
    if (!['attacks', 'features', 'equipment', 'spells', 'goals'].includes(tab)) return;
    const key = tab as 'attacks' | 'features' | 'equipment' | 'spells' | 'goals';
    mutate(data[key]);
  });
  const addDndListItem = (node: CanvasTemplateNode) => updateDndList(node, dndSheet(node).activeTab, (items) => { items.push({ id: options.genId(), name: '' }); });
  const updateDndListItem = (node: CanvasTemplateNode, id: string, key: keyof DndListItem, value: string | number | boolean) =>
    updateDndList(node, dndSheet(node).activeTab, (items) => { const item = items.find((entry) => entry.id === id); if (item) item[key] = value as never; });
  const removeDndListItem = (node: CanvasTemplateNode, id: string) =>
    updateDndList(node, dndSheet(node).activeTab, (items) => { const index = items.findIndex((entry) => entry.id === id); if (index >= 0) items.splice(index, 1); });
  const formatDndModifier = (score: number) => formatModifier(abilityModifier(score));
  const dndSavingThrow = (node: CanvasTemplateNode, key: DndAbilityKey) => {
    const data = dndSheet(node);
    return savingThrowBonus(data.abilities[key], data.proficiencyBonus);
  };
  const rollTemplateAbility = (node: CanvasTemplateNode, ability: DndAbilityKey) => {
    if (!isDndInteracting(node)) return;
    const data = dndSheet(node);
    options.emitRoll({ nodeId: node.id, label: `${data.identity.name}: ${ability.toUpperCase()}`, modifier: abilityModifier(data.abilities[ability].score) });
  };

  return {
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
  };
}
