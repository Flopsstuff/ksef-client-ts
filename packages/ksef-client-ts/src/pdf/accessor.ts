/**
 * Accessor layer over `fast-xml-parser` compact output.
 *
 * Compact parsing (`preserveOrder: false`) is convenient for layout but leaves
 * artifacts: single-element collections collapse from an array into an object,
 * elements with mixed content expose their text under `#text`, and attributes
 * are prefixed (we configure `@`). Templates never touch the parsed object
 * directly — every binding goes through these helpers so a one-line invoice is
 * handled exactly like a many-line one and a missing optional field never throws
 * (unless strict mode asks it to).
 *
 * A path is a dot-separated walk over the parsed object, e.g.
 * `Podmiot1.DaneIdentyfikacyjne.NIP`. A segment beginning with `@` reads an
 * attribute, e.g. `Naglowek.KodFormularza.@kodSystemowy`.
 */

const TEXT_KEY = '#text';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk `path` and return the raw node found there (object, array, or scalar),
 * or `undefined` if any intermediate segment is absent. When descent hits an
 * array mid-path (a collapsed/expanded repeater), the first element is followed
 * — use {@link list} when you need every element.
 */
export function getNode(root: unknown, path: string): unknown {
  const segments = path.split('.').filter((s) => s.length > 0);
  let cur: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(cur)) cur = cur[0];
    if (!isRecord(cur)) return undefined;
    cur = cur[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function coerceScalar(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return coerceScalar(node[0]);
  if (isRecord(node)) {
    if (TEXT_KEY in node) return coerceScalar(node[TEXT_KEY]);
    return undefined; // element with only children/attributes has no scalar value
  }
  return undefined;
}

/**
 * Read a scalar binding as a string. Missing/childless nodes yield `''` by
 * default; when `strict` is set, a missing binding throws instead — useful for
 * catching dot-path typos in built-in templates.
 *
 * Handles `#text` unwrapping (mixed content) and `@attr` segments transparently.
 */
export function get(root: unknown, path: string, strict = false): string {
  const scalar = coerceScalar(getNode(root, path));
  if (scalar === undefined) {
    if (strict) throw new Error(`Missing binding: "${path}"`);
    return '';
  }
  return scalar;
}

/**
 * Always-array read for repeaters. A single-element collection that the parser
 * collapsed into an object is returned as a one-element array, so a repeater
 * over `Fa.FaWiersz` iterates identically for one line or many.
 */
export function list(root: unknown, path: string): unknown[] {
  const node = getNode(root, path);
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

/**
 * Presence test for `when` conditions. An empty string, empty array, or missing
 * node is falsy; a present object/number/non-empty string is truthy.
 */
export function has(root: unknown, path: string): boolean {
  const node = getNode(root, path);
  if (node === undefined || node === null) return false;
  if (typeof node === 'string') return node.length > 0;
  if (Array.isArray(node)) return node.length > 0;
  if (isRecord(node)) {
    // An element that carries only an empty `#text` is not meaningfully present.
    if (TEXT_KEY in node && Object.keys(node).length === 1) {
      return coerceScalar(node) !== undefined && coerceScalar(node) !== '';
    }
    return true;
  }
  return true; // number / boolean
}
