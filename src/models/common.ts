export interface OperationResponse {
  referenceNumber: string;
}

export interface OperationStatusInfo {
  code: number;
  description: string;
  details?: string[] | null;
}

export interface TokenInfo {
  token: string;
  validUntil: string;
}

export interface FormCode {
  systemCode: string;
  schemaVersion: string;
  value: string;
}

export interface EncryptionInfo {
  encryptedSymmetricKey: string;
  initializationVector: string;
  /** Identifier of the public key used to encrypt the symmetric key — key-rotation selector (KSeF API v2.5.0). */
  publicKeyId?: string;
}

export interface FileMetadata {
  hashSHA: string;
  fileSize: number;
}

export type ContextIdentifierType = 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';

export interface ContextIdentifier {
  type: ContextIdentifierType;
  value: string;
}

/** Archive compression for batch upload / invoice export packages (KSeF API v2.6.0). Defaults to `Zip`. */
export type CompressionType = 'Zip' | 'TarGz';

export type SessionType = 'Online' | 'Batch';
export type SessionStatus = 'Succeeded' | 'InProgress' | 'Failed' | 'Cancelled';

export type SortOrder = 'Asc' | 'Desc';

export type InvoicingMode = 'Online' | 'Offline';

export type PermissionSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';
