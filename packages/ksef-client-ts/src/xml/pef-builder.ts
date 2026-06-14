import { KSeFValidationError } from '../errors/ksef-validation-error.js';
import type { PefSchema, PefUblDocumentInput, XmlObject } from './types.js';
import { buildXmlFromObject } from './xml-engine.js';

export const PEF_NAMESPACE: Record<PefSchema, string> = {
  PEF: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  PEF_KOR: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
};

const UBL_EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const UBL_CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const UBL_CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const UBL_CBC_PL_NS = 'urn:pl:extended:CommonBasicComponents-2';
const UBL_CAC_PL_NS = 'urn:pl:extended:CommonAggregateComponents-2';

export interface BuildPefOptions {
  schema?: PefSchema;
  pretty?: boolean;
}

export function isPefUblDocumentInput(input: unknown): input is PefUblDocumentInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const obj = input as Record<string, unknown>;
  const invoice = obj.Invoice;
  const creditNote = obj.CreditNote;
  const hasInvoice = typeof invoice === 'object' && invoice !== null && !Array.isArray(invoice);
  const hasCreditNote =
    typeof creditNote === 'object' && creditNote !== null && !Array.isArray(creditNote);
  // XOR — exactly one of Invoice / CreditNote must be present.
  return hasInvoice !== hasCreditNote;
}

function inferSchema(input: PefUblDocumentInput): PefSchema {
  return 'Invoice' in input ? 'PEF' : 'PEF_KOR';
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPefShape(input: unknown): asserts input is PefUblDocumentInput {
  if (!isNonArrayObject(input)) {
    throw new KSeFValidationError('PEF input must be a non-array object.');
  }
  const hasInvoiceKey = 'Invoice' in input;
  const hasCreditNoteKey = 'CreditNote' in input;
  if (hasInvoiceKey && hasCreditNoteKey) {
    throw new KSeFValidationError(
      'PEF input must contain exactly one of `Invoice` or `CreditNote`, not both.',
    );
  }
  if (!hasInvoiceKey && !hasCreditNoteKey) {
    throw new KSeFValidationError(
      'PEF input must contain either an `Invoice` or a `CreditNote` root element.',
    );
  }
  const rootKey = hasInvoiceKey ? 'Invoice' : 'CreditNote';
  if (!isNonArrayObject(input[rootKey])) {
    throw new KSeFValidationError(
      `PEF \`${rootKey}\` value must be a non-array object.`,
    );
  }
}

/**
 * Builds a PEF (UBL) Invoice or CreditNote XML string.
 *
 * Detects the root by the presence of either `Invoice` or `CreditNote` and
 * injects the UBL namespace set on the root element. Throws
 * `KSeFValidationError` when the caller's `schema` option contradicts the
 * detected root, or when neither / both of the roots are provided.
 */
export function buildPefXml(input: PefUblDocumentInput, options: BuildPefOptions = {}): string {
  assertPefShape(input);
  const inferred = inferSchema(input);
  const schema = options.schema ?? input.schema ?? inferred;
  if (schema !== inferred) {
    throw new KSeFValidationError(
      `PEF schema mismatch: expected ${inferred} based on root element, got ${schema}.`,
    );
  }

  const commonNamespaces = {
    '@_xmlns:ext': UBL_EXT_NS,
    '@_xmlns:cbc': UBL_CBC_NS,
    '@_xmlns:cac': UBL_CAC_NS,
    '@_xmlns:cbc-pl': UBL_CBC_PL_NS,
    '@_xmlns:cac-pl': UBL_CAC_PL_NS,
  };

  // Builder-injected UBL namespaces always win over any `@_xmlns*` attrs a
  // caller may have placed in `input.Invoice` / `input.CreditNote`. Same
  // guarantee as `buildFakturaXml`.
  const document: XmlObject =
    'Invoice' in input
      ? {
          Invoice: {
            ...input.Invoice,
            '@_xmlns': PEF_NAMESPACE.PEF,
            ...commonNamespaces,
          },
        }
      : {
          CreditNote: {
            ...input.CreditNote,
            '@_xmlns': PEF_NAMESPACE.PEF_KOR,
            ...commonNamespaces,
          },
        };

  return buildXmlFromObject(document, { pretty: options.pretty });
}
