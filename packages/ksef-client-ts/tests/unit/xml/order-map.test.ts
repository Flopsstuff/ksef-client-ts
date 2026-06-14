import { describe, it, expect } from 'vitest';
import { orderXmlObject, ORDER_MAP } from '../../../src/xml/order-map.js';

// `orderXmlObject` is the recursive normaliser that drives deterministic output.
// See src/xml/order-map.ts. The multi-rate interleave assertion below is the
// regression test referenced in the ORDER_MAP comment (smekcio TS d1ec8fe).
describe('orderXmlObject', () => {
  it('orders keys inside Fa according to ORDER_MAP (multi-rate interleave)', () => {
    // Input deliberately shuffled to confirm the normaliser reorders.
    const input = {
      P_15: '1500.00',
      P_13_2: '100',
      P_14_1W: '23W',
      P_13_6_1: 'amount',
      P_14_1: '23',
      P_13_1: '500',
      P_14_2: '46',
    };
    const ordered = orderXmlObject(input, 'Fa');
    expect(Object.keys(ordered)).toEqual([
      'P_13_1',
      'P_14_1',
      'P_14_1W',
      'P_13_2',
      'P_14_2',
      'P_13_6_1',
      'P_15',
    ]);
  });

  it('orders Faktura top-level children as Naglowek, Podmiot1, Podmiot2, Podmiot3, Fa, Stopka', () => {
    const input = {
      Fa: { P_1: '2026-04-18' },
      Stopka: { Info: 'x' },
      Podmiot2: {},
      Naglowek: { WariantFormularza: 3 },
      Podmiot1: {},
    };
    const ordered = orderXmlObject(input, 'Faktura');
    expect(Object.keys(ordered)).toEqual([
      'Naglowek',
      'Podmiot1',
      'Podmiot2',
      'Fa',
      'Stopka',
    ]);
  });

  it('appends remaining P_* keys via natural sort when ORDER_MAP does not list them', () => {
    // These P_* keys are not in ORDER_MAP.Fa but must still come out naturally sorted.
    const input = {
      P_99_10: 'z',
      P_99_2: 'y',
      P_99_1: 'x',
    };
    const ordered = orderXmlObject(input, 'Fa');
    expect(Object.keys(ordered)).toEqual(['P_99_1', 'P_99_2', 'P_99_10']);
  });

  it('appends unknown non-P_* keys after all ordered keys, in insertion order', () => {
    const input = {
      FooCustom: 'a',
      P_1: 'b',
      BarCustom: 'c',
    };
    const ordered = orderXmlObject(input, 'Fa');
    // P_1 (ORDER_MAP) first, then FooCustom and BarCustom in input order.
    expect(Object.keys(ordered)).toEqual(['P_1', 'FooCustom', 'BarCustom']);
  });

  it('omits keys whose value is undefined', () => {
    const input = {
      P_1: '2026-04-18',
      P_2: undefined as unknown as string,
      P_6: '2026-04-18',
    };
    const ordered = orderXmlObject(input, 'Fa');
    expect(Object.keys(ordered)).toEqual(['P_1', 'P_6']);
    expect(ordered).not.toHaveProperty('P_2');
  });

  it('recursively orders nested objects by their own parent-key context', () => {
    const input = {
      Podmiot1: {
        Adres: { AdresL1: 'street', KodKraju: 'PL' },
        DaneIdentyfikacyjne: { Nazwa: 'Acme', NIP: '123' },
      },
    };
    const ordered = orderXmlObject(input, 'Faktura') as Record<string, Record<string, unknown>>;
    const p1 = ordered.Podmiot1 as Record<string, Record<string, unknown>>;
    // Podmiot1 ORDER_MAP: DaneIdentyfikacyjne before Adres.
    expect(Object.keys(p1)).toEqual(['DaneIdentyfikacyjne', 'Adres']);
    // DaneIdentyfikacyjne ORDER_MAP: NIP before Nazwa.
    expect(Object.keys(p1.DaneIdentyfikacyjne)).toEqual(['NIP', 'Nazwa']);
    // Adres ORDER_MAP: KodKraju before AdresL1.
    expect(Object.keys(p1.Adres)).toEqual(['KodKraju', 'AdresL1']);
  });

  it('preserves order inside each element of an array value and repeats elements', () => {
    const input = {
      FaWiersz: [
        { P_7: 'B', NrWierszaFa: '2' },
        { P_7: 'A', NrWierszaFa: '1' },
      ],
    };
    const ordered = orderXmlObject(input, 'Fa') as Record<string, Array<Record<string, unknown>>>;
    expect(Array.isArray(ordered.FaWiersz)).toBe(true);
    expect(ordered.FaWiersz).toHaveLength(2);
    // FaWiersz ORDER_MAP: NrWierszaFa before P_7.
    expect(Object.keys(ordered.FaWiersz[0])).toEqual(['NrWierszaFa', 'P_7']);
    expect(Object.keys(ordered.FaWiersz[1])).toEqual(['NrWierszaFa', 'P_7']);
    // Array order preserved: first item keeps NrWierszaFa='2', second keeps '1'.
    expect(ordered.FaWiersz[0].NrWierszaFa).toBe('2');
    expect(ordered.FaWiersz[1].NrWierszaFa).toBe('1');
  });

  it('leaves keys intact when no context key matches ORDER_MAP', () => {
    const input = { Z: '1', A: '2', M: '3' };
    const ordered = orderXmlObject(input, 'UnknownParent');
    // No ORDER_MAP entry and no P_* keys → keep input order verbatim.
    expect(Object.keys(ordered)).toEqual(['Z', 'A', 'M']);
  });

  it('ORDER_MAP.Fa contains the multi-rate interleave sequence', () => {
    // Guard against accidental reordering of the ORDER_MAP itself.
    const fa = ORDER_MAP.Fa;
    const idx = (key: string) => fa.indexOf(key);
    expect(idx('P_13_1')).toBeLessThan(idx('P_14_1'));
    expect(idx('P_14_1')).toBeLessThan(idx('P_14_1W'));
    expect(idx('P_14_1W')).toBeLessThan(idx('P_13_2'));
    expect(idx('P_13_2')).toBeLessThan(idx('P_14_2'));
    expect(idx('P_14_2')).toBeLessThan(idx('P_13_6_1'));
    expect(idx('P_13_6_1')).toBeLessThan(idx('P_15'));
  });
});
