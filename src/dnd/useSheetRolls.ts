import { onBeforeUnmount, ref } from 'vue';
import {
  rollD20, rollFormula, formatFormula,
  type D20Roll, type DiceTerm, type FormulaRoll, type ParsedFormula, type RolledDice, type Rng, type RollMode,
} from './dice';
import { deathSaveOutcome, type DeathSaveOutcome } from './characterSheet';

export type SheetRollKind = 'check' | 'save' | 'skill' | 'initiative' | 'attack' | 'damage' | 'death-save' | 'hit-die';
export type DamageOption = { label: string; formula: ParsedFormula; type: string };

/**
 * What is rolled, before any dice: the same request goes to the local roller
 * or to the server (canvas-server-back's character-sheet.rolls.ts), which
 * rolls it when the sheet is connected to a canvas.
 */
export type RollSpec = {
  kind: SheetRollKind;
  label: string;
  /** Present when the roll starts with a d20 (checks, saves, attacks). */
  d20?: RollMode;
  dice: DiceTerm[];
  modifier: number;
  /** A critical hit: the dice are doubled, the flat modifier is not. */
  critical?: boolean;
  damageType?: string;
};

/** The dice that came up for a RollSpec - from the local roller or from the server. */
export type RolledSpec = {
  d20?: D20Roll;
  dice: RolledDice[];
  modifier: number;
  total: number;
  natural: '' | 'max' | 'min';
  critical: boolean;
};

/**
 * Rolls a request somewhere else (on the server). Returns `null` to mean "roll
 * it here" - the sheet is not connected, or cannot post to its canvas. A
 * rejected promise means no roll was made at all (no connection).
 */
export type RemoteRoller = (spec: RollSpec) => Promise<RolledSpec | null> | null;

export type SheetRoll = {
  id: string;
  at: number;
  kind: SheetRollKind;
  label: string;
  /** The d20 of a check, save or attack. */
  d20?: D20Roll;
  /** The bonus (checks, attacks) or the damage dice. */
  roll: FormulaRoll;
  total: number;
  /** A natural 20 or 1 on the kept d20. */
  natural: '' | 'max' | 'min';
  /** Damage this attack can roll next (crit doubles its dice on a natural 20). */
  damage?: DamageOption[];
  /** Set once this attack's damage was rolled from it: it cannot be rolled again. */
  damageRolled?: boolean;
  damageType?: string;
};

/**
 * An attack whose damage is still to be rolled. At the table the DM may take
 * a while to say "hit", so such an attack never times out: it stays until its
 * damage is rolled or the player closes it.
 */
export const awaitsDamage = (roll: SheetRoll) =>
  roll.kind === 'attack' && roll.natural !== 'min' && Boolean(roll.damage?.length) && !roll.damageRolled;

export const ROLL_KIND_LABEL: Record<SheetRollKind, string> = {
  check: 'Проверка', save: 'Спасбросок', skill: 'Проверка', initiative: 'Инициатива', attack: 'Атака', damage: 'Урон',
  'death-save': 'Спасбросок от смерти', 'hit-die': 'Кость хитов',
};
export const DEATH_SAVE_LABEL: Record<DeathSaveOutcome, string> = {
  success: 'успех', failure: 'провал', 'critical-failure': 'два провала', 'critical-success': 'встаёт с 1 HP',
};
export const ROLL_MODE_LABEL: Record<RollMode, string> = { normal: 'Обычный', advantage: 'Преимущество', disadvantage: 'Помеха' };

const HISTORY_LIMIT = 30;
const TOAST_LIMIT = 4;
const TOAST_MS = 10000;

const flat = (modifier: number): ParsedFormula => ({ dice: [], modifier, text: formatFormula([], modifier) });

/** "d20 (4, 17 → 17) + 5" / "1d8 (5, 7) + 3" - what was rolled, for toasts and the log. */
export function describeRoll(roll: SheetRoll): string {
  const parts: string[] = [];
  if (roll.d20) {
    parts.push(roll.d20.rolls.length > 1 ? `d20 (${roll.d20.rolls.join(', ')} → ${roll.d20.kept})` : `d20 (${roll.d20.kept})`);
  }
  roll.roll.dice.forEach((term, index) => {
    const sign = term.sign < 0 ? '− ' : parts.length || index > 0 ? '+ ' : '';
    parts.push(`${sign}${term.count}d${term.sides} (${term.rolls.join(', ')})`);
  });
  const modifier = roll.roll.modifier;
  if (modifier) parts.push(`${modifier > 0 ? (parts.length ? '+ ' : '') : '− '}${Math.abs(modifier)}`);
  return parts.join(' ');
}

/** Rolls a request in this browser - the same arithmetic as the server's roller. */
export function rollSpecLocally(spec: RollSpec, rng?: Rng): RolledSpec {
  const d20 = spec.d20 ? rollD20(spec.d20, rng) : undefined;
  const formula = rollFormula({ dice: spec.dice, modifier: spec.modifier, text: '' }, { critical: spec.critical, rng });
  const sum = (d20?.kept ?? 0) + formula.total;
  return {
    ...(d20 ? { d20 } : {}),
    dice: formula.dice,
    modifier: spec.modifier,
    // Damage and healing never go below zero; a check may.
    total: spec.kind === 'damage' || spec.kind === 'hit-die' ? Math.max(0, sum) : sum,
    natural: d20?.kept === 20 ? 'max' : d20?.kept === 1 ? 'min' : '',
    critical: Boolean(spec.critical),
  };
}

