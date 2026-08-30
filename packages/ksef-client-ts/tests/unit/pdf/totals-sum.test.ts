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
const fa2 = readFileSync(new URL('../../fixtures/pdf/fa2.xml', import.meta.url), 'utf8');
/** Settled in EUR — the case where an unqualified amount misleads. */
const eurInvoice = readFileSync(new URL('../../fixtures/pdf/e2e-buyer-no-id.xml', import.meta.url), 'utf8');

/** 23% + 8% + exempt, so every totals mode has something to show. */
const mixedRate = fa3
  .replace('<P_13_1>500.00</P_13_1>', '<P_13_1>500.00</P_13_1><P_13_2>200.00</P_13_2><P_13_7>50.00</P_13_7>')
  .replace('<P_14_1>115.00</P_14_1>', '<P_14_1>115.00</P_14_1><P_14_2>16.00</P_14_2>')
  .replace('<P_15>615.00</P_15>', '<P_15>881.00</P_15>');

/**
 * The net/VAT buckets a KSeF invoice can carry, from the FA(2)/FA(3) XSD (both
 * schemas declare the same set). The zero-rated sales are split three ways
 * rather than sitting in a `P_13_6`: domestic, intra-EU supply and export.
 * The `P_14_*W` fields are the same tax restated in PLN for foreign-currency
 * invoices, so they are deliberately excluded — adding them would double-count.
 */
const NET_BUCKETS = [
  'Fa.P_13_1', 'Fa.P_13_2', 'Fa.P_13_3', 'Fa.P_13_4', 'Fa.P_13_5',
  'Fa.P_13_6_1', 'Fa.P_13_6_2', 'Fa.P_13_6_3',
  'Fa.P_13_7', 'Fa.P_13_8', 'Fa.P_13_9', 'Fa.P_13_10', 'Fa.P_13_11',
];
const VAT_BUCKETS = ['Fa.P_14_1', 'Fa.P_14_2', 'Fa.P_14_3', 'Fa.P_14_4', 'Fa.P_14_5'];

type TotalsMode = 'none' | 'buckets' | 'summary' | 'both';

/** Rendered totals as `label -> value`, in the order the rows appear. */
function totalsRows(xml: string, templateName: string, mode: TotalsMode = 'summary') {
  const template = getBuiltinTemplate(templateName)!;
  const parsed = parseXmlForPdf(xml);
  const ctx = {
    root: (parsed as Record<string, unknown>).Faktura,
    strict: false,
    label: makeLabelResolver('en', {}),
    bindings: {},
    flags: {
      totalsBuckets: mode === 'buckets' || mode === 'both',
      totalsSummary: mode === 'summary' || mode === 'both',
      // Every fixture here is an ordinary invoice with no `Rozliczenie`, so
      // `P_15` is the amount due and the templates label it that way.
      p15IsAmountDue: true,
    },
  };
  const doc = interpretTemplate(template, ctx, blockRegistry);
  const totals = (doc.content as Array<Record<string, unknown>>).find(
    (n) => Array.isArray(n.columns) && JSON.stringify(n).includes('table'),
  )!;
  const cols = totals.columns as Array<Record<string, never>>;
  const body = (cols[1] as unknown as { table: { body: Array<Array<{ text: string }>> } }).table.body;
  return body.map(([label, value]) => [label.text, value.text] as const);
}

