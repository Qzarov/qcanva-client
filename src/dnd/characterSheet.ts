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

/**
 * The full D&D 5e (2014) skill list, each bound to the ability that drives it.
 * `key` is stable (used as the storage key in `skills` and never shown); `label`
 * is the Russian display name, matching DND_ABILITIES' own Russian labels.
 */
export const DND_SKILLS = [
  { key: 'athletics', label: 'Атлетика', ability: 'strength' },
  { key: 'acrobatics', label: 'Акробатика', ability: 'dexterity' },
  { key: 'sleightOfHand', label: 'Ловкость рук', ability: 'dexterity' },
  { key: 'stealth', label: 'Скрытность', ability: 'dexterity' },
  { key: 'arcana', label: 'Магия', ability: 'intelligence' },
  { key: 'history', label: 'История', ability: 'intelligence' },
  { key: 'investigation', label: 'Анализ', ability: 'intelligence' },
  { key: 'nature', label: 'Природа', ability: 'intelligence' },
  { key: 'religion', label: 'Религия', ability: 'intelligence' },
  { key: 'animalHandling', label: 'Уход за животными', ability: 'wisdom' },
  { key: 'insight', label: 'Проницательность', ability: 'wisdom' },
  { key: 'medicine', label: 'Медицина', ability: 'wisdom' },
  { key: 'perception', label: 'Восприятие', ability: 'wisdom' },
  { key: 'survival', label: 'Выживание', ability: 'wisdom' },
  { key: 'deception', label: 'Обман', ability: 'charisma' },
  { key: 'intimidation', label: 'Запугивание', ability: 'charisma' },
  { key: 'performance', label: 'Выступление', ability: 'charisma' },
  { key: 'persuasion', label: 'Убеждение', ability: 'charisma' },
] as const satisfies ReadonlyArray<{ key: string; label: string; ability: DndAbilityKey }>;

export type DndSkillKey = typeof DND_SKILLS[number]['key'];

export type DndAbility = { score: number; savingThrowProficient: boolean; customSavingThrowBonus: number };
export type DndSkill = { proficiency: SkillProficiency; customBonus: number };
/** When a feature's uses come back: on a short rest (and so on a long one too), or only on a long rest. */
export type FeatureRecharge = 'short' | 'long';
export const FEATURE_RECHARGE_OPTIONS = [
  { value: '', label: 'Не восстанавливается' },
  { value: 'short', label: 'Короткий отдых' },
  { value: 'long', label: 'Длинный отдых' },
] as const;

/** Hit die sizes of the 5e classes (d6 wizard ... d12 barbarian). */
export const HIT_DICE = [6, 8, 10, 12] as const;
export type DndDeathSaves = { successes: number; failures: number };
export type DeathSaveOutcome = 'success' | 'failure' | 'critical-failure' | 'critical-success';
export type RestKind = 'short' | 'long';

/** Spell slot levels. Slots are keyed `l1`..`l9`: sync paths must start with a letter. */
export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type SpellSlotKey = `l${typeof SPELL_LEVELS[number]}`;
export const spellSlotKey = (level: number) => `l${level}` as SpellSlotKey;
export type DndSpellSlot = { max: number; spent: number };
export const SPELL_CLASS_KEYS = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'] as const;
export type SpellClassKey = typeof SPELL_CLASS_KEYS[number];
export type DndSpellcasting = {
  /** The spellcasting class (slots, prepared limit, catalog spells); empty for a hand-kept list. */
  casterClass: SpellClassKey | '';
  /** The spellcasting ability; empty until the player picks one. */
  ability: DndAbilityKey | '';
  slots: Record<SpellSlotKey, DndSpellSlot>;
};
/** What a spell asks for: an attack roll by the caster, a saving throw by the target, or neither. */
export type SpellRollKind = '' | 'attack' | 'save';

