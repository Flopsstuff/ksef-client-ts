/**
 * Node-only entry point (`ksef-client-ts/node`).
 *
 * Re-exports the filesystem-backed symbols that the root barrel no longer
 * ships, keeping the core import fs-free. Import these from `ksef-client-ts/node`
 * when running on Node.js and you need disk-backed storage or XSD validation.
 */
export { FileOfflineInvoiceStorage } from './offline/file-storage.js';

export {
  FA_XSD_PATHS, PEF_XSD_PATHS, libxmljsAvailable, resolveXsdFor, validateAgainstXsd,
  isMissingLibxmljsError,
  type InvoiceSchemaId, type ValidateAgainstXsdResult,
} from './validation/xsd-validator.js';

export { FileHwmStore } from './workflows/hwm-storage.js';
