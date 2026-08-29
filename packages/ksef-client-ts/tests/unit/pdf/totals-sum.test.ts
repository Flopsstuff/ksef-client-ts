import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { sumDecimal } from '../../../src/pdf/format.js';
import { validateTemplate, type TotalsBlock } from '../../../src/pdf/template/dsl.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { interpretTemplate } from '../../../src/pdf/template/interpret.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

/**
 * The net/VAT buckets a KSeF invoice can carry, from the FA(2)/FA(3) XSD (both
 * schemas declare the same set; there is no `P_13_6`). The `P_14_*W` fields are
 * the same tax restated in PLN for foreign-currency invoices, so they are
 * deliberately excluded — adding them would double-count.
 */
const NET_BUCKETS = [
  'Fa.P_13_1', 'Fa.P_13_2', 'Fa.P_13_3', 'Fa.P_13_4', 'Fa.P_13_5',
  'Fa.P_13_7', 'Fa.P_13_8', 'Fa.P_13_9', 'Fa.P_13_10', 'Fa.P_13_11',
];
const VAT_BUCKETS = ['Fa.P_14_1', 'Fa.P_14_2', 'Fa.P_14_3', 'Fa.P_14_4', 'Fa.P_14_5'];

function totalsBody(xml: string, templateName: string) {
  const template = getBuiltinTemplate(templateName)!;
  const parsed = parseXmlForPdf(xml);
  const ctx = {
    root: (parsed as Record<string, unknown>).Faktura,
    strict: false,
    label: makeLabelResolver('en', {}),
    bindings: {},
    flags: {},
  };
  const doc = interpretTemplate(template, ctx, blockRegistry);
  const totals = (doc.content as Array<Record<string, unknown>>).find(
    (n) => Array.isArray(n.columns) && JSON.stringify(n).includes('table'),
  )!;
  const cols = totals.columns as Array<Record<string, never>>;
  return (cols[1] as unknown as { table: { body: Array<Array<{ text: string }>> } }).table.body;
}

describe('sumDecimal', () => {
  it('adds monetary strings without floating-point drift', () => {
    expect(sumDecimal(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimal(['500.00', '40.00'])).toBe('540.00');
  });

  it('keeps the widest scale among its inputs', () => {
    expect(sumDecimal(['1.5', '2.25'])).toBe('3.75');
    expect(sumDecimal(['10', '5'])).toBe('15');
  });

  it('handles negative amounts (credit notes)', () => {
    expect(sumDecimal(['100.00', '-40.00'])).toBe('60.00');
    expect(sumDecimal(['-100.00', '-40.00'])).toBe('-140.00');
  });

  it('skips absent buckets rather than counting them as zero', () => {
    expect(sumDecimal(['', '  ', '12.34'])).toBe('12.34');
  });

  it('returns blank when nothing is present, so an empty document stays blank', () => {
    expect(sumDecimal([])).toBe('');
    expect(sumDecimal(['', '   '])).toBe('');
  });

  it('returns blank rather than a wrong figure on unparseable input', () => {
    expect(sumDecimal(['12.00', 'not-a-number'])).toBe('');
  });
});

describe('built-in totals aggregate every VAT bucket', () => {
  it.each(['fa2-default', 'fa3-default'])('%s sums the XSD bucket set', (name) => {
    const template = getBuiltinTemplate(name)!;
    const totals = template.blocks.find((b) => b.type === 'totals') as TotalsBlock;
    const byLabel = Object.fromEntries(totals.rows.map((r) => [r.label, r]));
    expect(byLabel.totalNet?.sum).toEqual(NET_BUCKETS);
    expect(byLabel.totalVat?.sum).toEqual(VAT_BUCKETS);
    expect(byLabel.totalDue?.path).toBe('Fa.P_15');
  });

  it('prints real totals for a reduced-rate-only invoice', () => {
    const reduced = fa3
      .replace('<P_13_1>500.00</P_13_1>', '<P_13_2>500.00</P_13_2>')
      .replace('<P_14_1>115.00</P_14_1>', '<P_14_2>40.00</P_14_2>')
      .replace('<P_15>615.00</P_15>', '<P_15>540.00</P_15>');
    const body = totalsBody(reduced, 'fa3-default');
    expect(body[0][1].text).toBe('500,00');
    expect(body[1][1].text).toBe('40,00');
    expect(body[2][1].text).toBe('540,00');
  });

  it('adds the buckets of a mixed-rate invoice', () => {
    const mixed = fa3
      .replace('<P_13_1>500.00</P_13_1>', '<P_13_1>500.00</P_13_1><P_13_2>200.00</P_13_2><P_13_7>50.00</P_13_7>')
      .replace('<P_14_1>115.00</P_14_1>', '<P_14_1>115.00</P_14_1><P_14_2>16.00</P_14_2>')
      .replace('<P_15>615.00</P_15>', '<P_15>881.00</P_15>');
    const body = totalsBody(mixed, 'fa3-default');
    expect(body[0][1].text).toBe('750,00'); // 500 + 200 + 50
    expect(body[1][1].text).toBe('131,00'); // 115 + 16
    expect(body[2][1].text).toBe('881,00');
  });

  it('still renders the standard-rate-only fixture unchanged', () => {
    const body = totalsBody(fa3, 'fa3-default');
    expect(body[0][1].text).toBe('500,00');
    expect(body[1][1].text).toBe('115,00');
    expect(body[2][1].text).toBe('615,00');
  });
});

describe('totals row validation', () => {
  const wrap = (row: unknown) => ({
    schema: 'FA(3)',
    blocks: [{ type: 'totals', rows: [row] }],
  });

  it('accepts a single-path row', () => {
    expect(() => validateTemplate(wrap({ label: 'totalDue', path: 'Fa.P_15' }))).not.toThrow();
  });

  it('accepts a summed row', () => {
    expect(() => validateTemplate(wrap({ label: 'totalNet', sum: ['Fa.P_13_1'] }))).not.toThrow();
  });

  it('rejects a row with both path and sum', () => {
    expect(() =>
      validateTemplate(wrap({ label: 'totalNet', path: 'Fa.P_13_1', sum: ['Fa.P_13_2'] })),
    ).toThrow(/exactly one/);
  });

  it('rejects a row with neither path nor sum', () => {
    expect(() => validateTemplate(wrap({ label: 'totalNet' }))).toThrow(/exactly one/);
  });
});
