import { XMLParser } from 'fast-xml-parser';

export interface InvoiceFields {
  invoiceNumber: string;
  invoiceDate: string;
}

const invoiceParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: false,
});

/**
 * Extracts invoice number and date from KSeF invoice XML.
 *
 * Supports:
 * - FA formats (FA_2, FA_3, FA_3_SELF): `Faktura > Fa > P_2` (number), `P_1` (date)
 * - FA_RR format: `Faktura > FakturaRR > P_4C` (number), `P_4B` (date)
 */
export function extractInvoiceFields(xml: string): InvoiceFields {
  const parsed = invoiceParser.parse(xml);
  const root = parsed?.Faktura;
  if (!root || typeof root !== 'object') {
    throw new Error(
      'Cannot extract invoice fields: missing <Faktura> root element. ' +
        'Ensure the XML is a valid KSeF invoice (FA_2, FA_3, or FA_RR).',
    );
  }

  // FA_2, FA_3, FA_3_SELF: <Fa><P_1> (date) and <Fa><P_2> (number)
  if (root.Fa && typeof root.Fa === 'object') {
    const invoiceDate = nonEmptyString(root.Fa.P_1);
    const invoiceNumber = nonEmptyString(root.Fa.P_2);
    if (invoiceDate && invoiceNumber) {
      return { invoiceNumber, invoiceDate };
    }
  }

  // FA_RR: <FakturaRR><P_4B> (date) and <FakturaRR><P_4C> (number)
  if (root.FakturaRR && typeof root.FakturaRR === 'object') {
    const invoiceDate = nonEmptyString(root.FakturaRR.P_4B);
    const invoiceNumber = nonEmptyString(root.FakturaRR.P_4C);
    if (invoiceDate && invoiceNumber) {
      return { invoiceNumber, invoiceDate };
    }
  }

  throw new Error(
    'Cannot extract invoice number and date from XML. ' +
      'Expected <Fa><P_1>/<P_2> (FA format) or <FakturaRR><P_4B>/<P_4C> (RR format).',
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
