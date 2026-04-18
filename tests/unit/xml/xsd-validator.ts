/**
 * XSD validation helper for the invoice XML harness.
 *
 * This module is intentionally dependency-light: it lazily probes for the
 * native `libxmljs2` module and degrades gracefully when it is unavailable
 * (for example, if the native build fails on a CI matrix entry). All tests
 * that depend on XSD validation gate themselves on the exported
 * `libxmljsAvailable` flag via `describe.skipIf(!libxmljsAvailable)`.
 *
 * The validator loads the FA2/FA3 XSDs from `docs/schemas/FA/`, rewrites the
 * `<xsd:import schemaLocation="http://crd.gov.pl/...">` URL to a local
 * `file://` URL pointing at the vendored base types in
 * `docs/schemas/FA/bazowe/`, then uses libxmljs2's `baseUrl` option so that
 * further `<xsd:include>` directives (e.g. `KodyKrajow_v10-0E.xsd`)
 * resolve against the local filesystem too.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve repo root relative to this file (tests/unit/xml/ → repo root).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..', '..');
const xsdBaseDir = path.join(repoRoot, 'docs', 'schemas', 'FA');
const xsdBazoweDir = path.join(xsdBaseDir, 'bazowe');

/**
 * Absolute paths to the canonical KSeF Faktura schemas. The filenames contain
 * literal parentheses (e.g. `schemat_FA(2)_v1-0E.xsd`) exactly as published
 * upstream — do not rename.
 */
export const FA_XSD_PATHS = {
  FA2: path.join(xsdBaseDir, 'schemat_FA(2)_v1-0E.xsd'),
  FA3: path.join(xsdBaseDir, 'schemat_FA(3)_v1-0E.xsd'),
} as const;

export interface ValidateAgainstXsdResult {
  valid: boolean;
  errors: string[];
}

// Use createRequire so we can probe for an optional CommonJS native module
// from an ESM context without ever letting an import resolution crash the
// test runner at module-load time.
const requireModule = createRequire(import.meta.url);

type LibxmljsModule = {
  parseXml: (
    xml: string,
    options?: { baseUrl?: string },
  ) => {
    validate: (schema: unknown) => boolean;
    validationErrors: Array<{ message: string }>;
  };
};

let libxmljs: LibxmljsModule | null = null;
try {
  // Prefer the default export; libxmljs2 exposes a namespace with parseXml.
  libxmljs = requireModule('libxmljs2') as LibxmljsModule;
} catch {
  libxmljs = null;
}

export const libxmljsAvailable: boolean = libxmljs !== null;

/**
 * Rewrite the upstream `http://crd.gov.pl/.../StrukturyDanych_v10-0E.xsd`
 * schemaLocation in an FA XSD to a local `file://` URL so validation works
 * entirely offline.
 */
function rewriteSchemaLocations(xsdContent: string): string {
  const bazoweStrukturyPath = path.join(xsdBazoweDir, 'StrukturyDanych_v10-0E.xsd');
  const bazoweStrukturyUrl = pathToFileURL(bazoweStrukturyPath).href;
  return xsdContent.replace(
    /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/StrukturyDanych_v10-0E\.xsd"/g,
    `schemaLocation="${bazoweStrukturyUrl}"`,
  );
}

/**
 * Validate an XML string against an XSD file on disk.
 *
 * Returns `{ valid, errors }` rather than throwing so callers can make rich
 * assertions. Throws only if `libxmljs2` is not installed — tests should
 * gate on `libxmljsAvailable` before calling this.
 */
export function validateAgainstXsd(xml: string, xsdPath: string): ValidateAgainstXsdResult {
  if (!libxmljs) {
    throw new Error(
      'libxmljs2 is not installed; cannot run XSD validation. ' +
        'Guard callers with `describe.skipIf(!libxmljsAvailable)`.',
    );
  }

  const xsdDir = path.dirname(xsdPath);
  const rawXsd = fs.readFileSync(xsdPath, 'utf8');
  const rewrittenXsd = rewriteSchemaLocations(rawXsd);

  // baseUrl must end with a trailing separator so libxml2 treats it as a
  // directory when resolving subsequent relative `<xsd:include>` / `<xsd:import>`
  // references. The path.sep keeps this correct on Windows too.
  const baseUrl = pathToFileURL(xsdDir + path.sep).href;

  // libxmljs2 throws synchronously on malformed XML / XSD (e.g., a truncated
  // fast-check counterexample or a rewritten schema path that fails to load).
  // Convert those into structured validation results so property-test callers
  // still see a failing assertion with diagnostic context instead of a bare
  // exception surfacing from deep inside the helper.
  let schemaDoc;
  try {
    schemaDoc = libxmljs.parseXml(rewrittenXsd, { baseUrl });
  } catch (err) {
    return { valid: false, errors: [`XSD parse failed: ${(err as Error).message}`] };
  }
  let xmlDoc;
  try {
    xmlDoc = libxmljs.parseXml(xml);
  } catch (err) {
    return { valid: false, errors: [`XML parse failed: ${(err as Error).message}`] };
  }

  const valid = xmlDoc.validate(schemaDoc);
  const errors = valid
    ? []
    : xmlDoc.validationErrors.map((err: Error) => err.message.trim());

  return { valid, errors };
}
