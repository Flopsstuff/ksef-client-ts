import { describe, it, expect } from 'vitest';
import { loadPdfMake, createPdfBuffer } from '../../../src/pdf/fonts.js';
import { renderInvoicePdfFromTemplate } from '../../../src/pdf/index.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { interpretTemplate, type RenderContext } from '../../../src/pdf/template/interpret.js';
import type { InvoiceTemplate, PageConfig } from '../../../src/pdf/template/dsl.js';

/**
 * A divider used to be a canvas line of a constant 515pt — portrait A4 with
 * 40pt margins, and nothing else. The DSL lets a template pick its page size,
 * its orientation and its margins, so that constant was short on some pages and
 * hung past the margin on others. These read the line back out of the PDF and
 * check it against the geometry the template asked for.
 */

const ctx: RenderContext = {
  root: {},
  strict: false,
  label: (k) => k,
  bindings: {},
  flags: {},
};

const templateWith = (page: PageConfig): InvoiceTemplate => ({
  schema: 'FA(3)',
  page,
  blocks: [{ type: 'divider' }],
});

/**
 * The drawn line, as `[x1, x2]` in PDF user space. `compress: false` keeps the
 * content stream readable; pdfmake writes a stroke as `x y m` / `x y l`.
 */
async function ruleExtent(page: PageConfig): Promise<[number, number]> {
  const doc = interpretTemplate(templateWith(page), ctx, blockRegistry);
  const bytes = await createPdfBuffer(await loadPdfMake(), { ...doc, compress: false });
  const stream = Buffer.from(bytes).toString('latin1');
  const strokes = stream.match(/([-\d.]+) [-\d.]+ m\n([-\d.]+) [-\d.]+ l/g) ?? [];
  expect(strokes, 'the divider drew no line').toHaveLength(1);
  const [, x1, x2] = /([-\d.]+) [-\d.]+ m\n([-\d.]+) [-\d.]+ l/.exec(strokes[0]!)!;
  return [Number(x1), Number(x2)];
}

/** A4 is 595.28 × 841.89pt; A5 is 419.53 × 595.28. */
const CASES: Array<{ name: string; page: PageConfig; left: number; right: number }> = [
  { name: 'portrait A4', page: { size: 'A4', margins: [40, 40, 40, 50] }, left: 40, right: 555.28 },
  { name: 'landscape A4', page: { size: 'A4', orientation: 'landscape', margins: [40, 40, 40, 50] }, left: 40, right: 801.89 },
  { name: 'portrait A5', page: { size: 'A5', margins: [40, 40, 40, 50] }, left: 40, right: 379.53 },
  { name: 'A4 with narrow margins', page: { size: 'A4', margins: [20, 40, 20, 50] }, left: 20, right: 575.28 },
];

describe('a divider spans the content width of the page it is drawn on', () => {
  it.each(CASES)('$name', async ({ page, left, right }) => {
    const [x1, x2] = await ruleExtent(page);
    expect(x1).toBeCloseTo(left, 1);
    expect(x2).toBeCloseTo(right, 1);
  }, 30000);

  it('costs no vertical space, so a page of rules is still one page', async () => {
    // The rule replaced a zero-height canvas, and a template that separates
    // many short sections must not pay a line of leading for each one.
    const template: InvoiceTemplate = {
      schema: 'FA(3)',
      page: { size: 'A4', margins: [40, 40, 40, 50] },
      blocks: Array.from({ length: 300 }, () => ({ type: 'divider' as const })),
    };
    const doc = interpretTemplate(template, ctx, blockRegistry);
    const bytes = await createPdfBuffer(await loadPdfMake(), doc);
    const pages = (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(1);
  }, 30000);

  it('still renders through the public entry point', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza></Naglowek>
</Faktura>`;
    const bytes = await renderInvoicePdfFromTemplate(
      xml,
      templateWith({ size: 'A4', orientation: 'landscape' }) as never,
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  }, 30000);
});
