import crypto from 'node:crypto';
import { sha256Base64, verifyHash } from '../../../src/utils/hash.js';

describe('sha256Base64', () => {
  it('computes correct SHA-256 base64 for known input', () => {
    const data = new TextEncoder().encode('hello world');
    const expected = crypto.createHash('sha256').update(data).digest('base64');
    expect(sha256Base64(data)).toBe(expected);
  });

  it('computes correct hash for empty input', () => {
    const data = new Uint8Array(0);
    const expected = crypto.createHash('sha256').update(data).digest('base64');
    expect(sha256Base64(data)).toBe(expected);
  });
});

describe('verifyHash', () => {
  it('returns true when hash matches', () => {
    const data = new TextEncoder().encode('test data');
    const hash = crypto.createHash('sha256').update(data).digest('base64');
    expect(verifyHash(data, hash)).toBe(true);
  });

  it('returns false when hash does not match', () => {
    const data = new TextEncoder().encode('test data');
    expect(verifyHash(data, 'wrong-hash')).toBe(false);
  });
});
