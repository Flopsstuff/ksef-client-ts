export type SubjectType = 'EnforcementAuthority' | 'VatGroup' | 'JST';

export interface TestDataContextIdentifier {
  type: 'Nip';
  value: string;
}

export interface TestDataAuthorizedIdentifier {
  type: 'Nip' | 'Pesel' | 'Fingerprint';
  value: string;
}

export type TestDataPermission =
  | 'InvoiceRead'
  | 'InvoiceWrite'
  | 'CredentialRead'
  | 'CredentialManage'
  | 'EnforcementOperations'
  | 'SubunitManage'
  | 'SelfInvoicing';

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
  permissions: TestDataPermission[];
}

export interface AttachmentPermissionGrantRequest {
  nip: string;
}

export interface AttachmentPermissionRevokeRequest {
  nip: string;
  expectedEndDate?: string | null;
}

export interface ChangeSessionLimitsInCurrentContextRequest {
  maxInvoicesPerSession: number;
  maxSessionDurationMinutes: number;
}

export interface ChangeCertificatesLimitInCurrentSubjectRequest {
  limit: number;
}

export interface EffectiveApiRateLimitsRequest {
  contextIdentifier: TestDataContextIdentifier;
  rateLimits: Record<string, { maxCallsPerInterval: number; intervalMs: number }>;
}

export interface ContextBlockRequest {
  contextIdentifier: TestDataContextIdentifier;
}

export interface ContextUnblockRequest {
  contextIdentifier: TestDataContextIdentifier;
}

export interface TestDataStatusResponse {
  code: number;
  description: string;
}
