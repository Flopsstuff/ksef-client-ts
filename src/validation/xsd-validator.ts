import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let cachedPkgRoot: string | null = null;

function locatePackageRoot(): string {
  if (cachedPkgRoot !== null) return cachedPkgRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, 'docs', 'schemas');
    if (fs.existsSync(candidate)) {
      cachedPkgRoot = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate ksef-client-ts package root (docs/schemas not found).');
}

export type InvoiceSchemaId = 'FA2' | 'FA3' | 'PEF' | 'PEF_KOR';

const XSD_RELATIVE: Record<InvoiceSchemaId, readonly string[]> = {
  FA2: ['FA', 'schemat_FA(2)_v1-0E.xsd'],
  FA3: ['FA', 'schemat_FA(3)_v1-0E.xsd'],
  PEF: ['PEF', 'Schemat_PEF(3)_v2-1.xsd'],
  PEF_KOR: ['PEF', 'Schemat_PEF_KOR(3)_v2-1.xsd'],
};

export const FA_XSD_PATHS = {
  get FA2(): string { return resolveXsdFor('FA2'); },
  get FA3(): string { return resolveXsdFor('FA3'); },
} as const;

export const PEF_XSD_PATHS = {
  get PEF(): string { return resolveXsdFor('PEF'); },
  get PEF_KOR(): string { return resolveXsdFor('PEF_KOR'); },
} as const;

export function resolveXsdFor(schema: InvoiceSchemaId): string {
  const rel = XSD_RELATIVE[schema];
  if (!rel) throw new Error(`Unknown invoice schema: ${String(schema)}`);
  return path.join(locatePackageRoot(), 'docs', 'schemas', ...rel);
}

export interface ValidateAgainstXsdResult {
  valid: boolean;
  errors: string[];
}

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
  libxmljs = requireModule('libxmljs2') as LibxmljsModule;
} catch {
  libxmljs = null;
}

export const libxmljsAvailable: boolean = libxmljs !== null;

const MISSING_LIBXMLJS_MESSAGE_PREFIX = 'libxmljs2 is not installed';

export function isMissingLibxmljsError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith(MISSING_LIBXMLJS_MESSAGE_PREFIX);
}

// Only FA XSDs reference the external crd.gov.pl schemaLocation that needs
// rewriting to a local file://-URL. PEF XSDs have no such import, so this
// regex legitimately produces no replacement on a PEF path — callers must
// not treat a zero-replacement PEF rewrite as drift.
const EXTERNAL_STRUKTURY_DANYCH_URL =
  /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/StrukturyDanych_v10-0E\.xsd"/g;

function rewriteSchemaLocations(xsdContent: string): string {
  // No upstream URL present → nothing to rewrite (PEF XSDs reach this path
  // unchanged). Returning early makes the drift-guard below unambiguous.
  if (!EXTERNAL_STRUKTURY_DANYCH_URL.test(xsdContent)) {
    return xsdContent;
  }
  EXTERNAL_STRUKTURY_DANYCH_URL.lastIndex = 0;

  const bazoweStrukturyPath = path.join(
    locatePackageRoot(),
    'docs',
    'schemas',
    'FA',
    'bazowe',
    'StrukturyDanych_v10-0E.xsd',
  );
  const bazoweStrukturyUrl = pathToFileURL(bazoweStrukturyPath).href;
  const rewritten = xsdContent.replace(
    EXTERNAL_STRUKTURY_DANYCH_URL,
    `schemaLocation="${bazoweStrukturyUrl}"`,
  );
  EXTERNAL_STRUKTURY_DANYCH_URL.lastIndex = 0;

  // Drift-guard: the URL was present but `.replace()` produced no change.
  // Should be unreachable unless the regex and the URL diverge — fail loud
  // rather than pass through an unresolved `<xsd:import>` to libxmljs.
  if (rewritten === xsdContent) {
    throw new Error(
      'FA XSD schemaLocation rewrite produced no replacement despite URL being present; ' +
        'regex likely out of sync with docs/schemas/FA/. Re-check after `yarn sync-schemas`.',
    );
  }
  return rewritten;
}

export function validateAgainstXsd(xml: string, xsdPath: string): ValidateAgainstXsdResult {
  if (!libxmljs) {
    throw new Error(
      `${MISSING_LIBXMLJS_MESSAGE_PREFIX}; cannot run XSD validation. ` +
        'Install it as an optional peer dependency (e.g. `yarn add -O libxmljs2` or `npm i -O libxmljs2`).',
    );
  }

  const xsdDir = path.dirname(xsdPath);
  const rawXsd = fs.readFileSync(xsdPath, 'utf8');
  const rewrittenXsd = rewriteSchemaLocations(rawXsd);
  const baseUrl = pathToFileURL(xsdDir + path.sep).href;

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
    : xmlDoc.validationErrors.map((err) => err.message.trim());

  return { valid, errors };
}
