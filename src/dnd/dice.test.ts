import { describe, expect, it } from 'vitest';
import { addModifier, parseFormula, rollD20, rollFormula, type Rng } from './dice';

/** Returns the given die faces in order (for a d20, face n -> (n-1)/20). */
const faces = (sides: number, ...values: number[]): Rng => {
  let i = 0;
  return () => (values[i++]! - 1) / sides;
};

describe('parseFormula', () => {
  it.each([
    ['1d8+3', '1d8+3'],
    ['2d6 + 1d4', '2d6+1d4'],
    ['1d10-1', '1d10-1'],
    ['1d10−1', '1d10-1'],
    ['d20', '1d20'],
    ['1к8+2', '1d8+2'],
    ['2Д6', '2d6'],
    ['+5', '5'],
    ['-1', '-1'],
    ['1d6+1d6-2+3', '1d6+1d6+1'],
  ])('reads %s as %s', (input, text) => {
    const parsed = parseFormula(input);
    expect(parsed.ok && parsed.text).toBe(text);
  });

  it.each(['', '   ', '1d8+', 'меч', '1d8 огнём', '1d', '0d6', '1d1', '1d8*2', '1d8++3', '1001d6', '3d6 3'])('rejects %j with a reason', (input) => {
    const parsed = parseFormula(input);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toBeTruthy();
  });

  it('adds a flat bonus', () => {
    const withBonus = addModifier('1d8', 3);
    expect(withBonus.ok && withBonus.text).toBe('1d8+3');
    const negative = addModifier('1d8+1', -2);
    expect(negative.ok && negative.text).toBe('1d8-1');
  });
});

describe('rollFormula', () => {
  it('sums dice and the modifier', () => {
    const parsed = parseFormula('2d6+1d4+3');
    if (!parsed.ok) throw new Error('parse');
    let i = 0; const values = [5 / 6, 2 / 6, 3 / 4];
    const roll = rollFormula(parsed, { rng: () => values[i++]! });
    expect(roll.dice.map((term) => term.rolls)).toEqual([[6, 3], [4]]);
    expect(roll.total).toBe(16);
  });

  it('doubles the dice on a critical hit but not the modifier', () => {
    const parsed = parseFormula('1d8+3');
    if (!parsed.ok) throw new Error('parse');
    const roll = rollFormula(parsed, { critical: true, rng: faces(8, 5, 7) });
    expect(roll.dice[0]!.rolls).toEqual([5, 7]);
    expect(roll.total).toBe(15);
  });

  it('subtracts negative dice terms', () => {
    const parsed = parseFormula('1d6-1d4');
    if (!parsed.ok) throw new Error('parse');
    let i = 0; const values = [5 / 6, 1 / 4];
    expect(rollFormula(parsed, { rng: () => values[i++]! }).total).toBe(6 - 2);
  });
});

describe('rollD20', () => {
  it('keeps the higher die with advantage and the lower with disadvantage', () => {
    expect(rollD20('advantage', faces(20, 4, 17))).toEqual({ mode: 'advantage', rolls: [4, 17], kept: 17 });
    expect(rollD20('disadvantage', faces(20, 4, 17))).toEqual({ mode: 'disadvantage', rolls: [4, 17], kept: 4 });
    expect(rollD20('normal', faces(20, 11))).toEqual({ mode: 'normal', rolls: [11], kept: 11 });
  });

  it('only ever rolls 1..20', () => {
    for (let i = 0; i < 2000; i++) {
      const { kept } = rollD20();
      expect(kept).toBeGreaterThanOrEqual(1);
      expect(kept).toBeLessThanOrEqual(20);
    }
  });
});
