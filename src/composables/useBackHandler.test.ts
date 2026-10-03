import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBackHandler, runBackHandlers } from './useBackHandler';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
const register = (handler: () => boolean) => {
  const off = registerBackHandler(handler);
  cleanups.push(off);
  return off;
};

describe('back handler registry', () => {
  it('reports unhandled when nothing is registered', () => {
    expect(runBackHandlers()).toBe(false);
  });

  it('asks the most recently registered handler first and stops at the first that handles it', () => {
    const calls: string[] = [];
    register(() => { calls.push('outer'); return true; });
    register(() => { calls.push('inner'); return true; });
    expect(runBackHandlers()).toBe(true);
    expect(calls).toEqual(['inner']);
  });

  it('falls through handlers that decline', () => {
    const outer = vi.fn(() => true);
    register(outer);
    register(() => false);
    expect(runBackHandlers()).toBe(true);
    expect(outer).toHaveBeenCalledOnce();
  });

  it('stops asking a handler once it unregisters', () => {
    const handler = vi.fn(() => true);
    const off = register(handler);
    off();
    expect(runBackHandlers()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
