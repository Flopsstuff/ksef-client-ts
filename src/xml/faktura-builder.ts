import type { FormCode } from '../models/common.js';
import type { FakturaInput, FakturaSchema, XmlObject, XmlValue } from './types.js';
import { buildXmlFromObject } from './xml-engine.js';
import { orderXmlObject } from './order-map.js';

export const FAKTURA_NAMESPACE: Record<FakturaSchema, string> = {
  FA2: 'http://crd.gov.pl/wzor/2023/06/29/12648/',
  FA3: 'http://crd.gov.pl/wzor/2025/06/25/13775/',
};

export const ETD_NAMESPACE: Record<FakturaSchema, string> = {
  FA2: 'http://crd.gov.pl/xml/schematy/2020/10/08/eDokumenty',
  FA3: 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/',
};

export interface BuildFakturaOptions {
  schema?: FakturaSchema;
  fakturaNamespace?: string;
  etdNamespace?: string;
  pretty?: boolean;
}

export function toKodFormularza(formCode: FormCode): XmlObject {
  return {
    '@_kodSystemowy': formCode.systemCode,
    '@_wersjaSchemy': formCode.schemaVersion,
    '#text': formCode.value,
  };
}

export function isFormCodeShape(value: unknown): value is FormCode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { systemCode?: unknown; schemaVersion?: unknown; value?: unknown };
  return (
    typeof candidate.systemCode === 'string' &&
    typeof candidate.schemaVersion === 'string' &&
    typeof candidate.value === 'string'
  );
}

function isObject(value: unknown): value is XmlObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeValueForKey(key: string, value: XmlValue): XmlValue {
  if (key === 'KodFormularza' && isFormCodeShape(value)) {
    return toKodFormularza(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isObject(item)) return orderXmlObject(item as XmlObject, key);
      return item;
    });
  }
  if (isObject(value)) return orderXmlObject(value as XmlObject, key);
  return value;
}

function normalizeTopLevel(input: FakturaInput): XmlObject {
  const result: XmlObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'Naglowek' && isObject(value)) {
      result[key] = normalizeNaglowek(value as XmlObject);
      continue;
    }
    result[key] = normalizeValueForKey(key, value as XmlValue);
  }
  return result;
}

function normalizeNaglowek(value: XmlObject): XmlObject {
  const result: XmlObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (key === 'KodFormularza' && isFormCodeShape(item)) {
      result[key] = toKodFormularza(item);
      continue;
    }
    result[key] = normalizeValueForKey(key, item as XmlValue);
  }
  return result;
}

/**
 * Builds a Faktura XML string from a typed FakturaInput.
 *
 * Applies ORDER_MAP-driven element ordering (with multi-rate P_13/P_14
 * interleaving) and injects FA2/FA3 namespace attributes on the root
 * `<Faktura>` element.
 *
 * Default schema is FA3. The `fakturaNamespace` / `etdNamespace` options
 * override the per-schema defaults for advanced use cases.
 */
export function buildFakturaXml(faktura: FakturaInput, options: BuildFakturaOptions = {}): string {
  const schema = options.schema ?? 'FA3';
  const fakturaNamespace = options.fakturaNamespace ?? FAKTURA_NAMESPACE[schema];
  const etdNamespace = options.etdNamespace ?? ETD_NAMESPACE[schema];

  const normalized = normalizeTopLevel(faktura);
  const ordered = orderXmlObject(normalized, 'Faktura');
  const document: XmlObject = {
    Faktura: {
      '@_xmlns': fakturaNamespace,
      '@_xmlns:etd': etdNamespace,
      ...ordered,
    },
  };

  return buildXmlFromObject(document, { pretty: options.pretty });
}

export function isFakturaInput(input: unknown): input is FakturaInput {
  if (!isObject(input)) return false;
  return (
    Object.prototype.hasOwnProperty.call(input, 'Naglowek') &&
    Object.prototype.hasOwnProperty.call(input, 'Fa')
  );
}
