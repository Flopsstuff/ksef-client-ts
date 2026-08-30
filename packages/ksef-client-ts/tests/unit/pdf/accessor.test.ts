import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { get, list, has, getNode } from '../../../src/pdf/accessor.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures');

function loadFixture(rel: string): string {
  return fs.readFileSync(path.join(fixturesDir, rel), 'utf8');
}

// A synthetic, anonymous FA(3) invoice parsed through the compact PDF parser.
// Used for the fixture-backed cases (nested scalar, attribute, #text unwrap,
// collapsed list). No real taxpayer data.
const fa3 = parseXmlForPdf(loadFixture('pdf/fa3.xml'));

// A small, hand-built compact object exercising every parser artifact the
// accessor must smooth over, without depending on a real file.
const inline = {
  Podmiot1: {
    DaneIdentyfikacyjne: { NIP: '1111111111', Nazwa: 'Sprzedawca Przykładowy' },
  },
  // Mixed-content element: text under `#text`, plus attributes under `@`.
  KodFormularza: { '#text': 'FA', '@kodSystemowy': 'FA (3)', '@wersjaSchemy': '1-0E' },
  // Element with attributes only — no scalar value at all.
  AttrsOnly: { '@code': 'X' },
  // Element whose only child is an empty `#text`.
  EmptyText: { '#text': '' },
  // Element with `#text` alongside another key — not the "single #text" case.
  TextPlus: { '#text': '', '@a': 'x' },
  // Repeater the parser collapsed to an object (single element).
  Collapsed: { Row: { n: '1' } },
  // A genuine array (multi-element repeater) and an empty one.
  Rows: [{ n: '1' }, { n: '2' }, { n: '3' }],
  Empty: [] as unknown[],
  // Array descent: reading through an array should follow the first element.
  ArrDescent: [{ x: 'first' }, { x: 'second' }],
  // Array whose first element carries mixed content — coerced via #text.
  ArrText: [{ '#text': 'hi' }],
  // Scalars of each primitive kind.
  Str: 'hello',
  EmptyStr: '',
  Num: 5,
  Zero: 0,
  BoolTrue: true,
  BoolFalse: false,
  NullLeaf: null,
};

describe('getNode', () => {
  it('returns the raw object at a nested path', () => {
    const node = getNode(fa3, 'Faktura.Podmiot1.DaneIdentyfikacyjne');
    expect(node).toEqual({ NIP: '1111111111', Nazwa: 'Sprzedawca Przykładowy Sp. z o.o.' });
  });

  it('returns the raw array node untouched', () => {
    expect(getNode(inline, 'Rows')).toBe(inline.Rows);
  });

  it('returns the root when the path is empty (all segments filtered)', () => {
    expect(getNode(inline, '')).toBe(inline);
    // Leading/trailing/duplicate dots are filtered out too.
    expect(getNode(inline, '.Str.')).toBe('hello');
  });

  it('follows the first element when descent hits an array mid-path', () => {
    expect(getNode(inline, 'ArrDescent.x')).toBe('first');
  });

  it('returns undefined when an intermediate segment is missing', () => {
    expect(getNode(inline, 'Podmiot1.Nope.NIP')).toBeUndefined();
  });

  it('returns undefined when descent runs into a scalar', () => {
    expect(getNode(inline, 'Str.somethingDeeper')).toBeUndefined();
  });

  it('returns undefined for a null or undefined root', () => {
    expect(getNode(null, 'a')).toBeUndefined();
    expect(getNode(undefined, 'a')).toBeUndefined();
  });

  it('returns undefined when a leaf value is explicitly undefined', () => {
    expect(getNode({ a: undefined }, 'a')).toBeUndefined();
  });
});

