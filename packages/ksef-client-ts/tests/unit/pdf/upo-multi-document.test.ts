import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { interpretTemplate } from '../../../src/pdf/template/interpret.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';
import { renderUpoPdf } from '../../../src/pdf/index.js';

const fx = (p: string) => readFileSync(new URL(`../../fixtures/${p}`, import.meta.url), 'utf8');

/** Clone the fixture's single `<Dokument>` into an n-document session UPO. */
function withDocuments(xml: string, count: number): string {
  const start = xml.indexOf('<Dokument>');
  const end = xml.indexOf('</Dokument>') + '</Dokument>'.length;
  const first = xml.slice(start, end);
  const clones = Array.from({ length: count - 1 }, (_, i) =>
    first
      .replace('010000000000-00', `${String(i + 2).padStart(2, '0')}0000000000-00`)
      .replace('FA/2025/01/001', `FA/2025/01/00${i + 2}`),
  );
  return xml.slice(0, end) + '\n' + clones.join('\n') + xml.slice(end);
}

function renderTree(xml: string, templateName: string): string {
  const template = getBuiltinTemplate(templateName)!;
  const parsed = parseXmlForPdf(xml);
  const ctx = {
    root: (parsed as Record<string, unknown>).Potwierdzenie,
    strict: false,
    label: makeLabelResolver('en', {}),
    bindings: {},
    flags: {},
  };
  return JSON.stringify(interpretTemplate(template, ctx, blockRegistry));
}

describe.each([
  ['upo-4_3', 'pdf/upo-4_3.xml'],
  ['upo-4_2', 'pdf/upo-4_2.xml'],
])('%s renders every document in a session UPO', (templateName, fixture) => {
  const single = fx(fixture);

  it('keeps rendering a single-document receipt', () => {
    const tree = renderTree(single, templateName);
    const sessionRef = /<NumerReferencyjnySesji>([^<]+)</.exec(single)![1];
    expect(tree).toContain('FA/2025/01/001');
    expect(tree).toContain(sessionRef);
  });

  it('renders all three invoices of a three-document receipt', () => {
    const tree = renderTree(withDocuments(single, 3), templateName);
    expect(tree).toContain('FA/2025/01/001');
    expect(tree).toContain('FA/2025/01/002');
    expect(tree).toContain('FA/2025/01/003');
  });

  it('emits one field group per document, separated by dividers', () => {
    const template = getBuiltinTemplate(templateName)!;
    const parsed = parseXmlForPdf(withDocuments(single, 4));
    const ctx = {
      root: (parsed as Record<string, unknown>).Potwierdzenie,
      strict: false,
      label: makeLabelResolver('en', {}),
      bindings: {},
      flags: {},
    };
    const doc = interpretTemplate(template, ctx, blockRegistry);
    const tree = JSON.stringify(doc);

    // Each document contributes its own KSeF-number row, and consecutive
    // documents are separated by a divider (3 for 4 documents).
    expect(tree.split('"KSeF document number"')).toHaveLength(5);
    const group = (doc.content as Array<Record<string, unknown>>).find(
      (n) => Array.isArray(n.stack) && JSON.stringify(n).includes('KSeF document number'),
    ) as { stack: unknown[] };
    // Count dividers by their shape — a one-cell rule sized to the content
    // width. A spacer is a bare empty canvas, with no table around it.
    expect(JSON.stringify(group).split('"body":[[{"canvas":[]}]]')).toHaveLength(4);
  });

  it('keeps every field on the page instead of clipping wide records', () => {
    const template = getBuiltinTemplate(templateName)!;
    const parsed = parseXmlForPdf(single);
    const ctx = {
      root: (parsed as Record<string, unknown>).Potwierdzenie,
      strict: false,
      label: makeLabelResolver('en', {}),
      bindings: {},
      flags: {},
    };
    const tree = JSON.stringify(interpretTemplate(template, ctx, blockRegistry));
    // A table would have forced the hash and both dates onto one row with the
    // 35-character KSeF number; stacked rows carry all of them.
    for (const label of ['KSeF document number', 'Invoice number', 'Issue date', 'KSeF number assignment date', 'Document hash']) {
      expect(tree).toContain(label);
    }
  });
});

describe('multi-document UPO end to end', () => {
  it('produces a valid PDF', async () => {
    const bytes = await renderUpoPdf(withDocuments(fx('pdf/upo-4_3.xml'), 3));
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});
