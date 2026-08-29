/**
 * Semantic (node-structure) tests for the block renderers. We assert the shape
 * of the emitted pdfmake nodes — never bytes. Each renderer is exercised through
 * every branch: present/absent optional style, empty vs populated collections,
 * collapsed vs expanded repeaters, and strict vs non-strict binding resolution.
 */
import { describe, it, expect } from 'vitest';
import type { RenderContext, RenderChild, PdfNode } from '../../../src/pdf/template/interpret.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';
import { applyFormat } from '../../../src/pdf/format.js';
import { headerRenderer } from '../../../src/pdf/template/blocks/header.js';
import { partiesRenderer } from '../../../src/pdf/template/blocks/parties.js';
import { partiesRenderer } from '../../../src/pdf/template/blocks/parties.js';
import { linesRenderer } from '../../../src/pdf/template/blocks/lines.js';
import { totalsRenderer } from '../../../src/pdf/template/blocks/totals.js';
import { paymentRenderer } from '../../../src/pdf/template/blocks/payment.js';
import { annotationsRenderer } from '../../../src/pdf/template/blocks/annotations.js';
import { footerRenderer } from '../../../src/pdf/template/blocks/footer.js';

// ── test harness ────────────────────────────────────────────────────────────

/** Build a RenderContext by hand. `label` echoes the key by default. */
function makeCtx(root: unknown, overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    root,
    strict: false,
    label: (k: string) => k,
    bindings: {},
    flags: {},
    ...overrides,
  };
}

/** The child-render callback is unused by these blocks. */
const noRender: RenderChild = () => null;