export type DndListItem = {
  id: string; name: string; description?: string;
  currentUses?: number; maxUses?: number;
  /** Features only: which rest restores the uses. Absent = never automatically. */
  recharge?: FeatureRecharge;
  quantity?: number; equipped?: boolean; completed?: boolean;
  level?: number; prepared?: boolean;
  // Attack-specific (optional; `damage` and `damageType` are shared with spells).
  attackBonus?: string; damage?: string; damageType?: string;
  /** Spells only: how the spell is resolved, and which save the target makes. */
  rollKind?: SpellRollKind; saveAbility?: DndAbilityKey | '';
  /** Spells only: the catalog entry this spell was added from. */
  catalogKey?: string;
};

export interface DndCharacterSheetData {
  version: 1;
  displayMode: DndDisplayMode;
  activeTab: DndTab;
  identity: { name: string; race: string; className: string; subclass: string; level: number; experience: number; nextLevelExperience: number; background: string; alignment: string; portraitUrl: string };
  abilities: Record<DndAbilityKey, DndAbility>;
  proficiencyBonus: number;
  skills: Record<string, DndSkill>;
  combat: {
    armorClass: number; speed: number; currentHp: number; maxHp: number; temporaryHp: number; inspiration: boolean; exhaustion: number; initiativeMode: 'auto' | 'manual'; manualInitiative: number; customInitiativeBonus: number; conditions: string[];
    /** Death saving throws, rolled at 0 HP: three successes stabilise, three failures kill. */
    deathSaves: DndDeathSaves;
    /** Size of the hit die (one per level); `hitDiceSpent` of them are used up until a long rest. */
    hitDie: number;
    hitDiceSpent: number;
  };
  passiveBonuses: { perception: number; insight: number; investigation: number };
  attacks: DndListItem[];
  features: DndListItem[];
  equipment: DndListItem[];
  spells: DndListItem[];
  goals: DndListItem[];
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[]; other: string[] };
  spellcasting: DndSpellcasting;
  /** The canvas this character plays on: its rolls go to that canvas's chat. Empty = not connected. */
  campaign: { canvasId: string };
  /** Free-text "Attacks & Spellcasting" notes shown alongside the attack list. */
  attacksNotes: string;
  notes: string;
}

const ability = (): DndAbility => ({ score: 10, savingThrowProficient: false, customSavingThrowBonus: 0 });

export const isHpAmount = (amount: number) => Number.isSafeInteger(amount) && amount > 0;
export const calculateHpChange = (combat: DndCharacterSheetData['combat'], mode: 'heal' | 'damage', amount: number) => {
  if (!isHpAmount(amount)) return { currentHp: combat.currentHp, temporaryHp: combat.temporaryHp };
  if (mode === 'heal') return { currentHp: Math.min(combat.maxHp, combat.currentHp + amount), temporaryHp: combat.temporaryHp };
  const absorbed = Math.min(combat.temporaryHp, amount);
  return { currentHp: Math.max(0, combat.currentHp - (amount - absorbed)), temporaryHp: combat.temporaryHp - absorbed };
};

/** Hit dice still unspent: one per level, minus those used since the last long rest. */
export const hitDiceRemaining = (sheet: Pick<DndCharacterSheetData, 'identity' | 'combat'>) =>
  Math.max(0, clampLevel(sheet.identity.level) - Math.max(0, Math.trunc(Number(sheet.combat.hitDiceSpent) || 0)));

/** Hit dice a long rest gives back: half the level, at least one. */
export const hitDiceRegainedOnLongRest = (level: number) => Math.max(1, Math.floor(clampLevel(level) / 2));

/**
 * What a d20 means as a death saving throw (5e): 10+ succeeds, lower fails,
 * a natural 1 counts as two failures, a natural 20 puts the character back
 * on their feet with 1 HP.
 */
export const deathSaveOutcome = (d20: number): DeathSaveOutcome =>
  d20 >= 20 ? 'critical-success' : d20 <= 1 ? 'critical-failure' : d20 >= 10 ? 'success' : 'failure';

/** Dying: at 0 HP and neither stabilised nor dead yet. */
export const deathSaveStatus = (combat: Pick<DndCharacterSheetData['combat'], 'currentHp' | 'deathSaves'>): 'none' | 'dying' | 'stable' | 'dead' => {
  if (combat.currentHp > 0) return 'none';
  if (combat.deathSaves.failures >= 3) return 'dead';
  if (combat.deathSaves.successes >= 3) return 'stable';
  return 'dying';
};

