import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderInvoicePdfFromTemplate } from '../../../src/pdf/index.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import type { FieldDef, InvoiceTemplate, LinesBlock, PaymentBlock, TotalsBlock } from '../../../src/pdf/template/dsl.js';

/**
 * `strict` exists to turn a dot-path typo into an error instead of a blank
 * line. That only works if the templates say which bindings the document may
 * legitimately omit — otherwise the first optional field an invoice happens not
 * to carry throws, and the mode is useless on real documents.
 *
 * So the rule is: a binding is policed unless the template marks it `optional`,
 * and it is marked exactly where the FA schema allows the field to be absent.
 * `Fa.P_15` has no optional ancestor — an invoice always states its amount due —
 * so that one stays policed, which is the whole point of the mode.
 */

const fx = (name: string) => readFileSync(new URL(`../../fixtures/pdf/${name}`, import.meta.url), 'utf8');

const DOCUMENTS = [
  'fa3.xml',
  'e2e-vat-multi.xml',
  'e2e-services-np.xml',
  'e2e-buyer-no-id.xml',
];

const fa3Default = () => JSON.parse(JSON.stringify(getBuiltinTemplate('fa3-default'))) as InvoiceTemplate;

describe('strict mode survives real documents', () => {
  it.each(DOCUMENTS)('%s renders strict without throwing', async (name) => {
    await expect(
      renderInvoicePdfFromTemplate(fx(name), fa3Default(), { strict: true, totals: 'both' }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('an unpaid invoice renders strict, though <Zaplacono> is absent', async () => {
    // Zaplacono sits inside an optional choice inside an optional Platnosc, so
    // an unpaid invoice simply has none. This is the case that made `strict`
    // unusable before the bindings were marked.
    const unpaid = fx('fa3.xml').replace(/\s*<Zaplacono>1<\/Zaplacono>/, '');
    expect(unpaid).not.toContain('Zaplacono');
    await expect(
      renderInvoicePdfFromTemplate(unpaid, fa3Default(), { strict: true }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('an invoice that does not name its buyer renders strict', async () => {
    // `Nazwa` sits in an optional sequence inside `TPodmiot2` — art. 106e ust. 5
    // pkt 3 lets an invoice omit the buyer's name — so its absence is a valid
    // document, not a template typo.
    const unnamed = fx('fa3.xml').replace(/\s*<Nazwa>Nabywca[^<]*<\/Nazwa>/, '');
    expect(unnamed).not.toContain('Nabywca Przykładowy');
    await expect(
      renderInvoicePdfFromTemplate(unnamed, fa3Default(), { strict: true }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('an invoice without the optional second address line renders strict', async () => {
    const noAddressL2 = fx('fa3.xml').replace(/\s*<AdresL2>[^<]*<\/AdresL2>/g, '');
    expect(noAddressL2).not.toContain('AdresL2');
    await expect(
      renderInvoicePdfFromTemplate(noAddressL2, fa3Default(), { strict: true }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('every built-in marks what the FA schemas let a buyer omit', () => {
  it.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s marks the buyer name optional', (name) => {
    const parties = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'parties') as {
      right: { fields: unknown[] };
    };
    const nazwa = parties.right.fields.find(
      (f): f is { path: string; optional?: boolean } =>
        typeof f === 'object' && f !== null && (f as { path?: string }).path === 'Podmiot2.DaneIdentyfikacyjne.Nazwa',
    );
    expect(nazwa?.optional, 'the buyer name is optional in FA(2) and FA(3)').toBe(true);
  });
});

describe('strict mode still catches a typo in a required binding', () => {
  it('throws when the amount due path is misspelled', async () => {
    const template = fa3Default();
    const totals = template.blocks.find((b) => b.type === 'totals') as TotalsBlock;
    totals.rows.find((r) => r.label === 'totalDue')!.path = 'Fa.P_1S';
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).rejects.toThrow('Missing binding: "Fa.P_1S"');
  });

  it('throws when a required party field is misspelled', async () => {
    const template = fa3Default();
    const parties = template.blocks.find((b) => b.type === 'parties') as { left: { fields: unknown[] } };
    parties.left.fields[0] = 'Podmiot1.DaneIdentyfikacyjne.Nazwaa';
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).rejects.toThrow(/Nazwaa/);
  });

  it('throws when a required line column is misspelled', async () => {
    const template = fa3Default();
    const lines = template.blocks.find((b) => b.type === 'lines') as LinesBlock;
    lines.columns.find((c) => c.label === 'lp')!.path = 'NrWierszaFaa';
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).rejects.toThrow(/NrWierszaFaa/);
  });

  it('stays silent about the same typo without strict', async () => {
    const template = fa3Default();
    const totals = template.blocks.find((b) => b.type === 'totals') as TotalsBlock;
    totals.rows.find((r) => r.label === 'totalDue')!.path = 'Fa.P_1S';
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('does not throw for a misspelled binding that is marked optional', async () => {
    // The marker is a promise about the schema, not a licence to be sloppy —
    // but it does mean strict cannot police that path. Worth pinning so the
    // trade-off is visible rather than discovered later.
    const template = fa3Default();
    const lines = template.blocks.find((b) => b.type === 'lines') as LinesBlock;
    const name = lines.columns.find((c) => c.label === 'name')!;
    expect(name.optional, 'P_7 is minOccurs="0" and must be marked').toBe(true);
    name.path = 'P_77';
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

/**
 * `annotations` is a custom-template block — no built-in uses one — which is
 * how it came to be the only field-bearing renderer that read every path
 * strictly. Its fields take the same `optional` marker as every other block's,
 * so they have to mean the same thing.
 */
describe('an annotations block honours the optional marker', () => {
  const withAnnotations = (fields: FieldDef[]): InvoiceTemplate => ({
    schema: 'FA(3)',
    blocks: [{ type: 'annotations', fields }],
  });

  it('renders strict when a field the document omits is marked optional', async () => {
    const template = withAnnotations([
      { label: 'paid', path: 'Fa.Adnotacje.NieIstnieje', optional: true },
    ]);
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('still throws strict on an unmarked field the document omits', async () => {
    const template = withAnnotations([{ label: 'paid', path: 'Fa.Adnotacje.NieIstnieje' }]);
    await expect(
      renderInvoicePdfFromTemplate(fx('fa3.xml'), template, { strict: true }),
    ).rejects.toThrow('Missing binding: "Fa.Adnotacje.NieIstnieje"');
  });

  it('renders either way without strict', async () => {
    for (const optional of [true, undefined]) {
      const template = withAnnotations([
        { label: 'paid', path: 'Fa.Adnotacje.NieIstnieje', ...(optional ? { optional } : {}) },
      ]);
      await expect(
        renderInvoicePdfFromTemplate(fx('fa3.xml'), template),
      ).resolves.toBeInstanceOf(Uint8Array);
    }
  });
});

describe('the built-in templates mark the right bindings', () => {
  it.each(['fa2-default', 'fa3-default'])('%s polices the amount due', (name) => {
    const totals = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'totals') as TotalsBlock;
    const due = totals.rows.find((r) => r.label === 'totalDue')!;
    expect(due.path).toBe('Fa.P_15');
    expect(due.optional, 'P_15 is required by the schema and must stay policed').toBeUndefined();
  });

  it.each(['fa2-default', 'fa3-default'])('%s marks every rate bucket optional', (name) => {
    const totals = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'totals') as TotalsBlock;
    const buckets = totals.rows.filter((r) => r.when === 'totalsBuckets');
    expect(buckets.length).toBeGreaterThan(10);
    expect(buckets.every((r) => r.optional === true)).toBe(true);
  });

  it.each(['fa2-default', 'fa3-default'])('%s keeps the mandatory line column policed', (name) => {
    const lines = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'lines') as LinesBlock;
    const byLabel = Object.fromEntries(lines.columns.map((c) => [c.label, c]));
    expect(byLabel.lp?.optional, 'NrWierszaFa is required').toBeUndefined();
    for (const label of ['name', 'unit', 'qty', 'unitPrice', 'vatRate', 'net']) {
      expect(byLabel[label]?.optional, `${label} is minOccurs="0"`).toBe(true);
    }
  });

  it.each(['fa2-default', 'fa3-default'])('%s keeps the bank account number policed', (name) => {
    const payment = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'payment') as PaymentBlock;
    const fields = Object.fromEntries((payment.accounts!.fields as FieldDef[]).map((f) => [f.label, f]));
    expect(fields.bankAccount?.optional, 'NrRB is required inside RachunekBankowy').toBeUndefined();
    expect(fields.swift?.optional).toBe(true);
    expect(fields.bankName?.optional).toBe(true);
  });
});
