/**
 * The character's money: five kinds of coins (5e), counted separately.
 *
 * Spending is by value: when there are not enough coins of the kind asked
 * for, smaller ones are taken first, then a bigger one is broken and the
 * change comes back in gold, silver and copper.
 */
export const COIN_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
export type CoinKey = typeof COIN_KEYS[number];
export type DndCoins = Record<CoinKey, number>;

/** From the most valuable to the least; `value` is in copper. */
export const COINS: ReadonlyArray<{ key: CoinKey; short: string; label: string; value: number }> = [
  { key: 'pp', short: 'пм', label: 'Платиновые', value: 1000 },
  { key: 'gp', short: 'зм', label: 'Золотые', value: 100 },
  { key: 'ep', short: 'эм', label: 'Электрумовые', value: 50 },
  { key: 'sp', short: 'см', label: 'Серебряные', value: 10 },
  { key: 'cp', short: 'мм', label: 'Медные', value: 1 },
];
export const MAX_COINS = 9_999_999;

export const emptyCoins = (): DndCoins => ({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

const count = (value: unknown) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(MAX_COINS, Math.max(0, number)) : 0;
};

/** Reads stored coins: whole, never negative, never absurd. */
export function normalizeCoins(source: unknown): DndCoins {
  const data = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const coins = emptyCoins();
  for (const key of COIN_KEYS) coins[key] = count(data[key]);
  return coins;
}

/** What the coins are worth, in copper. */
export const coinsValue = (coins: Partial<DndCoins>) => COINS.reduce((sum, coin) => sum + count(coins[coin.key]) * coin.value, 0);

export const hasCoins = (coins: Partial<DndCoins>) => COIN_KEYS.some((key) => count(coins[key]) > 0);

/** "12 зм 5 см" - only the kinds there are; "—" for none. */
export const formatCoins = (coins: Partial<DndCoins>) =>
  COINS.filter((coin) => count(coins[coin.key]) > 0).map((coin) => `${count(coins[coin.key])} ${coin.short}`).join(' ') || '—';

/** A value in copper as gold: 1540 -> "15,4 зм". */
export const formatGold = (copper: number) => `${(Math.round(copper) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} зм`;

export function addCoins(wallet: DndCoins, gain: Partial<DndCoins>): DndCoins {
  const next = normalizeCoins(wallet);
  for (const key of COIN_KEYS) next[key] = Math.min(MAX_COINS, next[key] + count(gain[key]));
  return next;
}

/**
 * Pays `cost` out of the wallet. Coins of the kinds named are used first; a
 * shortfall is covered from the smallest coins up, and what is overpaid comes
 * back as gold, silver and copper. `null` when the wallet is not worth it.
 */
export function spendCoins(wallet: DndCoins, cost: Partial<DndCoins>): DndCoins | null {
  const next = normalizeCoins(wallet);
  if (coinsValue(cost) > coinsValue(next)) return null;
  let owed = 0;
  for (const coin of COINS) {
    const asked = count(cost[coin.key]);
    const paid = Math.min(next[coin.key], asked);
    next[coin.key] -= paid;
    owed += (asked - paid) * coin.value;
  }
  for (const coin of [...COINS].reverse()) {
    if (owed <= 0) break;
    const used = Math.min(next[coin.key], Math.ceil(owed / coin.value));
    next[coin.key] -= used;
    owed -= used * coin.value;
  }
  // Overpaid with a bigger coin: the change is given in the coins people actually count.
  let change = -owed;
  for (const key of ['gp', 'sp', 'cp'] as const) {
    const value = COINS.find((coin) => coin.key === key)!.value;
    const given = Math.floor(change / value);
    next[key] = Math.min(MAX_COINS, next[key] + given);
    change -= given * value;
  }
  return next;
}

/** True when paying `cost` breaks or combines coins instead of taking exactly the ones named. */
export const needsChange = (wallet: DndCoins, cost: Partial<DndCoins>) => COIN_KEYS.some((key) => count(cost[key]) > count(wallet[key]));
