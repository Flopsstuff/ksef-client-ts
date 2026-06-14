/**
 * Type-only fixture for ksef-client-ts/node subpath (FLO-246).
 *
 * Compiled by `tsc --project tsconfig.node-check.json --noEmit` in the lint
 * step. Proves that both node.d.ts (ESM import) and node.d.cts (CJS require)
 * are wired correctly and that all moved symbols have the expected shapes.
 *
 * This file is NOT executed at runtime.
 */
import {
  FileOfflineInvoiceStorage,
  FileHwmStore,
  validateAgainstXsd,
  resolveXsdFor,
  FA_XSD_PATHS,
  PEF_XSD_PATHS,
  libxmljsAvailable,
  isMissingLibxmljsError,
  type InvoiceSchemaId,
  type ValidateAgainstXsdResult,
} from 'ksef-client-ts/node';

// FileOfflineInvoiceStorage is a class (constructable)
const _storage: InstanceType<typeof FileOfflineInvoiceStorage> = new FileOfflineInvoiceStorage();
void _storage;

// FileHwmStore is a class (constructable)
const _hwm: InstanceType<typeof FileHwmStore> = new FileHwmStore('/tmp/test-hwm.json');
void _hwm;

// XSD path maps have string values
const _fa: string = FA_XSD_PATHS.FA2;
const _pef: string = PEF_XSD_PATHS.PEF;
void _fa; void _pef;

// InvoiceSchemaId is a union of literal strings
const _schemaId: InvoiceSchemaId = 'FA3';
void _schemaId;

// validateAgainstXsd is synchronous → ValidateAgainstXsdResult
const _validateResult: ValidateAgainstXsdResult = validateAgainstXsd('<Faktura/>', 'FA3');
void _validateResult;

// resolveXsdFor takes InvoiceSchemaId and returns string
const _xsdPath: string = resolveXsdFor('FA2');
void _xsdPath;

// libxmljsAvailable is a boolean constant
const _available: boolean = libxmljsAvailable;
void _available;

// isMissingLibxmljsError is a predicate function
const _err = new Error('test');
const _isMissing: boolean = isMissingLibxmljsError(_err);
void _isMissing;
