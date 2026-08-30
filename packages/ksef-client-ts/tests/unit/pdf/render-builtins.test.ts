import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderInvoicePdf, renderUpoPdf } from '../../../src/pdf/index.js';

const fx = (p: string) => readFileSync(new URL(`../../fixtures/${p}`, import.meta.url), 'utf8');
const fa2 = fx('pdf/fa2.xml');
const fa3 = fx('pdf/fa3.xml');
const upo43 = fx('pdf/upo-4_3.xml');
const upo42 = fx('pdf/upo-4_2.xml');

const head = (b: Uint8Array) => Buffer.from(b.subarray(0, 5)).toString('latin1');
const tail = (b: Uint8Array) => Buffer.from(b.subarray(-6)).toString('latin1').trim();
const isPdf = (b: Uint8Array) => head(b) === '%PDF-' && tail(b).endsWith('%%EOF');

describe('built-in templates render valid PDFs', () => {
  it('fa2-default renders FA(2)', async () => {
    expect(isPdf(await renderInvoicePdf(fa2, 'fa2-default'))).toBe(true);
  });

  it('fa3-default renders FA(3)', async () => {
    expect(isPdf(await renderInvoicePdf(fa3, 'fa3-default'))).toBe(true);
  });

  it('upo-4_3 renders via renderUpoPdf (auto-detected version)', async () => {
    expect(isPdf(await renderUpoPdf(upo43))).toBe(true);
  });

  it('upo-4_2 renders via renderUpoPdf (auto-detected version)', async () => {
    expect(isPdf(await renderUpoPdf(upo42))).toBe(true);
  });

  it('fa3-showcase renders FA(3)', async () => {
    // Registered like any other built-in, so it has to keep rendering: the DSL
    // lints check its shape, this checks that the shape still produces a page.
    expect(isPdf(await renderInvoicePdf(fa3, 'fa3-showcase', { qr: true, qrLinks: true }))).toBe(true);
  });

  it('rejects a non-UPO document in renderUpoPdf', async () => {
    await expect(renderUpoPdf(fa3)).rejects.toThrow(/UPO/);
  });
});

describe('built-in templates in strict mode against full fixtures', () => {
  // valid-fa2 / valid-fa3 populate every path the default templates reference,
  // so a dot-path typo in our own preset would surface as a thrown error here.
  it('fa2-default is strict-clean', async () => {
    expect(isPdf(await renderInvoicePdf(fa2, 'fa2-default', { strict: true }))).toBe(true);
  });

  it('fa3-default is strict-clean', async () => {
    expect(isPdf(await renderInvoicePdf(fa3, 'fa3-default', { strict: true }))).toBe(true);
  });
});

describe('QR embedding', () => {
  it('renders fa3-default with qr enabled without error', async () => {
    const bytes = await renderInvoicePdf(fa3, 'fa3-default', { qr: true, ksefNumber: '1234567890-20250115-ABCDEF-01' });
    expect(isPdf(bytes)).toBe(true);
  });

  it.each(['pl+en', 'en+pl'] as const)('renders bilingual %s labels', async (locale) => {
    const bytes = await renderInvoicePdf(fa3, 'fa3-default', { locale });
    expect(isPdf(bytes)).toBe(true);
  });
});

/**
 * The two KSeF verification codes reach the renderer differently: Code I is
 * derived from the document (or handed over ready-made), while Code II is
 * always supplied — its URL carries a signature made with the issuer's offline
 * certificate key, which this module never sees.
 *
 * A code itself leaves no readable text in the PDF: pdfmake draws it as one
 * vector rectangle per module, so the URL is nowhere in the bytes. What is
 * observable is the link annotation, which carries the same URL verbatim — so
 * these render with `qrLinks` on and read the URL back out of the annotation.
 */
describe('two verification codes', () => {
  const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
  const CODE_II =
    'https://qr.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/HASH/SIGNATURE';
  const CODE_I_CUSTOM = 'https://qr-test.ksef.mf.gov.pl/invoice/9999999999/01-01-2000/NOTDERIVABLE';

  it('derives Code I from the document', async () => {
    const out = text(await renderInvoicePdf(fa3, 'fa3-default', { qr: true, qrLinks: true }));
    expect(out).toContain('qr.ksef.mf.gov.pl/invoice/');
  });

  it('uses a supplied Code I verbatim, without deriving one', async () => {
    // The date and NIP here appear nowhere in the fixture, so a derived URL
    // could not look like this.
    const out = text(await renderInvoicePdf(fa3, 'fa3-default', { qrUrl: CODE_I_CUSTOM, qrLinks: true }));
    expect(out).toContain(CODE_I_CUSTOM);
    expect(out).not.toContain('qr.ksef.mf.gov.pl/invoice/');
  });

  it('prints Code II beside Code I', async () => {
    const out = text(
      await renderInvoicePdf(fa3, 'fa3-default', { qr: true, certificateQrUrl: CODE_II, qrLinks: true }),
    );
    expect(out).toContain(CODE_II);
    expect(out).toContain('qr.ksef.mf.gov.pl/invoice/');
  });

  it('prints Code II on its own, for an invoice still waiting for its number', async () => {
    const out = text(await renderInvoicePdf(fa3, 'fa3-default', { certificateQrUrl: CODE_II, qrLinks: true }));
    expect(out).toContain(CODE_II);
  });

  it('leaves no trace of Code II when none is supplied', async () => {
    const out = text(await renderInvoicePdf(fa3, 'fa3-default', { qr: true, qrLinks: true }));
    expect(out).toContain('qr.ksef.mf.gov.pl/invoice/');
    expect(out).not.toContain('/certificate/');
  });

  it('makes each code clickable when asked', async () => {
    const out = text(
      await renderInvoicePdf(fa3, 'fa3-default', { qr: true, certificateQrUrl: CODE_II, qrLinks: true }),
    );
    expect(out).toContain('/URI');
    expect(out).toContain(CODE_II);
  });

  it('embeds no link annotation by default', async () => {
    const out = text(await renderInvoicePdf(fa3, 'fa3-default', { qr: true, certificateQrUrl: CODE_II }));
    expect(out).not.toContain('/URI');
  });

  it('renders the same set through fa2-default', async () => {
    const out = text(
      await renderInvoicePdf(fa2, 'fa2-default', { qr: true, certificateQrUrl: CODE_II, qrLinks: true }),
    );
    expect(out).toContain(CODE_II);
    expect(out).toContain('/URI');
  });
});

describe('a template rejects a document it does not target', () => {
  it('rejects a UPO fed to an invoice template', async () => {
    await expect(renderInvoicePdf(upo43, 'fa3-default')).rejects.toThrow(/not recognized as a FA\(3\)/);
  });

  it('rejects an invoice fed to a UPO template', async () => {
    await expect(renderInvoicePdf(fa3, 'upo-4_3')).rejects.toThrow(/not recognized as a UPO\(4\.3\)/);
  });

  it('rejects arbitrary XML', async () => {
    await expect(renderInvoicePdf('<Whatever><x>1</x></Whatever>', 'fa3-default')).rejects.toThrow(
      /not recognized as a FA\(3\)/,
    );
  });

  it('still reports a concrete mismatch when the version is detectable', async () => {
    await expect(renderInvoicePdf(fa2, 'fa3-default')).rejects.toThrow(/detected as FA\(2\)/);
  });

  it('rejects a UPO(4.2) document fed to the UPO(4.3) template', async () => {
    await expect(renderInvoicePdf(upo42, 'upo-4_3')).rejects.toThrow(/detected as UPO\(4\.2\)/);
  });
});
