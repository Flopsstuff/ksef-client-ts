import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { YAMLParseError } from 'yaml';
import {
  inferSchema,
  parseInput,
  buildDrySummary,
  mapBuildExitCode,
  readInput,
  writeOutput,
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

    it('FA3 with a single FaWiersz object (not array) reports lineCount=1', () => {
      const summary = buildDrySummary(
        { Naglowek: {}, Fa: { P_2: 'FA/1', FaWiersz: { NrWierszaFa: 1 } } },
        'FA3',
      );
      expect(summary.lineCount).toBe(1);
    });

    it('PEF_KOR with single CreditNoteLine array reports lineCount', () => {
      const summary = buildDrySummary(
        {
          CreditNote: {
            'cbc:ID': 'COR/1',
            'cac:CreditNoteLine': [{ 'cbc:ID': '1' }, { 'cbc:ID': '2' }],
          },
        },
        'PEF_KOR',
      );
      expect(summary.invoiceNumber).toBe('COR/1');
      expect(summary.lineCount).toBe(2);
    });
  });

  describe('readInput', () => {
    it('infers yaml format from .yml extension', async () => {
      const tmp = path.join(os.tmpdir(), `ksef-read-${Date.now()}.yml`);
      fs.writeFileSync(tmp, 'a: 1\n');
      try {
        const { raw, format } = await readInput(tmp, 'auto');
        expect(format).toBe('yaml');
        expect(raw).toBe('a: 1\n');
      } finally {
        fs.unlinkSync(tmp);
      }
    });

    it('infers yaml format from .yaml extension', async () => {
      const tmp = path.join(os.tmpdir(), `ksef-read-${Date.now()}.yaml`);
      fs.writeFileSync(tmp, 'x: y\n');
      try {
        const { format } = await readInput(tmp, 'auto');
        expect(format).toBe('yaml');
      } finally {
        fs.unlinkSync(tmp);
      }
    });

    it('defaults stdin-auto to json', async () => {
      // "-" with auto: path extension logic returns 'json' (no extension).
      // We don't want to actually read stdin, so supply a real file path with no extension instead.
      const tmp = path.join(os.tmpdir(), `ksef-read-${Date.now()}-noext`);
      fs.writeFileSync(tmp, '{"a":1}');
      try {
        const { format } = await readInput(tmp, 'auto');
        expect(format).toBe('json');
      } finally {
        fs.unlinkSync(tmp);
      }
    });
  });

  describe('writeOutput', () => {
    it('writes buffer to a file when a path is provided', () => {
      const tmp = path.join(os.tmpdir(), `ksef-write-${Date.now()}.xml`);
      try {
        writeOutput(Buffer.from('<X/>', 'utf8'), tmp);
        expect(fs.readFileSync(tmp, 'utf8')).toBe('<X/>');
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
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

    it('returns 4 when validateAgainstXsd throws for missing libxmljs2', () => {
      const err = new Error(
        'libxmljs2 is not installed; cannot run XSD validation. ' +
          'Install it as an optional peer dependency: `npm i -O libxmljs2`.',
      );
      expect(mapBuildExitCode(err)).toBe(4);
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
