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

  it('renders bilingual pl+en labels', async () => {
    const bytes = await renderInvoicePdf(fa3, 'fa3-default', { locale: 'pl+en' });
    expect(isPdf(bytes)).toBe(true);
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
