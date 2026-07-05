import { describe, it, expect } from 'vitest';
import { satisfiesRequiredRange, normalizeVfs } from '../../../src/pdf/fonts.js';

describe('satisfiesRequiredRange', () => {
  it('accepts the exact lower bound 0.2.20', () => {
    expect(satisfiesRequiredRange('0.2.20')).toBe(true);
  });

  it('accepts a higher patch within 0.2.x', () => {
    expect(satisfiesRequiredRange('0.2.99')).toBe(true);
  });

  it('rejects a patch below 20', () => {
    expect(satisfiesRequiredRange('0.2.19')).toBe(false);
  });

  it('rejects the 0.3.0 minor bump', () => {
    expect(satisfiesRequiredRange('0.3.0')).toBe(false);
  });

  it('rejects any 0.3.x', () => {
    expect(satisfiesRequiredRange('0.3.11')).toBe(false);
  });

  it('rejects an older minor', () => {
    expect(satisfiesRequiredRange('0.1.5')).toBe(false);
  });

  it('rejects a major bump', () => {
    expect(satisfiesRequiredRange('1.0.0')).toBe(false);
  });

  it('rejects a non-semver string', () => {
    expect(satisfiesRequiredRange('abc')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(satisfiesRequiredRange('')).toBe(false);
  });
});

describe('normalizeVfs', () => {
  // A font map never carries `vfs`/`default`/`pdfMake` keys of its own.
  const fontMap = { 'Roboto-Regular.ttf': 'AAAA', 'Roboto-Bold.ttf': 'BBBB' };

  it('unwraps { default: <map> } (ESM default export that is the map itself)', () => {
    expect(normalizeVfs({ default: fontMap })).toBe(fontMap);
  });

  it('unwraps { default: { vfs: <map> } }', () => {
    expect(normalizeVfs({ default: { vfs: fontMap } })).toBe(fontMap);
  });

  it('unwraps { vfs: <map> }', () => {
    expect(normalizeVfs({ vfs: fontMap })).toBe(fontMap);
  });

  it('unwraps { pdfMake: { vfs: <map> } }', () => {
    expect(normalizeVfs({ pdfMake: { vfs: fontMap } })).toBe(fontMap);
  });

  it('returns a bare map unchanged', () => {
    expect(normalizeVfs(fontMap)).toBe(fontMap);
  });
});
