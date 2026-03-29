/**
 * Schema Registry — lazy-loads generated Zod schemas and provides
 * auto-detection of schema type from XML namespace or root element.
 */

import type { ZodType } from 'zod';
import { type SchemaType, NAMESPACE_MAP } from './schemas/index.js';

/** Map of root element names to schema types (for schemas without unique namespaces). */
const ROOT_ELEMENT_MAP: Record<string, SchemaType> = {
  Invoice: 'PEF3',
  CreditNote: 'PEF_KOR3',
};

/** Lazy-loaded schema cache. */
const schemaCache = new Map<SchemaType, ZodType>();

/** Dynamically import a schema module and extract the schema. */
async function loadSchema(type: SchemaType): Promise<ZodType> {
  const cached = schemaCache.get(type);
  if (cached) return cached;

  let mod: Record<string, unknown>;
  switch (type) {
    case 'FA3':     mod = await import('./schemas/fa3.js'); break;
    case 'FA2':     mod = await import('./schemas/fa2.js'); break;
    case 'RR1_V11E': mod = await import('./schemas/rr1-v11e.js'); break;
    case 'RR1_V10E': mod = await import('./schemas/rr1-v10e.js'); break;
    case 'PEF3':    mod = await import('./schemas/pef3.js'); break;
    case 'PEF_KOR3': mod = await import('./schemas/pef-kor3.js'); break;
    default: throw new Error(`Unknown schema type: ${type}`);
  }

  const exportName = `${type}Schema`;
  const schema = mod[exportName] as ZodType | undefined;
  if (!schema) {
    throw new Error(`Schema export "${exportName}" not found in module for type "${type}"`);
  }
  schemaCache.set(type, schema);
  return schema;
}

export const SchemaRegistry = {
  /**
   * Get a Zod schema by type. Lazy-loads the module on first access.
   */
  async get(type: SchemaType): Promise<ZodType> {
    return loadSchema(type);
  },

  /**
   * List all available schema types.
   */
  availableSchemas(): SchemaType[] {
    return ['FA3', 'FA2', 'RR1_V11E', 'RR1_V10E', 'PEF3', 'PEF_KOR3'];
  },

  /**
   * Detect schema type from XML namespace URI and/or root element name.
   *
   * Detection priority:
   * 1. Namespace URI match (unique per FA/RR schemas)
   * 2. Root element name match (for PEF/PEF_KOR which use UBL namespaces)
   */
  detect(namespace: string | null, rootElement: string | null): SchemaType | null {
    // Try namespace first
    if (namespace) {
      const byNs = NAMESPACE_MAP[namespace];
      if (byNs) return byNs;
    }

    // Fall back to root element name (PEF schemas)
    if (rootElement) {
      const byRoot = ROOT_ELEMENT_MAP[rootElement];
      if (byRoot) return byRoot;
    }

    return null;
  },
};

/** Clear the lazy-loaded schema cache (useful for testing). */
export function clearCache(): void {
  schemaCache.clear();
}
