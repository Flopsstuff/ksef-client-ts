import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { bytesToBase64 } from '../../../src/utils/base64.js';

describe('bytesToBase64', () => {
  it('encodes the empty input as the empty string', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });

  it.each([
    ['one byte, two pad characters', 1],
    ['two bytes, one pad character', 2],
    ['three bytes, no padding', 3],
  ])('pads a %s', (_label, length) => {
    const bytes = crypto.randomBytes(length);
    expect(bytesToBase64(new Uint8Array(bytes))).toBe(bytes.toString('base64'));
  });

  /**
   * The encoder exists so the PDF subpath can produce an invoice hash without
   * `Buffer` — so `Buffer` is exactly what it has to agree with, across every
   * remainder and a length past a single chunk.
   */
  it('agrees with Buffer at every length from 0 to 64', () => {
    for (let length = 0; length <= 64; length += 1) {
      const bytes = crypto.randomBytes(length);
      expect(bytesToBase64(new Uint8Array(bytes)), `length ${length}`).toBe(
        bytes.toString('base64'),
      );
    }
  });

  it('encodes high bytes without sign confusion', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0x80, 0x00]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
