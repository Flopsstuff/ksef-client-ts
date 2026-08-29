import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderInvoicePdf,
  renderInvoicePdfFromFile,
  renderInvoicePdfFromTemplate,
  renderUpoPdf,
  detectInvoiceVersion,
  detectUpoVersion,
  type InvoiceTemplate,
} from 'ksef-client-ts/pdf';

// Companion to spec 35, which drives the same renderer through the CLI. The CLI
// is a strict subset of the library: it wires five of the ten RenderOptions
// (locale, qr, ksefNumber, env, logo) and cannot pass a template as an object at
// all. This spec covers what the command line cannot reach — baseQrUrl, theme,
// bilingualSeparator, strict, invoiceHash, and renderInvoicePdfFromTemplate —
// so a regression there is not invisible just because no flag exposes it.
//
// It imports by package specifier on purpose: that resolves through the exports
// map to dist/, so the published artifact is what gets exercised, not src.
//
// Assertions stay shallow for the same reason as spec 35 — a complete PDF is
// written, and the rendered files are kept for review. Layout is judged by eye.
//
// Both specs render into the same directory, distinguished by a `lib-`/`cli-`
// prefix, so clearing is scoped to this spec's own files: wiping the directory
// would race the sibling spec under a parallel run.

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const fixtures = join(repoRoot, 'tests', 'fixtures', 'pdf');
const outDir = process.env.KSEF_PDF_OUT ?? join(repoRoot, '.pdf-preview');
const inputsDir = join(outDir, '_inputs');
const PREFIX = 'lib';

const fx = (name: string) => join(fixtures, name);
const bytes = (name: string) => new Uint8Array(readFileSync(fx(name)));
const text = (name: string) => readFileSync(fx(name), 'utf-8');

const KSEF_NUMBER = '1111111111-20260115-010000000000-00';
const LOGO = `data:image/png;base64,${readFileSync(fx('e2e-logo.png')).toString('base64')}`;

function isCompletePdf(file: string): boolean {
  const buf = readFileSync(file);
  return (
    buf.subarray(0, 5).toString('latin1') === '%PDF-' &&
    buf.subarray(-8).toString('latin1').trim().endsWith('%%EOF')
  );
}

async function save(name: string, render: Promise<Uint8Array>): Promise<string> {
  const out = join(outDir, `${name}.pdf`);
  const pdf = await render;
  expect(pdf, `${name} did not return bytes`).toBeInstanceOf(Uint8Array);
  writeFileSync(out, pdf);
  expect(isCompletePdf(out), `${name} is not a complete PDF`).toBe(true);
  return out;
}