/**
 * Dice rolling state for one open sheet: the advantage/disadvantage mode
 * (one roll, then back to normal), recent toasts, and a short history.
 *
 * Without `remote` every roll is made here and stays in this tab. With it, a
 * roll is first offered to the remote roller (the server, when the sheet is
 * connected to a canvas): its dice are the ones shown, and the same roll
 * appears in that canvas's chat.
 */
export function useSheetRolls(options: { rng?: Rng; remote?: RemoteRoller } = {}) {
  const mode = ref<RollMode>('normal');
  const history = ref<SheetRoll[]>([]);
  const toasts = ref<string[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const dismiss = (id: string) => {
    toasts.value = toasts.value.filter((entry) => entry !== id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  };

  const findRoll = (id: string) => history.value.find((entry) => entry.id === id);

  const record = (roll: SheetRoll) => {
    history.value = [roll, ...history.value].slice(0, HISTORY_LIMIT);
    // Over the limit, plain rolls make room first; a pending attack is the
    // last thing to be pushed out.
    let visible = [roll.id, ...toasts.value];
    while (visible.length > TOAST_LIMIT) {
      const candidates = visible.slice(1);
      const drop = [...candidates].reverse().find((id) => { const entry = findRoll(id); return !entry || !awaitsDamage(entry); }) ?? visible[visible.length - 1]!;
      dismiss(drop);
      visible = visible.filter((id) => id !== drop);
    }
    toasts.value = visible;
    if (!awaitsDamage(roll)) timers.set(roll.id, setTimeout(() => dismiss(roll.id), TOAST_MS));
    return roll;
  };

  const takeMode = () => {
    const current = mode.value;
    mode.value = 'normal';
    return current;
  };

  type Extra = Partial<SheetRoll> | ((rolled: RolledSpec) => Partial<SheetRoll>);

  /**
   * Makes one roll and records it. Local rolls are recorded before this
   * returns; a remote roll resolves when the server answers, and resolves to
   * `undefined` when no roll could be made.
   */
  const perform = (spec: RollSpec, extra: Extra = {}): Promise<SheetRoll | undefined> => {
    const finish = (rolled: RolledSpec) => record({
      id: newId(), at: Date.now(), kind: spec.kind, label: spec.label,
      ...(rolled.d20 ? { d20: rolled.d20 } : {}),
      roll: { dice: rolled.dice, modifier: rolled.modifier, total: rolled.total - (rolled.d20?.kept ?? 0), critical: rolled.critical },
      total: rolled.total,
      natural: rolled.natural,
      ...(spec.damageType ? { damageType: spec.damageType } : {}),
      ...(typeof extra === 'function' ? extra(rolled) : extra),
    });
    const remote = options.remote?.(spec) ?? null;
    if (!remote) return Promise.resolve(finish(rollSpecLocally(spec, options.rng)));
    return remote.then((rolled) => finish(rolled ?? rollSpecLocally(spec, options.rng)), () => undefined);
  };

  const withBonus = (bonus: number | ParsedFormula) => (typeof bonus === 'number' ? flat(bonus) : bonus);

  const rollCheck = (kind: Exclude<SheetRollKind, 'attack' | 'damage' | 'death-save' | 'hit-die'>, label: string, bonus: number) =>
    perform({ kind, label, d20: takeMode(), dice: [], modifier: bonus });

  const rollAttack = (label: string, bonus: number | ParsedFormula, damage: DamageOption[] = []) => {
    const formula = withBonus(bonus);
    return perform({ kind: 'attack', label, d20: takeMode(), dice: formula.dice, modifier: formula.modifier }, { damage });
  };

  const rollDamage = (label: string, option: DamageOption, critical = false) =>
    perform(
      { kind: 'damage', label, dice: option.formula.dice, modifier: option.formula.modifier, critical, damageType: option.type },
      { label: critical ? `${label} (крит)` : label },
    );

  /** A death saving throw: a bare d20, labelled with what it means. Resolves to the outcome. */
  const rollDeathSave = () =>
    perform({ kind: 'death-save', label: '', d20: takeMode(), dice: [], modifier: 0 }, (rolled) => ({ label: DEATH_SAVE_LABEL[deathSaveOutcome(rolled.d20!.kept)] }))
      .then((roll) => (roll?.d20 ? deathSaveOutcome(roll.d20.kept) : undefined));

  /** A spent hit die: the die plus the Constitution modifier, never below zero. Resolves to the HP healed. */
  const rollHitDie = (sides: number, modifier: number) =>
    perform({ kind: 'hit-die', label: 'лечение', dice: [{ sign: 1, count: 1, sides }], modifier })
      .then((roll) => roll?.total);

  /** Rolls an attack's damage from the attack itself (toast or log): crit on a natural 20, once. */
  const rollAttackDamage = (attackId: string, optionIndex: number) => {
    const attack = findRoll(attackId);
    const option = attack?.damage?.[optionIndex];
    if (!attack || !option || !awaitsDamage(attack)) return Promise.resolve(undefined);
    // Taken at once, so a second tap cannot roll the damage twice while the server answers.
    attack.damageRolled = true;
    history.value = [...history.value];
    dismiss(attackId);
    return rollDamage(attack.label, option, attack.natural === 'max').then((roll) => {
      if (roll) return roll;
      // No roll was made (no connection): the attack waits for its damage again.
      attack.damageRolled = false;
      history.value = [...history.value];
      if (!toasts.value.includes(attackId)) toasts.value = [attackId, ...toasts.value];
      return undefined;
    });
  };

  const setMode = (next: RollMode) => { mode.value = mode.value === next ? 'normal' : next; };

  onBeforeUnmount(() => { timers.forEach(clearTimeout); timers.clear(); });

  return { mode, setMode, history, toasts, dismiss, rollCheck, rollAttack, rollDamage, rollAttackDamage, rollDeathSave, rollHitDie };
}