/** Character names are also resource titles; old sheets may use a root name. */
export const characterSheetTitle = (source: unknown, fallback = 'Новый персонаж'): string => {
  const data = source as { identity?: { name?: unknown }; name?: unknown } | null;
  const name = data?.identity?.name ?? data?.name;
  return typeof name === 'string' ? name.trim() || 'Новый персонаж' : fallback;
};

export const createDndCharacterSheet = (): DndCharacterSheetData => ({
  version: 1,
  displayMode: 'full',
  activeTab: 'attacks',
  identity: { name: 'Новый персонаж', race: '', className: '', subclass: '', level: 1, experience: 0, nextLevelExperience: 0, background: '', alignment: '', portraitUrl: '' },
  abilities: { strength: ability(), dexterity: ability(), constitution: ability(), intelligence: ability(), wisdom: ability(), charisma: ability() },
  proficiencyBonus: 2,
  skills: {},
  combat: { armorClass: 10, speed: 30, currentHp: 10, maxHp: 10, temporaryHp: 0, inspiration: false, exhaustion: 0, initiativeMode: 'auto', manualInitiative: 0, customInitiativeBonus: 0, conditions: [], deathSaves: { successes: 0, failures: 0 }, hitDie: 8, hitDiceSpent: 0 },
  passiveBonuses: { perception: 0, insight: 0, investigation: 0 },
  attacks: [], features: [], equipment: [], spells: [], goals: [],
  personality: { traits: '', ideals: '', bonds: '', flaws: '' },
  proficiencies: { armor: [], weapons: [], tools: [], languages: [], other: [] },
  spellcasting: createSpellcasting(),
  campaign: { canvasId: '' },
  attacksNotes: '',
  notes: '',
});

const asNumber = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function createSpellcasting(): DndSpellcasting {
  const slots = {} as DndSpellcasting['slots'];
  for (const level of SPELL_LEVELS) slots[spellSlotKey(level)] = { max: 0, spent: 0 };
  return { casterClass: '', ability: '', slots };
}

