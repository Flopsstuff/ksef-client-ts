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

export interface SubjectCreateRequest {
  contextIdentifier: TestDataContextIdentifier;
  name?: string;
}

export interface SubjectRemoveRequest {
  contextIdentifier: TestDataContextIdentifier;
}

export interface PersonCreateRequest {
  contextIdentifier: TestDataContextIdentifier;
  personIdentifier: TestDataAuthorizedIdentifier;
  firstName?: string;
  lastName?: string;
}

export interface PersonRemoveRequest {
  contextIdentifier: TestDataContextIdentifier;
  personIdentifier: TestDataAuthorizedIdentifier;
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
  contextIdentifier: TestDataContextIdentifier;
}

export interface AttachmentPermissionRevokeRequest {
  contextIdentifier: TestDataContextIdentifier;
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
