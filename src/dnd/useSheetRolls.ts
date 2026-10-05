import { onBeforeUnmount, ref } from 'vue';
import {
  rollD20, rollFormula, formatFormula,
  type D20Roll, type FormulaRoll, type ParsedFormula, type Rng, type RollMode,
} from './dice';

export type SheetRollKind = 'check' | 'save' | 'skill' | 'initiative' | 'attack' | 'damage';
export type DamageOption = { label: string; formula: ParsedFormula; type: string };

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
  damageType?: string;
};

export const ROLL_KIND_LABEL: Record<SheetRollKind, string> = {
  check: 'Проверка', save: 'Спасбросок', skill: 'Проверка', initiative: 'Инициатива', attack: 'Атака', damage: 'Урон',
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

/**
 * Dice rolling state for one open sheet: the advantage/disadvantage mode
 * (one roll, then back to normal), recent toasts, and a short history.
 * Rolls are local for now; posting them to a canvas chat comes later.
 */
export function useSheetRolls(options: { rng?: Rng } = {}) {
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

  const record = (roll: SheetRoll) => {
    history.value = [roll, ...history.value].slice(0, HISTORY_LIMIT);
    const visible = [roll.id, ...toasts.value];
    visible.slice(TOAST_LIMIT).forEach(dismiss);
    toasts.value = visible.slice(0, TOAST_LIMIT);
    timers.set(roll.id, setTimeout(() => dismiss(roll.id), TOAST_MS));
    return roll;
  };

  const takeMode = () => {
    const current = mode.value;
    mode.value = 'normal';
    return current;
  };

  const rollWithD20 = (kind: SheetRollKind, label: string, bonus: number | ParsedFormula, extra: Partial<SheetRoll> = {}) => {
    const d20 = rollD20(takeMode(), options.rng);
    const roll = rollFormula(typeof bonus === 'number' ? flat(bonus) : bonus, { rng: options.rng });
    return record({
      id: newId(), at: Date.now(), kind, label, d20, roll,
      total: d20.kept + roll.total,
      natural: d20.kept === 20 ? 'max' : d20.kept === 1 ? 'min' : '',
      ...extra,
    });
  };

  const rollCheck = (kind: Exclude<SheetRollKind, 'attack' | 'damage'>, label: string, bonus: number) =>
    rollWithD20(kind, label, bonus);

  const rollAttack = (label: string, bonus: number | ParsedFormula, damage: DamageOption[] = []) =>
    rollWithD20('attack', label, bonus, { damage });

  const rollDamage = (label: string, option: DamageOption, critical = false) => {
    const roll = rollFormula(option.formula, { critical, rng: options.rng });
    return record({
      id: newId(), at: Date.now(), kind: 'damage', label: critical ? `${label} (крит)` : label,
      roll, total: Math.max(0, roll.total), natural: '', damageType: option.type,
    });
  };

  const setMode = (next: RollMode) => { mode.value = mode.value === next ? 'normal' : next; };

  onBeforeUnmount(() => { timers.forEach(clearTimeout); timers.clear(); });

  return { mode, setMode, history, toasts, dismiss, rollCheck, rollAttack, rollDamage };
}
