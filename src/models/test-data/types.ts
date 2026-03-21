export type SubjectType = 'EnforcementAuthority' | 'VatGroup' | 'JST';

export type TestDataContextIdentifierType = 'Nip';

export interface TestDataContextIdentifier {
  type: TestDataContextIdentifierType;
  value: string;
}

export type TestDataAuthorizedIdentifierType = 'Nip' | 'Pesel' | 'Fingerprint';

export interface TestDataAuthorizedIdentifier {
  type: TestDataAuthorizedIdentifierType;
  value: string;
}

export type TestDataPermissionType =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialsRead'
  | 'CredentialsManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'Introspection';

export interface TestDataPermission {
  permissionType: TestDataPermissionType;
  description?: string;
}

export type TestDataAuthenticationContextIdentifierType = 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';

export interface TestDataAuthenticationContextIdentifier {
  type: TestDataAuthenticationContextIdentifierType;
  value: string;
}

export interface Subunit {
  subjectNip: string;
  description: string;
}

export interface SubjectCreateRequest {
  subjectNip: string;
  subjectType: SubjectType;
  description: string;
  subunits?: Subunit[] | null;
  createdDate?: string | null;
}

export interface SubjectRemoveRequest {
  subjectNip: string;
}

export interface PersonCreateRequest {
  nip: string;
  pesel: string;
  isBailiff: boolean;
  description: string;
  isDeceased?: boolean;
  createdDate?: string | null;
}

export interface PersonRemoveRequest {
  nip: string;
}

export interface TestDataPermissionsGrantRequest {
  contextIdentifier: TestDataContextIdentifier;
  authorizedIdentifier: TestDataAuthorizedIdentifier;
  permissions: TestDataPermission[];
}

export interface TestDataPermissionsRevokeRequest {
  contextIdentifier: TestDataContextIdentifier;
  authorizedIdentifier: TestDataAuthorizedIdentifier;
}

export interface AttachmentPermissionGrantRequest {
  nip: string;
}

export interface AttachmentPermissionRevokeRequest {
  nip: string;
  expectedEndDate?: string | null;
}

export interface BlockContextAuthenticationRequest {
  contextIdentifier?: TestDataAuthenticationContextIdentifier | null;
}

export interface UnblockContextAuthenticationRequest {
  contextIdentifier?: TestDataAuthenticationContextIdentifier | null;
}

export interface TestDataStatusResponse {
  code: number;
  description: string;
}
