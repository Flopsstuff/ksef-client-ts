/**
 * Integration validation tests using real invoice XML fixtures.
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

describe('Invalid invoice fixtures', () => {
  it('Level 1: detects malformed XML', () => {
    const xml = readFixture('invalid-malformed.xml');
    const result = validateWellFormedness(xml);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('MALFORMED_XML');
  });

  it('Level 2: detects missing required elements', async () => {
    const xml = readFixture('invalid-missing-required-fa3.xml');
    const result = await validateSchema(xml);
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBe('FA3');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('Level 3: detects invalid NIP checksums', async () => {
    const xml = readFixture('invalid-bad-nip-fa3.xml');
    const result = await validate(xml);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_NIP_CHECKSUM')).toBe(true);
  });

  it('full pipeline rejects malformed XML early', async () => {
    const xml = readFixture('invalid-malformed.xml');
    const result = await validate(xml);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MALFORMED_XML');
  });
});
