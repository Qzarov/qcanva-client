import { describe, expect, it } from 'vitest';
import { createHistory } from './visualHtmlHistory';

describe('visualHtmlHistory', () => {
  it('records snapshots and undoes the latest', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.record('c');

    expect(history.undo()).toBe('b');
    expect(history.undo()).toBe('a');
    expect(history.undo()).toBeUndefined();
  });

  it('redoes after undo', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.undo();
    expect(history.redo()).toBe('b');
    expect(history.redo()).toBeUndefined();
  });

  it('clears redo branch when recording after undo', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.undo();
    history.record('c');
    expect(history.redo()).toBeUndefined();
    expect(history.undo()).toBe('a');
  });

  it('caps history at 50 entries', () => {
    const history = createHistory<number>(0);
    for (let i = 1; i <= 60; i += 1) history.record(i);
    let undone = history.undo();
    let steps = 0;
    while (undone !== undefined) {
      undone = history.undo();
      steps += 1;
    }
    expect(steps).toBeLessThanOrEqual(50);
  });

  it('reset clears both stacks', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.reset('x');
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();
  });
});
