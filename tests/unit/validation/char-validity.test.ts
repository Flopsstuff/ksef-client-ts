import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateCharValidity,
  DISCOURAGED_UNICODE_RANGES,
} from '../../../src/validation/char-validity.js';

const FA3_FIXTURE = path.join(__dirname, '../../fixtures/invoices/valid-fa3.xml');

describe('validateCharValidity', () => {
  describe('processing instructions', () => {
    it('accepts document with no PIs at all', () => {
      const errors = validateCharValidity('<Faktura><Naglowek/></Faktura>');
      expect(errors).toEqual([]);
    });

    it('accepts a valid <?xml?> prolog at offset 0', () => {
      const xml = '<?xml version="1.0" encoding="UTF-8"?><Faktura/>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('accepts a valid multiline <?xml?> prolog', () => {
      const xml = '<?xml version="1.0"\n    encoding="UTF-8"?>\n<Faktura/>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('rejects prolog preceded by whitespace (W3C XML 1.0 §2.8 requires offset 0)', () => {
      const xml = '  \n<?xml version="1.0"?><Faktura/>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
      expect(errors[0]!.path).toBe(`offset:${xml.indexOf('<?xml')}`);
    });

    it('accepts prolog preceded by a single UTF-8 BOM (W3C XML 1.0 Appendix F)', () => {
      const xml = '\uFEFF<?xml version="1.0"?><Faktura/>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('rejects prolog preceded by BOM + whitespace (only BOM is allowed, not whitespace)', () => {
      const xml = '\uFEFF  <?xml version="1.0"?><Faktura/>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
    });

    it('accepts a BOM-only document with no PIs at all', () => {
      const xml = '\uFEFF<Faktura/>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('rejects <?xml-stylesheet?> PI inside body', () => {
      const xml = '<?xml version="1.0"?><?xml-stylesheet href="x"?><Faktura/>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
      expect(errors[0]!.message).toContain('xml-stylesheet');
      expect(errors[0]!.path).toBe(`offset:${xml.indexOf('<?xml-stylesheet')}`);
    });

    it('rejects arbitrary PI target inside body', () => {
      const xml = '<?xml version="1.0"?><Faktura><?target data?></Faktura>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
      expect(errors[0]!.message).toContain('target');
    });

    it('rejects second <?xml?> declaration after the prolog', () => {
      const xml = '<?xml version="1.0"?><Faktura/><?xml version="1.0"?>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
    });

    it('rejects <?xml?> when not at offset 0 (comment before prolog)', () => {
      const xml = '<!-- comment --><?xml version="1.0"?><Faktura/>';
      const errors = validateCharValidity(xml);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some(e => e.code === 'XML_PROCESSING_INSTRUCTION')).toBe(true);
    });

    it('rejects upper-case <?XML?> target (spec is case-sensitive)', () => {
      const xml = '<?XML version="1.0"?><Faktura/>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
    });

    it('does not flag PI-looking text inside a comment', () => {
      const xml = '<?xml version="1.0"?><Faktura><!-- <?target data?> --></Faktura>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('does not flag PI-looking text inside CDATA', () => {
      const xml = '<?xml version="1.0"?><Faktura><![CDATA[<?target data?>]]></Faktura>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('still flags a real PI outside CDATA even when CDATA also contains PI-like text', () => {
      const xml =
        '<?xml version="1.0"?><Faktura><![CDATA[<?ignored data?>]]><?real target?></Faktura>';
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
      expect(errors[0]!.message).toContain('real');
    });
  });

  describe('discouraged Unicode code points', () => {
    // Table-driven: sample one character from each range
    const rangeSamples: Array<[number, string]> = DISCOURAGED_UNICODE_RANGES.map(
      ([start, _end]) => [start, `U+${start.toString(16).toUpperCase()}`],
    );

    it.each(rangeSamples)('rejects character from discouraged range %s (%s)', (codePoint) => {
      const xml = `<Faktura>${String.fromCodePoint(codePoint)}</Faktura>`;
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_DISCOURAGED_UNICODE');
      expect(errors[0]!.message).toContain(codePoint.toString(16).toUpperCase());
    });

    it('accepts astral-plane characters outside discouraged ranges (emoji U+1F600)', () => {
      const xml = `<Faktura>${String.fromCodePoint(0x1F600)}</Faktura>`;
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('accepts ordinary ASCII and Polish characters', () => {
      const xml = '<Faktura>ąćęłńóśźżĄĆĘŁŃÓŚŹŻ</Faktura>';
      expect(validateCharValidity(xml)).toEqual([]);
    });

    it('de-dupes by range — 100 copies of U+FDD0 produce exactly 1 error', () => {
      const bad = String.fromCodePoint(0xFDD0).repeat(100);
      const xml = `<Faktura>${bad}</Faktura>`;
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('XML_DISCOURAGED_UNICODE');
    });

    it('emits one error per unique range when multiple ranges are hit', () => {
      const xml = `<Faktura>${String.fromCodePoint(0x7F)}${String.fromCodePoint(0xFDD0)}</Faktura>`;
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(2);
      expect(errors.every(e => e.code === 'XML_DISCOURAGED_UNICODE')).toBe(true);
    });

    it('reports correct UTF-16 offset for a surrogate-pair discouraged char', () => {
      // U+1FFFE is a non-BMP discouraged character (2 UTF-16 code units)
      const prefix = '<Faktura>';
      const xml = `${prefix}${String.fromCodePoint(0x1FFFE)}</Faktura>`;
      const errors = validateCharValidity(xml);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.path).toBe(`offset:${prefix.length}`);
    });
  });

  describe('real fixture', () => {
    it('accepts the repository FA3 fixture unchanged', () => {
      const xml = readFileSync(FA3_FIXTURE, 'utf-8');
      expect(validateCharValidity(xml)).toEqual([]);
    });
  });
});
