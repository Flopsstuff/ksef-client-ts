import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderInvoicePdf,
  renderInvoicePdfFromTemplate,
  renderUpoPdf,
  getBuiltinTemplate,
  builtinTemplateNames,
  detectInvoiceVersion,
  detectUpoVersion,
  normalizeVfs,
  type InvoiceTemplate,
  type PdfMakeLike,
} from 'ksef-client-ts/pdf';
import { VerificationLinkService } from 'ksef-client-ts';

// Companion to spec 35, which drives the same renderer through the CLI. The CLI
// is a strict subset of the library: it wires most of RenderOptions but cannot
// pass a template as an object at all. This spec covers what the command line
// cannot reach — baseQrUrl, bilingualSeparator, strict, invoiceHash, and
// renderInvoicePdfFromTemplate — so a regression there is not invisible just
// because no flag exposes it. Options the CLI does expose still appear here
// where they ride along; `theme` is one, since `--accent` landed.
//
// Each render carries several of those at once rather than one apiece: they are
// orthogonal, so isolating them costs a PDF each and proves nothing extra. What
// has to hold is that none is left unexercised, which the check at the end of
// the block asserts by reading the option list off the published types.
// Reading a template off disk is not among them at all: `./pdf` is isomorphic
// and never touches the filesystem, so the CLI's `--template-file` owns that
// path end to end in spec 35.
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
const PREFIX = 'lib';
/** Same host as the CLI preview set: the environment this suite drives. */
const TEST_QR_HOST = 'https://qr-test.ksef.mf.gov.pl';

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
    mkdirSync(outDir, { recursive: true });
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
    it('takes a template as an object — a built-in, rebranded', async () => {
      // Neither a built-in name nor a file: the caller hands over the template
      // itself, which is how a layout assembled at runtime — from settings, a
      // database, a tenant's branding — reaches the renderer. The CLI has no way
      // to express this.
      //
      // Starting from a built-in rather than from nothing is the realistic
      // shape of it, and the reason `getBuiltinTemplate` is public: writing a
      // full FA(3) layout by hand to change two colours is not a thing anyone
      // should have to do.
      const template = getBuiltinTemplate('fa3-default')!;
      template.styles = {
        ...template.styles,
        title: { ...template.styles?.title, fontSize: 30, color: '#1B4965' },
        h1: { ...template.styles?.h1, color: '#5FA8D3', characterSpacing: 2 },
        partyIdentity: { ...template.styles?.partyIdentity, bold: true },
      };
      template.labels = { ...template.labels, seller: 'Wystawca', buyer: 'Odbiorca' };

      await save(
        `${PREFIX}-01-template-object`,
        renderInvoicePdfFromTemplate(bytes('e2e-vat-multi.xml'), template, {
          logo: LOGO,
          ksefNumber: KSEF_NUMBER,
          qr: true,
          env: 'test',
        }),
      );
    });

    it('hands out a copy, so editing one does not repaint the built-in', async () => {
      // The built-ins are validated once at import and held for the life of the
      // process. Handing out the stored object would let the edit above leak
      // into every later render by that name — including one in another part of
      // the caller's program.
      const edited = getBuiltinTemplate('fa3-default')!;
      edited.styles = { ...edited.styles, title: { fontSize: 99, color: '#FF00FF' } };

      const fresh = getBuiltinTemplate('fa3-default')!;
      expect(fresh.styles?.title).not.toEqual(edited.styles?.title);
      expect(fresh.styles?.title).toMatchObject({ bold: true });

      // …and a render by name is unaffected too.
      await expect(renderInvoicePdf(bytes('fa3.xml'), 'fa3-default')).resolves.toBeInstanceOf(Uint8Array);
    });

    it('lists the built-ins it can hand over', () => {
      expect(builtinTemplateNames()).toEqual(
        expect.arrayContaining(['fa2-default', 'fa3-default', 'fa3-showcase', 'upo-4_2', 'upo-4_3']),
      );
      expect(getBuiltinTemplate('no-such-template')).toBeUndefined();
    });

    it('accepts the XML as a string, with a custom separator, QR host and accent', async () => {
      // The accent repaints `title`, `h1` and `h2`, so it only shows on a
      // template that uses those names — a built-in does, which is why it rides
      // here rather than on the hand-built template above.
      await save(
        `${PREFIX}-02-string-input-newline-separator-custom-qr-host-accent`,
        renderInvoicePdf(text('e2e-vat-multi.xml'), 'fa3-default', {
          locale: 'en+pl',
          bilingualSeparator: '\n',
          theme: { accent: '#B0004E' },
          qr: true,
          baseQrUrl: 'https://verify.example/ksef',
          qrLinks: true,
          totals: 'both',
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    it('takes a precomputed hash for Code I and a ready-made Code II, strictly', async () => {
      // `strict` has no flag, so this is the only place it is exercised on a
      // real page. It turns a dot-path typo into a thrown error instead of a
      // blank line, which only works because every binding the FA schema lets a
      // document omit is marked optional in the template.

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
        TEST_QR_HOST,
      ).buildCertificateVerificationUrl(
        'Nip',
        '1111111111',
        '1111111111',
        '01F20A5D352AE590',
        invoiceHash,
        key,
      );
      await save(
        `${PREFIX}-03-precomputed-hash-both-codes-links-strict`,
        renderInvoicePdf(raw, 'fa3-default', {
          qr: true,
          strict: true,
          env: 'test',
          invoiceHash,
          certificateQrUrl,
          qrLinks: true,
          locale: 'en+uk',
        }),
      );
    });

    it('takes a Code I URL verbatim, skipping derivation entirely', async () => {
      await save(
        `${PREFIX}-04-supplied-code-i-url`,
        renderInvoicePdf(bytes('e2e-vat-multi.xml'), 'fa3-default', {
          qrUrl: `${TEST_QR_HOST}/invoice/1111111111/15-01-2026/SUPPLIED-VERBATIM`,
          qrLinks: true,
          locale: 'pl+uk',
          notes: [{ head: 'Delivery terms', body: 'Goods released at the seller warehouse.' }],
          ksefNumber: KSEF_NUMBER,
        }),
      );
    });

    // What a browser does: load pdfmake yourself, assign the VFS, hand the
    // instance over. Nothing here is Node-specific except the two imports —
    // which is the point, since the renderer neither imports nor probes when an
    // engine is supplied. Exercised against the real pdfmake so an incompatible
    // instance shape would show up as a broken PDF, not a passing mock.
    it('renders through a caller-supplied pdfmake instance', async () => {
      const pdfMake = (await import('pdfmake/build/pdfmake.js')).default as PdfMakeLike;
      pdfMake.vfs = normalizeVfs(await import('pdfmake/build/vfs_fonts.js'));

      await save(
        `${PREFIX}-05-supplied-engine`,
        renderInvoicePdf(bytes('fa3.xml'), 'fa3-default', { pdfMake, locale: 'en' }),
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
