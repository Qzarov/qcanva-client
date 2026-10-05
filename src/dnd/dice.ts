/**
 * Dice formulas and rolls for the character sheet.
 *
 * A formula is dice and whole numbers joined by + or -: `1d8+3`, `2d6+1d4`,
 * `1d10-1`, `+5`. Russian players often write the die as `к` or `д`
 * (`1к8`), so those are accepted too. A formula that does not parse is shown
 * as plain text with an explanation, never rolled with a guess.
 */

export type Rng = () => number;
export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export type DiceTerm = { sign: 1 | -1; count: number; sides: number };
export type ParsedFormula = { dice: DiceTerm[]; modifier: number; text: string };
export type FormulaParse =
  | ({ ok: true } & ParsedFormula)
  | { ok: false; reason: string };

export type RolledDice = DiceTerm & { rolls: number[] };
export type FormulaRoll = { dice: RolledDice[]; modifier: number; total: number; critical: boolean };
export type D20Roll = { mode: RollMode; rolls: number[]; kept: number };

export const FORMULA_EXAMPLES = '1d8+3, 2d6+1d4, 1d10−1';
export const FORMULA_HINT = `Формула — кости и числа через + или −, например ${FORMULA_EXAMPLES}.`;

const MAX_DICE_PER_TERM = 100;
const MAX_DICE_TOTAL = 200;
const MAX_SIDES = 1000;
const MAX_NUMBER = 10000;

const defaultRng: Rng = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoApi.getRandomValues(buffer);
    return buffer[0]! / 2 ** 32;
  }
  return Math.random();
};

export const rollDie = (sides: number, rng: Rng = defaultRng) => 1 + Math.floor(rng() * sides);

const signed = (value: number) => (value >= 0 ? `+${value}` : `-${Math.abs(value)}`);

/** Parses a formula. Pure numbers (`+5`) are valid formulas with no dice. */
export function parseFormula(input: string): FormulaParse {
  const source = (input ?? '').trim();
  if (!source) return { ok: false, reason: 'Формула пустая.' };
  // Spaces may surround + and -, nothing else: "3d6 3" must not become 3d63.
  const compact = source
    .replace(/[−–—]/g, '-')
    .replace(/\s*([+-])\s*/g, '$1')
    .replace(/[кКдДD]/g, 'd');
  const termPattern = /([+-]?)(?:(\d*)d(\d+)|(\d+))/y;
  const dice: DiceTerm[] = [];
  let modifier = 0;
  let totalDice = 0;
  let index = 0;
  while (index < compact.length) {
    termPattern.lastIndex = index;
    const match = termPattern.exec(compact);
    if (!match || (index > 0 && !match[1])) {
      const shown = source.length > 24 ? `${source.slice(0, 24)}…` : source;
      return { ok: false, reason: `Не получилось разобрать «${shown}».` };
    }
    const sign: 1 | -1 = match[1] === '-' ? -1 : 1;
    if (match[3] !== undefined) {
      const count = match[2] ? Number(match[2]) : 1;
      const sides = Number(match[3]);
      if (count < 1 || sides < 2) return { ok: false, reason: 'У кости должно быть хотя бы 2 грани и хотя бы 1 бросок.' };
      if (count > MAX_DICE_PER_TERM || sides > MAX_SIDES) return { ok: false, reason: 'Слишком много костей или граней.' };
      totalDice += count;
      if (totalDice > MAX_DICE_TOTAL) return { ok: false, reason: 'Слишком много костей.' };
      dice.push({ sign, count, sides });
    } else {
      const value = Number(match[4]);
      if (value > MAX_NUMBER) return { ok: false, reason: 'Слишком большое число.' };
      modifier += sign * value;
    }
    index = termPattern.lastIndex;
  }
  return { ok: true, dice, modifier, text: formatFormula(dice, modifier) };
}

export function formatFormula(dice: DiceTerm[], modifier: number): string {
  const parts = dice.map((term, i) => `${i === 0 && term.sign > 0 ? '' : term.sign > 0 ? '+' : '-'}${term.count}d${term.sides}`);
  if (modifier || !parts.length) parts.push(parts.length ? signed(modifier) : String(modifier));
  return parts.join('');
}

/** Adds a flat bonus to a formula, e.g. weapon dice + ability modifier. */
export function addModifier(formula: string, bonus: number): FormulaParse {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return parsed;
  const modifier = parsed.modifier + bonus;
  return { ...parsed, modifier, text: formatFormula(parsed.dice, modifier) };
}

/** Rolls a parsed formula. A critical hit doubles the dice, not the flat modifier. */
export function rollFormula(formula: ParsedFormula, options: { critical?: boolean; rng?: Rng } = {}): FormulaRoll {
  const rng = options.rng ?? defaultRng;
  const critical = Boolean(options.critical);
  const dice = formula.dice.map((term) => {
    const count = critical ? term.count * 2 : term.count;
    return { ...term, count, rolls: Array.from({ length: count }, () => rollDie(term.sides, rng)) };
  });
  const total = dice.reduce((sum, term) => sum + term.sign * term.rolls.reduce((a, b) => a + b, 0), 0) + formula.modifier;
  return { dice, modifier: formula.modifier, total, critical };
}

/** One d20, or two with advantage (keep higher) / disadvantage (keep lower). */
export function rollD20(mode: RollMode = 'normal', rng: Rng = defaultRng): D20Roll {
  if (mode === 'normal') {
    const value = rollDie(20, rng);
    return { mode, rolls: [value], kept: value };
  }
  const rolls = [rollDie(20, rng), rollDie(20, rng)];
  const kept = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
  return { mode, rolls, kept };
}

export const formatSigned = signed;
