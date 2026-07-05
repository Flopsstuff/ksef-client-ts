/**
 * Compact XML parsing + version detection for the PDF renderer.
 *
 * Uses `fast-xml-parser` in compact mode (`preserveOrder: false`) — unlike the
 * core `parseXml` (which preserves order and is awkward for layout). Numbers are
 * kept as strings (`parseTagValue: false`) so monetary precision and leading
 * zeros survive; formatters own number presentation. Namespace prefixes are
 * stripped so paths stay clean (`Fa.P_2`, not `tns:Fa.tns:P_2`). Attributes are
 * exposed under the `@` prefix and read through the accessor layer.
 */
import { XMLParser } from 'fast-xml-parser';
import { get } from './accessor.js';

export type InvoiceVersion = 'FA(2)' | 'FA(3)';
export type UpoVersion = 'UPO(4.2)' | 'UPO(4.3)';

export const pdfXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

/**
 * Parse KSeF invoice/UPO XML into a compact object for template binding.
 * `fast-xml-parser` always returns an object (empty/non-XML input yields `{}`).
 */
export function parseXmlForPdf(xml: string): Record<string, unknown> {
  return pdfXmlParser.parse(xml) as Record<string, unknown>;
}

/**
 * Detect the invoice schema version. Reads the `kodSystemowy` attribute
 * (`"FA (2)"` / `"FA (3)"`) and the `WariantFormularza` element; returns `null`
 * for anything that is not a recognized FA(2)/FA(3) invoice. FA(1) is not
 * supported.
 */
export function detectInvoiceVersion(xml: string): InvoiceVersion | null {
  const parsed = parseXmlForPdf(xml);
  if (!('Faktura' in parsed)) return null;

  const kod = get(parsed, 'Faktura.Naglowek.KodFormularza.@kodSystemowy').replace(/\s+/g, '');
  const variant = get(parsed, 'Faktura.Naglowek.WariantFormularza').trim();

  if (kod === 'FA(3)' || variant === '3') return 'FA(3)';
  if (kod === 'FA(2)' || variant === '2') return 'FA(2)';
  return null;
}

/**
 * Detect the UPO version. Requires a `Potwierdzenie` root, then reads the
 * version from the namespace marker in the raw XML (`.../KSeF/v4-3` →
 * `UPO(4.3)`, `v4-2` → `UPO(4.2)`). The default `xmlns` declaration is not
 * surfaced as an attribute by the compact parser, so we scan the source
 * directly. Returns `null` for non-UPO documents.
 */
export function detectUpoVersion(xml: string): UpoVersion | null {
  const parsed = parseXmlForPdf(xml);
  if (!('Potwierdzenie' in parsed)) return null;

  if (/KSeF\/v4-3\b/.test(xml)) return 'UPO(4.3)';
  if (/KSeF\/v4-2\b/.test(xml)) return 'UPO(4.2)';
  return null;
}
