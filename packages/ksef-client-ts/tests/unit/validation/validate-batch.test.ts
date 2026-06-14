import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateBatch } from '../../../src/validation/invoice-validator.js';

const fixturesDir = path.join(__dirname, '../../fixtures/invoices');
const readFixture = (name: string) => fs.readFileSync(path.join(fixturesDir, name), 'utf-8');

describe('validateBatch', () => {
  it('returns valid for all valid invoices', async () => {
    const invoices = [
      { fileName: 'valid-fa3.xml', xml: readFixture('valid-fa3.xml') },
      { fileName: 'valid-pef3.xml', xml: readFixture('valid-pef3.xml') },
    ];
    const result = await validateBatch(invoices);
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every(r => r.result.valid)).toBe(true);
  });

  it('returns invalid when all invoices fail', async () => {
    const invoices = [
      { fileName: 'bad-nip.xml', xml: readFixture('invalid-bad-nip-fa3.xml') },
      { fileName: 'malformed.xml', xml: readFixture('invalid-malformed.xml') },
    ];
    const result = await validateBatch(invoices);
    expect(result.valid).toBe(false);
    expect(result.results.every(r => !r.result.valid)).toBe(true);
  });

  it('returns invalid with mixed valid and invalid invoices', async () => {
    const invoices = [
      { fileName: 'valid-fa3.xml', xml: readFixture('valid-fa3.xml') },
      { fileName: 'bad-nip.xml', xml: readFixture('invalid-bad-nip-fa3.xml') },
      { fileName: 'valid-pef3.xml', xml: readFixture('valid-pef3.xml') },
    ];
    const result = await validateBatch(invoices);
    expect(result.valid).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]!.result.valid).toBe(true);
    expect(result.results[1]!.result.valid).toBe(false);
    expect(result.results[1]!.fileName).toBe('bad-nip.xml');
    expect(result.results[2]!.result.valid).toBe(true);
  });

  it('returns valid for empty input', async () => {
    const result = await validateBatch([]);
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('preserves file names in results', async () => {
    const invoices = [
      { fileName: 'invoice-001.xml', xml: readFixture('valid-fa3.xml') },
      { fileName: 'invoice-002.xml', xml: readFixture('valid-fa3.xml') },
    ];
    const result = await validateBatch(invoices);
    expect(result.results.map(r => r.fileName)).toEqual(['invoice-001.xml', 'invoice-002.xml']);
  });

  it('detects schema type for each invoice', async () => {
    const invoices = [
      { fileName: 'fa3.xml', xml: readFixture('valid-fa3.xml') },
      { fileName: 'pef3.xml', xml: readFixture('valid-pef3.xml') },
    ];
    const result = await validateBatch(invoices);
    expect(result.results[0]!.result.schemaType).toBe('FA3');
    expect(result.results[1]!.result.schemaType).toBe('PEF3');
  });
});
