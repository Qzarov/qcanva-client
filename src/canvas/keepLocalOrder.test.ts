import { describe, expect, it } from 'vitest';
import { keepLocalOrder } from './keepLocalOrder';

const item = (id: string, v = 0) => ({ id, v });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('keepLocalOrder', () => {
  it('keeps the local order for items both sides have, using the incoming objects', () => {
    const local = [item('a'), item('b'), item('c')];
    const incoming = [item('c', 3), item('a', 1), item('b', 2)];
    const out = keepLocalOrder(local, incoming);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out.map((x) => x.v)).toEqual([1, 2, 3]);
    expect(out[0]).toBe(incoming[1]);
  });

  it('drops items the incoming data no longer has', () => {
    expect(ids(keepLocalOrder([item('a'), item('b'), item('c')], [item('c'), item('a')]))).toEqual(['a', 'c']);
  });

  it('appends new items in their incoming order', () => {
    const out = keepLocalOrder([item('a'), item('b')], [item('x'), item('b'), item('y'), item('a')]);
    expect(ids(out)).toEqual(['a', 'b', 'x', 'y']);
  });

  it('is the incoming list itself when nothing local exists yet', () => {
    const incoming = [item('a'), item('b')];
    expect(keepLocalOrder([], incoming)).toEqual(incoming);
  });

  it('tolerates duplicate or missing ids without losing items', () => {
    const incoming = [item('a'), { id: '' , v: 9 }, item('a', 2)];
    expect(keepLocalOrder([item('a')], incoming as any).length).toBe(3);
  });
});