describe('36 - `ksef-client-ts/pdf` renders beyond what the CLI exposes', () => {
  beforeAll(() => {
    mkdirSync(inputsDir, { recursive: true });
    for (const stale of readdirSync(outDir)) {
      if (stale.startsWith(`${PREFIX}-`)) rmSync(join(outDir, stale), { force: true });
    }
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`\n  library-rendered PDFs kept for review in ${outDir}\n`);
  });

  it('is imported from the built package, not from src', () => {
    const resolved = createRequire(import.meta.url).resolve('ksef-client-ts/pdf');
    expect(resolved, 'the spec must exercise dist/ through the exports map').toContain(
      join('dist', 'pdf'),
    );
  });

  describe('surface the CLI has no flag for', () => {
    it('accepts a template as an object', async () => {
      const template: InvoiceTemplate = {
        schema: 'FA(3)',
        page: { size: 'A4', margins: [40, 40, 40, 40] },
        styles: { title: { fontSize: 18, bold: true } },
        blocks: [
          { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', date: 'Fa.P_1' },
          { type: 'divider' },
          {
            type: 'parties',
            left: { label: 'seller', fields: ['Podmiot1.DaneIdentyfikacyjne.Nazwa'] },
            right: { label: 'buyer', fields: ['Podmiot2.DaneIdentyfikacyjne.Nazwa'] },
          },
          { type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15', format: 'money' }] },
        ],
      };
      await save(`${PREFIX}-01-template-object`, renderInvoicePdfFromTemplate(bytes('e2e-vat-multi.xml'), template));
    });

    it('loads a custom template from a JSON file', async () => {
      const path = join(inputsDir, 'lib-minimal-template.json');
      writeFileSync(
        path,
        JSON.stringify({
          schema: 'FA(3)',
          blocks: [
            { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', date: 'Fa.P_1' },
            { type: 'lines', from: 'Fa.FaWiersz', columns: [
              { label: 'name', path: 'P_7', width: '*' },
              { label: 'net', path: 'P_11', format: 'money', width: 70 },
            ] },
          ],
        }),
      );
      await save(`${PREFIX}-02-template-from-file`, renderInvoicePdfFromFile(bytes('e2e-vat-multi.xml'), path));
    });

    it('exposes theme.accent to a template as the `opts.accent` binding', async () => {
      // No built-in template consumes it — styles in the DSL are static, so an
      // accent cannot colour anything today; it reaches a template only as a
      // string binding. Rendering it through a template that actually reads the
      // binding keeps the option exercised instead of silently ignored.
      const template: InvoiceTemplate = {
        schema: 'FA(3)',
        blocks: [
          { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', date: 'Fa.P_1' },
          { type: 'text', path: 'opts.accent' },
          { type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15', format: 'money' }] },
        ],
      };
      await save(
        `${PREFIX}-03-theme-accent-binding`,
        renderInvoicePdfFromTemplate(bytes('e2e-vat-multi.xml'), template, {
          theme: { accent: '#B0004E' },
          logo: LOGO,
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('honours a custom bilingual separator', async () => {
      await save(
        `${PREFIX}-04-bilingual-newline-separator`,
        renderInvoicePdf(bytes('e2e-vat-multi.xml'), 'fa3-default', {
          locale: 'en+pl',
          bilingualSeparator: '\n',
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('overrides the QR base URL for an offline/non-standard verifier', async () => {
      await save(
        `${PREFIX}-05-custom-qr-base-url`,
        renderInvoicePdf(bytes('e2e-vat-multi.xml'), 'fa3-default', {
          qr: true,
          baseQrUrl: 'https://verify.example/ksef',
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('takes a precomputed invoice hash verbatim for the QR', async () => {
      const raw = bytes('e2e-vat-multi.xml');
      const invoiceHash = createHash('sha256').update(raw).digest('base64');
      await save(
        `${PREFIX}-06-precomputed-invoice-hash`,
        renderInvoicePdf(raw, 'fa3-default', { qr: true, invoiceHash, ksefNumber: KSEF_NUMBER }),
      );
    });

    it('renders in strict mode against a fixture that populates every binding', async () => {
      // fa3.xml exists precisely so the built-in templates can be rendered with
      // every dot-path resolved; strict turns a typo in our own preset into a
      // thrown error rather than a blank line.
      await save(`${PREFIX}-07-strict-mode`, renderInvoicePdf(bytes('fa3.xml'), 'fa3-default', { strict: true }));
    });

    it('accepts the XML as a string as well as bytes', async () => {
      await save(`${PREFIX}-08-string-input`, renderInvoicePdf(text('e2e-vat-multi.xml'), 'fa3-default'));
    });

    // Receipt last, as in spec 35.
    it('renders a UPO through the library entry point', async () => {
      await save(`${PREFIX}-09-upo`, renderUpoPdf(bytes('upo-4_3.xml'), { locale: 'en+pl' }));
    });
  });

  describe('detectors are part of the public surface', () => {
    it('identifies invoices and receipts, and rejects everything else', () => {
      expect(detectInvoiceVersion(text('e2e-vat-multi.xml'))).toBe('FA(3)');
      expect(detectInvoiceVersion(text('fa2.xml'))).toBe('FA(2)');
      expect(detectUpoVersion(text('upo-4_3.xml'))).toBe('UPO(4.3)');
      expect(detectUpoVersion(text('upo-4_2.xml'))).toBe('UPO(4.2)');
      expect(detectInvoiceVersion(text('upo-4_3.xml'))).toBeNull();
      expect(detectUpoVersion(text('e2e-vat-multi.xml'))).toBeNull();
      expect(detectInvoiceVersion('<Whatever/>')).toBeNull();
    });
  });

  describe('rejections surface as errors, not as blank pages', () => {
    it('rejects an unknown built-in template by name', async () => {
      await expect(renderInvoicePdf(bytes('fa3.xml'), 'no-such-template')).rejects.toThrow(
        /Unknown built-in template/,
      );
    });

    it('rejects a template file that does not exist', async () => {
      await expect(
        renderInvoicePdfFromFile(bytes('fa3.xml'), join(inputsDir, 'absent.json')),
      ).rejects.toThrow(/Failed to read template file/);
    });

    it('rejects a template object that fails validation', async () => {
      await expect(
        renderInvoicePdfFromTemplate(bytes('fa3.xml'), { schema: 'FA(3)' } as unknown as InvoiceTemplate),
      ).rejects.toThrow();
    });

    it('rejects a document the template does not target', async () => {
      await expect(renderInvoicePdf(bytes('upo-4_3.xml'), 'fa3-default')).rejects.toThrow(
        /not recognized as a FA\(3\)/,
      );
      await expect(renderInvoicePdf(bytes('fa2.xml'), 'fa3-default')).rejects.toThrow(
        /detected as FA\(2\)/,
      );
    });

    it('rejects a non-UPO document handed to renderUpoPdf', async () => {
      await expect(renderUpoPdf(bytes('fa3.xml'))).rejects.toThrow(/UPO/);
    });
  });
});
