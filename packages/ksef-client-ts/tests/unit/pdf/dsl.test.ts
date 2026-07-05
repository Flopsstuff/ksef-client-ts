import { describe, it, expect } from 'vitest';
import { validateTemplate } from '../../../src/pdf/template/dsl.js';
import type { InvoiceTemplate } from '../../../src/pdf/template/dsl.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';

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