/** Cast a node to an indexable bag for structural assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rec = (n: PdfNode | PdfNode[] | null): any => n as any;

// ── parties ─────────────────────────────────────────────────────────────────

describe('partiesRenderer', () => {
  const panel = (root: unknown) =>
    rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.DaneIdentyfikacyjne.Nazwa'] },
          right: {
            label: 'buyer',
            fields: [
              'Podmiot2.DaneIdentyfikacyjne.Nazwa',
              {
                firstOf: [
                  'Podmiot2.DaneIdentyfikacyjne.NIP',
                  'Podmiot2.DaneIdentyfikacyjne.NrVatUE',
                  'Podmiot2.DaneIdentyfikacyjne.NrID',
                ],
              },
              'Podmiot2.Adres.AdresL1',
            ],
          },
        },
        makeCtx(root),
        noRender,
      ),
    ).columns[1].stack;

  const buyer = (ident: Record<string, string>) => ({
    Podmiot1: { DaneIdentyfikacyjne: { Nazwa: 'Sprzedawca' } },
    Podmiot2: { DaneIdentyfikacyjne: { Nazwa: 'Nabywca', ...ident }, Adres: { AdresL1: 'ul. Testowa 1' } },
  });

  it('prints a Polish NIP', () => {
    const stack = panel(buyer({ NIP: '1111111111' }));
    expect(stack.map((n: { text: string }) => n.text)).toEqual(['buyer', 'Nabywca', '1111111111', 'ul. Testowa 1']);
  });

  it('falls back to an EU VAT number', () => {
    const stack = panel(buyer({ NrVatUE: 'DE123456789' }));
    expect(stack.map((n: { text: string }) => n.text)).toContain('DE123456789');
  });

  it('falls back to a third-country identifier', () => {
    const stack = panel(buyer({ NrID: 'CR-421169' }));
    expect(stack.map((n: { text: string }) => n.text)).toContain('CR-421169');
  });

  it('leaves no blank line when the counterparty carries no identifier at all', () => {
    const stack = panel(buyer({ BrakID: '1' }));
    expect(stack.map((n: { text: string }) => n.text)).toEqual(['buyer', 'Nabywca', 'ul. Testowa 1']);
    expect(stack.every((n: { text: string }) => n.text !== '')).toBe(true);
  });

  it('skips a plain field that resolves empty instead of printing a gap', () => {
    const root = buyer({ NIP: '1111111111' });
    delete (root.Podmiot2 as { Adres?: unknown }).Adres;
    const stack = panel(root);
    expect(stack.map((n: { text: string }) => n.text)).toEqual(['buyer', 'Nabywca', '1111111111']);
  });

  it('prints the address under its own sub-heading, in the group style', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.DaneIdentyfikacyjne.Nazwa'] },
          right: {
            label: 'buyer',
            fields: [
              'Podmiot2.DaneIdentyfikacyjne.Nazwa',
              { label: 'address', style: 'partyAddress', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
            ],
          },
        },
        makeCtx({
          Podmiot1: { DaneIdentyfikacyjne: { Nazwa: 'Sprzedawca' } },
          Podmiot2: {
            DaneIdentyfikacyjne: { Nazwa: 'Nabywca' },
            Adres: { AdresL1: 'ul. Testowa 1', AdresL2: '00-001 Warszawa' },
          },
        }),
        noRender,
      ),
    );
    const stack = node.columns[1].stack;
    expect(stack.map((n: { text: string }) => n.text)).toEqual([
      'buyer', 'Nabywca', 'address', 'ul. Testowa 1', '00-001 Warszawa',
    ]);
    // the sub-heading matches the panel heading; the lines carry the group style
    expect(stack[2].style).toBe(stack[0].style);
    expect(stack[3].style).toBe('partyAddress');
    expect(stack[4].style).toBe('partyAddress');
  });

  it('drops an address group whose lines are all absent, heading included', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.DaneIdentyfikacyjne.Nazwa'] },
          right: {
            label: 'buyer',
            fields: [
              'Podmiot2.DaneIdentyfikacyjne.Nazwa',
              { label: 'address', style: 'partyAddress', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
            ],
          },
        },
        makeCtx({
          Podmiot1: { DaneIdentyfikacyjne: { Nazwa: 'Sprzedawca' } },
          Podmiot2: { DaneIdentyfikacyjne: { Nazwa: 'Nabywca' } },
        }),
        noRender,
      ),
    );
    expect(node.columns[1].stack.map((n: { text: string }) => n.text)).toEqual(['buyer', 'Nabywca']);
  });

  it('keeps the address group when only one of its lines resolves', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.DaneIdentyfikacyjne.Nazwa'] },
          right: {
            label: 'buyer',
            fields: [
              { label: 'address', style: 'partyAddress', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
            ],
          },
        },
        makeCtx({
          Podmiot1: { DaneIdentyfikacyjne: { Nazwa: 'Sprzedawca' } },
          Podmiot2: { Adres: { AdresL1: 'ul. Testowa 1' } },
        }),
        noRender,
      ),
    );
    expect(node.columns[1].stack.map((n: { text: string }) => n.text)).toEqual([
      'buyer', 'address', 'ul. Testowa 1',
    ]);
  });

  it('repeats a group over its collection, so every contact block is printed', () => {
    const contact = {
      label: 'contact',
      from: 'Podmiot2.DaneKontaktowe',
      style: 'partyAddress',
      fields: ['Email', 'Telefon'],
    };
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: [] },
          right: { label: 'buyer', fields: [contact] },
        },
        makeCtx({
          Podmiot2: {
            DaneKontaktowe: [
              { Email: 'a@example.test', Telefon: '+48000000001' },
              { Email: 'b@example.test' },
              { Telefon: '+48000000003' },
            ],
          },
        }),
        noRender,
      ),
    );
    // one heading, then every line of all three blocks — not just the first
    expect(node.columns[1].stack.map((n: { text: string }) => n.text)).toEqual([
      'buyer', 'contact', 'a@example.test', '+48000000001', 'b@example.test', '+48000000003',
    ]);
  });

  it('normalizes a single collapsed contact block to one entry', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: [] },
          right: {
            label: 'buyer',
            fields: [{ label: 'contact', from: 'Podmiot2.DaneKontaktowe', fields: ['Email', 'Telefon'] }],
          },
        },
        makeCtx({ Podmiot2: { DaneKontaktowe: { Email: 'only@example.test' } } }),
        noRender,
      ),
    );
    expect(node.columns[1].stack.map((n: { text: string }) => n.text)).toEqual([
      'buyer', 'contact', 'only@example.test',
    ]);
  });

  it('drops the contact heading when the party carries no contact block', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: [] },
          right: {
            label: 'buyer',
            fields: [
              'Podmiot2.DaneIdentyfikacyjne.Nazwa',
              { label: 'contact', from: 'Podmiot2.DaneKontaktowe', fields: ['Email', 'Telefon'] },
            ],
          },
        },
        makeCtx({ Podmiot2: { DaneIdentyfikacyjne: { Nazwa: 'Nabywca' } } }),
        noRender,
      ),
    );
    expect(node.columns[1].stack.map((n: { text: string }) => n.text)).toEqual(['buyer', 'Nabywca']);
  });

  it('reads repeater entries leniently even in strict mode', () => {
    // Every field of a contact block is optional; a block without a phone number
    // must not make a strict render throw.
    const render = () =>
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: [] },
          right: {
            label: 'buyer',
            fields: [{ label: 'contact', from: 'Podmiot2.DaneKontaktowe', fields: ['Email', 'Telefon'] }],
          },
        },
        makeCtx({ Podmiot2: { DaneKontaktowe: { Email: 'only@example.test' } } }, { strict: true }),
        noRender,
      );
    expect(render).not.toThrow();
    expect(rec(render()).columns[1].stack.map((n: { text: string }) => n.text)).toEqual([
      'buyer', 'contact', 'only@example.test',
    ]);
  });

  it('prefers NIP when several identifiers are somehow present', () => {
    const stack = panel(buyer({ NIP: '1111111111', NrID: 'CR-421169' }));
    expect(stack.map((n: { text: string }) => n.text)).toContain('1111111111');
    expect(stack.map((n: { text: string }) => n.text)).not.toContain('CR-421169');
  });
});

// ── header (existing renderer) ───────────────────────────────────────────────

describe('headerRenderer', () => {
  it('renders logo, title, number and date with an explicit style', () => {
    const ctx = makeCtx(
      { Fa: { P_2: 'FV/2025/01', P_1: '2025-01-15' } },
      { bindings: { 'opts.logo': 'data:image/png;base64,AAAA' } },
    );
    const node = rec(
      headerRenderer(
        {
          type: 'header',
          logo: 'opts.logo',
          title: { label: 'invoice' },
          number: 'Fa.P_2',
          date: 'Fa.P_1',
          style: 'bigtitle',
        },
        ctx,
        noRender,
      ),
    );

    expect(node.columns).toHaveLength(2);
    const [left, right] = node.columns;
    // title, then the logo beneath it
    expect(left.stack[0].text).toBe('invoice');
    expect(left.stack[0].style).toBe('bigtitle');
    expect(left.stack[1].image).toBe('data:image/png;base64,AAAA');
    // number + date, right-aligned
    expect(right.alignment).toBe('right');
    expect(right.stack).toHaveLength(2);
    expect(right.stack[0].text).toBe('invoiceNumber: FV/2025/01');
    expect(right.stack[1].text).toBe('issueDate: 15.01.2025');
  });

  it('falls back to the invoice label and default title style, omitting empty right column', () => {
    const node = rec(headerRenderer({ type: 'header' }, makeCtx({}), noRender));
    const [left, right] = node.columns;
    expect(left.stack).toHaveLength(1);
    expect(left.stack[0].text).toBe('invoice'); // label('invoice')
    expect(left.stack[0].style).toBe('title'); // default
    expect(right.stack).toHaveLength(0);
  });

  it('stacks the KSeF number under the date, in the same body font', () => {
    const ctx = makeCtx(
      { Fa: { P_2: 'FV/2025/01', P_1: '2025-01-15' } },
      { bindings: { 'opts.ksefNumber': '1111111111-20250115-010000000000-00' } },
    );
    const node = rec(
      headerRenderer(
        { type: 'header', number: 'Fa.P_2', date: 'Fa.P_1', ksefNumber: 'opts.ksefNumber' },
        ctx,
        noRender,
      ),
    );
    const [, right] = node.columns;
    expect(right.stack).toHaveLength(3);
    expect(right.stack[2].text).toBe('ksefNumber: 1111111111-20250115-010000000000-00');
    // no style of its own — it inherits the document font like the two above it
    expect(right.stack[2].style).toBeUndefined();
  });

  it('omits the KSeF line entirely when the number is absent (offline)', () => {
    const node = rec(
      headerRenderer(
        { type: 'header', number: 'Fa.P_2', date: 'Fa.P_1', ksefNumber: 'opts.ksefNumber' },
        makeCtx({ Fa: { P_2: 'FV/2025/01', P_1: '2025-01-15' } }),
        noRender,
      ),
    );
    const [, right] = node.columns;
    expect(right.stack).toHaveLength(2);
    expect(JSON.stringify(right.stack)).not.toContain('ksefNumber');
  });

  it('drops the logo node when its binding resolves empty', () => {
    const node = rec(headerRenderer({ type: 'header', logo: 'missing.logo' }, makeCtx({}), noRender));
    const [left] = node.columns;
    // no image pushed; only the title line remains
    expect(left.stack).toHaveLength(1);
    expect(left.stack[0].image).toBeUndefined();
  });
});

// ── parties ───────────────────────────────────────────────────────────────

describe('partiesRenderer', () => {
  it('emits a two-column layout with a bold label line and one line per field', () => {
    const ctx = makeCtx({
      Podmiot1: { Nazwa: 'ACME Sp. z o.o.', NIP: '5213003700' },
      Podmiot2: { Nazwa: 'Buyer Co' },
    });
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.Nazwa', 'Podmiot1.NIP'] },
          right: { label: 'buyer', fields: ['Podmiot2.Nazwa'] },
          style: 'pstyle',
        },
        ctx,
        noRender,
      ),
    );

    expect(node.columns).toHaveLength(2);
    expect(node.style).toBe('pstyle');

    const [left, right] = node.columns;
    expect(left.width).toBe('*');
    expect(left.stack).toHaveLength(3); // label + 2 fields
    expect(left.stack[0].text).toBe('seller');
    expect(left.stack[0].style).toBe('h2');
    expect(left.stack[1].text).toBe('ACME Sp. z o.o.');
    expect(left.stack[2].text).toBe('5213003700');

    expect(right.stack).toHaveLength(2); // label + 1 field
    expect(right.stack[1].text).toBe('Buyer Co');
  });

  it('handles empty field lists and omits style when absent', () => {
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: [] },
          right: { label: 'buyer', fields: [] },
        },
        makeCtx({}),
        noRender,
      ),
    );
    expect(node.style).toBeUndefined();
    expect('style' in node).toBe(false);
    expect(node.columns[0].stack).toHaveLength(1); // label only
  });

  it('resolves real localized labels via makeLabelResolver', () => {
    const ctx = makeCtx({ Podmiot1: { Nazwa: 'X' } }, { label: makeLabelResolver('pl') });
    const node = rec(
      partiesRenderer(
        {
          type: 'parties',
          left: { label: 'seller', fields: ['Podmiot1.Nazwa'] },
          right: { label: 'buyer', fields: [] },
        },
        ctx,
        noRender,
      ),
    );
    expect(node.columns[0].stack[0].text).toBe('Sprzedawca');
    expect(node.columns[1].stack[0].text).toBe('Nabywca');
  });
});

// ── lines ─────────────────────────────────────────────────────────────────

const lineColumns = [
  { label: 'lp', path: 'NrWierszaFa' },
  { label: 'name', path: 'P_7' },
  { label: 'qty', path: 'P_8B', format: 'number' as const },
  { label: 'net', path: 'P_9A', format: 'money' as const },
];

describe('linesRenderer', () => {
  it('renders a header row plus one body row for a collapsed single line', () => {
    const ctx = makeCtx({
      Fa: { FaWiersz: { NrWierszaFa: '1', P_7: 'Widget', P_8B: '2', P_9A: '10.00' } },
    });
    const node = rec(
      linesRenderer({ type: 'lines', from: 'Fa.FaWiersz', columns: lineColumns }, ctx, noRender),
    );

    expect(node.table.headerRows).toBe(1);
    expect(node.table.widths).toHaveLength(4);
    expect(node.layout).toBe('lightHorizontalLines');
    expect(node.table.body).toHaveLength(2); // 1 header + 1 line

    // header cells echo the column labels and are bold
    const header = node.table.body[0];
    expect(header.map((c: any) => c.text)).toEqual(['lp', 'name', 'qty', 'net']);
    expect(header.every((c: any) => c.bold === true)).toBe(true);

    // body cell values are formatted
    const row = node.table.body[1];
    expect(row[0].text).toBe('1');
    expect(row[1].text).toBe('Widget');
    expect(row[2].text).toBe(applyFormat('2', 'number'));
    expect(row[3].text).toBe(applyFormat('10.00', 'money')); // '10,00'
    expect(node.style).toBeUndefined();
  });

  it('renders one body row per element for an expanded array of lines (+ style)', () => {
    const ctx = makeCtx({ Fa: { FaWiersz: [{ P_7: 'A' }, { P_7: 'B' }] } });
    const node = rec(
      linesRenderer(
        {
          type: 'lines',
          from: 'Fa.FaWiersz',
          columns: [
            { label: 'name', path: 'P_7' },
            { label: 'qty', path: 'P_8B' }, // missing → '' (non-strict)
          ],
          style: 'lstyle',
        },
        ctx,
        noRender,
      ),
    );
    expect(node.table.body).toHaveLength(3); // 1 header + 2 lines
    expect(node.table.body[1][0].text).toBe('A');
    expect(node.table.body[2][0].text).toBe('B');
    expect(node.table.body[1][1].text).toBe(''); // missing binding, non-strict
    expect(node.style).toBe('lstyle');
  });

  it('emits only the header row for an empty collection', () => {
    const node = rec(
      linesRenderer({ type: 'lines', from: 'Fa.FaWiersz', columns: lineColumns }, makeCtx({ Fa: {} }), noRender),
    );
    expect(node.table.body).toHaveLength(1); // header only
  });

  it('throws in strict mode on a missing cell binding', () => {
    const ctx = makeCtx({ Fa: { FaWiersz: { P_7: 'X' } } }, { strict: true });
    expect(() =>
      linesRenderer(
        { type: 'lines', from: 'Fa.FaWiersz', columns: [{ label: 'name', path: 'P_MISSING' }] },
        ctx,
        noRender,
      ),
    ).toThrow(/Missing binding/);
  });
});

// ── totals ──────────────────────────────────────────────────────────────────

describe('totalsRenderer', () => {
  it('renders a right-aligned borderless summary table (+ style)', () => {
    const ctx = makeCtx({ Fa: { P_13_1: '100', P_15: '123' } });
    const node = rec(
      totalsRenderer(
        {
          type: 'totals',
          rows: [
            { label: 'totalNet', path: 'Fa.P_13_1', format: 'money' },
            { label: 'totalDue', path: 'Fa.P_15', format: 'money' },
          ],
          style: 'tstyle',
        },
        ctx,
        noRender,
      ),
    );

    expect(node.columns).toHaveLength(2);
    expect(node.columns[0].text).toBe(''); // elastic spacer
    expect(node.columns[0].width).toBe('*');
    expect(node.style).toBe('tstyle');

    const summary = node.columns[1];
    expect(summary.layout).toBe('noBorders');
    expect(summary.table.body).toHaveLength(2);
    const [labelCell, valueCell] = summary.table.body[0];
    expect(labelCell.text).toBe('totalNet');
    expect(labelCell.bold).toBe(true);
    expect(valueCell.text).toBe(applyFormat('100', 'money')); // '100,00'
    expect(valueCell.alignment).toBe('right');
  });

  it('omits style when absent', () => {
    const node = rec(
      totalsRenderer({ type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15' }] }, makeCtx({ Fa: { P_15: '5' } }), noRender),
    );
    expect('style' in node).toBe(false);
    expect(node.columns[1].table.body).toHaveLength(1);
  });
});

// ── payment ───────────────────────────────────────────────────────────────

describe('paymentRenderer', () => {
  it('renders a heading and one label:value line per row (+ style)', () => {
    const ctx = makeCtx({
      Fa: { FormaPlatnosci: '6', TerminPlatnosci: { Termin: '2025-02-01' } },
    });
    const node = rec(
      paymentRenderer(
        {
          type: 'payment',
          rows: [
            { label: 'paymentMethod', path: 'Fa.FormaPlatnosci' },
            { label: 'paymentDate', path: 'Fa.TerminPlatnosci.Termin', format: 'date' },
          ],
          style: 'paystyle',
        },
        ctx,
        noRender,
      ),
    );

    expect(node.stack).toHaveLength(3); // heading + 2 rows
    expect(node.stack[0].text).toBe('payment');
    expect(node.stack[0].style).toBe('h2');
    expect(node.stack[1].text).toBe('paymentMethod: 6');
    expect(node.stack[2].text).toBe('paymentDate: 01.02.2025');
    expect(node.style).toBe('paystyle');
  });

  it('renders only the heading for no rows and omits style', () => {
    const node = rec(paymentRenderer({ type: 'payment', rows: [] }, makeCtx({}), noRender));
    expect(node.stack).toHaveLength(1);
    expect(node.stack[0].text).toBe('payment');
    expect('style' in node).toBe(false);
  });

  it('skips rows whose value resolves empty (absent optional field)', () => {
    const ctx = makeCtx({ Fa: { FormaPlatnosci: '6' } });
    const node = rec(
      paymentRenderer(
        {
          type: 'payment',
          rows: [
            { label: 'paid', path: 'Fa.Zaplacono' }, // absent → skipped
            { label: 'paymentMethod', path: 'Fa.FormaPlatnosci', format: 'paymentForm' },
          ],
        },
        ctx,
        noRender,
      ),
    );
    expect(node.stack).toHaveLength(2); // heading + only the present row
    expect(node.stack[1].text).toBe('paymentMethod: Przelew');
  });

  it('renders a bank-account repeater: heading + one label:value line per field, per account', () => {
    const ctx = makeCtx({
      Fa: {
        Platnosc: {
          RachunekBankowy: [
            { NrRB: '11109000880000000100000001', SWIFT: 'WBKPPLPP', NazwaBanku: 'Bank A' },
            { NrRB: '22109000880000000100000002', NazwaBanku: 'Bank B' }, // no SWIFT → skipped
          ],
        },
      },
    });
    const node = rec(
      paymentRenderer(
        {
          type: 'payment',
          rows: [],
          accounts: {
            from: 'Fa.Platnosc.RachunekBankowy',
            heading: 'bankAccounts',
            fields: [
              { label: 'bankAccount', path: 'NrRB' },
              { label: 'swift', path: 'SWIFT' },
              { label: 'bankName', path: 'NazwaBanku' },
            ],
          },
        },
        ctx,
        noRender,
      ),
    );
    // heading(payment) + heading(bankAccounts) + [acc1: 3 lines] + [acc2: 2 lines]
    expect(node.stack).toHaveLength(7);
    expect(node.stack[1].text).toBe('bankAccounts');
    expect(node.stack[1].style).toBe('h2');
    expect(node.stack[2].text).toBe('bankAccount: 11109000880000000100000001');
    expect(node.stack[3].text).toBe('swift: WBKPPLPP');
    expect(node.stack[4].text).toBe('bankName: Bank A');
    // second account skipped its empty SWIFT
    expect(node.stack[5].text).toBe('bankAccount: 22109000880000000100000002');
    expect(node.stack[6].text).toBe('bankName: Bank B');
  });

  it('omits the accounts section entirely when the collection is absent', () => {
    const node = rec(
      paymentRenderer(
        {
          type: 'payment',
          rows: [{ label: 'paymentMethod', path: 'Fa.Platnosc.FormaPlatnosci', format: 'paymentForm' }],
          accounts: {
            from: 'Fa.Platnosc.RachunekBankowy',
            heading: 'bankAccounts',
            fields: [{ label: 'bankAccount', path: 'NrRB' }],
          },
        },
        makeCtx({ Fa: { Platnosc: { FormaPlatnosci: '6' } } }),
        noRender,
      ),
    );
    expect(node.stack).toHaveLength(2); // heading + the one payment row, no bank heading
    expect(node.stack[1].text).toBe('paymentMethod: Przelew');
  });

  it('throws in strict mode on a missing bank-account field binding', () => {
    const ctx = makeCtx(
      { Fa: { Platnosc: { RachunekBankowy: { NrRB: '111' } } } },
      { strict: true },
    );
    expect(() =>
      paymentRenderer(
        {
          type: 'payment',
          rows: [],
          accounts: {
            from: 'Fa.Platnosc.RachunekBankowy',
            fields: [{ label: 'swift', path: 'SWIFT' }], // absent in the account → strict throws
          },
        },
        ctx,
        noRender,
      ),
    ).toThrow(/Missing binding/);
  });
});

// ── annotations ─────────────────────────────────────────────────────────────

describe('annotationsRenderer', () => {
  it('renders a heading and one label:value line per field (+ style)', () => {
    const ctx = makeCtx({ Fa: { Adnotacje: { P_16: '1', P_17: '2' } } });
    const node = rec(
      annotationsRenderer(
        {
          type: 'annotations',
          fields: [
            { label: 'annotations', path: 'Fa.Adnotacje.P_16' },
            { label: 'annotations', path: 'Fa.Adnotacje.P_17' },
          ],
          style: 'astyle',
        },
        ctx,
        noRender,
      ),
    );
    expect(node.stack).toHaveLength(3); // heading + 2 fields
    expect(node.stack[0].text).toBe('annotations');
    expect(node.stack[1].text).toBe('annotations: 1');
    expect(node.stack[2].text).toBe('annotations: 2');
    expect(node.style).toBe('astyle');
  });

  it('renders only the heading for no fields and omits style', () => {
    const node = rec(annotationsRenderer({ type: 'annotations', fields: [] }, makeCtx({}), noRender));
    expect(node.stack).toHaveLength(1);
    expect('style' in node).toBe(false);
  });
});

// ── footer ────────────────────────────────────────────────────────────────

describe('footerRenderer', () => {
  it('renders a centered label-resolved line', () => {
    const node = rec(footerRenderer({ type: 'footer', label: 'page' }, makeCtx({}), noRender));
    expect(node.text).toBe('page');
    expect(node.alignment).toBe('center');
    expect('style' in node).toBe(false);
  });

  it('renders literal text with a style', () => {
    const node = rec(
      footerRenderer({ type: 'footer', text: 'Thank you', style: 'fstyle' }, makeCtx({}), noRender),
    );
    expect(node.text).toBe('Thank you');
    expect(node.style).toBe('fstyle');
  });

  it('renders an empty string when neither label nor text is set', () => {
    const node = rec(footerRenderer({ type: 'footer' }, makeCtx({}), noRender));
    expect(node.text).toBe('');
    expect(node.alignment).toBe('center');
  });
});
