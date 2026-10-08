import { describe, expect, it } from 'vitest';
import { addCoins, coinsValue, emptyCoins, formatCoins, formatGold, hasCoins, needsChange, normalizeCoins, spendCoins, MAX_COINS } from './coins';

const wallet = (coins: Partial<ReturnType<typeof emptyCoins>>) => ({ ...emptyCoins(), ...coins });

describe('coins', () => {
  it('reads stored coins as whole, non-negative numbers', () => {
    expect(normalizeCoins({ gp: '15', sp: 2.9, cp: -4, pp: 'x', ep: 1e12, junk: 5 })).toEqual({ pp: 0, gp: 15, ep: MAX_COINS, sp: 2, cp: 0 });
    expect(normalizeCoins(null)).toEqual(emptyCoins());
  });

  it('values and prints a wallet', () => {
    const coins = wallet({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 });
    expect(coinsValue(coins)).toBe(1000 + 200 + 50 + 30 + 4);
    expect(formatCoins(coins)).toBe('1 пм 2 зм 1 эм 3 см 4 мм');
    expect(formatCoins(wallet({ gp: 12, sp: 5 }))).toBe('12 зм 5 см');
    expect(formatCoins(emptyCoins())).toBe('—');
    expect(formatGold(1540)).toBe('15,4 зм');
    expect(formatGold(0)).toBe('0 зм');
    expect(hasCoins(emptyCoins())).toBe(false);
    expect(hasCoins(wallet({ cp: 1 }))).toBe(true);
  });

  it('adds coins kind by kind', () => {
    expect(addCoins(wallet({ gp: 5 }), { gp: 10, sp: 3 })).toEqual(wallet({ gp: 15, sp: 3 }));
    expect(addCoins(wallet({ gp: MAX_COINS }), { gp: 5 }).gp).toBe(MAX_COINS);
  });

  it('spends exactly the coins named when there are enough', () => {
    const before = wallet({ gp: 15, sp: 8, cp: 40 });
    expect(spendCoins(before, { gp: 5, sp: 3 })).toEqual(wallet({ gp: 10, sp: 5, cp: 40 }));
    expect(needsChange(before, { gp: 5, sp: 3 })).toBe(false);
    expect(before).toEqual(wallet({ gp: 15, sp: 8, cp: 40 }));
  });

  it('breaks a bigger coin and gives change', () => {
    // 5 sp from a single gold piece: 5 sp come back.
    expect(spendCoins(wallet({ gp: 1 }), { sp: 5 })).toEqual(wallet({ sp: 5 }));
    // 3 cp from a platinum piece: change in gold, silver and copper, never electrum.
    expect(spendCoins(wallet({ pp: 1 }), { cp: 3 })).toEqual(wallet({ gp: 9, sp: 9, cp: 7 }));
    expect(needsChange(wallet({ gp: 1 }), { sp: 5 })).toBe(true);
  });

  it('covers a bigger coin with smaller ones', () => {
    expect(spendCoins(wallet({ ep: 3 }), { gp: 1 })).toEqual(wallet({ ep: 1 }));
    expect(spendCoins(wallet({ sp: 25, cp: 7 }), { gp: 2 })).toEqual(wallet({ sp: 5, cp: 7 }));
    // Copper first, then silver; what is overpaid returns.
    expect(spendCoins(wallet({ sp: 3, cp: 4 }), { sp: 1, cp: 9 })).toEqual(wallet({ sp: 1, cp: 5 }));
  });

  it('never changes what the wallet is worth by more than the price', () => {
    const cases: Array<[ReturnType<typeof emptyCoins>, Partial<ReturnType<typeof emptyCoins>>]> = [
      [wallet({ pp: 2, gp: 3, ep: 5, sp: 7, cp: 11 }), { gp: 17, cp: 99 }],
      [wallet({ pp: 1, cp: 1 }), { ep: 3, sp: 4 }],
      [wallet({ ep: 9, cp: 60 }), { pp: 0, gp: 4, sp: 9, cp: 9 }],
      [wallet({ gp: 1 }), { gp: 1 }],
    ];
    for (const [before, cost] of cases) {
      const after = spendCoins(before, cost)!;
      expect(coinsValue(after)).toBe(coinsValue(before) - coinsValue(cost));
      expect(Object.values(after).every((amount) => Number.isInteger(amount) && amount >= 0)).toBe(true);
    }
  });

  it('refuses a price the wallet is not worth', () => {
    expect(spendCoins(wallet({ gp: 1, sp: 9, cp: 9 }), { gp: 2 })).toBeNull();
    expect(spendCoins(emptyCoins(), { cp: 1 })).toBeNull();
    expect(spendCoins(wallet({ gp: 2 }), { gp: 2 })).toEqual(emptyCoins());
  });
});