describe('get', () => {
  it('reads a nested scalar from a fixture', () => {
    expect(get(fa3, 'Faktura.Podmiot1.DaneIdentyfikacyjne.NIP')).toBe('1111111111');
  });

  it('unwraps #text on a mixed-content element (fixture)', () => {
    expect(get(fa3, 'Faktura.Naglowek.KodFormularza')).toBe('FA');
  });

  it('unwraps #text on a mixed-content element (inline)', () => {
    expect(get(inline, 'KodFormularza')).toBe('FA');
  });

  it('reads an @attribute segment (fixture)', () => {
    expect(get(fa3, 'Faktura.Naglowek.KodFormularza.@kodSystemowy')).toBe('FA (3)');
  });

  it('reads an @attribute segment (inline)', () => {
    expect(get(inline, 'KodFormularza.@wersjaSchemy')).toBe('1-0E');
  });

  it('coerces a number leaf to a string', () => {
    expect(get(inline, 'Num')).toBe('5');
    expect(get(inline, 'Zero')).toBe('0');
  });

  it('coerces a boolean leaf to a string', () => {
    expect(get(inline, 'BoolTrue')).toBe('true');
    expect(get(inline, 'BoolFalse')).toBe('false');
  });

  it('returns "" for a leaf of an uncoercible type (e.g. bigint)', () => {
    // Not a string/number/boolean/array/record — falls through to no scalar.
    expect(get({ big: 10n }, 'big')).toBe('');
  });

  it('follows the first element when descending through an array', () => {
    expect(get(inline, 'ArrDescent.x')).toBe('first');
  });

  it('coerces via the first array element (unwrapping its #text)', () => {
    expect(get(inline, 'ArrText')).toBe('hi');
  });

  it('returns "" for an element that has only attributes (no scalar)', () => {
    expect(get(inline, 'AttrsOnly')).toBe('');
  });

  it('returns "" for a missing path', () => {
    expect(get(inline, 'Nope.Missing')).toBe('');
  });

  it('returns "" for a null leaf', () => {
    expect(get(inline, 'NullLeaf')).toBe('');
  });

  it('returns "" for a null/undefined root', () => {
    expect(get(null, 'a')).toBe('');
    expect(get(undefined, 'a')).toBe('');
  });

  it('throws with the path in the message when strict and missing', () => {
    expect(() => get(inline, 'Nope.Missing', true)).toThrow(/Missing binding: "Nope\.Missing"/);
  });

  it('does not throw in strict mode when the binding exists', () => {
    expect(get(inline, 'Str', true)).toBe('hello');
  });
});

describe('list', () => {
  it('wraps a parser-collapsed single element into a 1-element array (fixture)', () => {
    const rows = list(fa3, 'Faktura.Fa.FaWiersz');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect((rows[0] as Record<string, unknown>).NrWierszaFa).toBe('1');
  });

  it('wraps a collapsed object (inline) into a 1-element array', () => {
    expect(list(inline, 'Collapsed.Row')).toEqual([{ n: '1' }]);
  });

  it('returns a real array unchanged (same reference)', () => {
    const rows = list(inline, 'Rows');
    expect(rows).toBe(inline.Rows);
    expect(rows).toHaveLength(3);
  });

  it('returns [] for a missing path', () => {
    expect(list(inline, 'Nope')).toEqual([]);
  });

  it('returns [] for a null leaf', () => {
    expect(list(inline, 'NullLeaf')).toEqual([]);
  });

  it('returns [] for a null root', () => {
    expect(list(null, 'a')).toEqual([]);
  });
});

describe('has', () => {
  it('is true for a present nested object (fixture)', () => {
    expect(has(fa3, 'Faktura.Podmiot1')).toBe(true);
  });

  it('is true for a present non-empty scalar (fixture)', () => {
    expect(has(fa3, 'Faktura.Fa.P_2')).toBe(true);
  });

  it('is true for a number leaf, including 0', () => {
    expect(has(inline, 'Num')).toBe(true);
    expect(has(inline, 'Zero')).toBe(true);
  });

  it('is true for a boolean leaf, including false', () => {
    expect(has(inline, 'BoolTrue')).toBe(true);
    expect(has(inline, 'BoolFalse')).toBe(true);
  });

  it('is true for a non-empty array', () => {
    expect(has(inline, 'Rows')).toBe(true);
  });

  it('is true for an element carrying a non-empty #text only', () => {
    expect(has({ K: { '#text': 'FA' } }, 'K')).toBe(true);
  });

  it('is true for an element with #text plus other keys', () => {
    expect(has(inline, 'TextPlus')).toBe(true);
  });

  it('is false for a missing path', () => {
    expect(has(inline, 'Nope')).toBe(false);
  });

  it('is false for a null leaf', () => {
    expect(has(inline, 'NullLeaf')).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(has(inline, 'EmptyStr')).toBe(false);
  });

  it('is false for an empty array', () => {
    expect(has(inline, 'Empty')).toBe(false);
  });

  it('is false for an element carrying only an empty #text', () => {
    expect(has(inline, 'EmptyText')).toBe(false);
  });
});