const valueOf = (rows: ReadonlyArray<readonly [string, string]>, label: string) =>
  rows.find(([l]) => l === label)?.[1];

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
    // Two rows print under `Do zapłaty` and never together: `P_15` on a plain
    // invoice, and the settled payable when the document states one.
    expect(totals.rows.filter((r) => r.label === 'totalDue').map((r) => r.path)).toEqual([
      'Fa.P_15',
      'Fa.Rozliczenie.DoZaplaty',
    ]);
  });

  it('prints real totals for a reduced-rate-only invoice', () => {
    const reduced = fa3
      .replace('<P_13_1>500.00</P_13_1>', '<P_13_2>500.00</P_13_2>')
      .replace('<P_14_1>115.00</P_14_1>', '<P_14_2>40.00</P_14_2>')
      .replace('<P_15>615.00</P_15>', '<P_15>540.00</P_15>');
    const rows = totalsRows(reduced, 'fa3-default');
    expect(valueOf(rows, 'Total net')).toBe('500,00');
    expect(valueOf(rows, 'Total VAT')).toBe('40,00');
    expect(valueOf(rows, 'Amount due')).toBe('540,00');
  });

  it('adds the buckets of a mixed-rate invoice', () => {
    const rows = totalsRows(mixedRate, 'fa3-default');
    expect(valueOf(rows, 'Total net')).toBe('750,00'); // 500 + 200 + 50
    expect(valueOf(rows, 'Total VAT')).toBe('131,00'); // 115 + 16
    expect(valueOf(rows, 'Amount due')).toBe('881,00');
  });

  it('counts zero-rated sales, which sit in three separate buckets', () => {
    // A 0% line lands in P_13_6_1 (domestic), P_13_6_2 (intra-EU supply) or
    // P_13_6_3 (export) depending on why it is zero-rated — an exporter's whole
    // turnover can live there and contribute no VAT at all.
    const zeroRated = fa3
      .replace(
        '<P_13_1>500.00</P_13_1>',
        '<P_13_1>500.00</P_13_1><P_13_6_1>100.00</P_13_6_1><P_13_6_2>2000.00</P_13_6_2><P_13_6_3>3000.00</P_13_6_3>',
      )
      .replace('<P_15>615.00</P_15>', '<P_15>5715.00</P_15>');
    const rows = totalsRows(zeroRated, 'fa3-default');
    expect(valueOf(rows, 'Total net')).toBe('5\u00A0600,00'); // 500 + 100 + 2000 + 3000
    expect(valueOf(rows, 'Total VAT')).toBe('115,00'); // zero-rated sales carry no VAT
    expect(valueOf(rows, 'Amount due')).toBe('5\u00A0715,00');
  });

  it('still renders the standard-rate-only fixture unchanged', () => {
    const rows = totalsRows(fa3, 'fa3-default');
    expect(valueOf(rows, 'Total net')).toBe('500,00');
    expect(valueOf(rows, 'Total VAT')).toBe('115,00');
    expect(valueOf(rows, 'Amount due')).toBe('615,00');
  });
});

describe('the totals mode selects what a reader gets', () => {
  it('none: the amount due and nothing else', () => {
    expect(totalsRows(mixedRate, 'fa3-default', 'none')).toEqual([
      ['Amount due', '881,00'],
      ['Currency', 'PLN'],
    ]);
  });

  it('buckets: one row per bucket the invoice carries, nothing computed', () => {
    expect(totalsRows(mixedRate, 'fa3-default', 'buckets')).toEqual([
      ['Net 23%', '500,00'],
      ['VAT 23%', '115,00'],
      ['Net 8%', '200,00'],
      ['VAT 8%', '16,00'],
      ['Net exempt', '50,00'],
      ['Amount due', '881,00'],
      ['Currency', 'PLN'],
    ]);
  });

  it('summary: only the computed totals', () => {
    expect(totalsRows(mixedRate, 'fa3-default', 'summary')).toEqual([
      ['Total net', '750,00'],
      ['Total VAT', '131,00'],
      ['Amount due', '881,00'],
      ['Currency', 'PLN'],
    ]);
  });

  it('both: the breakdown followed by the computed totals', () => {
    const rows = totalsRows(mixedRate, 'fa3-default', 'both');
    expect(rows.map(([l]) => l)).toEqual([
      'Net 23%', 'VAT 23%', 'Net 8%', 'VAT 8%', 'Net exempt', 'Total net', 'Total VAT', 'Amount due',
      'Currency',
    ]);
  });

  it('never prints a bucket the invoice does not carry', () => {
    const rows = totalsRows(fa3, 'fa3-default', 'both');
    expect(rows.map(([l]) => l)).toEqual([
      'Net 23%', 'VAT 23%', 'Total net', 'Total VAT', 'Amount due', 'Currency',
    ]);
  });

  it('shows the amount due in every mode', () => {
    for (const mode of ['none', 'buckets', 'summary', 'both'] as const) {
      expect(valueOf(totalsRows(mixedRate, 'fa3-default', mode), 'Amount due'), mode).toBe('881,00');
    }
  });

  // Money is printed unqualified, so without the currency an invoice settled in
  // EUR reads as one settled in PLN. KodWaluty is mandatory in both schemas, so
  // every invoice can say which it is, in every mode.
  it('names the currency in every mode and every invoice built-in', () => {
    for (const template of ['fa2-default', 'fa3-default', 'fa3-showcase'] as const) {
      const xml = template === 'fa2-default' ? fa2 : fa3;
      for (const mode of ['none', 'buckets', 'summary', 'both'] as const) {
        const rows = totalsRows(xml, template, mode);
        expect(valueOf(rows, 'Currency'), `${template}/${mode}`).toBe('PLN');
      }
    }
  });

  it('prints the invoice currency, not an assumed one', () => {
    expect(valueOf(totalsRows(eurInvoice, 'fa3-default'), 'Currency')).toBe('EUR');
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
