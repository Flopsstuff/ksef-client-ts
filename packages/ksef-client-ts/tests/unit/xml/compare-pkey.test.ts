import { describe, it, expect } from 'vitest';
import { comparePKey } from '../../../src/xml/order-map.js';

// Natural-order sort for KSeF `P_*` keys. See src/xml/order-map.ts and the spec
// requirement "FA2 and FA3 element ordering follows the KSeF XSD".
describe('comparePKey', () => {
  it('orders single-index P_* numerically: P_13_1 < P_13_2 < P_13_10', () => {
    const keys = ['P_13_10', 'P_13_2', 'P_13_1'];
    const sorted = [...keys].sort(comparePKey);
    expect(sorted).toEqual(['P_13_1', 'P_13_2', 'P_13_10']);
  });

  it('orders P_20_A < P_20_B lexicographically on trailing alpha parts', () => {
    const keys = ['P_20_B', 'P_20_A'];
    const sorted = [...keys].sort(comparePKey);
    expect(sorted).toEqual(['P_20_A', 'P_20_B']);
  });

  it('satisfies the full spec chain P_13_1 < P_13_2 < P_13_10 < P_20_A < P_20_B', () => {
    const keys = ['P_20_B', 'P_13_10', 'P_20_A', 'P_13_1', 'P_13_2'];
    const sorted = [...keys].sort(comparePKey);
    expect(sorted).toEqual(['P_13_1', 'P_13_2', 'P_13_10', 'P_20_A', 'P_20_B']);
  });

  it('is not lexicographic — P_13_10 does NOT sort after P_13_1 but before P_13_2', () => {
    // Sanity check: a lexicographic sort would produce P_13_1, P_13_10, P_13_2.
    // comparePKey MUST avoid that.
    const sorted = ['P_13_10', 'P_13_1', 'P_13_2'].sort(comparePKey);
    expect(sorted).toEqual(['P_13_1', 'P_13_2', 'P_13_10']);
    expect(sorted).not.toEqual(['P_13_1', 'P_13_10', 'P_13_2']);
  });

  it('returns 0 for equal keys', () => {
    expect(comparePKey('P_13_1', 'P_13_1')).toBe(0);
  });

  it('handles keys with shared numeric prefix but different lengths', () => {
    // P_13 (shorter) sorts before P_13_1 (longer) — a missing part ranks before a present one.
    const sorted = ['P_13_1', 'P_13'].sort(comparePKey);
    expect(sorted).toEqual(['P_13', 'P_13_1']);
  });

  it('is stable across mixed-case trailing letter suffixes (e.g. W)', () => {
    // Ensures alpha parts like the "W" suffix in P_14_1W / P_14_2W compare lexicographically.
    const sorted = ['P_14_2W', 'P_14_1W'].sort(comparePKey);
    expect(sorted).toEqual(['P_14_1W', 'P_14_2W']);
  });

  // ── Edge cases pinned to catch silent future regressions ────────────

  it('pin: mixed numeric/alpha at the same depth compares consistently (P_14_1 < P_14_1W)', () => {
    // P_14_1 normalises to [14, 1]; P_14_1W to [14, "1W"]. The generic path
    // falls through to String(1).localeCompare("1W") which yields < 0.
    // ORDER_MAP.Fa lists both explicitly, so this only fires for undeclared
    // keys — but a refactor that touched comparePKey should keep this stable.
    const sorted = ['P_14_1W', 'P_14_1'].sort(comparePKey);
    expect(sorted).toEqual(['P_14_1', 'P_14_1W']);
    expect(comparePKey('P_14_1', 'P_14_1W')).toBeLessThan(0);
  });

  it('pin: malformed keys with empty segments (e.g. P__1) do not throw', () => {
    // Number("") is 0, not NaN, so `P__1` normalises to [0, 1] and compares
    // as a numeric tuple without throwing. Not a bug per se — just the
    // current silent behaviour we want to prevent a future refactor from
    // flipping into a throw.
    expect(() => comparePKey('P__1', 'P_1_1')).not.toThrow();
    // P__1 ([0, 1]) sorts before P_1_1 ([1, 1]) numerically.
    expect(comparePKey('P__1', 'P_1_1')).toBeLessThan(0);
  });
});
