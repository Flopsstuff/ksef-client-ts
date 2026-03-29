// Generated barrel — do not edit manually
// Run: yarn generate-schemas

export { FA3Schema, type FA3 } from './fa3.js';
export { FA2Schema, type FA2 } from './fa2.js';
export { RR1_V11ESchema, type RR1_V11E } from './rr1-v11e.js';
export { RR1_V10ESchema, type RR1_V10E } from './rr1-v10e.js';
export { PEF3Schema, type PEF3 } from './pef3.js';
export { PEF_KOR3Schema, type PEF_KOR3 } from './pef-kor3.js';

/** Schema type identifiers */
export type SchemaType = 'FA3' | 'FA2' | 'RR1_V11E' | 'RR1_V10E' | 'PEF3' | 'PEF_KOR3';

/** Namespace URI → schema type mapping for auto-detection */
export const NAMESPACE_MAP: Record<string, SchemaType> = {
  'http://crd.gov.pl/wzor/2025/06/25/13775/': 'FA3',
  'http://crd.gov.pl/wzor/2023/06/29/12648/': 'FA2',
  'http://crd.gov.pl/wzor/2026/03/06/14189/': 'RR1_V11E',
  'http://crd.gov.pl/wzor/2026/02/17/14164/': 'RR1_V10E',
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2': 'PEF3',
  'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2': 'PEF_KOR3',
};
