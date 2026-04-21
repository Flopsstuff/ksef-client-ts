import { describe, it, expect } from 'vitest';
import { YAMLParseError } from 'yaml';
import {
  inferSchema,
  parseInput,
  buildDrySummary,
  mapBuildExitCode,
} from '../../../../src/cli/commands/invoice-build-helpers.js';
import { KSeFValidationError } from '../../../../src/errors/ksef-validation-error.js';
import { KSeFXsdValidationError } from '../../../../src/errors/ksef-xsd-validation-error.js';

describe('invoice-build helpers', () => {
  describe('inferSchema', () => {
    it('returns PEF for input with Invoice key', () => {
      expect(inferSchema({ Invoice: {} })).toBe('PEF');
    });

    it('returns PEF_KOR for input with CreditNote key', () => {
      expect(inferSchema({ CreditNote: {} })).toBe('PEF_KOR');
    });

    it('returns FA2 when Naglowek.KodFormularza.systemCode is "FA (2)"', () => {
      expect(
        inferSchema({
          Naglowek: { KodFormularza: { systemCode: 'FA (2)' } },
          Fa: {},
        }),
      ).toBe('FA2');
    });

    it('returns FA3 when systemCode is "FA (3)"', () => {
      expect(
        inferSchema({
          Naglowek: { KodFormularza: { systemCode: 'FA (3)' } },
          Fa: {},
        }),
      ).toBe('FA3');
    });

    it('defaults to FA3 for ambiguous or missing shape', () => {
      expect(inferSchema({})).toBe('FA3');
      expect(inferSchema(null)).toBe('FA3');
      expect(inferSchema('string')).toBe('FA3');
    });
  });

  describe('parseInput', () => {
    it('parses JSON input', () => {
      expect(parseInput('{"a":1}', 'json')).toEqual({ a: 1 });
    });

    it('parses YAML input', () => {
      expect(parseInput('a: 1\nb: two', 'yaml')).toEqual({ a: 1, b: 'two' });
    });

    it('throws SyntaxError for malformed JSON', () => {
      expect(() => parseInput('{bad', 'json')).toThrow(SyntaxError);
    });

    it('throws YAMLParseError for malformed YAML', () => {
      expect(() => parseInput('key: : :', 'yaml')).toThrow(YAMLParseError);
    });
  });

  describe('buildDrySummary', () => {
    it('extracts invoice number and line count from FA3 input', () => {
      const summary = buildDrySummary(
        {
          Naglowek: {},
          Fa: { P_2: 'FA/2026/1', FaWiersz: [{}, {}, {}] },
        },
        'FA3',
      );
      expect(summary.schema).toBe('FA3');
      expect(summary.invoiceNumber).toBe('FA/2026/1');
      expect(summary.lineCount).toBe(3);
      expect(summary.sections).toEqual(['Naglowek', 'Fa']);
    });

    it('handles PEF input with cbc:ID and single line', () => {
      const summary = buildDrySummary(
        { Invoice: { 'cbc:ID': 'INV/1', 'cac:InvoiceLine': {} } },
        'PEF',
      );
      expect(summary.invoiceNumber).toBe('INV/1');
      expect(summary.lineCount).toBe(1);
    });

    it('returns schema + empty sections for non-object input', () => {
      expect(buildDrySummary('str', 'FA3')).toEqual({ schema: 'FA3', sections: [] });
    });
  });

  describe('mapBuildExitCode', () => {
    it('returns 2 for SyntaxError (JSON)', () => {
      expect(mapBuildExitCode(new SyntaxError('bad json'))).toBe(2);
    });

    it('returns 2 for YAMLParseError', () => {
      const err = new YAMLParseError({ line: 1, col: 1, offset: 0 }, 'X', 'bad yaml');
      expect(mapBuildExitCode(err)).toBe(2);
    });

    it('returns 3 for KSeFValidationError', () => {
      expect(mapBuildExitCode(new KSeFValidationError('shape'))).toBe(3);
    });

    it('returns 4 for KSeFXsdValidationError', () => {
      expect(mapBuildExitCode(new KSeFXsdValidationError('/tmp/x.xsd', ['err']))).toBe(4);
    });

    it('returns 5 for ENOENT / EACCES / EPERM / EISDIR', () => {
      expect(mapBuildExitCode({ code: 'ENOENT' })).toBe(5);
      expect(mapBuildExitCode({ code: 'EACCES' })).toBe(5);
      expect(mapBuildExitCode({ code: 'EPERM' })).toBe(5);
      expect(mapBuildExitCode({ code: 'EISDIR' })).toBe(5);
    });

    it('returns undefined for unknown errors (fallback path)', () => {
      expect(mapBuildExitCode(new Error('unknown'))).toBeUndefined();
      expect(mapBuildExitCode('string')).toBeUndefined();
    });
  });
});
