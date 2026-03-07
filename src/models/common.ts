export interface OperationResponse {
  referenceNumber: string;
}

export interface OperationStatusInfo {
  code: number;
  description: string;
  details?: string[];
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

export type SessionType = 'Online' | 'Batch';
export type SessionStatus = 'Succeeded' | 'InProgress' | 'Failed' | 'Cancelled';

export type SortOrder = 'Asc' | 'Desc';

export type PermissionSubjectIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';