/** Reads stored spellcasting data: unknown abilities are dropped, slots are whole numbers with spent <= max. */
export function normalizeSpellcasting(source: unknown): DndSpellcasting {
  const data = source && typeof source === 'object' ? source as Record<string, any> : {};
  const base = createSpellcasting();
  if (DND_ABILITIES.some((item) => item.key === data.ability)) base.ability = data.ability;
  if ((SPELL_CLASS_KEYS as readonly string[]).includes(data.casterClass)) base.casterClass = data.casterClass;
  for (const level of SPELL_LEVELS) {
    const stored = data.slots?.[spellSlotKey(level)] || {};
    const max = Math.min(99, Math.max(0, Math.trunc(asNumber(stored.max, 0))));
    base.slots[spellSlotKey(level)] = { max, spent: Math.min(max, Math.max(0, Math.trunc(asNumber(stored.spent, 0)))) };
  }
  return base;
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampLevel = (level: unknown) => clamp(Math.trunc(asNumber(level, 1)), 1, 20);

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
  base.combat.conditions = Array.isArray(data.combat?.conditions)
    ? [...new Set<string>(data.combat.conditions.filter((value: unknown): value is string => typeof value === 'string').map((value: string) => value.trim()).filter(Boolean))]
    : [];
  base.combat.currentHp = Math.max(0, asNumber(data.combat?.currentHp ?? data.hp, base.combat.currentHp));
  base.combat.maxHp = Math.max(1, asNumber(data.combat?.maxHp, base.combat.maxHp));
  base.combat.temporaryHp = Math.max(0, asNumber(data.combat?.temporaryHp, base.combat.temporaryHp));
  base.combat.armorClass = Math.max(0, asNumber(data.combat?.armorClass ?? data.ac, base.combat.armorClass));
  base.combat.speed = Math.max(0, asNumber(data.combat?.speed, base.combat.speed));
  base.combat.exhaustion = clamp(asNumber(data.combat?.exhaustion, base.combat.exhaustion), 0, 6);
  base.combat.deathSaves = {
    successes: clamp(Math.trunc(asNumber(data.combat?.deathSaves?.successes, 0)), 0, 3),
    failures: clamp(Math.trunc(asNumber(data.combat?.deathSaves?.failures, 0)), 0, 3),
  };
  const hitDie = asNumber(data.combat?.hitDie, 8);
  base.combat.hitDie = (HIT_DICE as readonly number[]).includes(hitDie) ? hitDie : 8;
  // One hit die per level: never more spent than the character has.
  base.combat.hitDiceSpent = clamp(Math.trunc(asNumber(data.combat?.hitDiceSpent, 0)), 0, clamp(Math.trunc(base.identity.level), 1, 20));
  base.displayMode = data.displayMode === 'compact' ? 'compact' : 'full';
  base.activeTab = ['attacks', 'features', 'equipment', 'personality', 'goals', 'notes', 'spells'].includes(data.activeTab) ? data.activeTab : base.activeTab;
  for (const key of ['skills', 'passiveBonuses', 'personality', 'proficiencies'] as const) Object.assign(base[key], data[key] || {});
  for (const key of ['attacks', 'features', 'equipment', 'spells', 'goals'] as const) base[key] = Array.isArray(data[key]) ? data[key] : [];
  base.spellcasting = normalizeSpellcasting(data.spellcasting);
  base.campaign = { canvasId: typeof data.campaign?.canvasId === 'string' ? data.campaign.canvasId.slice(0, 64) : '' };
  base.attacksNotes = typeof data.attacksNotes === 'string' ? data.attacksNotes : '';
  base.notes = typeof data.notes === 'string' ? data.notes : '';
  return base;
};

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
export const formatModifier = (modifier: number) => modifier > 0 ? `+${modifier}` : String(modifier);

/**
 * Proficiency bonus derived from level (5e 2014): +2 at 1-4, +3 at 5-8, +4 at
 * 9-12, +5 at 13-16, +6 at 17-20. Derived rather than stored so changing the
 * level recomputes every saving throw, skill and passive score that uses it.
 */
export const proficiencyBonusForLevel = (level: number) => Math.ceil(clamp(asNumber(level, 1), 1, 20) / 4) + 1;

export const savingThrowBonus = (abilityData: DndAbility, proficiencyBonus: number) => abilityModifier(abilityData.score) + (abilityData.savingThrowProficient ? proficiencyBonus : 0) + abilityData.customSavingThrowBonus;

export const skillBonus = (abilityScore: number, skill: DndSkill | undefined, proficiencyBonus: number) => {
  const multiplier = { none: 0, half: .5, proficient: 1, expertise: 2 }[skill?.proficiency || 'none'];
  return abilityModifier(abilityScore) + Math.floor(proficiencyBonus * multiplier) + (skill?.customBonus || 0);
};

/** The ability a skill is driven by. */
export const skillAbility = (skillKey: DndSkillKey): DndAbilityKey =>
  (DND_SKILLS.find((s) => s.key === skillKey)?.ability ?? 'strength');

/** A skill's total modifier off the whole sheet (looks up its driving ability). */
export const skillModifier = (sheet: DndCharacterSheetData, skillKey: DndSkillKey, proficiencyBonus: number) =>
  skillBonus(sheet.abilities[skillAbility(skillKey)].score, sheet.skills[skillKey], proficiencyBonus);

/** Passive score = 10 + the relevant skill modifier (+ any manual bonus). */
export const passiveScore = (skillMod: number, bonus = 0) => 10 + skillMod + bonus;

/** Initiative: manual value, or DEX modifier + a custom bonus in auto mode. */
export const initiativeBonus = (sheet: DndCharacterSheetData) =>
  sheet.combat.initiativeMode === 'manual'
    ? sheet.combat.manualInitiative
    : abilityModifier(sheet.abilities.dexterity.score) + sheet.combat.customInitiativeBonus;
