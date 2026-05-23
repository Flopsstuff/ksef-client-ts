// Generated barrel — do not edit manually
// Run: yarn generate-schemas

export { FA3Schema, type FA3 } from './fa3.js';
export { FA2Schema, type FA2 } from './fa2.js';
export { FA_RR1Schema, type FA_RR1 } from './fa-rr1.js';
export { PEF3Schema, type PEF3 } from './pef3.js';
export { PEF_KOR3Schema, type PEF_KOR3 } from './pef-kor3.js';

/** Schema type identifiers */
export type SchemaType = 'FA3' | 'FA2' | 'FA_RR1' | 'PEF3' | 'PEF_KOR3';

/** All valid schema type values as a runtime array. */
export const SCHEMA_TYPES: readonly SchemaType[] = ['FA3', 'FA2', 'FA_RR1', 'PEF3', 'PEF_KOR3'] as const;

/** Namespace URI → schema type mapping for auto-detection */
export const NAMESPACE_MAP: Record<string, SchemaType> = {
  'http://crd.gov.pl/wzor/2025/06/25/13775/': 'FA3',
  'http://crd.gov.pl/wzor/2023/06/29/12648/': 'FA2',
  'http://crd.gov.pl/wzor/2026/03/06/14189/': 'FA_RR1',
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2': 'PEF3',
  'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2': 'PEF_KOR3',
};
