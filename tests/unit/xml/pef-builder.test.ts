import { describe, it, expect } from 'vitest';
import {
  buildPefXml,
  isPefUblDocumentInput,
  PEF_NAMESPACE,
} from '../../../src/xml/pef-builder.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import type { PefUblDocumentInput } from '../../../src/xml/types.js';

// ── Root detection + namespace injection ────────────────────────────────

describe('buildPefXml — Invoice root', () => {
  it('produces <Invoice> root with Invoice-2 xmlns and full UBL namespace set', () => {
    const xml = buildPefXml({ Invoice: { ID: 'INV-001' } });
    expect(xml).toContain(
      `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"`,
    );
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF}"`);
    expect(xml).toContain(
      'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
    );
    expect(xml).toContain(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    );
    expect(xml).toContain(
      'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    );
    expect(xml).toContain('xmlns:cbc-pl="urn:pl:extended:CommonBasicComponents-2"');
    expect(xml).toContain('xmlns:cac-pl="urn:pl:extended:CommonAggregateComponents-2"');
    // Content is preserved.
    expect(xml).toContain('<ID>INV-001</ID>');
    expect(xml).toContain('</Invoice>');
  });

  it('accepts matching schema option PEF', () => {
    const xml = buildPefXml({ Invoice: { ID: 'INV-001' } }, { schema: 'PEF' });
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF}"`);
  });
});

describe('buildPefXml — CreditNote root', () => {
  it('produces <CreditNote> root with CreditNote-2 xmlns', () => {
    const xml = buildPefXml({ CreditNote: { ID: 'CN-001' } });
    expect(xml).toContain(
      `<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"`,
    );
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF_KOR}"`);
    expect(xml).toContain('<ID>CN-001</ID>');
    expect(xml).toContain('</CreditNote>');
  });

  it('accepts matching schema option PEF_KOR', () => {
    const xml = buildPefXml({ CreditNote: { ID: 'CN-001' } }, { schema: 'PEF_KOR' });
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF_KOR}"`);
  });
});

// ── XOR validation ──────────────────────────────────────────────────────

describe('buildPefXml — XOR validation of Invoice / CreditNote', () => {
  it('throws KSeFValidationError when neither Invoice nor CreditNote is present', () => {
    expect(() => buildPefXml({} as unknown as PefUblDocumentInput)).toThrow(KSeFValidationError);
    expect(() => buildPefXml({} as unknown as PefUblDocumentInput)).toThrow(
      /Invoice|CreditNote/,
    );
  });

  it('throws KSeFValidationError when both Invoice and CreditNote are present', () => {
    const bad = {
      Invoice: { ID: 'x' },
      CreditNote: { ID: 'y' },
    } as unknown as PefUblDocumentInput;
    expect(() => buildPefXml(bad)).toThrow(KSeFValidationError);
    expect(() => buildPefXml(bad)).toThrow(/both|not both/i);
  });

  it('throws KSeFValidationError for non-object input (e.g., null / array)', () => {
    expect(() => buildPefXml(null as unknown as PefUblDocumentInput)).toThrow(KSeFValidationError);
    expect(() => buildPefXml([] as unknown as PefUblDocumentInput)).toThrow(KSeFValidationError);
  });

  it('throws KSeFValidationError when Invoice value is not a plain object', () => {
    for (const bad of [
      { Invoice: 1 },
      { Invoice: 'x' },
      { Invoice: null },
      { Invoice: [] },
    ]) {
      expect(() => buildPefXml(bad as unknown as PefUblDocumentInput)).toThrow(
        KSeFValidationError,
      );
      expect(() => buildPefXml(bad as unknown as PefUblDocumentInput)).toThrow(
        /Invoice.*non-array object/,
      );
    }
  });

  it('throws KSeFValidationError when CreditNote value is not a plain object', () => {
    for (const bad of [
      { CreditNote: 1 },
      { CreditNote: 'x' },
      { CreditNote: null },
      { CreditNote: [] },
    ]) {
      expect(() => buildPefXml(bad as unknown as PefUblDocumentInput)).toThrow(
        KSeFValidationError,
      );
      expect(() => buildPefXml(bad as unknown as PefUblDocumentInput)).toThrow(
        /CreditNote.*non-array object/,
      );
    }
  });
});

// ── Namespace override guard ────────────────────────────────────────────
//
// Regression pin: payload must not be able to shadow the UBL namespace set.
// Spreading `input.Invoice` / `input.CreditNote` before the namespace attrs
// guarantees the builder always wins even if a caller put their own
// `@_xmlns*` attrs into the payload.

describe('buildPefXml — builder namespaces override payload', () => {
  it('ignores @_xmlns in Invoice payload and emits canonical PEF namespace', () => {
    const xml = buildPefXml({
      Invoice: {
        '@_xmlns': 'http://evil.example/override',
        '@_xmlns:cbc': 'http://evil.example/override-cbc',
        ID: 'INV-1',
      },
    });
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF}"`);
    expect(xml).not.toContain('http://evil.example/override');
    expect(xml).toContain(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    );
  });

  it('ignores @_xmlns in CreditNote payload and emits canonical PEF_KOR namespace', () => {
    const xml = buildPefXml({
      CreditNote: {
        '@_xmlns': 'http://evil.example/override',
        ID: 'CN-1',
      },
    });
    expect(xml).toContain(`xmlns="${PEF_NAMESPACE.PEF_KOR}"`);
    expect(xml).not.toContain('http://evil.example/override');
  });
});

// ── Schema / root mismatch ──────────────────────────────────────────────

describe('buildPefXml — schema option vs detected root', () => {
  it('throws KSeFValidationError when schema=PEF_KOR but root is Invoice', () => {
    expect(() =>
      buildPefXml({ Invoice: { ID: 'x' } }, { schema: 'PEF_KOR' }),
    ).toThrow(KSeFValidationError);
    expect(() =>
      buildPefXml({ Invoice: { ID: 'x' } }, { schema: 'PEF_KOR' }),
    ).toThrow(/schema mismatch|PEF_KOR|PEF/i);
  });

  it('throws KSeFValidationError when schema=PEF but root is CreditNote', () => {
    expect(() =>
      buildPefXml({ CreditNote: { ID: 'x' } }, { schema: 'PEF' }),
    ).toThrow(KSeFValidationError);
  });

  it('error message identifies the mismatch between detected and requested schema', () => {
    try {
      buildPefXml({ Invoice: { ID: 'x' } }, { schema: 'PEF_KOR' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFValidationError);
      expect((err as Error).message).toMatch(/PEF/);
      expect((err as Error).message).toMatch(/PEF_KOR/);
    }
  });
});

// ── isPefUblDocumentInput guard ─────────────────────────────────────────

describe('isPefUblDocumentInput', () => {
  it('returns true for objects with exactly one of Invoice or CreditNote', () => {
    expect(isPefUblDocumentInput({ Invoice: {} })).toBe(true);
    expect(isPefUblDocumentInput({ CreditNote: {} })).toBe(true);
  });

  it('returns false when both Invoice and CreditNote are present', () => {
    expect(isPefUblDocumentInput({ Invoice: {}, CreditNote: {} })).toBe(false);
  });

  it('returns false when neither Invoice nor CreditNote is present', () => {
    expect(isPefUblDocumentInput({})).toBe(false);
    expect(isPefUblDocumentInput({ other: 'x' })).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isPefUblDocumentInput(null)).toBe(false);
    expect(isPefUblDocumentInput(undefined)).toBe(false);
    expect(isPefUblDocumentInput([])).toBe(false);
    expect(isPefUblDocumentInput('Invoice')).toBe(false);
  });
});
