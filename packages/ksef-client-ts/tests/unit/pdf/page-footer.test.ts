import { describe, it, expect } from 'vitest';
import { interpretTemplate, type RenderContext } from '../../../src/pdf/template/interpret.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { validateTemplate, type InvoiceTemplate } from '../../../src/pdf/template/dsl.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';
import type { Locale } from '../../../src/pdf/i18n/types.js';

/**
 * The page footer is a pdfmake callback rather than a content node, because the
 * page total is not known until the content has been laid out — a block cannot
 * produce it. These tests drive that callback directly.
 */

type FooterFn = (currentPage: number, pageCount: number) => {
  columns: Array<{ text: string; alignment: string; color?: string }>;
  margin: number[];
  style?: string;
};

function ctxFor(locale: Locale = 'pl'): RenderContext {
  return { root: {}, strict: false, label: makeLabelResolver(locale, {}), bindings: {}, flags: {} };
}

function footerOf(template: InvoiceTemplate, locale: Locale = 'pl'): FooterFn {
  const doc = interpretTemplate(template, ctxFor(locale), blockRegistry);
  return doc.footer as FooterFn;
}

const fa3 = () => getBuiltinTemplate('fa3-default')!;

describe('page footer', () => {
  it('is emitted as a callback, not as content', () => {
    expect(typeof footerOf(fa3())).toBe('function');
  });

  it('puts the attribution left and the page indicator right', () => {
    const [credit, pages] = footerOf(fa3())(1, 3).columns;
    expect(credit.alignment).toBe('left');
    expect(credit.text).toBe('Wygenerowano przez Flopsstuff/ksef-client-ts');
    expect(pages.alignment).toBe('right');
    expect(pages.text).toBe('Strona 1 z 3');
  });

  it('substitutes the numbers pdfmake supplies on each page', () => {
    const footer = footerOf(fa3());
    expect(footer(1, 3).columns[1].text).toBe('Strona 1 z 3');
    expect(footer(2, 3).columns[1].text).toBe('Strona 2 z 3');
    expect(footer(3, 3).columns[1].text).toBe('Strona 3 z 3');
  });

  it('reads as whole phrases in English and bilingually', () => {
    expect(footerOf(fa3(), 'en')(1, 2).columns[1].text).toBe('Page 1 of 2');
    // The indicator is one label carrying its own placeholders, so the two
    // grammars stay intact instead of interleaving into "Strona / Page 1 z / of 2".
    expect(footerOf(fa3(), 'en+pl')(1, 2).columns[1].text).toBe('Page 1 of 2 / Strona 1 z 2');
    expect(footerOf(fa3(), 'en+pl')(1, 2).columns[0].text).toBe(
      'Generated with / Wygenerowano przez Flopsstuff/ksef-client-ts',
    );
  });

  it('keeps the page indicator out of the muted credit colour', () => {
    const [credit, pages] = footerOf(fa3())(1, 1).columns;
    expect(pages.color).toBe('#333333');
    expect(credit.color).toBeUndefined(); // inherits the footer style
  });

  it('aligns with the page margins rather than the paper edge', () => {
    const template = fa3();
    expect(template.page?.margins).toEqual([40, 40, 40, 50]);
    expect(footerOf(template)(1, 1).margin).toEqual([40, 0, 40, 0]);
  });

  it('is absent when a template does not ask for one', () => {
    const bare: InvoiceTemplate = { schema: 'FA(3)', blocks: [{ type: 'divider' }] };
    expect(interpretTemplate(bare, ctxFor(), blockRegistry).footer).toBeUndefined();
  });

  it.each(['fa2-default', 'fa3-default', 'upo-4_2', 'upo-4_3'])('%s carries a footer', (name) => {
    expect(typeof footerOf(getBuiltinTemplate(name)!)).toBe('function');
  });
});

describe('the attribution is not template-configurable', () => {
  it('no built-in template carries the tool name', () => {
    for (const name of ['fa2-default', 'fa3-default', 'upo-4_2', 'upo-4_3']) {
      expect(JSON.stringify(getBuiltinTemplate(name))).not.toContain('Flopsstuff');
    }
  });

  it('a template cannot supply its own credit text', () => {
    expect(() =>
      validateTemplate({
        schema: 'FA(3)',
        pageFooter: { note: 'Some Other Vendor', style: 'footerNote' },
        blocks: [{ type: 'divider' }],
      }),
    ).toThrow();
  });

  it('but may still restyle the footer', () => {
    const template = validateTemplate({
      schema: 'FA(3)',
      page: { size: 'A4', margins: [20, 20, 20, 30] },
      pageFooter: { style: 'muted' },
      styles: { muted: { fontSize: 6 } },
      blocks: [{ type: 'divider' }],
    });
    const footer = footerOf(template)(1, 1);
    expect(footer.style).toBe('muted');
    expect(footer.margin).toEqual([20, 0, 20, 0]);
    expect(footer.columns[0].text).toContain('Flopsstuff/ksef-client-ts');
  });
});
