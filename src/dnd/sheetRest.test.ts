import { describe, expect, it } from 'vitest';
import { applySheetOperation, diffSheet, replaySheetOperations, type SheetOperation } from './sheetOperations';
import {
  createDndCharacterSheet, deathSaveOutcome, deathSaveStatus, hitDiceRegainedOnLongRest, hitDiceRemaining,
  normalizeDndCharacterSheet,
} from './characterSheet';

// The same cases as canvas-server-back's character-sheet.ops.spec.ts: both
// sides must apply these operations identically.
const resting = () => ({
  identity: { level: 5 },
  combat: { currentHp: 4, maxHp: 30, temporaryHp: 6, exhaustion: 2, hitDiceSpent: 4, deathSaves: { successes: 1, failures: 2 } },
  features: [
    { id: 's', name: 'Второе дыхание', currentUses: 0, maxUses: 1, recharge: 'short' },
    { id: 'l', name: 'Ярость', currentUses: 1, maxUses: 3, recharge: 'long' },
    { id: 'n', name: 'Зелье', currentUses: 0, maxUses: 2 },
  ],
});
const apply = (sheet: Record<string, unknown>, op: SheetOperation) => applySheetOperation(sheet, op) as any;
const uses = (sheet: any) => sheet.features.map((item: any) => item.currentUses);

describe('rest operations', () => {
  it('a short rest restores only short-rest features', () => {
    const result = apply(resting(), { type: 'rest', kind: 'short' });
    expect(uses(result)).toEqual([1, 1, 0]);
    expect(result.combat).toMatchObject({ currentHp: 4, temporaryHp: 6, exhaustion: 2, hitDiceSpent: 4 });
  });

  it('a long rest restores HP, half the hit dice, features and one exhaustion level', () => {
    const result = apply(resting(), { type: 'rest', kind: 'long' });
    expect(uses(result)).toEqual([1, 3, 0]);
    expect(result.combat).toEqual({
      currentHp: 30, maxHp: 30, temporaryHp: 0, exhaustion: 1, hitDiceSpent: 2, deathSaves: { successes: 0, failures: 0 },
    });
  });

  it('a long rest gives back at least one hit die and never goes below zero', () => {
    const result = apply({ identity: { level: 1 }, combat: { hitDiceSpent: 1 } }, { type: 'rest', kind: 'long' });
    expect(result.combat.hitDiceSpent).toBe(0);
    expect(result.combat.exhaustion).toBe(0);
  });

  it('a long rest lifts the exhaustion condition once no level is left', () => {
    expect(apply({ combat: { conditions: ['exhaustion', 'prone'] } }, { type: 'rest', kind: 'long' }).combat.conditions).toEqual(['prone']);
    expect(apply({ combat: { exhaustion: 3, conditions: ['exhaustion'] } }, { type: 'rest', kind: 'long' }).combat)
      .toMatchObject({ exhaustion: 2, conditions: ['exhaustion'] });
  });

  it('two long rests sent at once leave the same sheet as one', () => {
    const once = apply(resting(), { type: 'rest', kind: 'long' });
    const twice = apply(once, { type: 'rest', kind: 'long' });
    expect(twice.combat.currentHp).toBe(30);
    expect(uses(twice)).toEqual(uses(once));
  });
});

describe('hit dice', () => {
  it('spends a hit die and heals, capped at max HP', () => {
    const sheet = resting();
    sheet.combat.hitDiceSpent = 3;
    expect(apply(sheet, { type: 'hit-die', heal: 100 }).combat).toMatchObject({ hitDiceSpent: 4, currentHp: 30 });
  });

  it('does nothing when no hit dice are left, so the last die heals only once', () => {
    const result = replaySheetOperations(resting(), [{ type: 'hit-die', heal: 5 }, { type: 'hit-die', heal: 5 }]) as any;
    expect(result.combat).toMatchObject({ hitDiceSpent: 5, currentHp: 9 });
  });

  it('counts what is left and what a long rest gives back', () => {
    const sheet = createDndCharacterSheet();
    sheet.identity.level = 7;
    sheet.combat.hitDiceSpent = 3;
    expect(hitDiceRemaining(sheet)).toBe(4);
    sheet.combat.hitDiceSpent = 99;
    expect(hitDiceRemaining(sheet)).toBe(0);
    expect([1, 2, 5, 20].map(hitDiceRegainedOnLongRest)).toEqual([1, 1, 2, 10]);
  });
});

