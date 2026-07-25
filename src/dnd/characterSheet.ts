export const DND_ABILITIES = [
  { key: 'strength', short: 'СИЛ', label: 'Сила' },
  { key: 'dexterity', short: 'ЛОВ', label: 'Ловкость' },
  { key: 'constitution', short: 'ТЕЛ', label: 'Телосложение' },
  { key: 'intelligence', short: 'ИНТ', label: 'Интеллект' },
  { key: 'wisdom', short: 'МДР', label: 'Мудрость' },
  { key: 'charisma', short: 'ХАР', label: 'Харизма' },
] as const;

export type DndAbilityKey = typeof DND_ABILITIES[number]['key'];
export type DndDisplayMode = 'full' | 'compact';
export type DndTab = 'attacks' | 'features' | 'equipment' | 'personality' | 'goals' | 'notes' | 'spells';
export type SkillProficiency = 'none' | 'half' | 'proficient' | 'expertise';

export type DndAbility = { score: number; savingThrowProficient: boolean; customSavingThrowBonus: number };
export type DndSkill = { proficiency: SkillProficiency; customBonus: number };
export type DndListItem = { id: string; name: string; description?: string; currentUses?: number; maxUses?: number; quantity?: number; equipped?: boolean; completed?: boolean; level?: number; prepared?: boolean };

export interface DndCharacterSheetData {
  version: 1;
  displayMode: DndDisplayMode;
  activeTab: DndTab;
  identity: { name: string; race: string; className: string; subclass: string; level: number; experience: number; nextLevelExperience: number; background: string; alignment: string; portraitUrl: string };
  abilities: Record<DndAbilityKey, DndAbility>;
  proficiencyBonus: number;
  skills: Record<string, DndSkill>;
  combat: { armorClass: number; speed: number; currentHp: number; maxHp: number; temporaryHp: number; inspiration: boolean; exhaustion: number; initiativeMode: 'auto' | 'manual'; manualInitiative: number; customInitiativeBonus: number; conditions: string[] };
  passiveBonuses: { perception: number; insight: number; investigation: number };
  attacks: DndListItem[];
  features: DndListItem[];
  equipment: DndListItem[];
  spells: DndListItem[];
  goals: DndListItem[];
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[]; other: string[] };
  notes: string;
}

const ability = (): DndAbility => ({ score: 10, savingThrowProficient: false, customSavingThrowBonus: 0 });

export const createDndCharacterSheet = (): DndCharacterSheetData => ({
  version: 1,
  displayMode: 'full',
  activeTab: 'attacks',
  identity: { name: 'Новый персонаж', race: '', className: '', subclass: '', level: 1, experience: 0, nextLevelExperience: 0, background: '', alignment: '', portraitUrl: '' },
  abilities: { strength: ability(), dexterity: ability(), constitution: ability(), intelligence: ability(), wisdom: ability(), charisma: ability() },
  proficiencyBonus: 2,
  skills: {},
  combat: { armorClass: 10, speed: 30, currentHp: 10, maxHp: 10, temporaryHp: 0, inspiration: false, exhaustion: 0, initiativeMode: 'auto', manualInitiative: 0, customInitiativeBonus: 0, conditions: [] },
  passiveBonuses: { perception: 0, insight: 0, investigation: 0 },
  attacks: [], features: [], equipment: [], spells: [], goals: [],
  personality: { traits: '', ideals: '', bonds: '', flaws: '' },
  proficiencies: { armor: [], weapons: [], tools: [], languages: [], other: [] },
  notes: '',
});

const asNumber = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Converts both the original flat card payload and current nested payload to v1. */
export const normalizeDndCharacterSheet = (source: unknown): DndCharacterSheetData => {
  const data = source && typeof source === 'object' ? source as Record<string, any> : {};
  const base = createDndCharacterSheet();
  const legacyAbilities: Record<DndAbilityKey, string> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
  for (const item of DND_ABILITIES) {
    const next = data.abilities?.[item.key] || {};
    base.abilities[item.key] = {
      score: clamp(asNumber(next.score ?? data[legacyAbilities[item.key]], 10), 1, 30),
      savingThrowProficient: Boolean(next.savingThrowProficient),
      customSavingThrowBonus: asNumber(next.customSavingThrowBonus, 0),
    };
  }
  Object.assign(base.identity, data.identity || {});
  base.identity.name = String(data.identity?.name ?? data.name ?? base.identity.name);
  base.identity.level = Math.max(1, asNumber(data.identity?.level ?? data.level, base.identity.level));
  base.proficiencyBonus = Math.max(0, asNumber(data.proficiencyBonus, base.proficiencyBonus));
  Object.assign(base.combat, data.combat || {});
  base.combat.currentHp = Math.max(0, asNumber(data.combat?.currentHp ?? data.hp, base.combat.currentHp));
  base.combat.maxHp = Math.max(1, asNumber(data.combat?.maxHp, base.combat.maxHp));
  base.combat.temporaryHp = Math.max(0, asNumber(data.combat?.temporaryHp, base.combat.temporaryHp));
  base.combat.armorClass = Math.max(0, asNumber(data.combat?.armorClass ?? data.ac, base.combat.armorClass));
  base.combat.speed = Math.max(0, asNumber(data.combat?.speed, base.combat.speed));
  base.combat.exhaustion = clamp(asNumber(data.combat?.exhaustion, base.combat.exhaustion), 0, 6);
  base.displayMode = data.displayMode === 'compact' ? 'compact' : 'full';
  base.activeTab = ['attacks', 'features', 'equipment', 'personality', 'goals', 'notes', 'spells'].includes(data.activeTab) ? data.activeTab : base.activeTab;
  for (const key of ['skills', 'passiveBonuses', 'personality', 'proficiencies'] as const) Object.assign(base[key], data[key] || {});
  for (const key of ['attacks', 'features', 'equipment', 'spells', 'goals'] as const) base[key] = Array.isArray(data[key]) ? data[key] : [];
  base.notes = typeof data.notes === 'string' ? data.notes : '';
  return base;
};

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
export const formatModifier = (modifier: number) => modifier > 0 ? `+${modifier}` : String(modifier);
export const savingThrowBonus = (abilityData: DndAbility, proficiencyBonus: number) => abilityModifier(abilityData.score) + (abilityData.savingThrowProficient ? proficiencyBonus : 0) + abilityData.customSavingThrowBonus;
export const skillBonus = (abilityScore: number, skill: DndSkill | undefined, proficiencyBonus: number) => {
  const multiplier = { none: 0, half: .5, proficient: 1, expertise: 2 }[skill?.proficiency || 'none'];
  return abilityModifier(abilityScore) + Math.floor(proficiencyBonus * multiplier) + (skill?.customBonus || 0);
};
