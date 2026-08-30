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
function versionFromKod(kod: string): InvoiceVersion | null {
  return kod === 'FA(3)' ? 'FA(3)' : kod === 'FA(2)' ? 'FA(2)' : null;
}

function versionFromVariant(variant: string): InvoiceVersion | null {
  return variant === '3' ? 'FA(3)' : variant === '2' ? 'FA(2)' : null;
}

export function detectInvoiceVersion(xml: string): InvoiceVersion | null {
  const parsed = parseXmlForPdf(xml);
  if (!('Faktura' in parsed)) return null;

  const kod = get(parsed, 'Faktura.Naglowek.KodFormularza.@kodSystemowy').replace(/\s+/g, '');
  const variant = get(parsed, 'Faktura.Naglowek.WariantFormularza').trim();
  const byKod = versionFromKod(kod);
  const byVariant = versionFromVariant(variant);

  // A document carrying both markers has to mean one version by them. Accepting
  // either on its own let `FA (2)` paired with variant 3 render as FA(3) — every
  // binding resolved against the wrong schema, and a plausible page to show for
  // it. Every real KSeF invoice states both, so demanding they agree costs
  // nothing and a disagreement is a document worth refusing.
  if (kod !== '' && variant !== '') {
    return byKod !== null && byKod === byVariant ? byKod : null;
  }
  return byKod ?? byVariant;
}

/**
 * Detect the UPO version. Requires a `Potwierdzenie` root, then reads the
 * version from the namespace that root element is bound to (`.../KSeF/v4-3` →
 * `UPO(4.3)`, `v4-2` → `UPO(4.2)`). The default `xmlns` declaration is not
 * surfaced as an attribute by the compact parser, so we scan the source
 * directly. Returns `null` for non-UPO documents.
 */
export function detectUpoVersion(xml: string): UpoVersion | null {
  const parsed = parseXmlForPdf(xml);
  if (!('Potwierdzenie' in parsed)) return null;

  // Read the marker from the root element's own tag, which is why this reads
  // the source rather than `parsed`: `removeNSPrefix` drops the xmlns
  // declarations, so the version is gone by the time the document is an object.
  //
  // Comments come out first and the match is anchored to the document's *first*
  // element, not to the first thing that looks like a Potwierdzenie. Scanning by
  // name alone let a commented-out root — or any mention of the string in a note
  // or an embedded document — decide the version instead.
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const firstElement = /<(?![?!])([\w.:-]+)[^>]*>/.exec(withoutComments);
  const rootTag = firstElement?.[0] ?? '';
  const qualifiedName = firstElement?.[1] ?? '';
  const colon = qualifiedName.indexOf(':');
  const prefix = colon === -1 ? '' : qualifiedName.slice(0, colon);
  const rootName = colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
  if (rootName !== 'Potwierdzenie') return null;

  // The version has to come from the namespace the root is *in*, not from
  // anywhere in its start tag: matching the whole tag let an unrelated document
  // that merely quotes the string in some other attribute — a note, a source
  // URL, a second namespace it does not use — be routed to the UPO renderer.
  const wanted = prefix === '' ? 'xmlns' : `xmlns:${prefix}`;
  let namespace = '';
  for (const match of rootTag.matchAll(/\s(xmlns(?::[\w.-]+)?)\s*=\s*(["'])([^"']*)\2/g)) {
    if (match[1] === wanted) namespace = match[3] ?? '';
  }

  if (/KSeF\/v4-3\b/.test(namespace)) return 'UPO(4.3)';
  if (/KSeF\/v4-2\b/.test(namespace)) return 'UPO(4.2)';
  return null;
}
