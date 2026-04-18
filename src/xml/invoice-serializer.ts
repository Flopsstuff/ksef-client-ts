import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import type {
  FakturaInput,
  InvoiceSerializerInput,
  PefUblDocumentInput,
  SerializeInvoiceOptions,
  XmlObject,
} from './types.js';
import { buildFakturaXml, isFakturaInput } from './faktura-builder.js';
import { buildPefXml, isPefUblDocumentInput } from './pef-builder.js';
import { buildXml, buildXmlFromObject, stripBom } from './xml-engine.js';

const FAKTURA_SCHEMAS = new Set(['FA2', 'FA3']);
const PEF_SCHEMAS = new Set(['PEF', 'PEF_KOR']);

function classifyUnknownObject(input: Record<string, unknown>): KSeFValidationError {
  // Diagnose what the input looks like and report the first missing key.
  const looksLikeFaktura =
    'Naglowek' in input || 'Fa' in input || 'Podmiot1' in input || 'Podmiot2' in input;
  const hasInvoice = 'Invoice' in input;
  const hasCreditNote = 'CreditNote' in input;

  if (hasInvoice && hasCreditNote) {
    return new KSeFValidationError(
      'Input must contain exactly one of `Invoice` or `CreditNote`, not both.',
    );
  }

  if (looksLikeFaktura) {
    const missing: string[] = [];
    if (!('Naglowek' in input)) missing.push('Naglowek');
    if (!('Fa' in input)) missing.push('Fa');
    return KSeFValidationError.fromField(
      missing[0] ?? 'Faktura',
      `Faktura input is missing required top-level key(s): ${missing.join(', ')}.`,
    );
  }

  return new KSeFValidationError(
    'Unsupported invoice input shape: expected `FakturaInput` (with `Naglowek` + `Fa`) or `PefUblDocumentInput` (with `Invoice` or `CreditNote`).',
  );
}

/**
 * Serializes a KSeF invoice from any supported input shape into a UTF-8
 * encoded `Buffer`.
 *
 * Input dispatch:
 *   - `Buffer`           — returned byte-for-byte as the same reference;
 *                          callers must not mutate the buffer after the call
 *   - `string`           — UTF-8 BOM stripped, wrapped in a `Buffer`
 *   - pre-parsed `XmlDocument` array — rebuilt via the engine
 *   - `FakturaInput`     — FA2/FA3 builder (default schema: FA3)
 *   - `PefUblDocumentInput` — PEF / PEF_KOR builder
 *
 * Structured inputs that match none of the known shapes throw
 * `KSeFValidationError` naming the first missing top-level key. Callers
 * with an already-shaped `XmlObject` that deliberately sidesteps schema
 * dispatch can use `buildRawXmlObject` directly.
 */
export function serializeInvoiceXml(
  input: InvoiceSerializerInput,
  options?: SerializeInvoiceOptions,
): Buffer {
  if (Buffer.isBuffer(input)) return input;

  if (typeof input === 'string') {
    return Buffer.from(stripBom(input), 'utf8');
  }

  if (Array.isArray(input)) {
    return Buffer.from(stripBom(buildXml(input)), 'utf8');
  }

  if (input && typeof input === 'object') {
    const schema = options?.schema;

    if (isPefUblDocumentInput(input)) {
      if (schema && !PEF_SCHEMAS.has(schema)) {
        throw new KSeFValidationError(
          `schema option ${schema} is not compatible with a PEF / PEF_KOR input.`,
        );
      }
      const pefSchema = schema === 'PEF' || schema === 'PEF_KOR' ? schema : undefined;
      const xml = buildPefXml(input as PefUblDocumentInput, {
        schema: pefSchema,
        pretty: options?.pretty,
      });
      return Buffer.from(stripBom(xml), 'utf8');
    }

    if (isFakturaInput(input)) {
      if (schema && !FAKTURA_SCHEMAS.has(schema)) {
        throw new KSeFValidationError(
          `schema option ${schema} is not compatible with a Faktura input.`,
        );
      }
      const fakturaSchema = schema === 'FA2' || schema === 'FA3' ? schema : undefined;
      const xml = buildFakturaXml(input as FakturaInput, {
        schema: fakturaSchema,
        fakturaNamespace: options?.fakturaNamespace,
        etdNamespace: options?.etdNamespace,
        pretty: options?.pretty,
      });
      return Buffer.from(stripBom(xml), 'utf8');
    }

    // Plain object that did not match known shapes — report the first
    // missing / conflicting key to help the caller.
    throw classifyUnknownObject(input as Record<string, unknown>);
  }

  throw new KSeFValidationError(
    'Unsupported invoice input type: expected Buffer, string, XmlDocument, FakturaInput, or PefUblDocumentInput.',
  );
}

/**
 * Low-level helper for callers that already have a plain XML-shaped object
 * (e.g. produced by `parseXml`) and want to build it back out.
 */
export function buildRawXmlObject(document: XmlObject, options?: { pretty?: boolean }): string {
  return buildXmlFromObject(document, options);
}
