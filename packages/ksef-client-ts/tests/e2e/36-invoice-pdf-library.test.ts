import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, generateKeyPairSync } from 'node:crypto';
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
import { VerificationLinkService } from 'ksef-client-ts';

// Companion to spec 35, which drives the same renderer through the CLI. The CLI
// is a strict subset of the library: it wires most of RenderOptions but cannot
// pass a template as an object at all. This spec covers what the command line
// cannot reach — baseQrUrl, theme, bilingualSeparator, strict, invoiceHash, and
// renderInvoicePdfFromTemplate — so a regression there is not invisible just
// because no flag exposes it.
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
/** Same host as the CLI preview set: a demo link is one a reader can click. */
const DEMO_QR_HOST = 'https://qr-demo.ksef.mf.gov.pl';

const require = createRequire(import.meta.url);

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

  /**
   * Each render below carries several library-only options at once, rather than
   * one option per PDF. The options are orthogonal — a separator does not
   * interact with a hash — so isolating them costs a PDF each and proves nothing
   * extra; what has to hold is that every one of them is exercised, which the
   * grid check at the end of this block asserts by reading the calls back.
   */
  describe('surface the CLI has no flag for', () => {
    it('takes a template object, and hands it theme.accent as a binding', async () => {
      // No built-in template consumes the accent — styles in the DSL are static,
      // so it cannot colour anything today and reaches a template only as a
      // string binding. Rendering through a template that reads that binding
      // keeps the option exercised instead of silently ignored.
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
          { type: 'text', path: 'opts.accent' },
          { type: 'totals', rows: [{ label: 'totalDue', path: 'Fa.P_15', format: 'money' }] },
        ],
      };
      await save(
        `${PREFIX}-01-template-object-accent`,
        renderInvoicePdfFromTemplate(bytes('e2e-vat-multi.xml'), template, {
          theme: { accent: '#B0004E' },
          logo: LOGO,
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('loads a custom template from a JSON file, and renders it strict', async () => {
      // fa3.xml populates every path the template names, so strict has nothing
      // to complain about — and would throw on a dot-path typo in the file.
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
      await save(
        `${PREFIX}-02-template-file-strict`,
        renderInvoicePdfFromFile(bytes('fa3.xml'), path, { strict: true }),
      );
    });

    it('accepts the XML as a string, with a custom separator and QR host', async () => {
      await save(
        `${PREFIX}-03-string-input-newline-separator-custom-qr-host`,
        renderInvoicePdf(text('e2e-vat-multi.xml'), 'fa3-default', {
          locale: 'en+pl',
          bilingualSeparator: '\n',
          qr: true,
          baseQrUrl: 'https://verify.example/ksef',
          qrLinks: true,
          totals: 'both',
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('takes a precomputed hash for Code I and a ready-made Code II', async () => {
      // Code II cannot be derived here — it is signed with the issuer's offline
      // certificate key — so the library takes it as a URL. Built with a
      // throwaway key so the code has a realistic density.
      const raw = bytes('e2e-vat-multi.xml');
      const invoiceHash = createHash('sha256').update(raw).digest('base64');
      const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string;
      const certificateQrUrl = new VerificationLinkService(
        DEMO_QR_HOST,
      ).buildCertificateVerificationUrl(
        'Nip',
        '1111111111',
        '1111111111',
        '01F20A5D352AE590',
        invoiceHash,
        key,
      );
      await save(
        `${PREFIX}-04-precomputed-hash-both-codes-links`,
        renderInvoicePdf(raw, 'fa3-default', {
          qr: true,
          env: 'demo',
          invoiceHash,
          certificateQrUrl,
          qrLinks: true,
          locale: 'en+uk',
        }),
      );
    });

    it('takes a Code I URL verbatim, skipping derivation entirely', async () => {
      await save(
        `${PREFIX}-05-supplied-code-i-url`,
        renderInvoicePdf(bytes('e2e-vat-multi.xml'), 'fa3-default', {
          qrUrl: `${DEMO_QR_HOST}/invoice/1111111111/15-01-2026/SUPPLIED-VERBATIM`,
          qrLinks: true,
          locale: 'pl+uk',
          notes: [{ head: 'Delivery terms', body: 'Goods released at the seller warehouse.' }],
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    // Receipt last, as in spec 35.
    it('renders a UPO through the library entry point', async () => {
      await save(`${PREFIX}-06-upo`, renderUpoPdf(bytes('upo-4_3.xml'), { locale: 'uk' }));
    });

    it('leaves no render option unexercised', () => {
      // The renders above each carry several options, which is what keeps the
      // preview set small — but it also makes it easy to drop the last use of
      // one while editing a row for another reason. So the option list is read
      // off the published type rather than kept by hand here: add a field to
      // RenderOptions and this fails until some render uses it.
      const dts = readFileSync(join(resolve(require.resolve('ksef-client-ts/pdf'), '..'), 'index.d.ts'), 'utf-8');
      const body = /interface RenderOptions \{([\s\S]*?)\n\}/.exec(dts)?.[1];
      expect(body, 'RenderOptions not found in the published types').toBeTruthy();

      const options = [...body!.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]!);
      expect(options.length, 'the type parse found nothing').toBeGreaterThan(10);

      const spec = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
      const unused = options.filter((name) => !new RegExp(`\\b${name}[,:]`).test(spec));
      expect(unused, 'render options no preview exercises').toEqual([]);
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
