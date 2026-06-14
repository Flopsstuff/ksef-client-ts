import { describe, it, expect, vi } from 'vitest';
import { SchemaRegistry, clearCache } from '../../../src/validation/schema-registry.js';

describe('SchemaRegistry', () => {
  describe('availableSchemas', () => {
    it('returns all 5 schema types', () => {
      const schemas = SchemaRegistry.availableSchemas();
      expect(schemas).toEqual(['FA3', 'FA2', 'FA_RR1', 'PEF3', 'PEF_KOR3']);
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

    it('loads FA_RR1 schema lazily', async () => {
      const schema = await SchemaRegistry.get('FA_RR1');
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

    it('detects FA_RR1 by namespace', () => {
      expect(SchemaRegistry.detect('http://crd.gov.pl/wzor/2026/03/06/14189/', 'Faktura')).toBe('FA_RR1');
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

  describe('clearCache', () => {
    it('invalidates the cache so the next get() re-enters loadSchema', async () => {
      // Replace the real fa2 module with a stubbed one whose getter counts
      // every access. loadSchema() re-imports the module on every cache
      // miss, so `schemaReads` should bump from 1 → 2 exactly when
      // clearCache() takes effect. A no-op clearCache would leave it at 1.
      vi.resetModules();
      let schemaReads = 0;
      vi.doMock('../../../src/validation/schemas/fa2.js', () => ({
        get FA2Schema() {
          schemaReads += 1;
          return { safeParse: vi.fn() };
        },
      }));
      try {
        const mod = await import('../../../src/validation/schema-registry.js');
        const registry = mod.SchemaRegistry;
        const clear = mod.clearCache;

        const first = await registry.get('FA2');
        expect(schemaReads).toBe(1);
        expect(await registry.get('FA2')).toBe(first);
        expect(schemaReads).toBe(1); // cache hit on second call

        clear();

        const second = await registry.get('FA2');
        expect(schemaReads).toBe(2); // proof the cache was cleared
        expect(second).not.toBe(first); // fresh module-level object
        expect(await registry.get('FA2')).toBe(second);
        expect(schemaReads).toBe(2); // cached again after the reload
      } finally {
        vi.doUnmock('../../../src/validation/schemas/fa2.js');
        vi.resetModules();
      }
    });
  });
});
