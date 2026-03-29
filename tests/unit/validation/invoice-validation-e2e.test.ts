/**
 * End-to-end validation tests using real invoice XML fixtures.
 * These tests verify the full pipeline: XML → xmldom → object → Zod schema.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  validate,
  validateWellFormedness,
  validateSchema,
  validateBusinessRules,
} from '../../../src/validation/invoice-validator.js';

const FIXTURES_DIR = join(__dirname, '../../fixtures/invoices');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

describe('FA(3) invoice validation', () => {
  const xml = readFixture('valid-fa3.xml');

  it('passes well-formedness check', () => {
    const result = validateWellFormedness(xml);
    expect(result.valid).toBe(true);
    expect(result.schemaType).toBe('FA3');
  });

  it('auto-detects FA3 schema from namespace', () => {
    const result = validateWellFormedness(xml);
    expect(result.schemaType).toBe('FA3');
  });

  it('passes schema validation', async () => {
    const result = await validateSchema(xml);
    expect(result.schemaType).toBe('FA3');
    // Log errors for debugging if validation fails
    if (!result.valid) {
      console.log('Schema errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.valid).toBe(true);
  });

  it('passes business rules (valid NIPs)', () => {
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('passes full combined validation', async () => {
    const result = await validate(xml);
    if (!result.valid) {
      console.log('Validation errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.valid).toBe(true);
    expect(result.schemaType).toBe('FA3');
  });
});

describe('Invalid invoice detection', () => {
  it('detects missing required elements', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Naglowek>
        <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
        <WariantFormularza>3</WariantFormularza>
        <DataWytworzeniaFa>2025-01-15T10:00:00</DataWytworzeniaFa>
      </Naglowek>
    </Faktura>`;

    const result = await validateSchema(xml);
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBe('FA3');
    // Missing Podmiot1 and Fa
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects invalid NIP checksum in fixture', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot1>
        <DaneIdentyfikacyjne>
          <NIP>1234567890</NIP>
          <Nazwa>Bad NIP Company</Nazwa>
        </DaneIdentyfikacyjne>
      </Podmiot1>
    </Faktura>`;

    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NIP_CHECKSUM')).toBe(true);
  });
});
