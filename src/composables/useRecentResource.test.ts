import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const markOpened = vi.fn();
const isAuthenticated = vi.fn(() => true);
vi.mock('../api/client', () => ({
  recentResources: { markOpened: (...args: unknown[]) => markOpened(...args) },
  isAuthenticated: () => isAuthenticated(),
}));

import { markResourceOpened, resetRecentResourceMarks } from './useRecentResource';

beforeEach(() => {
  markOpened.mockReset().mockResolvedValue({});
  isAuthenticated.mockReturnValue(true);
  resetRecentResourceMarks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('markResourceOpened', () => {
  it('records the opened resource under its real id', () => {
    markResourceOpened('text-document', 'doc-1');
    expect(markOpened).toHaveBeenCalledWith('text-document', 'doc-1');
  });

  it('writes nothing for an anonymous viewer or without an id', () => {
    isAuthenticated.mockReturnValue(false);
    markResourceOpened('canvas', 'c1');
    isAuthenticated.mockReturnValue(true);
    markResourceOpened('canvas', '');
    markResourceOpened('canvas', null);
    expect(markOpened).not.toHaveBeenCalled();
  });

  it('counts a re-run of the same load as one visit, but a later visit again', () => {
    markResourceOpened('canvas', 'c1');
    markResourceOpened('canvas', 'c1');
    expect(markOpened).toHaveBeenCalledTimes(1);

    markResourceOpened('text-document', 'c1');
    expect(markOpened).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(31_000);
    markResourceOpened('text-document', 'c1');
    expect(markOpened).toHaveBeenCalledTimes(3);
  });

  it('never throws, whether the write fails later or right away', async () => {
    markOpened.mockRejectedValueOnce(new Error('offline'));
    expect(() => markResourceOpened('canvas', 'c1')).not.toThrow();
    await vi.runAllTimersAsync();

    markOpened.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => markResourceOpened('canvas', 'c2')).not.toThrow();
  });
});
