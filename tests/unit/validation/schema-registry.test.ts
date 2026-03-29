import { describe, it, expect } from 'vitest';
import { SchemaRegistry } from '../../../src/validation/schema-registry.js';

describe('SchemaRegistry', () => {
  describe('availableSchemas', () => {
    it('returns all 6 schema types', () => {
      const schemas = SchemaRegistry.availableSchemas();
      expect(schemas).toEqual(['FA3', 'FA2', 'RR1_V11E', 'RR1_V10E', 'PEF3', 'PEF_KOR3']);
    });
  });

  describe('get', () => {
    it('loads FA3 schema lazily', async () => {
      const schema = await SchemaRegistry.get('FA3');
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    });

    it('loads FA2 schema lazily', async () => {
      const schema = await SchemaRegistry.get('FA2');
      expect(schema).toBeDefined();
    });

    it('loads RR1_V11E schema lazily', async () => {
      const schema = await SchemaRegistry.get('RR1_V11E');
      expect(schema).toBeDefined();
    });

    it('loads RR1_V10E schema lazily', async () => {
      const schema = await SchemaRegistry.get('RR1_V10E');
      expect(schema).toBeDefined();
    });

    it('loads PEF3 schema lazily', async () => {
      const schema = await SchemaRegistry.get('PEF3');
      expect(schema).toBeDefined();
    });

    it('loads PEF_KOR3 schema lazily', async () => {
      const schema = await SchemaRegistry.get('PEF_KOR3');
      expect(schema).toBeDefined();
    });

    it('caches schema on second call', async () => {
      const first = await SchemaRegistry.get('FA3');
      const second = await SchemaRegistry.get('FA3');
      expect(first).toBe(second);
    });
  });

  describe('detect', () => {
    it('detects FA3 by namespace', () => {
      expect(SchemaRegistry.detect('http://crd.gov.pl/wzor/2025/06/25/13775/', 'Faktura')).toBe('FA3');
    });

    it('detects FA2 by namespace', () => {
      expect(SchemaRegistry.detect('http://crd.gov.pl/wzor/2023/06/29/12648/', 'Faktura')).toBe('FA2');
    });

    it('detects RR1_V11E by namespace', () => {
      expect(SchemaRegistry.detect('http://crd.gov.pl/wzor/2026/03/06/14189/', 'Faktura')).toBe('RR1_V11E');
    });

    it('detects RR1_V10E by namespace', () => {
      expect(SchemaRegistry.detect('http://crd.gov.pl/wzor/2026/02/17/14164/', 'Faktura')).toBe('RR1_V10E');
    });

    it('detects PEF3 by root element Invoice', () => {
      expect(SchemaRegistry.detect('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'Invoice')).toBe('PEF3');
    });

    it('detects PEF_KOR3 by root element CreditNote', () => {
      expect(SchemaRegistry.detect('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2', 'CreditNote')).toBe('PEF_KOR3');
    });

    it('detects PEF3 by root element name alone when namespace is unknown', () => {
      expect(SchemaRegistry.detect(null, 'Invoice')).toBe('PEF3');
    });

    it('detects PEF_KOR3 by root element name alone', () => {
      expect(SchemaRegistry.detect(null, 'CreditNote')).toBe('PEF_KOR3');
    });

    it('returns null for unknown namespace and element', () => {
      expect(SchemaRegistry.detect('http://unknown.com/', 'Unknown')).toBeNull();
    });

    it('returns null for null inputs', () => {
      expect(SchemaRegistry.detect(null, null)).toBeNull();
    });
  });
});
