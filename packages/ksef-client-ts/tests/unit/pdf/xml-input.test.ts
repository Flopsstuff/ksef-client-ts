import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeXmlBytes, toXmlString } from '../../../src/pdf/xml-input.js';

/**
 * The renderer has to read the document the same way whichever encoding its
 * bytes are in. Rendered PDFs differ run to run (creation date, file id), so
 * the comparison is on the document definition handed to pdfmake.
 */
const captured: Array<Record<string, unknown>> = [];

vi.mock('pdfmake/build/pdfmake.js', () => ({
  default: {
    createPdf(docDefinition: Record<string, unknown>) {
      captured.push(docDefinition);
      return {
        getStream() {
          const handlers: Record<string, (arg?: never) => void> = {};
          return {
            on(event: string, cb: (arg?: never) => void) {
              handlers[event] = cb;
            },
            end() {
              (handlers.data as unknown as (c: Uint8Array) => void)?.(Uint8Array.from([37, 80]));
              handlers.end?.();
            },
          };
        },
      };
    },
  },
}));

vi.mock('pdfmake/build/vfs_fonts.js', () => ({ default: { 'Roboto-Regular.ttf': '' } }));

const { renderInvoicePdf, renderUpoPdf } = await import('../../../src/pdf/index.js');

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/pdf/${name}`, import.meta.url), 'utf8');
const fa3 = fixture('fa3.xml');
const fa2 = fixture('fa2.xml');
const upo = fixture('upo-4_3.xml');

const BOM = '﻿';

function utf16le(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf16le'));
}

function utf16be(text: string): Uint8Array {
  const bytes = utf16le(text);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    [bytes[i], bytes[i + 1]] = [bytes[i + 1]!, bytes[i]!];
  }
  return bytes;
}

/** The fixture re-declared as UTF-16, the way a UTF-16 file would carry it. */
function asUtf16Document(xml: string): string {
  expect(xml).toMatch(/encoding="utf-8"/);
  return xml.replace(/encoding="utf-8"/, 'encoding="UTF-16"');
}

/**
 * The document handed to pdfmake, as data. Table layouts carry callbacks that
 * are fresh closures on every render, so they are dropped from the comparison.
 */
async function docDefinition(render: () => Promise<Uint8Array>): Promise<unknown> {
  captured.length = 0;
  await render();
  expect(captured).toHaveLength(1);
  return JSON.parse(JSON.stringify(captured[0]));
}

describe('decodeXmlBytes', () => {
  const xml = '<?xml version="1.0"?><a>Zażółć gęślą jaźń €</a>';

  it('decodes UTF-8 without a BOM', () => {
    expect(decodeXmlBytes(new TextEncoder().encode(xml))).toBe(xml);
  });

  it('decodes UTF-8 and drops its BOM', () => {
    expect(decodeXmlBytes(new TextEncoder().encode(BOM + xml))).toBe(xml);
  });

  it('decodes UTF-16LE with a BOM and drops it', () => {
    const bytes = utf16le(BOM + xml);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe]);
    expect(decodeXmlBytes(bytes)).toBe(xml);
  });

  it('decodes UTF-16LE without a BOM', () => {
    const bytes = utf16le(xml);
    expect([bytes[0], bytes[1]]).toEqual([0x3c, 0x00]);
    expect(decodeXmlBytes(bytes)).toBe(xml);
  });

  it('decodes UTF-16BE with a BOM and drops it', () => {
    const bytes = utf16be(BOM + xml);
    expect([bytes[0], bytes[1]]).toEqual([0xfe, 0xff]);
    expect(decodeXmlBytes(bytes)).toBe(xml);
  });

  it('decodes UTF-16BE without a BOM', () => {
    const bytes = utf16be(xml);
    expect([bytes[0], bytes[1]]).toEqual([0x00, 0x3c]);
    expect(decodeXmlBytes(bytes)).toBe(xml);
  });

  it('decodes characters outside the BMP from both byte orders', () => {
    const astral = '<a>\u{1F9FE}</a>';
    expect(decodeXmlBytes(utf16le(astral))).toBe(astral);
    expect(decodeXmlBytes(utf16be(astral))).toBe(astral);
  });

  it('turns a dangling byte of odd-length UTF-16 into one replacement character', () => {
    const le = utf16le(xml);
    const be = utf16be(xml);
    const withTail = (bytes: Uint8Array) => Uint8Array.from([...bytes, 0x0a]);
    expect(decodeXmlBytes(withTail(le))).toBe(`${xml}�`);
    expect(decodeXmlBytes(withTail(be))).toBe(`${xml}�`);
  });

  it('leaves the input it was given untouched', () => {
    const bytes = utf16be(BOM + xml);
    const copy = Uint8Array.from(bytes);
    decodeXmlBytes(bytes);
    expect(bytes).toEqual(copy);
  });

  it('decodes empty and one-byte input without throwing', () => {
    expect(decodeXmlBytes(new Uint8Array())).toBe('');
    expect(decodeXmlBytes(Uint8Array.from([0x3c]))).toBe('<');
  });
});

describe('toXmlString', () => {
  it('drops a leading BOM from a string and otherwise returns it as is', () => {
    expect(toXmlString(`${BOM}<a/>`)).toBe('<a/>');
    expect(toXmlString('<a/>')).toBe('<a/>');
  });
});

describe('rendering UTF-16 input', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('carries non-ASCII text, so a wrong decode would show', () => {
    expect(/[^\x00-\x7f]/.test(fa3)).toBe(true);
  });

  const encodings = [
    ['UTF-16LE with BOM', (xml: string) => utf16le(BOM + asUtf16Document(xml))],
    ['UTF-16LE without BOM', (xml: string) => utf16le(asUtf16Document(xml))],
    ['UTF-16BE with BOM', (xml: string) => utf16be(BOM + asUtf16Document(xml))],
    ['UTF-16BE without BOM', (xml: string) => utf16be(asUtf16Document(xml))],
    ['UTF-8 with BOM', (xml: string) => new TextEncoder().encode(BOM + xml)],
  ] as const;

  it.each(encodings)('renders an FA(3) invoice in %s as it renders the UTF-8 one', async (_, encode) => {
    const expected = await docDefinition(() => renderInvoicePdf(fa3, 'fa3-default'));
    const actual = await docDefinition(() => renderInvoicePdf(encode(fa3), 'fa3-default'));
    expect(actual).toEqual(expected);
  });

  it.each(encodings)('recognizes an FA(2) invoice in %s', async (_, encode) => {
    const expected = await docDefinition(() => renderInvoicePdf(fa2, 'fa2-default'));
    const actual = await docDefinition(() => renderInvoicePdf(encode(fa2), 'fa2-default'));
    expect(actual).toEqual(expected);
  });

  it.each(encodings)('recognizes a UPO receipt in %s', async (_, encode) => {
    const expected = await docDefinition(() => renderUpoPdf(upo));
    const actual = await docDefinition(() => renderUpoPdf(encode(upo)));
    expect(actual).toEqual(expected);
  });

  it('accepts a string that starts with a BOM', async () => {
    const expected = await docDefinition(() => renderInvoicePdf(fa3, 'fa3-default'));
    const actual = await docDefinition(() => renderInvoicePdf(BOM + fa3, 'fa3-default'));
    expect(actual).toEqual(expected);
  });

  it('hashes the UTF-16 bytes as given for the QR code, not the decoded text', async () => {
    const bytes = utf16be(BOM + asUtf16Document(fa3));
    const hash = createHash('sha256').update(bytes).digest('base64url');
    const doc = await docDefinition(() =>
      renderInvoicePdf(bytes, 'fa3-default', { qr: true, qrLinks: true }),
    );
    expect(JSON.stringify(doc)).toContain(`/${hash}`);
  });
});
