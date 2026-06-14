import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { XmlDocument, XmlObject } from './types.js';

// fast-xml-parser's XMLBuilder has no built-in declaration option (the
// `declaration:{include,encoding}` config above was silently ignored in 4.x/5.x),
// so the XML prolog is prepended manually on every build. The canonical KSeF
// invoices carry a UTF-8 prolog; emitting it keeps our output byte-comparable
// to the vendored fixtures and maximises server-side parser compatibility.
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  // Preserve leading zeros and keep everything as strings — KSeF fields like
  // KRS (`\d{10}`) and NIP (`\d{10}`) would otherwise be lossy through parse.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: false,
  processEntities: true,
} as ConstructorParameters<typeof XMLBuilder>[0]);

function createObjectBuilder(pretty = false): XMLBuilder {
  return new XMLBuilder({
    ignoreAttributes: false,
    preserveOrder: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: pretty,
    suppressBooleanAttributes: false,
    suppressEmptyNode: false,
    processEntities: true,
  } as ConstructorParameters<typeof XMLBuilder>[0]);
}

function prependDeclaration(xml: string): string {
  // Never double-declare when the caller already emitted a prolog.
  return xml.startsWith('<?xml') ? xml : `${XML_DECLARATION}${xml}`;
}

export function parseXml(xml: string): XmlDocument {
  return parser.parse(xml) as XmlDocument;
}

export function buildXml(document: XmlDocument): string {
  return prependDeclaration(builder.build(document));
}

export function buildXmlFromObject(document: XmlObject, options?: { pretty?: boolean }): string {
  return prependDeclaration(createObjectBuilder(options?.pretty).build(document));
}

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}
