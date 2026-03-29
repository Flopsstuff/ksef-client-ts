/**
 * XML-to-Object converter for Zod schema validation.
 *
 * Converts XML string → plain JS object matching the shape expected by
 * generated Zod schemas (element children → properties, repeated elements → arrays,
 * attributes → @-prefixed keys, namespace prefixes stripped).
 */

import { DOMParser } from '@xmldom/xmldom';

/** Result of XML-to-object conversion. */
export interface XmlConversionResult {
  /** The converted root object (null if parsing failed). */
  object: Record<string, unknown> | null;
  /** Detected root element local name (e.g. "Faktura"). */
  rootElement: string | null;
  /** Detected namespace URI from the root element. */
  namespace: string | null;
  /** Parse errors, if any. */
  errors: string[];
}

/**
 * Convert an XML string to a plain JS object suitable for Zod validation.
 *
 * - Element children become object properties
 * - Repeated elements with the same name become arrays
 * - Attributes are prefixed with `@` (e.g. `@kodSystemowy`)
 * - Namespace prefixes are stripped from element and attribute names
 * - Text-only elements become string values
 * - Mixed content (text + children) puts text in `#text` key
 */
export function xmlToObject(xml: string): XmlConversionResult {
  const errors: string[] = [];

  const doc = new DOMParser({
    errorHandler: {
      warning: (_msg: string) => { /* ignore warnings */ },
      error: (msg: string) => errors.push(msg),
      fatalError: (msg: string) => errors.push(msg),
    },
  }).parseFromString(xml, 'text/xml');

  if (errors.length > 0 || !doc || !doc.documentElement) {
    return { object: null, rootElement: null, namespace: null, errors };
  }

  const root = doc.documentElement;
  const rootName = getLocalName(root);
  const namespace = root.namespaceURI || null;

  const obj = elementToObject(root);

  return {
    object: typeof obj === 'object' && obj !== null ? obj as Record<string, unknown> : { '#text': obj },
    rootElement: rootName,
    namespace,
    errors: [],
  };
}

/** Strip namespace prefix from a node name. */
function getLocalName(node: { localName?: string | null; nodeName: string }): string {
  if (node.localName) return node.localName;
  const name = node.nodeName;
  const idx = name.indexOf(':');
  return idx === -1 ? name : name.substring(idx + 1);
}

/**
 * Convert a DOM Element to a plain JS value:
 * - Element with only text → string
 * - Element with child elements → object
 * - Repeated child elements → array
 */
function elementToObject(el: Element): unknown {
  const result: Record<string, unknown> = {};
  let hasChildElements = false;

  // Process attributes (skip xmlns declarations)
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i);
    if (!a) continue;
    const name = a.nodeName;
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    const attrLocal = getLocalName(a);
    result[`@${attrLocal}`] = a.value;
  }

  // Count child elements by name (to detect arrays)
  const childCounts = new Map<string, number>();
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes.item(i);
    if (!child || child.nodeType !== 1 /* ELEMENT_NODE */) continue;
    const name = getLocalName(child as Element);
    childCounts.set(name, (childCounts.get(name) || 0) + 1);
    hasChildElements = true;
  }

  // If no child elements, return text content (or object with attrs + #text)
  if (!hasChildElements) {
    const text = getTextContent(el);
    const hasAttrs = Object.keys(result).length > 0;
    if (hasAttrs) {
      result['#text'] = text;
      return result;
    }
    return text;
  }

  // Process child elements
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes.item(i);
    if (!child || child.nodeType !== 1 /* ELEMENT_NODE */) continue;

    const name = getLocalName(child as Element);
    const value = elementToObject(child as Element);
    const count = childCounts.get(name) || 1;

    if (count > 1) {
      if (!Array.isArray(result[name])) {
        result[name] = [];
      }
      (result[name] as unknown[]).push(value);
    } else {
      result[name] = value;
    }
  }

  return result;
}

/** Get concatenated text content of direct text/CDATA child nodes. */
function getTextContent(el: Element): string {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes.item(i);
    if (!child) continue;
    if (child.nodeType === 3 /* TEXT_NODE */ || child.nodeType === 4 /* CDATA_SECTION_NODE */) {
      text += child.nodeValue || '';
    }
  }
  return text.trim();
}
