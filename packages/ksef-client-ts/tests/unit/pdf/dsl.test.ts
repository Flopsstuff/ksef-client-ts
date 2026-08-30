import { describe, it, expect } from 'vitest';
import { validateTemplate } from '../../../src/pdf/template/dsl.js';
import type { InvoiceTemplate } from '../../../src/pdf/template/dsl.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import {
  builtinTemplateNames,
  getBuiltinTemplate,
} from '../../../src/pdf/template/builtin/index.js';

/** A small but structurally rich valid template (header + text + nested container). */
const VALID: unknown = {
  schema: 'FA(3)',
  page: { size: 'A4', orientation: 'portrait', margins: [40, 40, 40, 40] },
  defaultStyle: { fontSize: 9 },
  styles: { h1: { fontSize: 14, bold: true } },
  labels: { seller: 'Wystawca' },
  blocks: [
    { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', style: 'h1' },
    { type: 'text', text: 'Hello', style: 'h1' },
    {
      type: 'columns',
      columns: [
        { type: 'text', path: 'Fa.P_1', format: 'date' },
        {
          type: 'stack',
          stack: [
            { type: 'text', label: 'seller' },
            { type: 'divider' },
          ],
        },
      ],
    },
  ],
};

describe('validateTemplate', () => {
  it('returns the typed template for a valid input', () => {
    const template: InvoiceTemplate = validateTemplate(VALID);
    expect(template.schema).toBe('FA(3)');
    expect(template.blocks).toHaveLength(3);
    expect(template.blocks[0].type).toBe('header');
    // The recursive container is preserved through validation.
    const cols = template.blocks[2];
    expect(cols.type).toBe('columns');
  });

  it('validates a deeply nested container (columns → stack → blocks)', () => {
    const nested: unknown = {
      schema: 'FA(2)',
      blocks: [
        {
          type: 'stack',
          stack: [
            {
              type: 'columns',
              columns: [{ type: 'text', text: 'a' }, { type: 'spacer', height: 4 }],
            },
          ],
        },
      ],
    };
    expect(() => validateTemplate(nested)).not.toThrow();
  });

  it('throws KSeFValidationError for an unknown block type', () => {
    expect(() => validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'bogus' }] })).toThrow(
      KSeFValidationError,
    );
  });

  it("includes a path segment for an unknown block type", () => {
    try {
      validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'bogus' }] });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('blocks.0.type');
    }
  });

  it('throws for an extra/unknown key on a block (strict schema)', () => {
    try {
      validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'text', text: 'x', bogus: 1 }] });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('blocks.0');
      expect((e as Error).message).toContain('bogus');
    }
  });

  it('throws for an extra/unknown key on the root (strict schema)', () => {
    try {
      validateTemplate({ schema: 'FA(3)', blocks: [], bogus: 1 });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('(root)');
    }
  });

  it('throws for a missing required block field (lines without from)', () => {
    try {
      validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'lines', columns: [] }] });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('blocks.0.from');
    }
  });

  it('throws when the root omits blocks', () => {
    try {
      validateTemplate({ schema: 'FA(3)' });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('blocks');
    }
  });

  it('throws for an invalid schema id', () => {
    try {
      validateTemplate({ schema: 'ZZ', blocks: [] });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(KSeFValidationError);
      expect((e as Error).message).toContain('schema');
    }
  });

  it('exposes each issue as a details entry', () => {
    try {
      validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'lines', columns: [] }] });
      expect.unreachable('expected validateTemplate to throw');
    } catch (e) {
      const err = e as KSeFValidationError;
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details[0].message).toContain('blocks.0.from');
    }
  });
});

describe('a divider can be conditional', () => {
  it('accepts a `when`', () => {
    expect(() =>
      validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'divider', when: 'notes' }] }),
    ).not.toThrow();
  });

  it('still accepts a plain one', () => {
    expect(() => validateTemplate({ schema: 'FA(3)', blocks: [{ type: 'divider' }] })).not.toThrow();
  });
});

// The shapes `RepeatedSum` refuses at compile time are the ones the schema has
// always refused at runtime. Pinning them here keeps the two from drifting: the
// type is a mirror of these rules, and a template parsed from JSON never meets
// the type at all.
describe('a computed figure states exactly one source', () => {
  const totalsWith = (sumFrom: unknown): unknown => ({
    schema: 'FA(3)',
    blocks: [{ type: 'totals', rows: [{ label: 'totalDue', sumFrom }] }],
  });

  it('accepts a path, a path over a collection, and a fixed list', () => {
    expect(() => validateTemplate(totalsWith({ path: 'Fa.P_15' }))).not.toThrow();
    expect(() => validateTemplate(totalsWith({ from: 'Fa.ZaliczkaCzesciowa', path: 'P_15Z' }))).not.toThrow();
    expect(() => validateTemplate(totalsWith({ sum: ['Fa.P_13_1', 'Fa.P_14_1'] }))).not.toThrow();
  });

  it('refuses a figure with no source at all', () => {
    expect(() => validateTemplate(totalsWith({}))).toThrow(KSeFValidationError);
  });

  it('refuses both sources at once', () => {
    expect(() => validateTemplate(totalsWith({ path: 'Fa.P_15', sum: ['Fa.P_13_1'] }))).toThrow(
      KSeFValidationError,
    );
  });

  it('refuses a collection with nothing to read over it', () => {
    expect(() => validateTemplate(totalsWith({ from: 'Fa.ZaliczkaCzesciowa' }))).toThrow(
      KSeFValidationError,
    );
  });
});

// The payment renderer settles a computed row before it looks at any binding,
// so a row carrying both prints the sum under a label written for the reading —
// silently, since neither shape is wrong on its own.
describe('a payment row is either read or computed, never both', () => {
  const paymentWith = (row: Record<string, unknown>): unknown => ({
    schema: 'FA(3)',
    blocks: [{ type: 'payment', rows: [{ label: 'paid', ...row }] }],
  });

  it('accepts a label alone, a reading, and a computed figure', () => {
    expect(() => validateTemplate(paymentWith({}))).not.toThrow();
    expect(() => validateTemplate(paymentWith({ path: 'Fa.Platnosc.Zaplacono' }))).not.toThrow();
    expect(() =>
      validateTemplate(
        paymentWith({ sumFrom: { from: 'Fa.Platnosc.ZaplataCzesciowa', path: 'KwotaZaplatyCzesciowej' } }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['path', { path: 'Fa.P_15' }],
    ['from', { from: 'Fa.Platnosc.ZaplataCzesciowa' }],
    ['less', { less: { path: 'Fa.P_15' } }],
  ])('refuses a computed row that also carries %s', (_label, extra) => {
    expect(() => validateTemplate(paymentWith({ sumFrom: { sum: ['Fa.P_15'] }, ...extra }))).toThrow(
      KSeFValidationError,
    );
  });

  // Every built-in drives this schema, and two of them carry computed payment
  // rows — the refinement must not have made them invalid.
  it('leaves every built-in template valid', () => {
    for (const name of builtinTemplateNames()) {
      expect(() => validateTemplate(getBuiltinTemplate(name)), name).not.toThrow();
    }
  });
});
