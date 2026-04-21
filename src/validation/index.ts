export {
  Nip, VatUe, NipVatUe, InternalId, PeppolId, ReferenceNumber,
  KsefNumber, KsefNumberV35, KsefNumberV36, CertificateName, Pesel,
  CertificateFingerprint, Base64String, Ip4Address, Ip4Range, Ip4Mask, Sha256Base64,
  isValidNip, isValidVatUe, isValidNipVatUe, isValidInternalId, isValidPeppolId,
  isValidReferenceNumber, isValidKsefNumber, isValidKsefNumberV35, isValidKsefNumberV36,
  isValidPesel, isValidCertificateName,
  isValidCertificateFingerprint, isValidBase64, isValidIp4Address, isValidSha256Base64,
} from './patterns.js';
export {
  REQUIRED_CHALLENGE_LENGTH, CERTIFICATE_NAME_MIN_LENGTH, CERTIFICATE_NAME_MAX_LENGTH,
  SUBUNIT_NAME_MIN_LENGTH, SUBUNIT_NAME_MAX_LENGTH,
  PERMISSION_DESCRIPTION_MIN_LENGTH, PERMISSION_DESCRIPTION_MAX_LENGTH,
} from './constraints.js';

export { xmlToObject, type XmlConversionResult } from './xml-to-object.js';
export { SchemaRegistry } from './schema-registry.js';
export {
  validate, validateBatch, batchValidationDetails, validateWellFormedness, validateSchema, validateBusinessRules,
  type InvoiceValidationResult, type InvoiceValidationError,
  type InvoiceValidationErrorCode, type ValidateOptions, type BatchValidationResult,
} from './invoice-validator.js';
export { validateCharValidity, DISCOURAGED_UNICODE_RANGES } from './char-validity.js';
export {
  FA_XSD_PATHS, PEF_XSD_PATHS, libxmljsAvailable, resolveXsdFor, validateAgainstXsd,
  type InvoiceSchemaId, type ValidateAgainstXsdResult,
} from './xsd-validator.js';
