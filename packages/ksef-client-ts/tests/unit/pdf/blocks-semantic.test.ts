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
import { linesRenderer } from '../../../src/pdf/template/blocks/lines.js';
import { totalsRenderer } from '../../../src/pdf/template/blocks/totals.js';
import { paymentRenderer } from '../../../src/pdf/template/blocks/payment.js';
import { annotationsRenderer } from '../../../src/pdf/template/blocks/annotations.js';
import { footerRenderer } from '../../../src/pdf/template/blocks/footer.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';

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
              { label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
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
    expect(stack[3].style).toBe('partyDetails');
    expect(stack[4].style).toBe('partyDetails');
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
              { label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
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
              { label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1', 'Podmiot2.Adres.AdresL2'] },
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
      style: 'partyDetails',
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

  // The panel style covers the identity lines — name and tax number — which sit
  // directly under the heading and belong to no group.
  describe('panel style', () => {
    const styled = (group: Record<string, unknown>) =>
      rec(
        partiesRenderer(
          {
            type: 'parties',
            left: { label: 'seller', fields: [] },
            right: {
              label: 'buyer',
              style: 'partyIdentity',
              fields: ['Podmiot2.DaneIdentyfikacyjne.Nazwa', group],
            },
          },
          makeCtx({
            Podmiot2: {
              DaneIdentyfikacyjne: { Nazwa: 'Nabywca' },
              Adres: { AdresL1: 'ul. Testowa 1' },
            },
          }),
          noRender,
        ),
      ).columns[1].stack;

    it('styles the identity lines but leaves the heading alone', () => {
      const stack = styled({ label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1'] });
      expect(stack[0].text).toBe('buyer');
      expect(stack[0].style).toBe('h2'); // the heading keeps its own style
      expect(stack[1]).toEqual({ text: 'Nabywca', style: 'partyIdentity' });
    });

    it('lets a group override it for its own lines', () => {
      const stack = styled({ label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1'] });
      expect(stack[2].style).toBe('h2'); // the sub-heading, not the group style
      expect(stack[3]).toEqual({ text: 'ul. Testowa 1', style: 'partyDetails' });
    });

    it('passes it down to a group that declares none', () => {
      const stack = styled({ label: 'address', fields: ['Podmiot2.Adres.AdresL1'] });
      expect(stack[3].style).toBe('partyIdentity');
    });

    it('leaves value lines unstyled when the panel declares none', () => {
      const stack = rec(
        partiesRenderer(
          {
            type: 'parties',
            left: { label: 'seller', fields: [] },
            right: { label: 'buyer', fields: ['Podmiot2.DaneIdentyfikacyjne.Nazwa'] },
          },
          makeCtx({ Podmiot2: { DaneIdentyfikacyjne: { Nazwa: 'Nabywca' } } }),
          noRender,
        ),
      ).columns[1].stack;
      expect(stack[1]).toEqual({ text: 'Nabywca' });
    });
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

  it('puts the OFFLINE marker in the KSeF number\'s slot, right-aligned with it', () => {
    const node = rec(
      headerRenderer(
        {
          type: 'header',
          number: 'Fa.P_2',
          date: 'Fa.P_1',
          ksefNumber: 'opts.ksefNumber',
          offlineStyle: 'offline',
        },
        makeCtx({ Fa: { P_2: 'FV/2025/01', P_1: '2025-01-15' } }),
        noRender,
      ),
    );
    const [, right] = node.columns;
    expect(right.alignment).toBe('right'); // the marker rides the header's right stack
    expect(right.stack).toHaveLength(3);
    expect(right.stack[2]).toEqual({ text: 'offline', style: 'offline' }); // label('offline')
  });

  it('drops the marker once the invoice carries a KSeF number', () => {
    const ctx = makeCtx(
      { Fa: { P_2: 'FV/2025/01', P_1: '2025-01-15' } },
      { bindings: { 'opts.ksefNumber': '1111111111-20250115-010000000000-00' } },
    );
    const node = rec(
      headerRenderer(
        {
          type: 'header',
          number: 'Fa.P_2',
          date: 'Fa.P_1',
          ksefNumber: 'opts.ksefNumber',
          offlineStyle: 'offline',
        },
        ctx,
        noRender,
      ),
    );
    const [, right] = node.columns;
    expect(right.stack).toHaveLength(3);
    expect(right.stack[2].style).toBeUndefined();
    expect(right.stack[2].text).toContain('1111111111-20250115-010000000000-00');
  });

  // The marker stands in for the KSeF number, so a header that prints no such
  // number has no slot for it either.
  it('leaves the marker out when the header prints no KSeF number at all', () => {
    const node = rec(
      headerRenderer(
        { type: 'header', number: 'Fa.P_2', offlineStyle: 'offline' },
        makeCtx({ Fa: { P_2: 'FV/2025/01' } }),
        noRender,
      ),
    );
    const [, right] = node.columns;
    expect(right.stack).toHaveLength(1);
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
  // Every row is gated — on `when`, or on resolving to a value — so all of them
  // can be skipped. pdfmake reads body[0].length, so an empty totals table took
  // the render down rather than printing nothing.
  it('returns null when every row was skipped', () => {
    const ctx = makeCtx({ Fa: {} });
    expect(
      totalsRenderer(
        {
          type: 'totals',
          rows: [
            { label: 'net23', path: 'Fa.P_13_1', optional: true, format: 'money' },
            { label: 'vat23', path: 'Fa.P_14_1', optional: true, format: 'money' },
          ],
        },
        ctx,
        noRender,
      ),
    ).toBeNull();
  });

  it('still renders when one row survives', () => {
    const ctx = makeCtx({ Fa: { P_15: '123' } });
    expect(
      totalsRenderer(
        { type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15', format: 'money' }] },
        ctx,
        noRender,
      ),
    ).not.toBeNull();
  });

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
    // Not bold: emphasis in this table is a template's choice, row by row.
    expect(labelCell.bold).toBeUndefined();
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

// ── heading styles ───────────────────────────────────────────────────────────

/**
 * A block that prints a heading of its own reaches for a style name rather than
 * being handed one, so `headingStyle` is the only way a template can redirect
 * it. The default has to stay `h2`, since every built-in template defines that
 * and nothing else points at it.
 */
describe('headingStyle', () => {
  const partiesBlock = (headingStyle?: string) =>
    rec(
      partiesRenderer(
        {
          type: 'parties',
          ...(headingStyle ? { headingStyle } : {}),
          left: { label: 'seller', fields: [] },
          right: {
            label: 'buyer',
            fields: [{ label: 'address', style: 'partyDetails', fields: ['Podmiot2.Adres.AdresL1'] }],
          },
        },
        makeCtx({ Podmiot2: { Adres: { AdresL1: 'ul. Testowa 1' } } }),
        noRender,
      ),
    ).columns[1].stack;

  const paymentBlock = (headingStyle?: string) =>
    rec(
      paymentRenderer(
        {
          type: 'payment',
          ...(headingStyle ? { headingStyle } : {}),
          rows: [{ label: 'paid', path: 'Fa.Platnosc.Zaplacono' }],
          accounts: {
            from: 'Fa.Platnosc.RachunekBankowy',
            heading: 'bankAccounts',
            fields: [{ label: 'bankAccount', path: 'NrRB' }],
          },
        },
        makeCtx({ Fa: { Platnosc: { Zaplacono: '1', RachunekBankowy: { NrRB: 'PL01' } } } }),
        noRender,
      ),
    ).stack;

  const annotationsBlock = (headingStyle?: string) =>
    rec(
      annotationsRenderer(
        {
          type: 'annotations',
          ...(headingStyle ? { headingStyle } : {}),
          fields: [{ label: 'annotations', path: 'Fa.Adnotacje.P_16' }],
        },
        makeCtx({ Fa: { Adnotacje: { P_16: '2' } } }),
        noRender,
      ),
    ).stack;

  it('defaults to h2 in every block that prints a heading', () => {
    expect(partiesBlock()[0].style).toBe('h2');
    expect(paymentBlock()[0].style).toBe('h2');
    expect(annotationsBlock()[0].style).toBe('h2');
  });

  it('redirects the heading when a template names another style', () => {
    expect(partiesBlock('sectionHead')[0].style).toBe('sectionHead');
    expect(paymentBlock('sectionHead')[0].style).toBe('sectionHead');
    expect(annotationsBlock('sectionHead')[0].style).toBe('sectionHead');
  });

  it('leaves the sub-headings a block prints one level down', () => {
    // The address group inside a party panel, and the bank-account heading
    // inside payment: both are a level below the block's own heading, so
    // lifting section headings must not drag every label along with them.
    const [, groupHeading] = partiesBlock('sectionHead');
    expect(groupHeading.style).toBe('h2');
    expect(paymentBlock('sectionHead').find((n: { text: string }) => n.text === 'bankAccounts').style).toBe('h2');
  });

  it('still puts both levels on h2 by default, so a plain template looks flat', () => {
    expect(partiesBlock()[1].style).toBe('h2');
    expect(paymentBlock().find((n: { text: string }) => n.text === 'bankAccounts').style).toBe('h2');
  });

  it('leaves the value lines alone', () => {
    // Only headings move: the group keeps its own style for its content.
    expect(partiesBlock('sectionHead')[2].style).toBe('partyDetails');
    expect(paymentBlock('sectionHead')[1].style).toBeUndefined();
  });
});

// ── classification sub-lines ─────────────────────────────────────────────────

/**
 * A line-item column may carry a second, smaller line of classifiers. They live
 * there rather than in columns of their own because `Indeks`, `GTIN`, `PKWiU`,
 * `CN` and `PKOB` are all optional and a real invoice fills one or two — a
 * column's width is fixed for the whole table and cannot shrink away per row.
 */
describe('column sub-lines', () => {
  const column = (over: Record<string, unknown> = {}) => ({
    label: 'name',
    path: 'P_7',
    width: '*',
    sub: [
      { label: 'pkwiu', path: 'PKWiU', optional: true },
      { label: 'indeks', path: 'Indeks', optional: true },
      { label: 'gtin', path: 'GTIN', optional: true },
    ],
    ...over,
  });

  const cells = (row: Record<string, string>, over?: Record<string, unknown>) =>
    rec(
      linesRenderer(
        { type: 'lines', from: 'Fa.FaWiersz', columns: [column(over)] as never },
        makeCtx({ Fa: { FaWiersz: row } }),
        noRender,
      ),
    ).table.body;

  it('prints the classifiers an item carries, on one line under the value', () => {
    const [, [cell]] = cells({ P_7: 'Kalibracja', PKWiU: '71.20.19.0', Indeks: 'ABC-1' });
    expect(cell.stack.map((n: { text: string }) => n.text)).toEqual([
      'Kalibracja',
      'pkwiu 71.20.19.0 · indeks ABC-1',
    ]);
  });

  it('leaves out every classifier the item does not carry', () => {
    const [, [cell]] = cells({ P_7: 'Kalibracja', GTIN: '5901234123457' });
    expect(cell.stack[1].text).toBe('gtin 5901234123457');
  });

  it('emits a plain cell when the item carries none of them', () => {
    // Not a stack with an empty second line: an item without classifiers has to
    // look exactly as it did before the column grew them.
    const [, [cell]] = cells({ P_7: 'Kalibracja' });
    expect(cell).toEqual({ text: 'Kalibracja' });
  });

  it('takes the style the column names for that line', () => {
    const [, [cell]] = cells({ P_7: 'Kalibracja', PKWiU: '71.20.19.0' }, { subStyle: 'lineMeta' });
    expect(cell.stack[0].style).toBeUndefined(); // the value keeps the table's own
    expect(cell.stack[1].style).toBe('lineMeta');
  });

  it('joins with " · " by default and with whatever the column asks for', () => {
    const row = { P_7: 'Kalibracja', PKWiU: '71.20.19.0', Indeks: 'ABC-1' };
    expect(cells(row)[1][0].stack[1].text).toContain(' · ');
    expect(cells(row, { subSeparator: ' | ' })[1][0].stack[1].text).toBe(
      'pkwiu 71.20.19.0 | indeks ABC-1',
    );
  });

  it('applies the column style to the cell and to its header', () => {
    // `style` was declared on a column and read by nothing until the sub-lines
    // needed a home; a numeric column wanting `alignment: right` needs it on
    // both halves.
    const body = cells({ P_7: 'Kalibracja' }, { style: 'numeric' });
    expect(body[0][0].style).toBe('numeric'); // header
    expect(body[1][0].style).toBe('numeric'); // value
  });

  it('reads a sub field leniently when it is marked optional, even in strict', () => {
    const render = () =>
      linesRenderer(
        { type: 'lines', from: 'Fa.FaWiersz', columns: [column()] as never },
        makeCtx({ Fa: { FaWiersz: { P_7: 'Kalibracja' } } }, { strict: true }),
        noRender,
      );
    expect(render).not.toThrow();
  });
});

// ── value suffixes ───────────────────────────────────────────────────────────

/**
 * An amount and its currency are one fact. `suffixPath` appends the second
 * binding to the first so they print as `800,00 EUR`, rather than leaving the
 * reader to pair a number in one row with a currency code in another.
 */
describe('suffixPath', () => {
  const root = { Fa: { P_15: '800.00', KodWaluty: 'EUR', Platnosc: { FormaPlatnosci: '6' } } };

  const paymentRows = (rows: unknown[], over: Record<string, unknown> = {}) =>
    rec(
      paymentRenderer(
        { type: 'payment', rows: rows as never, ...over },
        makeCtx(root),
        noRender,
      ),
    ).stack.map((n: { text: string }) => n.text);

  it('appends the second binding after a space', () => {
    const rows = paymentRows([{ label: 'amountDueTotal', path: 'Fa.P_15', format: 'money', suffixPath: 'Fa.KodWaluty' }]);
    expect(rows).toContain('amountDueTotal: 800,00 EUR');
  });

  it('formats the value first, then appends', () => {
    // The formatter belongs to the value: the suffix must not be swept into it.
    const rows = paymentRows([{ label: 'amountDueTotal', path: 'Fa.P_15', suffixPath: 'Fa.KodWaluty' }]);
    expect(rows).toContain('amountDueTotal: 800.00 EUR'); // unformatted value, suffix still appended
  });

  it('prints the value alone when the suffix resolves empty', () => {
    const rows = paymentRows([{ label: 'amountDueTotal', path: 'Fa.P_15', format: 'money', suffixPath: 'Fa.Nieistnieje', optional: true }]);
    expect(rows).toContain('amountDueTotal: 800,00');
  });

  it('prints nothing at all when the value itself is absent', () => {
    // Never a bare currency code: an absent amount drops the whole row.
    const rows = paymentRows([{ label: 'amountDueTotal', path: 'Fa.Brak', format: 'money', suffixPath: 'Fa.KodWaluty', optional: true }]);
    expect(rows.some((t: string) => t.includes('EUR'))).toBe(false);
  });

  it('reads the suffix at the strictness of the value it follows', () => {
    // A typo in a required field's suffix is a typo, and strict is what exists
    // to catch it.
    const render = () =>
      paymentRenderer(
        { type: 'payment', rows: [{ label: 'amountDueTotal', path: 'Fa.P_15', suffixPath: 'Fa.KodWalutyy' }] as never },
        makeCtx(root, { strict: true }),
        noRender,
      );
    expect(render).toThrow(/KodWalutyy/);
  });
});

describe('the built-in templates restate the amount due with its currency', () => {
  it.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s does it in the payment block', (name) => {
    const payment = getBuiltinTemplate(name)!.blocks.find((b) => b.type === 'payment') as {
      rows: Array<{ label: string; path: string; suffixPath?: string }>;
    };
    // One row per reading of `P_15`, then the settled payable — the figures
    // restate the total, so they belong after the terms they settle.
    const amounts = payment.rows.slice(-4);
    expect(amounts.map((r) => r.path)).toEqual([
      'Fa.P_15',
      'Fa.P_15',
      'Fa.P_15',
      'Fa.Rozliczenie.DoZaplaty',
    ]);
    expect(amounts.map((r) => r.suffixPath)).toEqual(Array(4).fill('Fa.KodWaluty'));
  });
});

// ── row styles ───────────────────────────────────────────────────────────────

/**
 * `style` on a totals row or a payment field was declared and read by nothing.
 * It has a reader now, which is what lets a template pick out the one figure on
 * the page a reader is looking for.
 */
describe('row style', () => {
  it('covers both cells of a totals row', () => {
    // Label and figure are one line to a reader; styling half of it reads as a
    // mistake rather than as emphasis.
    const node = rec(
      totalsRenderer(
        {
          type: 'totals',
          rows: [
            { label: 'totalNet', path: 'Fa.P_13_1', format: 'money' },
            { label: 'totalDue', path: 'Fa.P_15', format: 'money', style: 'strong' },
          ],
        },
        makeCtx({ Fa: { P_13_1: '100.00', P_15: '123.00' } }),
        noRender,
      ),
    );
    const [plain, strong] = node.columns[1].table.body;
    expect(plain.map((c: { style?: string }) => c.style)).toEqual([undefined, undefined]);
    expect(strong.map((c: { style?: string }) => c.style)).toEqual(['strong', 'strong']);
  });

  it('reaches a payment row and a bank-account field', () => {
    const node = rec(
      paymentRenderer(
        {
          type: 'payment',
          rows: [
            { label: 'paymentMethod', path: 'Fa.Platnosc.FormaPlatnosci' },
            { label: 'amountDueTotal', path: 'Fa.P_15', style: 'strong' },
          ],
          accounts: {
            from: 'Fa.Platnosc.RachunekBankowy',
            fields: [{ label: 'bankAccount', path: 'NrRB', style: 'strong' }],
          },
        },
        makeCtx({ Fa: { P_15: '123.00', Platnosc: { FormaPlatnosci: '6', RachunekBankowy: { NrRB: 'PL01' } } } }),
        noRender,
      ),
    );
    const byText = Object.fromEntries(
      node.stack.map((n: { text: string; style?: string }) => [n.text.split(':')[0], n.style]),
    );
    expect(byText.paymentMethod).toBeUndefined();
    expect(byText.amountDueTotal).toBe('strong');
    expect(byText.bankAccount).toBe('strong');
  });
});

describe('the built-in templates pick out the amount due', () => {
  it.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s emphasises it in both places', (name) => {
    const template = getBuiltinTemplate(name)!;
    const totals = template.blocks.find((b) => b.type === 'totals') as {
      rows: Array<{ label: string; style?: string }>;
    };
    const payment = template.blocks.find((b) => b.type === 'payment') as {
      rows: Array<{ label: string; style?: string }>;
    };
    // The figure and the currency it is denominated in, wherever they appear.
    expect(totals.rows.find((r) => r.label === 'totalDue')!.style).toBe('strong');
    expect(totals.rows.find((r) => r.label === 'currency')!.style).toBe('strong');
    expect(payment.rows.find((r) => r.label === 'amountDueTotal')!.style).toBe('strong');
    expect(Object.keys(template.styles ?? {})).toContain('strong');
  });
});

describe('totals emphasise nothing on their own', () => {
  it('leaves every row plain until a template says otherwise', () => {
    const node = rec(
      totalsRenderer(
        {
          type: 'totals',
          rows: [
            { label: 'totalNet', path: 'Fa.P_13_1', format: 'money' },
            { label: 'totalDue', path: 'Fa.P_15', format: 'money', style: 'strong' },
          ],
        },
        makeCtx({ Fa: { P_13_1: '100.00', P_15: '123.00' } }),
        noRender,
      ),
    );
    const [plain, strong] = node.columns[1].table.body;
    // A column of bold labels emphasises everything and so emphasises nothing.
    expect(plain.every((c: { bold?: boolean }) => c.bold === undefined)).toBe(true);
    expect(strong.every((c: { style?: string }) => c.style === 'strong')).toBe(true);
  });
});
