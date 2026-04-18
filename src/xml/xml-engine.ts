import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { XmlDocument, XmlObject } from './types.js';

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
  declaration: {
    include: true,
    encoding: 'utf-8',
  },
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
    declaration: {
      include: true,
      encoding: 'utf-8',
    },
  } as ConstructorParameters<typeof XMLBuilder>[0]);
}

export function parseXml(xml: string): XmlDocument {
  return parser.parse(xml) as XmlDocument;
}

export function buildXml(document: XmlDocument): string {
  return builder.build(document);
}

export function buildXmlFromObject(document: XmlObject, options?: { pretty?: boolean }): string {
  return createObjectBuilder(options?.pretty).build(document);
}

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}