describe('death saves', () => {
  const dying = () => ({ combat: { currentHp: 0, maxHp: 20 } }) as Record<string, unknown>;
  const run = (...outcomes: Array<'success' | 'failure' | 'critical-failure' | 'critical-success'>) =>
    outcomes.reduce((sheet, outcome) => apply(sheet, { type: 'death-save', outcome }), dying()) as any;

  it('reads a d20 the 5e way', () => {
    expect([1, 2, 9, 10, 19, 20].map(deathSaveOutcome)).toEqual(['critical-failure', 'failure', 'failure', 'success', 'success', 'critical-success']);
  });

  it('counts successes and failures, a natural 1 as two, never past three', () => {
    expect(run('success', 'failure').combat.deathSaves).toEqual({ successes: 1, failures: 1 });
    expect(run('critical-failure').combat.deathSaves.failures).toBe(2);
    expect(run('failure', 'critical-failure', 'failure').combat.deathSaves.failures).toBe(3);
    expect(run('success', 'success', 'success', 'success').combat.deathSaves.successes).toBe(3);
  });

  it('a natural 20 puts the character at 1 HP and clears the saves', () => {
    const result = apply({ combat: { currentHp: 0, maxHp: 20, deathSaves: { successes: 1, failures: 2 } } }, { type: 'death-save', outcome: 'critical-success' });
    expect(result.combat).toMatchObject({ currentHp: 1, deathSaves: { successes: 0, failures: 0 } });
  });

  it('healing from 0 HP and dropping to 0 HP both clear the saves; damage at 0 HP does not', () => {
    const down = { combat: { currentHp: 0, maxHp: 20, deathSaves: { successes: 2, failures: 1 } } };
    expect(apply(down, { type: 'hp-change', mode: 'heal', amount: 3 }).combat.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(apply(down, { type: 'hp-change', mode: 'damage', amount: 3 }).combat.deathSaves).toEqual({ successes: 2, failures: 1 });
    const stale = { combat: { currentHp: 5, maxHp: 20, deathSaves: { successes: 2, failures: 2 } } };
    expect(apply(stale, { type: 'hp-change', mode: 'damage', amount: 9 }).combat).toMatchObject({ currentHp: 0, deathSaves: { successes: 0, failures: 0 } });
  });

  it('tells dying from stable from dead', () => {
    const status = (currentHp: number, successes: number, failures: number) => deathSaveStatus({ currentHp, deathSaves: { successes, failures } });
    expect(status(5, 0, 0)).toBe('none');
    expect(status(0, 2, 2)).toBe('dying');
    expect(status(0, 3, 2)).toBe('stable');
    expect(status(0, 3, 3)).toBe('dead');
  });
});

describe('the new fields in the sheet', () => {
  it('defaults and clamps them when reading a stored sheet', () => {
    const old = normalizeDndCharacterSheet({ identity: { level: 3 }, combat: { currentHp: 5 } });
    expect(old.combat).toMatchObject({ deathSaves: { successes: 0, failures: 0 }, hitDie: 8, hitDiceSpent: 0 });
    const odd = normalizeDndCharacterSheet({ identity: { level: 3 }, combat: { deathSaves: { successes: 9, failures: -2 }, hitDie: 7, hitDiceSpent: 12 } });
    expect(odd.combat).toMatchObject({ deathSaves: { successes: 3, failures: 0 }, hitDie: 8, hitDiceSpent: 3 });
  });

  it('syncs a manual edit as a field-level set', () => {
    const prev = JSON.parse(JSON.stringify(createDndCharacterSheet()));
    const next = JSON.parse(JSON.stringify(prev));
    next.combat.deathSaves.failures = 1;
    next.combat.hitDie = 10;
    expect(diffSheet(prev, next)).toEqual(expect.arrayContaining([
      { type: 'set', path: ['combat', 'deathSaves', 'failures'], value: 1 },
      { type: 'set', path: ['combat', 'hitDie'], value: 10 },
    ]));
  });
});
