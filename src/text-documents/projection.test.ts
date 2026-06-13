import { describe, expect, it } from 'vitest';
import { base64ToUint8Array, uint8ArrayToBase64 } from './projection';

describe('text document projection helpers', () => {
  it('round trips binary state through base64', () => {
    const source = new Uint8Array([1, 2, 3, 255]);
    expect(base64ToUint8Array(uint8ArrayToBase64(source))).toEqual(source);
  });
});
